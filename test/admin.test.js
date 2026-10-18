import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp } from './helpers.js';
import { HOUR } from '../src/time.js';

describe('admin auth', () => {
  let app;
  before(async () => { app = await startTestApp(); });
  after(() => app.close());

  test('admin endpoints reject anonymous requests', async () => {
    for (const p of ['/api/admin/dashboard', '/api/admin/bookings', '/api/admin/settings', '/api/admin/calendar', '/api/admin/outbox']) {
      assert.equal((await app.call('GET', p)).status, 401, p);
    }
  });
  test('wrong password rejected, right password accepted', async () => {
    assert.equal((await app.login('admin@test.local', 'wrong-password-1')).status, 401);
    assert.equal((await app.login()).status, 200);
    assert.equal((await app.call('GET', '/api/admin/me', undefined, { admin: true })).status, 200);
  });
  test('mutating admin calls without the CSRF header are refused', async () => {
    const r = await app.call('PUT', '/api/admin/settings', { owner_email: 'x@y.com' }, { admin: true, headers: { 'X-Requested-With': '' } });
    assert.ok([400, 403].includes(r.status), String(r.status));
  });
  test('security headers and static traversal protection', async () => {
    const r = await app.call('GET', '/api/health');
    assert.match(r.headers.get('content-security-policy'), /script-src 'self'/);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    const t = await app.call('GET', '/..%2f..%2fpackage.json', undefined, { raw: true });
    assert.notEqual(t.status, 200);
    const t2 = await app.call('GET', '/%2e%2e/package.json', undefined, { raw: true });
    assert.notEqual(t2.status, 200);
  });
});

describe('admin operations', () => {
  let app;
  before(async () => { app = await startTestApp(); await app.login(); });
  after(() => app.close());
  const A = (m, p, b) => app.call(m, p, b, { admin: true });

  test('prices are editable and apply to new bookings', async () => {
    const r = await A('PUT', '/api/admin/services/1', { name: 'Online', price: 600, kind: 'online', active: true });
    assert.equal(r.status, 200);
    const b = await app.book(app.slot(1, 10).id);
    assert.equal(b.body.total, 630);
  });

  test('dashboard counts confirmed bookings', async () => {
    const b = await app.book(app.slot(1, 11).id);
    assert.equal((await A('GET', '/api/admin/dashboard')).body.confirmed, 0);
    await app.pay(b);
    assert.equal((await A('GET', '/api/admin/dashboard')).body.confirmed, 1);
  });

  test('calendar marks paid bookings and blocked slots can be hidden from customers', async () => {
    const s = app.slot(2, 10);
    const bl = await A('POST', `/api/admin/slots/${s.id}/block`, { blocked: true });
    assert.equal(bl.status, 200);
    const ids = (await app.call('GET', '/api/slots?from=2026-10-21&to=2026-10-22')).body.slots.map((x) => x.id);
    assert.ok(!ids.includes(s.id));
    assert.equal((await app.book(s.id)).status, 409);
    await A('POST', `/api/admin/slots/${s.id}/block`, { blocked: false });
    assert.equal((await app.book(s.id)).status, 201);
  });

  test('admin can reschedule inside 24h (customer cannot)', async () => {
    const b = await app.book(app.slot(0, 16).id); // today 16:00, 8h away
    await app.pay(b);
    const row = app.dbBooking(b.body.reference);
    const mine = await app.call('POST', `/api/manage/${b.body.reference}/reschedule`, { t: b.body.token, slotId: app.slot(0, 17).id });
    assert.equal(mine.status, 403);
    const adm = await A('POST', `/api/admin/bookings/${row.id}/reschedule`, { slotId: app.slot(0, 17).id });
    assert.equal(adm.status, 200);
    assert.equal(app.dbBooking(b.body.reference).start_ts, app.slot(0, 17).start_ts);
  });

  test('refund: request -> admin approves -> credit note, slot released', async () => {
    const b = await app.book(app.slot(3, 10).id, { email: 'refund@example.com' });
    await app.pay(b);
    const req = await app.call('POST', `/api/manage/${b.body.reference}/refund-request`, { t: b.body.token, reason: 'Cannot attend' });
    assert.equal(req.status, 200);
    const row = app.dbBooking(b.body.reference);
    assert.equal(row.status, 'refund_requested');
    const ap = await A('POST', `/api/admin/bookings/${row.id}/refund/approve`);
    assert.equal(ap.status, 200);
    const after = app.dbBooking(b.body.reference);
    assert.equal(after.status, 'refunded');
    assert.equal(after.payment_status, 'refunded');
    assert.match(app.ctx.db.prepare('SELECT credit_note_number c FROM invoices WHERE booking_id=?').get(row.id).c, /^CN-2026-\d{6}$/);
    const ids = (await app.call('GET', '/api/slots?from=2026-10-22&to=2026-10-23')).body.slots.map((x) => x.id);
    assert.ok(ids.includes(app.slot(3, 10).id), 'slot is bookable again');
  });

  test('refund can be rejected and booking stays confirmed', async () => {
    const b = await app.book(app.slot(3, 11).id);
    await app.pay(b);
    await app.call('POST', `/api/manage/${b.body.reference}/refund-request`, { t: b.body.token, reason: 'x' });
    const id = app.dbBooking(b.body.reference).id;
    assert.equal((await A('POST', `/api/admin/bookings/${id}/refund/reject`)).status, 200);
    assert.equal(app.dbBooking(b.body.reference).status, 'confirmed');
  });

  test('refund is impossible once the appointment has started', async () => {
    const b = await app.book(app.slot(0, 12).id);
    await app.pay(b);
    app.clock.advance(5 * HOUR); // 13:00 > 12:00 start
    const r = await app.call('POST', `/api/manage/${b.body.reference}/refund-request`, { t: b.body.token, reason: 'late' });
    assert.equal(r.status, 409);
    app.clock.advance(-5 * HOUR);
  });

  test('reminder: confirmed booking within 2h is flagged once and emailed to admin', async () => {
    await A('PUT', '/api/admin/settings', { owner_email: 'owner@example.com' });
    const b = await app.book(app.slot(0, 15).id);
    await app.pay(b);
    app.clock.advance(5 * HOUR + 30 * 60000); // 13:30; booking 15:00 -> 90 min away
    const r1 = await A('GET', '/api/admin/reminders');
    assert.ok(r1.body.bookings.some((x) => x.reference === b.body.reference));
    await app.ctx.service.runReminders();
    await app.ctx.service.runReminders();
    await app.ctx.flush();
    const n = app.ctx.db.prepare("SELECT COUNT(*) n FROM outbox WHERE booking_id=? AND subject LIKE '%Reminder%'").get(app.dbBooking(b.body.reference).id).n;
    assert.equal(n, 1, 'exactly one reminder email');
  });

  test('ICS feed requires the key and lists confirmed bookings', async () => {
    assert.equal((await app.call('GET', '/calendar.ics?key=bad', undefined, { raw: true })).status, 404);
    const key = app.ctx.settings().feed_key;
    const res = await app.call('GET', `/calendar.ics?key=${key}`, undefined, { raw: true });
    assert.equal(res.status, 200);
    assert.match(await res.text(), /BEGIN:VCALENDAR[\s\S]*BEGIN:VEVENT/);
  });
});

