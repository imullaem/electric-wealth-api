import { Router, type Request, type Response } from 'express';
import type { Db } from '../db/connection.js';
import { parseOr400, sendError } from '../middleware/index.js';
import { errors, jsonBody, registry } from '../openapi/registry.js';
import {
  attachOfflineClient,
  completeRegistration,
  emailInUse,
  findOpenRegistration,
  listSecurityQuestions,
  matchOfflineClient,
  saveSecurityAnswers,
  saveTrustedContact,
  startRegistration,
  unknownQuestionIds,
  type RegistrationRow,
} from '../repositories/registration.js';
import { createSession, TOKEN_TTL_SECONDS } from '../repositories/sessions.js';
import { TokenResponseSchema } from '../schemas/auth.js';
import { LanguageSchema } from '../schemas/common.js';
import {
  RegistrationCompleteRequestSchema,
  RegistrationStartRequestSchema,
  RegistrationStartResponseSchema,
  SecurityAnswersRequestSchema,
  SecurityQuestionsResponseSchema,
  StepSavedResponseSchema,
  TrustedContactRequestSchema,
  VerifyIdentityRequestSchema,
  VerifyIdentityResponseSchema,
} from '../schemas/registration.js';
import { z } from '../schemas/zod.js';

const tags = ['Registration'];
const post = (path: string, summary: string, body: z.ZodType, response: z.ZodType, status: 200 | 201, codes: number[], description?: string) =>
  registry.registerPath({
    method: 'post',
    path,
    tags,
    summary,
    description,
    request: { body: jsonBody(body) },
    responses: { [status]: jsonBody(response, summary), ...errors(...codes) },
  });

post('/api/registration/start', 'Step 1: choose a login (email and password)', RegistrationStartRequestSchema, RegistrationStartResponseSchema, 201, [400, 409],
  'Starts online enrolment for an existing client. 409 EMAIL_TAKEN if the email already has online access.');
post('/api/registration/verify-identity', 'Step 2: match the account number, postal code and date of birth on file', VerifyIdentityRequestSchema, VerifyIdentityResponseSchema, 200, [400, 404, 409, 422],
  '422 IDENTITY_MISMATCH if no client record matches all three; 409 ALREADY_ENROLLED if that client already has online access.');
registry.registerPath({
  method: 'get',
  path: '/api/registration/security-questions',
  tags,
  summary: 'Questions to choose from in step 3',
  request: { headers: z.object({ 'accept-language': LanguageSchema.optional() }) },
  responses: { 200: jsonBody(SecurityQuestionsResponseSchema, 'Security questions') },
});
post('/api/registration/security-questions', 'Step 3: answer two security questions', SecurityAnswersRequestSchema, StepSavedResponseSchema, 200, [400, 404, 409]);
post('/api/registration/trusted-contact', 'Step 5 (optional): add a trusted contact', TrustedContactRequestSchema, StepSavedResponseSchema, 200, [400, 404, 409]);
post('/api/registration/complete', 'Final step: choose the code method, accept the terms and create the login', RegistrationCompleteRequestSchema, TokenResponseSchema, 201, [400, 404, 409],
  'Creates the user and returns a signed-in session (mfaRequired is false: the client just proved their identity).');

export function createRegistrationRouter(db: Db) {
  const router = Router();

  const outOfOrder = (req: Request, res: Response, message: string) => sendError(req, res, 409, 'STEP_OUT_OF_ORDER', message);

  /** Sends 404 and returns undefined unless the registration exists, has not expired and is not finished. */
  const openOr404 = (req: Request, res: Response, id: string): RegistrationRow | undefined => {
    const reg = findOpenRegistration(db, id);
    if (!reg) sendError(req, res, 404, 'REGISTRATION_NOT_FOUND', 'This registration has expired or does not exist. Please start again.');
    return reg;
  };

  router.post('/start', (req, res) => {
    const body = parseOr400(RegistrationStartRequestSchema, req.body, req, res);
    if (!body) return;
    if (emailInUse(db, body.email)) {
      sendError(req, res, 409, 'EMAIL_TAKEN', 'This email already has online access. Sign in instead.');
      return;
    }
    res.status(201).json(RegistrationStartResponseSchema.parse(startRegistration(db, body.email, body.password)));
  });

  router.post('/verify-identity', (req, res) => {
    const body = parseOr400(VerifyIdentityRequestSchema, req.body, req, res);
    if (!body) return;
    const reg = openOr404(req, res, body.registrationId);
    if (!reg) return;
    const client = matchOfflineClient(db, body.accountNumber, body.postalCode, body.dateOfBirth);
    if (!client) {
      sendError(req, res, 422, 'IDENTITY_MISMATCH', 'We could not verify those details.');
      return;
    }
    if (client.enrolled_user_id) {
      sendError(req, res, 409, 'ALREADY_ENROLLED', 'This client already has online access. Sign in instead.');
      return;
    }
    attachOfflineClient(db, reg.id, client.account_number);
    res.json(VerifyIdentityResponseSchema.parse({ verified: true, name: client.name }));
  });

  router.get('/security-questions', (req, res) => {
    res.json(SecurityQuestionsResponseSchema.parse(listSecurityQuestions(db, req.language)));
  });

  router.post('/security-questions', (req, res) => {
    const body = parseOr400(SecurityAnswersRequestSchema, req.body, req, res);
    if (!body) return;
    const reg = openOr404(req, res, body.registrationId);
    if (!reg) return;
    if (!reg.account_number) return outOfOrder(req, res, 'Verify your identity first.');
    const unknown = unknownQuestionIds(db, body.answers.map((a) => a.questionId));
    if (unknown.length) {
      sendError(req, res, 400, 'VALIDATION_ERROR', `Invalid request. Unknown question: ${unknown.join(', ')}`);
      return;
    }
    saveSecurityAnswers(db, reg.id, body.answers);
    res.json(StepSavedResponseSchema.parse({ saved: true }));
  });

  router.post('/trusted-contact', (req, res) => {
    const body = parseOr400(TrustedContactRequestSchema, req.body, req, res);
    if (!body) return;
    const reg = openOr404(req, res, body.registrationId);
    if (!reg) return;
    if (!reg.account_number) return outOfOrder(req, res, 'Verify your identity first.');
    saveTrustedContact(db, reg.id, body);
    res.json(StepSavedResponseSchema.parse({ saved: true }));
  });

  router.post('/complete', (req, res) => {
    const body = parseOr400(RegistrationCompleteRequestSchema, req.body, req, res);
    if (!body) return;
    const reg = openOr404(req, res, body.registrationId);
    if (!reg) return;
    if (!reg.account_number) return outOfOrder(req, res, 'Verify your identity first.');
    if (!reg.security_answers_saved) return outOfOrder(req, res, 'Answer your security questions first.');
    if (emailInUse(db, reg.email)) {
      sendError(req, res, 409, 'EMAIL_TAKEN', 'This email already has online access. Sign in instead.');
      return;
    }
    const userId = completeRegistration(db, reg, body);
    const session = createSession(db, userId, true);
    res.status(201).json(
      TokenResponseSchema.parse({
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        tokenType: 'Bearer',
        expiresIn: TOKEN_TTL_SECONDS,
        mfaRequired: false,
      }),
    );
  });

  return router;
}
