// Payment providers: Ziina or Stripe Checkout (real card payments, AED) and a built-in mock for demos/tests.
// Card details are entered only on the provider's hosted page; this app never sees or stores them.
import crypto from 'node:crypto';
import { HttpError } from './http.js';
import { safeEqual } from './auth.js';

const STRIPE_API = 'https://api.stripe.com/v1';

export function createPayments(ctx) {
  const { db, config } = ctx;
  if (config.paymentProvider === 'ziina') return ziinaProvider(ctx);
  return config.paymentProvider === 'stripe' ? stripeProvider(ctx) : mockProvider(ctx);
}

function mockProvider(ctx) {
  const { db, config } = ctx;
  return {
    name: 'mock',
    async createCheckout(booking) {
      const id = `mock_${crypto.randomBytes(9).toString('hex')}`;
      db.prepare('INSERT INTO payment_sessions(id,booking_id,provider,status,amount,created_at) VALUES(?,?,?,?,?,?)').run(id, booking.id, 'mock', 'open', booking.total, ctx.now());
      return { id, url: `${config.baseUrl}/pay-mock.html?s=${id}&ref=${encodeURIComponent(booking.reference)}&t=${booking.manage_token}` };
    },
    /** -> { paid: boolean, paymentRef?: string, expired?: boolean } */
    async retrieve(sessionId) {
      const s = db.prepare('SELECT * FROM payment_sessions WHERE id=?').get(sessionId);
      if (!s) return { paid: false, expired: true };
      return { paid: s.status === 'paid', paymentRef: s.payment_ref, expired: s.status === 'expired' };
    },
    async expireSession(sessionId) {
      db.prepare("UPDATE payment_sessions SET status='expired' WHERE id=? AND status='open'").run(sessionId);
    },
    async refund(booking) {
      return { id: `re_mock_${crypto.randomBytes(6).toString('hex')}` };
    },
    /** Mock-only: customer "pays" on the demo checkout page. */
    completeMock(sessionId) {
      const s = db.prepare('SELECT * FROM payment_sessions WHERE id=?').get(sessionId);
      if (!s || s.provider !== 'mock') throw new HttpError(404, 'Payment session not found');
      if (s.status === 'expired') throw new HttpError(410, 'This payment session has expired.');
      const ref = s.payment_ref || `pi_mock_${crypto.randomBytes(8).toString('hex')}`;
      db.prepare("UPDATE payment_sessions SET status='paid', payment_ref=? WHERE id=?").run(ref, sessionId);
      return { bookingId: s.booking_id, paymentRef: ref };
    },
  };
}

function stripeProvider(ctx) {
  const { config } = ctx;
  const call = async (method, path, params, extraHeaders = {}) => {
    const res = await fetch(`${STRIPE_API}${path}`, {
      method,
      headers: { Authorization: `Bearer ${config.stripe.secretKey}`, ...(params ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}), ...extraHeaders },
      body: params ? new URLSearchParams(params).toString() : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(`Stripe ${method} ${path} failed: ${data?.error?.message || res.status}`);
      err.stripe = data?.error;
      throw err;
    }
    return data;
  };
  return {
    name: 'stripe',
    async createCheckout(booking) {
      const base = config.baseUrl;
      const lockSec = Math.max(1800, 0); // Stripe requires >= 30 min; we expire it ourselves at lock expiry
      const data = await call('POST', '/checkout/sessions', {
        mode: 'payment',
        'payment_method_types[0]': 'card',
        success_url: `${base}/status.html?ref=${encodeURIComponent(booking.reference)}&t=${booking.manage_token}`,
        cancel_url: `${base}/status.html?ref=${encodeURIComponent(booking.reference)}&t=${booking.manage_token}&cancelled=1`,
        ...(booking.email ? { customer_email: booking.email } : {}),
        client_reference_id: String(booking.id),
        'metadata[booking_id]': String(booking.id),
        'metadata[reference]': booking.reference,
        'line_items[0][quantity]': '1',
        'line_items[0][price_data][currency]': 'aed',
        'line_items[0][price_data][unit_amount]': String(Math.round(booking.total * 100)),
        'line_items[0][price_data][product_data][name]': `Consultation (${booking.service_name}) - ${booking.reference}`,
        expires_at: String(Math.floor(ctx.now() / 1000) + lockSec),
      });
      return { id: data.id, url: data.url };
    },
    async retrieve(sessionId) {
      const s = await call('GET', `/checkout/sessions/${encodeURIComponent(sessionId)}`);
      return { paid: s.payment_status === 'paid', paymentRef: s.payment_intent || s.id, expired: s.status === 'expired' };
    },
    async expireSession(sessionId) {
      try { await call('POST', `/checkout/sessions/${encodeURIComponent(sessionId)}/expire`, {}); } catch { /* already completed/expired */ }
    },
    async refund(booking) {
      const r = await call('POST', '/refunds', { payment_intent: booking.payment_ref, 'metadata[reference]': booking.reference }, { 'Idempotency-Key': `refund-${booking.id}-${booking.payment_ref}` });
      return { id: r.id };
    },
    /** Verifies a Stripe webhook signature header; returns the parsed event or throws. */
    verifyWebhook(rawBody, header) {
      const secret = config.stripe.webhookSecret;
      if (!secret) throw new HttpError(400, 'Webhook secret not configured');
      const parts = Object.fromEntries(String(header || '').split(',').map((p) => p.split('=')));
      const t = parts.t;
      if (!t || !parts.v1) throw new HttpError(400, 'Bad signature header');
      const expected = crypto.createHmac('sha256', secret).update(`${t}.${rawBody.toString('utf8')}`).digest('hex');
      if (!safeEqual(expected, parts.v1)) throw new HttpError(400, 'Invalid signature');
      if (Math.abs(ctx.now() / 1000 - Number(t)) > 300) throw new HttpError(400, 'Signature timestamp too old');
      return JSON.parse(rawBody.toString('utf8'));
    },
  };
}

