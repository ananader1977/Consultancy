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

  test('clients cannot cancel online; admin can still cancel with a refund -> credit note, slot released', async () => {
    const b = await app.book(app.slot(3, 10).id, { email: 'refund@example.com' });
    await app.pay(b);
    const req = await app.call('POST', `/api/manage/${b.body.reference}/refund-request`, { t: b.body.token, reason: 'Cannot attend' });
    assert.equal(req.status, 403);
    const view = await app.call('GET', `/api/manage/${b.body.reference}?t=${b.body.token}`);
    assert.ok(!('canRequestRefund' in view.body));
    const row = app.dbBooking(b.body.reference);
    assert.equal(row.status, 'confirmed');
    const ap = await A('POST', `/api/admin/bookings/${row.id}/refund/approve`);
    assert.equal(ap.status, 200);
    const after = app.dbBooking(b.body.reference);
    assert.equal(after.status, 'refunded');
    assert.equal(after.payment_status, 'refunded');
    assert.match(app.ctx.db.prepare('SELECT credit_note_number c FROM invoices WHERE booking_id=?').get(row.id).c, /^CN-2026-\d{6}$/);
    const ids = (await app.call('GET', '/api/slots?from=2026-10-22&to=2026-10-23')).body.slots.map((x) => x.id);
    assert.ok(ids.includes(app.slot(3, 10).id), 'slot is bookable again');
    await app.ctx.flush();
    const mail = app.ctx.db.prepare("SELECT * FROM outbox WHERE booking_id=? AND to_addr='refund@example.com' ORDER BY id DESC").get(row.id);
    assert.doesNotMatch(mail.subject + mail.body, /refund/i, 'client emails do not use the word refund');
  });

  test('admin refund is impossible once the appointment has started', async () => {
    const b = await app.book(app.slot(0, 12).id);
    await app.pay(b);
    app.clock.advance(5 * HOUR); // 13:00 > 12:00 start
    try {
      const r = await A('POST', `/api/admin/bookings/${app.dbBooking(b.body.reference).id}/refund/approve`);
      assert.equal(r.status, 409);
    } finally { app.clock.advance(-5 * HOUR); }
  });

  test('clients can change a booking at most 2 times within 30 days; admin is not limited', async () => {
    const b = await app.book(app.slot(4, 10).id);
    await app.pay(b);
    const move = (d, hr) => app.call('POST', `/api/manage/${b.body.reference}/reschedule`, { t: b.body.token, slotId: app.slot(d, hr).id });
    const view = () => app.call('GET', `/api/manage/${b.body.reference}?t=${b.body.token}`).then((r) => r.body);
    assert.equal((await view()).changesLeft, 2);
    assert.equal((await move(4, 11)).status, 200);
    assert.equal((await view()).changesLeft, 1);
    assert.equal((await move(4, 14)).status, 200);
    const v = await view();
    assert.equal(v.changesLeft, 0);
    assert.equal(v.canReschedule, false);
    const third = await move(4, 15);
    assert.equal(third.status, 403);
    assert.match(third.body.error, /changed 2 times within 30 days/);
    const ar = await app.call('POST', `/api/manage/${b.body.reference}/reschedule`, { t: b.body.token, slotId: app.slot(4, 15).id }, { headers: { 'X-Lang': 'ar' } });
    assert.match(ar.body.error, /لا يمكن إجراء أي تغيير آخر/);
    const adm = await A('POST', `/api/admin/bookings/${app.dbBooking(b.body.reference).id}/reschedule`, { slotId: app.slot(4, 15).id });
    assert.equal(adm.status, 200, 'admin can still move it');
    await A('PUT', '/api/admin/settings', { max_changes: 3 });
    assert.equal((await view()).changesLeft, 1, 'limit is editable in settings');
    await A('PUT', '/api/admin/settings', { max_changes: 2 });
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
    assert.match(t.body.text, /مرتين كحد أقصى خلال 30 يوماً/);
    assert.doesNotMatch(t.body.text, /استرداد/);
    assert.match(t.body.company, /لما الصفدي/);
  });
});

