import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp } from './helpers.js';
import { HOUR, MINUTE, parts } from '../src/time.js';

describe('slots and pricing', () => {
  let app;
  before(async () => { app = await startTestApp(); });
  after(() => app.close());

  test('public config shows both services with AED prices and 5% VAT', async () => {
    const r = await app.call('GET', '/api/config');
    assert.equal(r.status, 200);
    const [online, offline] = r.body.services;
    assert.deepEqual([online.name, online.price, online.vat, online.total], ['Online', 300, 14.29, 300]);
    assert.deepEqual([offline.name, offline.price, offline.vat, offline.total], ['Offline', 500, 23.81, 500]);
  });

  test('slots are 1 hour, 10:00-18:00, no lunch slot at 13:00, never on Sunday', async () => {
    const r = await app.call('GET', '/api/slots?from=2026-10-19&to=2026-10-26');
    assert.equal(r.status, 200);
    const hoursSeen = new Set();
    const daysSeen = new Set();
    for (const s of r.body.slots) {
      const p = parts(s.start);
      assert.equal(s.end - s.start, HOUR, 'every slot is exactly one hour');
      assert.ok(p.hour >= 10 && p.hour <= 17, `hour ${p.hour} inside 10-18`);
      assert.notEqual(p.hour, 13, 'lunch break 13:00-14:00 has no slot');
      assert.notEqual(p.dow, 0, 'no Sunday slots');
      hoursSeen.add(p.hour);
      daysSeen.add(p.dow);
    }
    assert.deepEqual([...hoursSeen].sort((a, b) => a - b), [10, 11, 12, 14, 15, 16, 17]);
    assert.deepEqual([...daysSeen].sort(), [1, 2, 3, 4, 5, 6], 'Monday-Saturday are open');
    assert.equal(app.slot(0, 13), undefined);
    assert.equal(app.slot(6, 10), undefined, 'Sunday 25 Oct has no slots');
  });

  test('VAT can be inclusive or exclusive of the listed price', async () => {
    const { service } = app.ctx;
    assert.deepEqual(service.breakdown(500, { vat_rate: 5, prices_include_vat: false }), { net: 500, vat: 25, total: 525 });
    assert.deepEqual(service.breakdown(500, { vat_rate: 5, prices_include_vat: true }), { net: 476.19, vat: 23.81, total: 500 });
  });

  test('past slots and bad date ranges are rejected', async () => {
    assert.equal((await app.call('GET', '/api/slots?from=nope')).status, 400);
    assert.equal((await app.call('GET', '/api/slots?from=2026-10-19&to=2026-10-18')).status, 400);
    assert.equal((await app.call('GET', '/api/slots?from=2026-10-19&to=2027-10-19')).status, 400);
  });
});

