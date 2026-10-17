import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, getSettings } from './db.js';
import { createApp, createRateLimiter } from './http.js';
import { createAuth, ensureAdmin } from './auth.js';
import { createPayments } from './payments.js';
import { createNotifier } from './notify.js';
import { createService } from './service.js';
import { registerRoutes } from './routes.js';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Builds all services around one SQLite database. `now` is injectable so tests can travel in time. */
export function createContext({ config, now = () => Date.now() }) {
  const db = openDb(config.dbPath);
  const ctx = { config, db, now };
  ctx.settings = () => getSettings(db);
  const pending = new Set();
  ctx.background = (p) => {
    const t = Promise.resolve(p)
      .catch((e) => console.error('[background]', e))
      .finally(() => pending.delete(t));
    pending.add(t);
    return t;
  };
  ctx.flush = async () => {
    while (pending.size) await Promise.all([...pending]);
  };
  ctx.limit = createRateLimiter(() => now());
  ctx.payments = createPayments(ctx);
  ctx.notifier = createNotifier(ctx);
  ctx.service = createService(ctx);
  ctx.auth = createAuth(ctx);
  ctx.bootstrapAdmin = ensureAdmin(ctx);
  ctx.service.generateSlots();
  return ctx;
}

export function createWebApp(ctx) {
  const app = createApp({ publicDir: path.join(here, '..', 'public') });
  registerRoutes(app, ctx);
  return app;
}

/** Background jobs: expire unpaid holds, send 2-hour reminders, keep generating future slots. */
export function startJobs(ctx) {
  const timers = [];
  const safe = (name, fn) => async () => {
    try { await fn(); } catch (e) { console.error(`[job:${name}]`, e.message); }
  };
  timers.push(setInterval(safe('expire', () => ctx.service.expireDue()), 15 * 1000));
  timers.push(setInterval(safe('reminders', () => ctx.service.runReminders()), 60 * 1000));
  timers.push(setInterval(safe('slots', () => ctx.service.generateSlots()), 6 * 3600 * 1000));
  for (const t of timers) t.unref();
  return () => timers.forEach(clearInterval);
}
