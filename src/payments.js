// Payment providers: Stripe Checkout (real card payments, AED) and a built-in mock for demos/tests.
import crypto from 'node:crypto';
import { HttpError } from './http.js';
import { safeEqual } from './auth.js';

const STRIPE_API = 'https://api.stripe.com/v1';

export function createPayments(ctx) {
  const { db, config } = ctx;
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