describe('creating bookings', () => {
  let app;
  before(async () => { app = await startTestApp(); });
  after(() => app.close());

  test('name and mobile are mandatory; email is optional but validated when given', async () => {
    const s = app.slot(1, 10);
    for (const bad of [{ name: '' }, { name: 'A' }, { mobile: '' }, { mobile: 'abc' }, { mobile: '123' }, { email: 'not-an-email' }]) {
      const r = await app.book(s.id, bad);
      assert.equal(r.status, 400, JSON.stringify(bad));
    }
    assert.equal((await app.book(s.id, { mobile: '050 123 4567' })).status, 201, 'local format with spaces is accepted');
  });

  test('online service needs Zoom or Teams; offline does not', async () => {
    assert.equal((await app.book(app.slot(1, 11).id, { platform: '' })).status, 400);
    assert.equal((await app.book(app.slot(1, 11).id, { platform: 'Skype' })).status, 400);
    assert.equal((await app.book(app.slot(1, 11).id, { platform: 'Microsoft Teams' })).status, 201);
    const off = await app.book(app.slot(1, 12).id, { serviceId: 2, platform: '' });
    assert.equal(off.status, 201);
    assert.equal(off.body.total, 500);
  });

  test('booking references are auto-generated and never duplicate', async () => {
    const refs = new Set();
    for (let h = 14; h <= 17; h++) {
      const r = await app.book(app.slot(2, h).id);
      assert.equal(r.status, 201);
      assert.match(r.body.reference, /^CO-2610-\d{5}$/);
      refs.add(r.body.reference);
    }
    assert.equal(refs.size, 4);
    const dupes = app.ctx.db.prepare('SELECT reference, COUNT(*) n FROM bookings GROUP BY reference HAVING n>1').all();
    assert.equal(dupes.length, 0);
  });

  test('a new booking is pending, unpaid, has NO invoice and customer is sent to the payment page', async () => {
    const r = await app.book(app.slot(3, 10).id);
    assert.equal(r.status, 201);
    assert.ok(r.body.checkoutUrl.includes('/pay-mock.html'));
    const st = await app.status(r);
    assert.equal(st.body.status, 'pending');
    assert.equal(st.body.paymentStatus, 'unpaid');
    assert.equal(st.body.invoiceNumber, null);
    assert.equal(app.ctx.db.prepare('SELECT COUNT(*) n FROM invoices').get().n, 0, 'no invoice before payment');
  });

  test('unknown slot / service / blocked input are rejected', async () => {
    assert.equal((await app.book(999999)).status, 409);
    assert.equal((await app.book('x')).status, 400);
    assert.equal((await app.book(app.slot(3, 11).id, { serviceId: 77 })).status, 400);
  });
});

