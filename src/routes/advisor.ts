import { Router, type Request, type Response } from 'express';
import type { Db } from '../db/connection.js';
import { authMiddleware, parseOr400, sendError } from '../middleware/index.js';
import { errors, jsonBody, registry, secured } from '../openapi/registry.js';
import {
  addClientMessage,
  cancelAppointment,
  createAppointment,
  findAppointment,
  findUserAdvisor,
  getAvailability,
  isSlotOpen,
  listAppointments,
  listMessages,
  rescheduleAppointment,
} from '../repositories/advisor.js';
import {
  AdvisorMessageCreateRequestSchema,
  AdvisorMessageSchema,
  AdvisorMessagesResponseSchema,
  AppointmentCreateRequestSchema,
  AppointmentIdParamsSchema,
  AppointmentPatchRequestSchema,
  AppointmentSchema,
  AppointmentsResponseSchema,
  AvailabilityQuerySchema,
  AvailabilityResponseSchema,
} from '../schemas/advisor.js';

registry.registerPath({
  method: 'get',
  path: '/api/advisor/availability',
  tags: ['Advisor'],
  summary: "Open meeting slots with the user's advisor over the next five business days",
  security: secured,
  request: { query: AvailabilityQuerySchema },
  responses: { 200: jsonBody(AvailabilityResponseSchema, 'Availability'), ...errors(400, 401, 404) },
});

registry.registerPath({
  method: 'get',
  path: '/api/advisor/appointments',
  tags: ['Advisor'],
  summary: "The user's meetings (past and upcoming), oldest first",
  security: secured,
  responses: { 200: jsonBody(AppointmentsResponseSchema, 'Appointments'), ...errors(401) },
});

registry.registerPath({
  method: 'post',
  path: '/api/advisor/appointments',
  tags: ['Advisor'],
  summary: 'Book a meeting in an open slot',
  security: secured,
  request: { body: jsonBody(AppointmentCreateRequestSchema) },
  responses: { 201: jsonBody(AppointmentSchema, 'Booked'), ...errors(400, 401, 404, 409) },
});

registry.registerPath({
  method: 'patch',
  path: '/api/advisor/appointments/{id}',
  tags: ['Advisor'],
  summary: 'Reschedule (new date and time) or cancel a scheduled meeting',
  security: secured,
  request: { params: AppointmentIdParamsSchema, body: jsonBody(AppointmentPatchRequestSchema) },
  responses: { 200: jsonBody(AppointmentSchema, 'Updated appointment'), ...errors(400, 401, 404, 409) },
});

registry.registerPath({
  method: 'get',
  path: '/api/advisor/messages',
  tags: ['Advisor'],
  summary: 'Secure message thread with the advisor, oldest first',
  security: secured,
  responses: { 200: jsonBody(AdvisorMessagesResponseSchema, 'Messages'), ...errors(401) },
});

registry.registerPath({
  method: 'post',
  path: '/api/advisor/messages',
  tags: ['Advisor'],
  summary: 'Send a message to the advisor',
  security: secured,
  request: { body: jsonBody(AdvisorMessageCreateRequestSchema) },
  responses: { 201: jsonBody(AdvisorMessageSchema, 'Sent message'), ...errors(400, 401, 404) },
});

const isUniqueViolation = (err: unknown) => err instanceof Error && /UNIQUE constraint failed/.test(err.message);

export function createAdvisorRouter(db: Db) {
  const router = Router();
  router.use(authMiddleware(db));

  /** Sends 404 and returns undefined when the user has no advisor assigned. */
  const advisorOr404 = (req: Request, res: Response) => {
    const advisor = findUserAdvisor(db, req.userId!);
    if (!advisor) sendError(req, res, 404, 'NO_ADVISOR', 'No advisor is assigned to this client.');
    return advisor;
  };

  const slotTaken = (req: Request, res: Response) =>
    sendError(req, res, 409, 'SLOT_UNAVAILABLE', 'That time is no longer available. Please pick another slot.');

  router.get('/availability', (req, res) => {
    if (!parseOr400(AvailabilityQuerySchema, req.query, req, res)) return;
    const advisor = advisorOr404(req, res);
    if (!advisor) return;
    res.json(AvailabilityResponseSchema.parse(getAvailability(db, advisor)));
  });

  router.get('/appointments', (req, res) => {
    res.json(AppointmentsResponseSchema.parse(listAppointments(db, req.userId!)));
  });

  router.post('/appointments', (req, res) => {
    const body = parseOr400(AppointmentCreateRequestSchema, req.body, req, res);
    if (!body) return;
    const advisor = advisorOr404(req, res);
    if (!advisor) return;
    if (!isSlotOpen(db, advisor, body.date, body.time)) return slotTaken(req, res);
    try {
      const id = createAppointment(db, req.userId!, advisor.id, body);
      res.status(201).json(AppointmentSchema.parse(findAppointment(db, req.userId!, id)));
    } catch (err) {
      if (isUniqueViolation(err)) return slotTaken(req, res); // booked by someone else a moment ago
      throw err;
    }
  });

  router.patch('/appointments/:id', (req, res) => {
    const body = parseOr400(AppointmentPatchRequestSchema, req.body, req, res);
    if (!body) return;
    const appointment = findAppointment(db, req.userId!, req.params.id);
    if (!appointment) {
      sendError(req, res, 404, 'NOT_FOUND', 'Appointment not found.');
      return;
    }
    if (appointment.status !== 'scheduled') {
      sendError(req, res, 409, 'NOT_SCHEDULED', `A ${appointment.status} appointment cannot be changed.`);
      return;
    }
    if (body.status === 'cancelled') {
      cancelAppointment(db, req.userId!, appointment.id);
    } else if (body.date && body.time) {
      const advisor = advisorOr404(req, res);
      if (!advisor) return;
      if (!isSlotOpen(db, advisor, body.date, body.time)) return slotTaken(req, res);
      try {
        rescheduleAppointment(db, req.userId!, appointment.id, body.date, body.time);
      } catch (err) {
        if (isUniqueViolation(err)) return slotTaken(req, res);
        throw err;
      }
    }
    res.json(AppointmentSchema.parse(findAppointment(db, req.userId!, appointment.id)));
  });

  router.get('/messages', (req, res) => {
    res.json(AdvisorMessagesResponseSchema.parse(listMessages(db, req.userId!)));
  });

  router.post('/messages', (req, res) => {
    const body = parseOr400(AdvisorMessageCreateRequestSchema, req.body, req, res);
    if (!body) return;
    const advisor = advisorOr404(req, res);
    if (!advisor) return;
    res.status(201).json(AdvisorMessageSchema.parse(addClientMessage(db, req.userId!, advisor.id, body.text)));
  });

  return router;
}
