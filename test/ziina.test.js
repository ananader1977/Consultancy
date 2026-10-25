import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import { startTestApp } from './helpers.js';

// A tiny stand-in for the Ziina API
function fakeZiina() {
  const intents = new Map(); const calls = [];
  const server = http.createServer(async (req, res) => {
    let body = ''; for await (const c of req) body += c;
    const json = body ? JSON.parse(body) : null;
    calls.push({ method: req.method, url: req.url, body: json, auth: req.headers.authorization });
    const send = (code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (req.method === 'POST' && req.url === '/api/payment_intent') {
      const id = `pi_${crypto.randomBytes(6).toString('hex')}`;
      const pi = { id, status: 'requires_payment_instrument', amount: json.amount, currency_code: json.currency_code, redirect_url: `https://pay.ziina.test/${id}` };
      intents.set(id, pi); return send(201, pi);
    }
    const m = req.url.match(/^\/api\/payment_intent\/(.+)$/);
    if (req.method === 'GET' && m) return intents.has(m[1]) ? send(200, intents.get(m[1])) : send(404, { message: 'not found' });
    if (req.method === 'POST' && req.url === '/api/refund') return send(201, { id: json.id, status: 'pending' });
    if (req.method === 'POST' && req.url === '/api/webhook') return send(200, { success: true });
    send(404, {});
  });
  return new Promise((r) => server.listen(0, () => r({ server, intents, calls, base: `http://127.0.0.1:${server.address().port}/api` })));
}

describe('Ziina payments', () => {
  let app, z;
  const SECRET = 'whsec_test_123';
  before(async () => {
    z = await fakeZiina();
    app = await startTestApp({ paymentProvider: 'ziina', ziina: { apiKey: 'sk_test', webhookSecret: SECRET, test: true, baseUrl: z.base }, trustProxy: false });
    await app.login();
  });
  after(() => { app.close(); z.server.close(); });

  const hook = (payload, sig) => fetch(app.base + '/api/webhooks/ziina', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Hmac-Signature': sig ?? crypto.createHmac('sha256', SECRET).update(JSON.stringify(payload)).digest('hex') }, body: JSON.stringify(payload) });

  test('booking opens a Ziina hosted page for the right amount (in fils, AED, test flag)', async () => {
    const b = await app.book(app.slot(2, 10).id);
    assert.equal(b.status, 201);
    assert.match(b.body.checkoutUrl, /^https:\/\/pay\.ziina\.test\/pi_/);
    const c = z.calls.find((x) => x.url === '/api/payment_intent' && x.method === 'POST');
    assert.equal(c.auth, 'Bearer sk_test');
    assert.equal(c.body.amount, 30000);
    assert.equal(c.body.currency_code, 'AED');
    assert.equal(c.body.test, true);
    assert.match(c.body.success_url, /\/status\.html\?ref=CO-/);
  });

  test('webhook with a bad signature is refused; a valid one confirms only after re-checking Ziina', async () => {
    const b = await app.book(app.slot(2, 11).id);
    const id = new URL(b.body.checkoutUrl).pathname.slice(1);
    assert.equal((await hook({ event: 'payment_intent.status.updated', data: { id, status: 'completed' } }, 'bad')).status, 401);
    // payload says completed but Ziina says not yet -> stays pending
    assert.equal((await hook({ event: 'payment_intent.status.updated', data: { id, status: 'completed' } })).status, 200);
    await app.ctx.flush();
    assert.equal(app.dbBooking(b.body.reference).status, 'pending');
    z.intents.get(id).status = 'completed';
    assert.equal((await hook({ event: 'payment_intent.status.updated', data: { id, status: 'completed' } })).status, 200);
    await app.ctx.flush();
    const row = app.dbBooking(b.body.reference);
    assert.equal(row.status, 'confirmed');
    assert.equal(row.payment_ref, id);
    assert.ok(row.invoice_number);
  });

  test('returning to the status page confirms the payment even without the webhook', async () => {
    const b = await app.book(app.slot(2, 12).id);
    const id = new URL(b.body.checkoutUrl).pathname.slice(1);
    z.intents.get(id).status = 'completed';
    const st = await app.call('GET', `/api/bookings/${b.body.reference}/status?t=${b.body.token}`);
    assert.equal(st.body.status, 'confirmed');
  });

  test('admin cancellation returns the payment through the Ziina refund API', async () => {
    const b = await app.book(app.slot(3, 10).id);
    const id = new URL(b.body.checkoutUrl).pathname.slice(1);
    z.intents.get(id).status = 'completed';
    await app.call('GET', `/api/bookings/${b.body.reference}/status?t=${b.body.token}`);
    const row = app.dbBooking(b.body.reference);
    const r = await app.call('POST', `/api/admin/bookings/${row.id}/refund/approve`, {}, { admin: true });
    assert.equal(r.status, 200);
    const rf = z.calls.find((x) => x.url === '/api/refund');
    assert.equal(rf.body.payment_intent_id, id);
    assert.equal(rf.body.amount, 30000);
    assert.equal(app.dbBooking(b.body.reference).status, 'refunded');
  });
});