describe('double booking and the 10-minute lock', () => {
  let app;
  before(async () => { app = await startTestApp(); });
  after(() => app.close());

  test('two simultaneous requests for the same slot: exactly one wins', async () => {
    const s = app.slot(1, 10);
    const results = await Promise.all([
      app.book(s.id, { email: 'a@example.com' }),
      app.book(s.id, { email: 'b@example.com' }),
      app.book(s.id, { email: 'c@example.com' }),
      app.book(s.id, { email: 'd@example.com' }),
    ]);
    const codes = results.map((r) => r.status).sort();
    assert.deepEqual(codes, [201, 409, 409, 409]);
    assert.equal(app.ctx.db.prepare("SELECT COUNT(*) n FROM bookings WHERE slot_id=? AND status='pending'").get(s.id).n, 1);
  });

  test('the database itself refuses two active bookings on one slot', () => {
    const s = app.slot(1, 11);
    const ins = () => app.ctx.db.prepare(`INSERT INTO bookings(reference,customer_name,mobile,email,service_id,service_name,service_kind,slot_id,start_ts,end_ts,net,vat,total,manage_token,created_at,updated_at)
      VALUES(?, 'x','+971500000000','x@x.com',1,'Online','online',?,?,?,1,0,1,'t',0,0)`).run(`RAW-${Math.random()}`, s.id, s.start_ts, s.end_ts);
    ins();
    assert.throws(ins, /UNIQUE/);
  });

  test('a locked slot disappears from the public calendar', async () => {
    const s = app.slot(2, 10);
    const before = (await app.call('GET', '/api/slots?from=2026-10-21&to=2026-10-22')).body.slots.map((x) => x.id);
    assert.ok(before.includes(s.id));
    await app.book(s.id);
    const after = (await app.call('GET', '/api/slots?from=2026-10-21&to=2026-10-22')).body.slots.map((x) => x.id);
    assert.ok(!after.includes(s.id), 'booked/locked slot hidden');
  });

  test('the lock lasts 10 minutes, then the slot is released for others', async () => {
    const s = app.slot(2, 11);
    const first = await app.book(s.id, { email: 'first@example.com' });
    assert.equal(first.status, 201);
    assert.equal(first.body.lockExpires - app.clock.now(), 10 * MINUTE);

    app.clock.advance(9 * MINUTE + 59 * 1000);
    assert.equal((await app.book(s.id, { email: 'early@example.com' })).status, 409, 'still locked at 9:59');

    app.clock.advance(2 * 1000); // 10:01
    const ids = (await app.call('GET', '/api/slots?from=2026-10-21&to=2026-10-22')).body.slots.map((x) => x.id);
    assert.ok(ids.includes(s.id), 'slot visible again after the lock expires');
    assert.equal((await app.status(first)).body.status, 'expired');

    const second = await app.book(s.id, { email: 'second@example.com' });
    assert.equal(second.status, 201, 'someone else can now book it');
  });

  test('payment after the hold expired: honoured if the slot is still free', async () => {
    const s = app.slot(3, 12);
    const b = await app.book(s.id, { email: 'late-free@example.com' });
    app.clock.advance(11 * MINUTE);
    await app.call('GET', '/api/slots?from=2026-10-22&to=2026-10-23'); // sweep
    assert.equal(app.dbBooking(b.body.reference).status, 'expired');
    const r = await app.ctx.service.handlePayment(app.dbBooking(b.body.reference).id, 'pi_late_1');
    assert.equal(r.booking.status, 'confirmed');
    assert.ok(r.invoice.number.startsWith('INV-'));
  });

  test('payment after the hold expired and the slot was re-booked: automatic full refund, no invoice', async () => {
    const s = app.slot(3, 14);
    const slow = await app.book(s.id, { email: 'slow@example.com' });
    app.clock.advance(11 * MINUTE);
    const fast = await app.book(s.id, { email: 'fast@example.com' });
    assert.equal(fast.status, 201);
    const r = await app.ctx.service.handlePayment(app.dbBooking(slow.body.reference).id, 'pi_late_2');
    assert.equal(r.conflict, true);
    const row = app.dbBooking(slow.body.reference);
    assert.equal(row.status, 'refunded');
    assert.equal(row.payment_status, 'refunded');
    assert.ok(row.refund_ref.startsWith('re_mock_'));
    assert.equal(app.ctx.db.prepare('SELECT COUNT(*) n FROM invoices WHERE booking_id=?').get(row.id).n, 0);
    assert.equal(app.dbBooking(fast.body.reference).status, 'pending', 'the other customer keeps the slot');
    await app.ctx.flush();
    const mail = app.ctx.db.prepare("SELECT * FROM outbox WHERE to_addr='slow@example.com' AND subject LIKE 'Booking could not be completed%'").get();
    assert.ok(mail, 'customer is told about the automatic refund');
  });
});