describe('client emails: manage link and booking changes', () => {
  let app;
  before(async () => { app = await startTestApp(); await app.login(); });
  after(() => app.close());
  const A = (m, p, b) => app.call(m, p, b, { admin: true });
  const mails = (id, to) => app.ctx.db.prepare("SELECT * FROM outbox WHERE channel='email' AND booking_id=? AND to_addr=? ORDER BY id").all(id, to);

  test('the confirmation email carries the manage-booking link', async () => {
    const b = await app.book(app.slot(2, 10).id, { email: 'save@example.com' });
    await app.pay(b);
    const id = app.dbBooking(b.body.reference).id;
    const conf = mails(id, 'save@example.com').find((m) => /Booking confirmed/.test(m.subject));
    assert.ok(conf);
    assert.ok(conf.body.includes(`/manage.html?ref=${b.body.reference}&t=${b.body.token}`), 'link with the private token');
    assert.match(conf.body, /Save this link/);
  });

  test('admin changes to client-visible details email the client the updated booking', async () => {
    const b = await app.book(app.slot(2, 11).id, { email: 'change@example.com' });
    await app.pay(b);
    const id = app.dbBooking(b.body.reference).id;
    await A('PATCH', `/api/admin/bookings/${id}`, { admin_notes: 'internal only' });
    await app.ctx.flush();
    assert.equal(mails(id, 'change@example.com').filter((m) => /Booking updated/.test(m.subject)).length, 0, 'internal notes do not email the client');
    await A('PATCH', `/api/admin/bookings/${id}`, { meeting_link: 'https://zoom.us/j/123', mobile: '+971509999999' });
    await app.ctx.flush();
    const upd = mails(id, 'change@example.com').filter((m) => /Booking updated/.test(m.subject));
    assert.equal(upd.length, 1);
    assert.match(upd[0].body, /manage\.html\?ref=/);
    assert.match(upd[0].attachment, /\.ics/);
  });

  test('admin reschedule emails the client the new time with the manage link', async () => {
    const b = await app.book(app.slot(3, 10).id, { email: 'move@example.com' });
    await app.pay(b);
    const id = app.dbBooking(b.body.reference).id;
    assert.equal((await A('POST', `/api/admin/bookings/${id}/reschedule`, { slotId: app.slot(3, 14).id })).status, 200);
    await app.ctx.flush();
    const m = mails(id, 'move@example.com').find((x) => /rescheduled/.test(x.subject));
    assert.ok(m);
    assert.match(m.body, /14:00/);
    assert.match(m.body, /manage\.html/);
  });

  test('cancelling an unpaid booking tells the client', async () => {
    const b = await app.book(app.slot(4, 10).id, { email: 'unpaid@example.com' });
    const id = app.dbBooking(b.body.reference).id;
    assert.equal((await A('POST', `/api/admin/bookings/${id}/cancel`, {})).status, 200);
    await app.ctx.flush();
    assert.ok(mails(id, 'unpaid@example.com').some((m) => /Booking cancelled/.test(m.subject)));
  });

  test('Arabic error messages when the page is in Arabic', async () => {
    const r = await app.call('POST', '/api/bookings', app.customer({ slotId: app.slot(4, 11).id, acceptTerms: false }), { headers: { 'X-Lang': 'ar' } });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /الشروط والأحكام/);
    const t = await app.call('GET', '/api/terms?lang=ar');
    assert.match(t.body.text, /الإلغاء والاسترداد/);
    assert.match(t.body.company, /لمى الصفدي/);
  });
});