// Ziina (UAE): hosted payment page via payment intents. Docs: https://docs.ziina.com
export const ZIINA_WEBHOOK_IPS = ['3.29.184.186', '3.29.190.95', '20.233.47.127', '13.202.161.181'];

function ziinaProvider(ctx) {
  const { db, config } = ctx;
  const z = config.ziina;
  const call = async (method, path, body) => {
    const res = await fetch(`${z.baseUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${z.apiKey}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Ziina ${method} ${path} failed: ${data?.message || data?.error || res.status}`);
    return data;
  };
  const statusUrl = (b, extra = '') => `${config.baseUrl}/status.html?ref=${encodeURIComponent(b.reference)}&t=${b.manage_token}${extra}`;
  return {
    name: 'ziina',
    async createCheckout(booking) {
      const now = ctx.now();
      const expiry = Math.max(booking.lock_expires || 0, now + 15 * 60 * 1000); // late payments are still handled safely
      const data = await call('POST', '/payment_intent', {
        amount: Math.round(booking.total * 100),
        currency_code: 'AED',
        message: `${booking.service_name} session - ${booking.reference}`.slice(0, 100),
        success_url: statusUrl(booking),
        cancel_url: statusUrl(booking, '&cancelled=1'),
        failure_url: statusUrl(booking, '&failed=1'),
        expiry: String(expiry),
        test: z.test,
        allow_tips: false,
      });
      db.prepare('INSERT OR REPLACE INTO payment_sessions(id,booking_id,provider,status,amount,created_at) VALUES(?,?,?,?,?,?)').run(data.id, booking.id, 'ziina', 'open', booking.total, now);
      return { id: data.id, url: data.redirect_url };
    },
    async retrieve(intentId) {
      const pi = await call('GET', `/payment_intent/${encodeURIComponent(intentId)}`);
      return { paid: pi.status === 'completed', paymentRef: pi.id, expired: pi.status === 'canceled' || pi.status === 'failed', status: pi.status, amount: pi.amount };
    },
    async expireSession(intentId) {
      // Ziina has no "cancel intent" call; the intent expires by itself. Mark it so a late payment is checked, not trusted blindly.
      db.prepare("UPDATE payment_sessions SET status='expired' WHERE id=? AND status='open'").run(intentId);
    },
    async refund(booking) {
      const id = crypto.randomUUID();
      const r = await call('POST', '/refund', { id, payment_intent_id: booking.payment_ref, amount: Math.round(booking.total * 100), currency_code: 'AED', ...(z.test ? { test: true } : {}) });
      return { id: r.id || id };
    },
    /** Webhook check: HMAC-SHA256 of the raw body (X-Hmac-Signature) + Ziina's sender IPs. */
    verifyWebhook(rawBody, signature, senderIp) {
      if (!z.webhookSecret) throw new HttpError(400, 'Webhook secret not configured');
      const expected = crypto.createHmac('sha256', z.webhookSecret).update(rawBody).digest('hex');
      if (!signature || !safeEqual(expected, String(signature).toLowerCase())) throw new HttpError(401, 'Invalid signature');
      if (senderIp && !ZIINA_WEBHOOK_IPS.includes(senderIp.replace(/^::ffff:/, ''))) throw new HttpError(403, 'Unknown sender');
      return JSON.parse(rawBody.toString('utf8'));
    },
    bookingForIntent(intentId) {
      return db.prepare('SELECT booking_id FROM payment_sessions WHERE id=?').get(String(intentId))?.booking_id ?? null;
    },
    /** Registers (or updates) this site's webhook URL with Ziina. */
    async registerWebhook() {
      return call('POST', '/webhook', { url: `${config.baseUrl}/api/webhooks/ziina`, secret: z.webhookSecret });
    },
  };
}