describe('payment, invoice and notifications', () => {
  let app;
  let booking;
  before(async () => {
    app = await startTestApp();
    await app.login();
    const set = await app.call('PUT', '/api/admin/settings', { owner_email: 'owner@example.com', company_trn: '100123456700003', company_address: 'Office 1, Dubai' }, { admin: true });
    assert.equal(set.status, 200);
    booking = await app.book(app.slot(2, 10).id, { email: 'client@example.com' });
  });
  after(() => app.close());

  test('paying confirms the booking and issues a sequential tax invoice', async () => {
    const r = await app.pay(booking);
    assert.equal(r.status, 200);
    const st = (await app.status(booking)).body;
    assert.equal(st.status, 'confirmed');
    assert.equal(st.paymentStatus, 'paid');
    assert.equal(st.invoiceNumber, 'INV-2026-000001');
    const inv = app.ctx.db.prepare('SELECT * FROM invoices').get();
    assert.deepEqual([inv.net, inv.vat, inv.total, inv.vat_rate], [285.71, 14.29, 300, 5]);
    assert.equal(inv.supplier_trn, '100123456700003');
    const b2 = await app.book(app.slot(2, 11).id, { email: 'two@example.com' });
    await app.pay(b2);
    assert.equal((await app.status(b2)).body.invoiceNumber, 'INV-2026-000002');
  });

  test('paying twice does not create a second invoice', async () => {
    const id = app.dbBooking(booking.body.reference).id;
    await app.ctx.service.handlePayment(id, 'pi_again');
    assert.equal(app.ctx.db.prepare('SELECT COUNT(*) n FROM invoices WHERE booking_id=?').get(id).n, 1);
  });

  test('the invoice downloads as a real PDF only with the signed link', async () => {
    const st = (await app.status(booking)).body;
    const ok = await app.call('GET', `/api/invoices/${st.invoiceNumber}/pdf?t=${st.invoiceToken}`, undefined, { raw: true });
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get('content-type'), 'application/pdf');
    const buf = Buffer.from(await ok.arrayBuffer());
    assert.equal(buf.subarray(0, 5).toString(), '%PDF-');
    assert.ok(buf.toString('latin1').includes('%%EOF'));
    assert.equal((await app.call('GET', `/api/invoices/${st.invoiceNumber}/pdf?t=wrong`, undefined, { raw: true })).status, 404);
    assert.equal((await app.call('GET', `/api/invoices/${st.invoiceNumber}/pdf`, undefined, { raw: true })).status, 404);
  });

  test('client and owner are emailed, invoice + calendar attached, WhatsApp sent', async () => {
    const rows = app.ctx.db.prepare('SELECT * FROM outbox WHERE booking_id=? ORDER BY id').all(app.dbBooking(booking.body.reference).id);
    const clientMail = rows.find((r) => r.channel === 'email' && r.to_addr === 'client@example.com');
    const ownerMail = rows.find((r) => r.channel === 'email' && r.to_addr === 'owner@example.com');
    const wa = rows.find((r) => r.channel === 'whatsapp');
    assert.ok(clientMail, 'client email');
    assert.ok(ownerMail, 'owner email');
    assert.ok(wa, 'whatsapp message');
    assert.match(clientMail.attachment, /INV-2026-000001\.pdf/);
    assert.match(clientMail.attachment, /\.ics/);
    assert.match(clientMail.subject, /Booking confirmed/);
    assert.match(ownerMail.subject, /^\[Admin\]/);
    assert.equal(wa.to_addr, '971501234567', 'WhatsApp number is digits-only with country code');
    assert.match(wa.body, /booking_confirmation/);
  });

  test('an unpaid booking never produces notifications or invoices', async () => {
    const before = app.ctx.db.prepare('SELECT COUNT(*) n FROM outbox').get().n;
    const b = await app.book(app.slot(4, 10).id, { email: 'unpaid@example.com' });
    await app.ctx.flush();
    assert.equal(app.ctx.db.prepare('SELECT COUNT(*) n FROM outbox').get().n, before);
    assert.equal(app.ctx.db.prepare('SELECT COUNT(*) n FROM invoices WHERE booking_id=?').get(app.dbBooking(b.body.reference).id).n, 0);
  });
});