describe('contact details', () => {
  let app;
  before(async () => { app = await startTestApp(); });
  after(() => app.close());
  test('contact details are public, in emails and in the terms', async () => {
    const c = (await app.call('GET', '/api/contact')).body;
    assert.deepEqual([c.phone, c.email, c.facebook], ['+971 52 806 6121', 'info@lamaalsafadi.ae', 'lama_alsafadi']);
    assert.match((await app.call('GET', '/api/terms')).body.text, /info@lamaalsafadi\.ae/);
    assert.match((await app.call('GET', '/api/terms?lang=ar')).body.text, /info@lamaalsafadi\.ae/);
    assert.equal(app.ctx.settings().owner_email, 'info@lamaalsafadi.ae', 'owner notifications go to the business email by default');
    const b = await app.book(app.slot(2, 10).id, { email: 'c1@example.com' });
    await app.pay(b);
    const owner = app.ctx.db.prepare("SELECT * FROM outbox WHERE to_addr='info@lamaalsafadi.ae'").all();
    assert.ok(owner.length >= 1, 'owner copy sent to info@lamaalsafadi.ae');
  });
});

describe('admin notifications to info@lamaalsafadi.ae', () => {
  let app;
  before(async () => { app = await startTestApp(); await app.login(); });
  after(() => app.close());
  const A = (m, p, b) => app.call(m, p, b, { admin: true });
  const adminMails = (id) => app.ctx.db.prepare("SELECT * FROM outbox WHERE channel='email' AND booking_id=? AND to_addr='info@lamaalsafadi.ae' ORDER BY id").all(id);

  test('new confirmed booking (after payment only) and every modification', async () => {
    const b = await app.book(app.slot(2, 10).id, { email: '' });
    const id = app.dbBooking(b.body.reference).id;
    await app.ctx.flush();
    assert.equal(adminMails(id).filter((m) => /New confirmed booking/.test(m.subject)).length, 0, 'nothing before payment');
    await app.pay(b);
    await app.ctx.flush();
    assert.equal(adminMails(id).filter((m) => /^\[Admin\] New confirmed booking - /.test(m.subject)).length, 1);
    await A('PATCH', `/api/admin/bookings/${id}`, { meeting_link: 'https://zoom.us/j/9' });
    await app.ctx.flush();
    const mod = adminMails(id).find((m) => /^\[Admin\] Booking modified - /.test(m.subject));
    assert.ok(mod);
    assert.match(mod.body, /zoom\.us\/j\/9/);
    assert.match(mod.body, /No client email on file/);
    await A('POST', `/api/admin/bookings/${id}/reschedule`, { slotId: app.slot(2, 15).id });
    await app.ctx.flush();
    assert.ok(adminMails(id).some((m) => /^\[Admin\] Booking modified \(rescheduled\)/.test(m.subject) && /15:00/.test(m.body)));
  });

  test('admin can send a test email', async () => {
    const r = await A('POST', '/api/admin/test-email', {});
    assert.equal(r.status, 200);
    assert.equal(r.body.to, 'info@lamaalsafadi.ae');
    assert.equal(r.body.status, 'logged', 'SMTP not configured in tests');
    const s = await A('GET', '/api/admin/settings');
    assert.ok(!('_m_owner_email_1' in s.body.settings));
  });
});

describe('Excel export', () => {
  let app;
  before(async () => { app = await startTestApp(); await app.login(); });
  after(() => app.close());
  test('admin-only xlsx with all sheets and data', async () => {
    const b = await app.book(app.slot(2, 10).id, { name: 'Excel Client', email: '' });
    await app.pay(b);
    const anon = await fetch(app.base + '/api/admin/export.xlsx');
    assert.equal(anon.status, 401);
    const r = await app.call('GET', '/api/admin/export.xlsx', undefined, { admin: true, raw: true });
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /spreadsheetml/);
    assert.match(r.headers.get('content-disposition'), /bookings-export-\d{4}-\d{2}-\d{2}\.xlsx/);
    const buf = Buffer.from(await r.arrayBuffer());
    assert.equal(buf.subarray(0, 2).toString(), 'PK');
    const fs = await import('node:fs');
    fs.writeFileSync(process.env.XLSX_OUT || '/dev/null', buf);
  });
});

describe('dirham sign', () => {
  let app;
  before(async () => { app = await startTestApp(); });
  after(() => app.close());
  test('font and email image are served; text emails keep AED', async () => {
    const f = await app.call('GET', '/fonts/dirham.woff', undefined, { raw: true });
    assert.equal(f.status, 200);
    assert.equal(f.headers.get('content-type'), 'font/woff');
    assert.equal((await app.call('GET', '/dirham.png', undefined, { raw: true })).status, 200);
    const b = await app.book(app.slot(2, 10).id, { email: 'sym@example.com' });
    await app.pay(b);
    const m = app.ctx.db.prepare("SELECT * FROM outbox WHERE to_addr='sym@example.com'").get();
    assert.match(m.body, /Amount: AED 525\.00/);
    assert.doesNotMatch(m.body, /&nbsp;|<img/);
  });
});
