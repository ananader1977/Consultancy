import { HttpError } from './http.js';
import { hashPassword, verifyPassword, validatePasswordStrength, safeEqual } from './auth.js';
import { PLATFORMS } from './service.js';
import { renderInvoicePdf } from './invoice.js';
import { buildIcs } from './ics.js';
import { parseDateKey, dubaiMidnight, DAY, fmtRange, fmtStamp, money } from './time.js';
import { isEmail, clampStr } from './util.js';

const DUMMY_HASH = hashPassword('dummy-password-for-timing');

export function registerRoutes(app, ctx) {
  const { service: svc, config } = ctx;
  const limit = (...a) => { if (!config.disableRateLimit) ctx.limit(...a); };
  const ip = (req) => (config.trustProxy ? String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() : '') || req.ip_;
  const admin = (req) => ctx.auth.requireAdmin(req);
  const idParam = (req) => {
    const n = Number(req.params.id);
    if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, 'Invalid id');
    return n;
  };
  const dateRange = (req, maxDays) => {
    const today = dubaiMidnight(ctx.now());
    const from = req.query.from ? parseDateKey(req.query.from) : today;
    const to = req.query.to ? parseDateKey(req.query.to) : from + 7 * DAY;
    if (from === null || to === null) throw new HttpError(400, 'Dates must be YYYY-MM-DD');
    if (to <= from || to - from > maxDays * DAY) throw new HttpError(400, `Date range must be 1-${maxDays} days`);
    return [from, to];
  };

  app.get('/api/health', (req, res) => res.json({ ok: true, time: ctx.now(), payments: ctx.payments.name }));

  // ======================== public: booking ========================
  app.get('/api/config', (req, res) => {
    const s = ctx.settings();
    const services = ctx.db.prepare('SELECT * FROM services WHERE active=1 ORDER BY price').all().map((x) => ({
      id: x.id, name: x.name, kind: x.kind, description: x.description, price: x.price, ...svc.breakdown(x.price, s),
    }));
    res.json({
      company: s.company_name, companyAr: s.company_name_ar, address: s.company_address, services, vatRate: s.vat_rate, pricesIncludeVat: s.prices_include_vat,
      lockMinutes: s.lock_minutes, freeRescheduleHours: s.free_reschedule_hours, workStart: s.work_start, workEnd: s.work_end,
      lunchStart: s.lunch_start, closedDays: s.closed_days, slotDays: s.slot_days, platforms: PLATFORMS, timezone: 'Asia/Dubai',
      now: ctx.now(), today: dubaiMidnight(ctx.now()), paymentProvider: ctx.payments.name,
    });
  });
  app.get('/api/contact', (req, res) => {
    const s = ctx.settings();
    res.json({ company: s.company_name, companyAr: s.company_name_ar, phone: s.contact_phone, email: s.contact_email, facebook: s.facebook, address: s.company_address });
  });
  app.get('/api/terms', (req, res) => {
    const s = ctx.settings();
    const ar = req.query.lang === 'ar';
    res.json({ company: ar ? s.company_name_ar || s.company_name : s.company_name, text: ar ? s.terms_text_ar || s.terms_text : s.terms_text });
  });

  app.get('/api/slots', (req, res) => {
    const [from, to] = dateRange(req, 42);
    res.json({ slots: svc.listAvailableSlots(from, to), now: ctx.now() });
  });

  app.post('/api/bookings', async (req, res) => {
    limit(`book:${ip(req)}`, 12, 10 * 60 * 1000);
    const body = await req.json();
    const { booking, checkoutUrl } = await svc.createBooking(body);
    res.json({ reference: booking.reference, token: booking.manage_token, checkoutUrl, lockExpires: booking.lock_expires, total: booking.total }, 201);
  });

  app.get('/api/bookings/:ref/status', async (req, res) => {
    const b = svc.bookingByToken(req.params.ref, req.query.t);
    const fresh = await svc.syncPayment(b.id);
    res.json(svc.manageView(fresh));
  });

  // ======================== public: manage booking ========================
  app.post('/api/manage/lookup', async (req, res) => {
    limit(`lookup:${ip(req)}`, 10, 10 * 60 * 1000);
    const { reference, mobile, email } = await req.json();
    const b = svc.lookup(reference, { mobile, email });
    res.json({ reference: b.reference, token: b.manage_token });
  });
  app.get('/api/manage/:ref', async (req, res) => {
    const b = svc.bookingByToken(req.params.ref, req.query.t);
    res.json(svc.manageView(await svc.syncPayment(b.id)));
  });
  app.post('/api/manage/:ref/reschedule', async (req, res) => {
    limit(`resched:${ip(req)}`, 20, 10 * 60 * 1000);
    const body = await req.json();
    const b = svc.bookingByToken(req.params.ref, body.t);
    res.json(svc.manageView(svc.reschedule(b.id, body.slotId, { by: 'customer' })));
  });
  app.post('/api/manage/:ref/refund-request', async (req, res) => {
    limit(`refundreq:${ip(req)}`, 10, 10 * 60 * 1000);
    const body = await req.json();
    const b = svc.bookingByToken(req.params.ref, body.t);
    void b; // clients can no longer cancel online; admin handles any cancellation
    throw new HttpError(403, 'Online cancellation is not available. Please contact us.');
  });

  // invoice PDFs (link in the confirmation email is protected by a signed token)
  const invoiceByNumber = (req) => {
    const inv = ctx.db.prepare('SELECT i.*, b.reference FROM invoices i JOIN bookings b ON b.id=i.booking_id WHERE i.number=?').get(req.params.number);
    if (!inv || !safeEqual(svc.invoiceToken(inv.number), String(req.query.t || ''))) throw new HttpError(404, 'Invoice not found');
    return inv;
  };
  const pdf = (res, buf, name) => res.send(buf, 'application/pdf', 200, { 'Content-Disposition': `inline; filename="${name}"` });
  app.get('/api/invoices/:number/pdf', (req, res) => {
    const inv = invoiceByNumber(req);
    pdf(res, renderInvoicePdf(inv, { contact: ctx.settings() }), `${inv.number}.pdf`);
  });
  app.get('/api/invoices/:number/credit-note.pdf', (req, res) => {
    const inv = invoiceByNumber(req);
    if (!inv.credit_note_number) throw new HttpError(404, 'No credit note for this invoice');
    pdf(res, renderInvoicePdf(inv, { creditNote: true, contact: ctx.settings() }), `${inv.credit_note_number}.pdf`);
  });

  // ======================== payments ========================
  app.post('/api/webhooks/stripe', async (req, res) => {
    if (ctx.payments.name !== 'stripe') throw new HttpError(404, 'Not found');
    const event = ctx.payments.verifyWebhook(await req.rawBody(), req.headers['stripe-signature']);
    const obj = event.data?.object;
    if ((event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') && obj?.payment_status === 'paid') {
      const id = Number(obj.metadata?.booking_id || obj.client_reference_id);
      if (Number.isInteger(id)) await svc.handlePayment(id, obj.payment_intent || obj.id, { actor: 'stripe-webhook' });
    }
    res.json({ received: true });
  });

  // demo checkout (PAYMENT_PROVIDER=mock only)
  app.get('/api/pay/mock/:sid', (req, res) => {
    if (ctx.payments.name !== 'mock') throw new HttpError(404, 'Not found');
    const s = ctx.db.prepare('SELECT * FROM payment_sessions WHERE id=?').get(req.params.sid);
    if (!s) throw new HttpError(404, 'Payment session not found');
    const b = svc.bookingById(s.booking_id);
    res.json({ amount: s.amount, status: s.status, reference: b.reference, service: b.service_name, when: fmtRange(b.start_ts, b.end_ts), lockExpires: b.lock_expires, bookingStatus: b.status });
  });
  app.post('/api/pay/mock/:sid/complete', async (req, res) => {
    if (ctx.payments.name !== 'mock') throw new HttpError(404, 'Not found');
    const done = ctx.payments.completeMock(req.params.sid);
    const r = await svc.handlePayment(done.bookingId, done.paymentRef, { actor: 'mock-checkout' });
    res.json({ ok: true, conflict: !!r.conflict });
  });

  // ======================== calendar feed (subscribe in Zoho Calendar / Outlook / Google) ========================
  app.get('/calendar.ics', (req, res) => {
    const key = ctx.db.prepare("SELECT value FROM settings WHERE key='feed_key'").get().value;
    if (!safeEqual(String(req.query.key || ''), key)) throw new HttpError(404, 'Not found');
    const s = ctx.settings();
    const events = svc.feedEvents().map((b) => ({
      uid: `${b.reference}@consultancy-operation`, start: b.start_ts, end: b.end_ts,
      summary: `${b.payment_status === 'paid' ? '[PAID] ' : '[UNPAID] '}${b.customer_name} - ${b.service_name}`,
      description: `Ref ${b.reference}\nCustomer: ${b.customer_name}\nMobile: ${b.mobile}\nEmail: ${b.email || '-'}\nTotal: AED ${money(b.total)}${b.meeting_link ? '\nLink: ' + b.meeting_link : ''}`,
      location: b.service_kind === 'online' ? `${b.platform || 'Online'} ${b.meeting_link || ''}`.trim() : s.company_address || 'Office',
      color: b.payment_status === 'paid' ? 'green' : 'orange',
      status: b.status === 'pending' ? 'TENTATIVE' : 'CONFIRMED',
    }));
    res.send(buildIcs(events, { name: `${s.company_name} bookings`, alarmMinutes: s.reminder_hours * 60, now: ctx.now() }), 'text/calendar; charset=utf-8');
  });

  // ======================== admin: auth ========================
  app.post('/api/admin/login', async (req, res) => {
    const { email = '', password = '' } = await req.json();
    const key = String(email).toLowerCase();
    limit(`login:${ip(req)}:${key}`, 8, 10 * 60 * 1000);
    limit(`login-ip:${ip(req)}`, 30, 10 * 60 * 1000);
    const row = ctx.db.prepare('SELECT * FROM admins WHERE email=?').get(key);
    const ok = verifyPassword(String(password), row ? row.password_hash : DUMMY_HASH) && !!row;
    if (!ok) throw new HttpError(401, 'Incorrect email or password.');
    ctx.auth.startSession(res, row.id);
    res.json({ admin: { id: row.id, email: row.email, name: row.name } });
  });
  app.post('/api/admin/logout', (req, res) => {
    ctx.auth.endSession(res);
    res.json({ ok: true });
  });
  app.get('/api/admin/me', (req, res) => {
    const a = ctx.auth.currentAdmin(req);
    if (!a) throw new HttpError(401, 'Please sign in.');
    res.json({ admin: a });
  });
  app.post('/api/admin/password', admin, async (req, res) => {
    const { current = '', password = '' } = await req.json();
    const row = ctx.db.prepare('SELECT * FROM admins WHERE id=?').get(req.admin.id);
    if (!verifyPassword(String(current), row.password_hash)) throw new HttpError(403, 'Current password is incorrect.');
    validatePasswordStrength(password);
    ctx.db.prepare('UPDATE admins SET password_hash=? WHERE id=?').run(hashPassword(password), req.admin.id);
    res.json({ ok: true });
  });
  app.get('/api/admin/admins', admin, (req, res) => res.json({ admins: ctx.db.prepare('SELECT id,email,name,created_at FROM admins ORDER BY id').all() }));
  app.post('/api/admin/admins', admin, async (req, res) => {
    const b = await req.json();
    const email = clampStr(b.email, 254).toLowerCase();
    if (!isEmail(email)) throw new HttpError(400, 'Invalid email address.');
    validatePasswordStrength(b.password);
    try {
      const r = ctx.db.prepare('INSERT INTO admins(email,name,password_hash,created_at) VALUES(?,?,?,?)').run(email, clampStr(b.name, 100), hashPassword(b.password), ctx.now());
      svc.audit(req.admin.email, 'admin.created', null, email);
      res.json({ id: Number(r.lastInsertRowid), email }, 201);
    } catch (e) {
      if (/UNIQUE/i.test(e.message)) throw new HttpError(409, 'An admin with that email already exists.');
      throw e;
    }
  });
  app.delete('/api/admin/admins/:id', admin, (req, res) => {
    const id = idParam(req);
    if (id === req.admin.id) throw new HttpError(400, 'You cannot delete your own account.');
    ctx.db.prepare('DELETE FROM admins WHERE id=?').run(id);
    svc.audit(req.admin.email, 'admin.deleted', null, String(id));
    res.json({ ok: true });
  });

  // ======================== admin: dashboard / calendar / bookings ========================
  app.get('/api/admin/dashboard', admin, (req, res) => res.json(svc.dashboard()));
  app.get('/api/admin/reminders', admin, (req, res) => {
    const s = ctx.settings();
    res.json({ hours: s.reminder_hours, bookings: svc.upcomingWithin(s.reminder_hours).map(svc.publicAdminBooking) });
  });
  app.get('/api/admin/calendar', admin, (req, res) => {
    const [from, to] = dateRange(req, 42);
    res.json({ slots: svc.adminCalendar(from, to), now: ctx.now() });
  });
  app.get('/api/admin/bookings', admin, (req, res) => res.json({ bookings: svc.listBookings({ status: req.query.status, search: req.query.q, limit: req.query.limit }) }));
  app.get('/api/admin/bookings/:id', admin, (req, res) => {
    const id = idParam(req);
    const b = svc.bookingById(id);
    if (!b) throw new HttpError(404, 'Booking not found');
    const inv = svc.invoiceFull(id);
    const trail = ctx.db.prepare('SELECT ts,actor,action,detail FROM audit WHERE booking_id=? ORDER BY id DESC LIMIT 50').all(id);
    res.json({ booking: svc.publicAdminBooking(b), invoice: inv ? { id: inv.id, number: inv.number, status: inv.status, creditNote: inv.credit_note_number } : null, audit: trail });
  });
  app.post('/api/admin/bookings', admin, async (req, res) => {
    const body = await req.json();
    const r = await svc.adminCreateBooking(body, req.admin.email, { markPaid: body.markPaid === true });
    res.json({ booking: svc.publicAdminBooking(r.booking), checkoutUrl: r.checkoutUrl }, 201);
  });
  app.patch('/api/admin/bookings/:id', admin, async (req, res) => res.json({ booking: svc.publicAdminBooking(svc.adminUpdateBooking(idParam(req), await req.json(), req.admin.email)) }));
  app.post('/api/admin/bookings/:id/reschedule', admin, async (req, res) => {
    const b = await req.json();
    res.json({ booking: svc.publicAdminBooking(svc.reschedule(idParam(req), b.slotId, { by: 'admin', reason: b.reason })) });
  });
  app.post('/api/admin/bookings/:id/refund/approve', admin, async (req, res) => res.json({ booking: svc.publicAdminBooking(await svc.approveRefund(idParam(req), req.admin.email)) }));
  app.post('/api/admin/bookings/:id/refund/reject', admin, async (req, res) => res.json({ booking: svc.publicAdminBooking(svc.rejectRefund(idParam(req), req.admin.email)) }));
  app.post('/api/admin/bookings/:id/mark-paid', admin, async (req, res) => res.json({ booking: svc.publicAdminBooking(await svc.markPaidManually(idParam(req), req.admin.email)) }));
  app.post('/api/admin/bookings/:id/cancel', admin, (req, res) => res.json({ booking: svc.publicAdminBooking(svc.cancelPending(idParam(req), req.admin.email)) }));

  // ======================== admin: slots / services / settings / invoices ========================
  app.post('/api/admin/slots/generate', admin, (req, res) => res.json({ created: svc.generateSlots() }));
  app.post('/api/admin/slots/:id/block', admin, async (req, res) => {
    const { blocked = true } = await req.json();
    svc.setSlotBlocked(idParam(req), blocked !== false, req.admin.email);
    res.json({ ok: true });
  });
  app.get('/api/admin/services', admin, (req, res) => res.json({ services: ctx.db.prepare('SELECT * FROM services ORDER BY id').all() }));
  app.post('/api/admin/services', admin, async (req, res) => res.json({ service: svc.upsertService(null, await req.json(), req.admin.email) }, 201));
  app.put('/api/admin/services/:id', admin, async (req, res) => res.json({ service: svc.upsertService(idParam(req), await req.json(), req.admin.email) }));
  app.get('/api/admin/settings', admin, (req, res) => {
    const s = ctx.settings();
    const { _secret, feed_key, ...rest } = s;
    res.json({ settings: rest, feedUrl: `${config.baseUrl}/calendar.ics?key=${feed_key}`, provider: ctx.payments.name, smtpConfigured: !!config.smtp.host, whatsappConfigured: !!(config.whatsapp.token && config.whatsapp.phoneNumberId), baseUrl: config.baseUrl });
  });
  app.put('/api/admin/settings', admin, async (req, res) => {
    const s = svc.updateSettings(await req.json(), req.admin.email);
    const { _secret, feed_key, ...rest } = s;
    res.json({ settings: rest });
  });
  app.post('/api/admin/test-email', admin, async (req, res) => {
    res.json(await ctx.notifier.testEmail());
  });
  app.get('/api/admin/invoices', admin, (req, res) => {
    const rows = ctx.db.prepare(`SELECT i.id,i.number,i.issued_at,i.customer_name,i.net,i.vat,i.total,i.status,i.credit_note_number,b.reference
      FROM invoices i JOIN bookings b ON b.id=i.booking_id ORDER BY i.id DESC LIMIT 500`).all();
    res.json({ invoices: rows });
  });
  const invoiceById = (req) => {
    const inv = ctx.db.prepare('SELECT i.*, b.reference FROM invoices i JOIN bookings b ON b.id=i.booking_id WHERE i.id=?').get(idParam(req));
    if (!inv) throw new HttpError(404, 'Invoice not found');
    return inv;
  };
  app.get('/api/admin/invoices/:id/pdf', admin, (req, res) => {
    const inv = invoiceById(req);
    pdf(res, renderInvoicePdf(inv, { contact: ctx.settings() }), `${inv.number}.pdf`);
  });
  app.get('/api/admin/invoices/:id/credit-note.pdf', admin, (req, res) => {
    const inv = invoiceById(req);
    if (!inv.credit_note_number) throw new HttpError(404, 'No credit note for this invoice');
    pdf(res, renderInvoicePdf(inv, { creditNote: true, contact: ctx.settings() }), `${inv.credit_note_number}.pdf`);
  });
  app.get('/api/admin/outbox', admin, (req, res) => {
    res.json({ messages: ctx.db.prepare('SELECT id,ts,channel,to_addr,subject,status,error,booking_id,attachment FROM outbox ORDER BY id DESC LIMIT ?').all(Math.min(Number(req.query.limit) || 100, 300)) });
  });
}