describe('rescheduling', () => {
  let app;
  before(async () => { app = await startTestApp(); });
  after(() => app.close());

  async function paid(day, hour, extra) {
    const b = await app.book(app.slot(day, hour).id, extra);
    await app.pay(b);
    return b;
  }
  const resched = (b, slotId) => app.call('POST', `/api/manage/${b.body.reference}/reschedule`, { t: b.body.token, slotId });

  test('free reschedule more than 24h before: old slot is released, new slot taken', async () => {
    const b = await paid(3, 10);
    const old = app.slot(3, 10);
    const target = app.slot(4, 15);
    const r = await resched(b, target.id);
    assert.equal(r.status, 200);
    assert.equal(r.body.start, target.start_ts);
    assert.equal(r.body.rescheduleCount, 1);
    const free = (await app.call('GET', '/api/slots?from=2026-10-22&to=2026-10-24')).body.slots.map((s) => s.id);
    assert.ok(free.includes(old.id), 'old slot is available again');
    assert.ok(!free.includes(target.id), 'new slot is now taken');
    assert.equal(app.ctx.db.prepare('SELECT appointment_text t FROM invoices').get().t.includes('15:00'), true, 'invoice shows the new time');
  });

  test('cannot move onto a slot that is already booked', async () => {
    const a = await paid(5, 10);
    const b = await paid(5, 11);
    const r = await resched(b, app.slot(5, 10).id);
    assert.equal(r.status, 409);
    assert.equal(app.dbBooking(b.body.reference).start_ts, app.slot(5, 11).start_ts);
    assert.ok(a);
  });

  test('exactly 24h before is still free; one second later it is not', async () => {
    const b = await paid(1, 10); // Tue 10:00; now Mon 08:00 -> 26h
    app.clock.advance(2 * HOUR); // Mon 10:00 -> exactly 24h
    assert.equal((await app.status(b)).body.canReschedule, true);
    app.clock.advance(1000);
    const st = (await app.status(b)).body;
    assert.equal(st.canReschedule, false);
    const r = await resched(b, app.slot(3, 17).id);
    assert.equal(r.status, 403);
    assert.match(r.body.error, /24 hours/);
    app.clock.advance(-2 * HOUR - 1000);
  });

  test('wrong token cannot reschedule or even view a booking', async () => {
    const b = await paid(4, 14);
    const r = await app.call('POST', `/api/manage/${b.body.reference}/reschedule`, { t: 'nope', slotId: app.slot(5, 14).id });
    assert.equal(r.status, 404);
    assert.equal((await app.call('GET', `/api/manage/${b.body.reference}?t=nope`)).status, 404);
  });

  test('lookup by reference + email works, wrong email does not', async () => {
    const b = await paid(2, 17, { email: 'findme@example.com' });
    const ok = await app.call('POST', '/api/manage/lookup', { reference: b.body.reference, email: 'FindMe@example.com' });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.token, b.body.token);
    assert.equal((await app.call('POST', '/api/manage/lookup', { reference: b.body.reference, email: 'other@example.com' })).status, 404);
  });

  test('unpaid bookings cannot be rescheduled', async () => {
    const b = await app.book(app.slot(5, 12).id);
    assert.equal((await resched(b, app.slot(5, 14).id)).status, 409);
  });
});

describe('terms and conditions', () => {
  let app;
  before(async () => { app = await startTestApp(); await app.login(); });
  after(() => app.close());

  test('customers must accept the terms before they can book and pay', async () => {
    const s = app.slot(1, 10);
    for (const v of [undefined, false, 'yes', 1]) {
      const r = await app.book(s.id, { acceptTerms: v });
      assert.equal(r.status, 400, String(v));
      assert.match(r.body.error, /Terms/);
    }
    assert.equal(app.ctx.db.prepare('SELECT COUNT(*) n FROM bookings').get().n, 0, 'nothing is created or held');
    const ok = await app.book(s.id);
    assert.equal(ok.status, 201);
    assert.equal(app.dbBooking(ok.body.reference).terms_accepted_at, app.clock.now(), 'acceptance time is recorded');
  });

  test('the terms text is public and editable by the admin', async () => {
    const t = await app.call('GET', '/api/terms');
    assert.equal(t.status, 200);
    assert.match(t.body.text, /up to 2 times within 30 calendar days/);
    assert.doesNotMatch(t.body.text, /refund/i);
    const up = await app.call('PUT', '/api/admin/settings', { terms_text: 'Our new terms.\n\n1. Something\nDetails here.' }, { admin: true });
    assert.equal(up.status, 200);
    assert.match((await app.call('GET', '/api/terms')).body.text, /Our new terms/);
    assert.equal((await app.call('PUT', '/api/admin/settings', { terms_text: 'short' }, { admin: true })).status, 400);
  });

  test('bookings the admin enters for a client do not need the checkbox', async () => {
    const r = await app.call('POST', '/api/admin/bookings', { name: 'Walk In', mobile: '+971501112233', email: 'walkin@example.com', serviceId: 2, slotId: app.slot(2, 11).id, markPaid: true }, { admin: true });
    assert.equal(r.status, 201);
    assert.equal(r.body.booking.terms_accepted_at, null);
    assert.equal(r.body.booking.status, 'confirmed');
  });
});

