import { createApp } from './app.js';
import { config } from './config.js';
import { openDatabase } from './db/connection.js';

const db = openDatabase(config.dbPath);
const app = createApp({ db, corsOrigins: config.corsOrigins });

const server = app.listen(config.port, () => {
  console.log(`Electric Wealth API listening on http://localhost:${config.port}`);
  console.log(`  API docs:  http://localhost:${config.port}/docs`);
  console.log(`  Database:  ${config.dbPath}`);
});

// Close the database cleanly so the file isn't left locked (matters on Windows).
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close();
    db.close();
    process.exit(0);
  });
}
