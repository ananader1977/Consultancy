import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp } from './helpers.js';
import { HOUR } from '../src/time.js';

describe('bank transfer and cash', () => {
  let app;
  const A = (m, p, b) => app.call(m, p, b, { admin: true });
  before(async () => {
    app = await startTestApp();
    await app.login();
    await A('PUT', '/api/admin/settings', { bank_name: 'Emirates NBD', bank_account_name: 'Lama Alsafadi', bank_iban: 'AE07 0331 2345 6789 0123 456' });
  });
  after(() => app.close());

  test('config offers card, bank transfer and cash; IBAN is validated', async () => {
    assert.deepEqual((await app.call('GET', '/api/config')).body.payMethods, ['card', 'bank_transfer', 'cash']);
    assert.equal((await A('PUT', '/api/admin/settings', { bank_iban: 'GB123' })).status, 400);
  });

  test('bank transfer: no card checkout, time held 24h, client sees bank details, admin marks paid -> tax invoice says bank transfer', async () => {
    const b = await app.book(app.slot(2, 10).id, { paymentMethod: 'bank_transfer', email: 'bank@example.com' });
    assert.equal(b.status, 201);
    assert.equal(b.body.checkoutUrl, null);
    const row = app.dbBooking(b.body.reference);
    assert.equal(row.payment_method, 'bank_transfer');
    assert.ok(row.lock_expires >= app.ctx.now() + 23 * HOUR);
    const st = (await app.call('GET', `/api/bookings/${b.body.reference}/status?t=${b.body.token}`)).body;
    assert.equal(st.status, 'pending');
    assert.equal(st.bank.iban, 'AE070331234567890123456');
    await app.ctx.flush();
    const mails = app.ctx.db.prepare('SELECT * FROM outbox WHERE booking_id=?').all(row.id);
    assert.ok(mails.some((m) => m.to_addr === 'bank@example.com' && /awaiting payment/.test(m.subject) && m.body.includes('AE070331234567890123456')));
    assert.ok(mails.some((m) => /^\[Admin\] New booking awaiting bank transfer/.test(m.subject)));
    app.clock.advance(5 * HOUR); // still held
    const paid = await A('POST', `/api/admin/bookings/${row.id}/mark-paid`, { method: 'bank_transfer', reference: 'TRX-889' });
    assert.equal(paid.status, 200);
    app.clock.advance(-5 * HOUR);
    const after = app.dbBooking(b.body.reference);
    assert.equal(after.status, 'confirmed');
    assert.match(after.payment_ref, /^MANUAL-bank_transfer-TRX-889/);
    const pdf = await app.call('GET', `/api/admin/invoices/${app.ctx.db.prepare('SELECT id FROM invoices WHERE booking_id=?').get(row.id).id}/pdf`, undefined, { admin: true, raw: true });
    assert.equal(pdf.status, 200);
  });

  test('cash only for office sessions; Arabic error', async () => {
    const r = await app.call('POST', '/api/bookings', app.customer({ slotId: app.slot(2, 11).id, paymentMethod: 'cash' }), { headers: { 'X-Lang': 'ar' } });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /نقداً متاح لجلسات المكتب فقط/);
    const ok = await app.book(app.slot(2, 11).id, { serviceId: 2, platform: '', paymentMethod: 'cash' });
    assert.equal(ok.status, 201);
    assert.equal(app.dbBooking(ok.body.reference).payment_method, 'cash');
  });

  test('bank transfer hidden when switched off', async () => {
    await A('PUT', '/api/admin/settings', { pay_bank: false });
    assert.deepEqual((await app.call('GET', '/api/config')).body.payMethods, ['card', 'cash']);
    assert.equal((await app.book(app.slot(3, 10).id, { paymentMethod: 'bank_transfer' })).status, 400);
    await A('PUT', '/api/admin/settings', { pay_bank: true });
  });

  test('admin books "already paid in cash" -> confirmed immediately', async () => {
    const r = await A('POST', '/api/admin/bookings', { name: 'Walk In', mobile: '+971501234000', serviceId: 2, slotId: app.slot(3, 11).id, paymentMethod: 'cash', markPaid: true });
    assert.equal(r.status, 201);
    assert.equal(r.body.booking.status, 'confirmed');
    assert.equal(r.body.booking.payment_method, 'cash');
  });

  test('admin books unpaid with bank transfer -> held and instructions sent, no card link', async () => {
    const r = await A('POST', '/api/admin/bookings', { name: 'Later Payer', mobile: '+971501234001', email: 'later@example.com', serviceId: 2, slotId: app.slot(3, 12).id, paymentMethod: 'bank_transfer' });
    assert.equal(r.status, 201);
    assert.equal(r.body.payUrl, null);
    assert.equal(r.body.booking.status, 'pending');
    assert.ok(app.ctx.db.prepare("SELECT 1 FROM outbox WHERE to_addr='later@example.com' AND subject LIKE '%awaiting payment%'").get());
  });
});