describe('bookings without an email address', () => {
  let app;
  before(async () => { app = await startTestApp(); await app.login(); });
  after(() => app.close());

  test('a client can book and pay with only name and mobile; no client email is attempted', async () => {
    const b = await app.book(app.slot(1, 10).id, { email: undefined, name: 'No Email', mobile: '050 777 8888' });
    assert.equal(b.status, 201);
    await app.pay(b);
    const row = app.dbBooking(b.body.reference);
    assert.equal(row.email, '');
    assert.equal(row.status, 'confirmed');
    const st = (await app.status(b)).body;
    assert.equal(st.hasEmail, false);
    const toClient = app.ctx.db.prepare("SELECT COUNT(*) n FROM outbox WHERE booking_id=? AND channel='email' AND to_addr=''").get(row.id).n;
    assert.equal(toClient, 0);
    assert.ok(app.ctx.db.prepare("SELECT COUNT(*) n FROM outbox WHERE booking_id=? AND channel='whatsapp'").get(row.id).n >= 1, 'WhatsApp still goes out');
  });

  test('clients find their booking with reference + mobile number (any format)', async () => {
    const b = await app.book(app.slot(1, 11).id, { email: undefined, mobile: '+971 50 123 9999' });
    await app.pay(b);
    for (const m of ['0501239999', '+971501239999', '00971 50 123 9999']) {
      const r = await app.call('POST', '/api/manage/lookup', { reference: b.body.reference.toLowerCase(), mobile: m });
      assert.equal(r.status, 200, m);
      assert.equal(r.body.token, b.body.token);
    }
    assert.equal((await app.call('POST', '/api/manage/lookup', { reference: b.body.reference, mobile: '0509999999' })).status, 404);
    assert.equal((await app.call('POST', '/api/manage/lookup', { reference: b.body.reference })).status, 404);
  });

  test('the admin can add (or remove) an email later, and the client is then emailed', async () => {
    const b = await app.book(app.slot(2, 10).id, { email: undefined });
    await app.pay(b);
    const id = app.dbBooking(b.body.reference).id;
    const r = await app.call('PATCH', `/api/admin/bookings/${id}`, { email: 'added@example.com' }, { admin: true });
    assert.equal(r.status, 200);
    await app.ctx.flush();
    assert.ok(app.ctx.db.prepare("SELECT COUNT(*) n FROM outbox WHERE booking_id=? AND to_addr='added@example.com'").get(id).n >= 1);
    assert.equal((await app.call('PATCH', `/api/admin/bookings/${id}`, { email: '' }, { admin: true })).status, 200);
    const c = await app.call('POST', '/api/admin/bookings', { name: 'Walk In', mobile: '+971501112233', serviceId: 1, platform: 'Zoom', slotId: app.slot(2, 11).id, markPaid: true }, { admin: true });
    assert.equal(c.status, 201, 'admin can create a booking without email');
  });
});

describe('prices include VAT and the not-medical notice', () => {
  let app;
  before(async () => { app = await startTestApp(); });
  after(() => app.close());
  test('terms state prices include VAT and the service is not medical', async () => {
    const en = (await app.call('GET', '/api/terms')).body.text;
    const ar = (await app.call('GET', '/api/terms?lang=ar')).body.text;
    assert.match(en, /include VAT at 5%/);
    assert.match(en, /not a medical service/);
    assert.match(ar, /ليست خدمة طبية/);
    assert.match(ar, /وتشمل ضريبة القيمة المضافة/);
    const cfg = (await app.call('GET', '/api/config')).body;
    assert.equal(cfg.pricesIncludeVat, true);
  });
});
