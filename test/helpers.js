import { loadConfig } from '../src/config.js';
import { createContext, createWebApp } from '../src/app.js';
import { dubaiMidnight, HOUR, DAY } from '../src/time.js';

// Monday 19 Oct 2026, 08:00 Dubai time (04:00 UTC). Time is FROZEN and only moves when a test advances it.
export const START = Date.UTC(2026, 9, 19, 4, 0, 0);

export async function startTestApp(overrides = {}, { frozenAt = START } = {}) {
  let t = frozenAt;
  const clock = { now: () => t, advance: (ms) => { t += ms; }, set: (v) => { t = v; } };
  const config = {
    ...loadConfig({}),
    dbPath: ':memory:',
    paymentProvider: 'mock',
    jobs: false,
    disableRateLimit: true,
    adminEmail: 'admin@test.local',
    adminPassword: 'TestPass12345',
    ...overrides,
  };
  const ctx = createContext({ config, now: clock.now });
  const app = createWebApp(ctx);
  const server = app.server();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  config.baseUrl = base;

  let cookie = '';
  async function call(method, path, body, { admin = false, headers = {}, raw = false } = {}) {
    const h = {};
    if (body !== undefined) h['Content-Type'] = 'application/json';
    if (admin) {
      h.Cookie = cookie;
      h['X-Requested-With'] = 'co';
    }
    Object.assign(h, headers);
    const res = await fetch(base + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    if (raw) return res;
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = text; }
    return { status: res.status, body: json, headers: res.headers };
  }
  async function login(email = 'admin@test.local', password = 'TestPass12345') {
    const res = await fetch(base + '/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    const set = res.headers.get('set-cookie');
    if (res.status === 200) cookie = set.split(';')[0];
    return res;
  }
  const slot = (dayOffset, hour) => {
    const ts = dubaiMidnight(clock.now()) + dayOffset * DAY + hour * HOUR;
    return ctx.db.prepare('SELECT id, start_ts, end_ts FROM slots WHERE start_ts=?').get(ts);
  };
  const customer = (extra = {}) => ({ name: 'Test Customer', mobile: '+971501234567', email: 'customer@example.com', serviceId: 1, platform: 'Zoom', acceptTerms: true, ...extra });
  const book = (slotId, extra = {}) => call('POST', '/api/bookings', customer({ slotId, ...extra }));
  /** Customer pays on the (mock) checkout page. */
  async function pay(booking) {
    const sid = new URL(booking.body.checkoutUrl).searchParams.get('s');
    const r = await call('POST', `/api/pay/mock/${sid}/complete`, {});
    await ctx.flush();
    return r;
  }
  const status = (b) => call('GET', `/api/bookings/${b.body.reference}/status?t=${b.body.token}`);
  const dbBooking = (reference) => ctx.db.prepare('SELECT * FROM bookings WHERE reference=?').get(reference);
  const close = async () => { await ctx.flush(); await new Promise((r) => server.close(r)); };
  return { ctx, clock, config, base, call, login, slot, customer, book, pay, status, dbBooking, close };
}
