// Booking engine: slots, locking, payments, invoices, rescheduling, refunds, dashboard.
import crypto from 'node:crypto';
import { HttpError } from './http.js';
import { transaction } from './db.js';
import * as T from './time.js';
import { cleanMobile, isEmail, clampStr, whatsappNumber } from './util.js';
import { safeEqual, hmac } from './auth.js';

export const PLATFORMS = ['Phone call', 'Zoom', 'Botim'];
const LEGACY_PLATFORMS = ['Microsoft Teams']; // kept valid for bookings made before Oct 2026
const ACTIVE_SQL = "('pending','confirmed','refund_requested')";
const isUnique = (e) => /UNIQUE/i.test(String(e?.message));

export function createService(ctx) {
  const { db } = ctx;
  const q = (sql) => db.prepare(sql);
  const tx = (fn) => transaction(db, fn);
  const bookingById = (id) => q('SELECT * FROM bookings WHERE id=?').get(id);
  const audit = (actor, action, bookingId, detail = '') =>
    q('INSERT INTO audit(ts,actor,action,booking_id,detail) VALUES(?,?,?,?,?)').run(ctx.now(), actor, action, bookingId || null, String(detail).slice(0, 500));
  const refundsInFlight = new Set();

  const mustBooking = (id) => {
    const b = bookingById(Number(id));
    if (!b) throw new HttpError(404, 'Booking not found');
    return b;
  };
  const invoiceFull = (bookingId) =>
    q('SELECT i.*, b.reference FROM invoices i JOIN bookings b ON b.id=i.booking_id WHERE i.booking_id=?').get(bookingId);

  // ---- pricing -------------------------------------------------------------------------
  function breakdown(price, s) {
    const rate = s.vat_rate / 100;
    if (s.prices_include_vat) {
      const total = T.round2(price);
      const net = T.round2(price / (1 + rate));
      return { net, vat: T.round2(total - net), total };
    }
    const net = T.round2(price);
    const vat = T.round2(price * rate);
    return { net, vat, total: T.round2(net + vat) };
  }

  // ---- slots -----------------------------------------------------------------------------
  /** Creates 1-hour slots for the next N days: closed days skipped, lunch hour skipped. Idempotent. */
  function generateSlots(days) {
    const s = ctx.settings();
    const n = days ?? s.slot_days;
    const now = ctx.now();
    const today = T.dubaiMidnight(now);
    const ins = q('INSERT OR IGNORE INTO slots(start_ts,end_ts) VALUES(?,?)');
    let created = 0;
    tx(() => {
      for (let i = 0; i <= n; i++) {
        const day = today + i * T.DAY; // Dubai has no DST, so 24h steps are exact
        if (s.closed_days.includes(T.parts(day + 12 * T.HOUR).dow)) continue;
        for (let h = s.work_start; h < s.work_end; h++) {
          if (h === s.lunch_start) continue;
          const start = day + h * T.HOUR;
          if (start <= now) continue;
          created += Number(ins.run(start, start + T.HOUR).changes);
        }
      }
    });
    return created;
  }

  /** Marks pending bookings whose 10-minute hold ran out as expired (frees the slot). */
  function expireDue() {
    const now = ctx.now();
    const rows = q("SELECT id FROM bookings WHERE status='pending' AND lock_expires IS NOT NULL AND lock_expires<=?").all(now);
    if (!rows.length) return [];
    q("UPDATE bookings SET status='expired', updated_at=? WHERE status='pending' AND lock_expires IS NOT NULL AND lock_expires<=?").run(now, now);
    for (const r of rows) ctx.background(settleExpiredSession(r.id));
    return rows.map((r) => r.id);
  }

  /** After a hold expires: if the customer actually paid, honour it (or auto-refund); otherwise close the session. */
  async function settleExpiredSession(bookingId) {
    const b = bookingById(bookingId);
    if (!b || !b.payment_session_id) return;
    try {
      let r = await ctx.payments.retrieve(b.payment_session_id);
      if (!r.paid) {
        await ctx.payments.expireSession(b.payment_session_id);
        r = await ctx.payments.retrieve(b.payment_session_id); // paid in the meantime?
      }
      if (r.paid) await handlePayment(bookingId, r.paymentRef, { actor: 'system' });
    } catch (e) {
      console.error(`[settleExpiredSession ${bookingId}]`, e.message);
    }
  }

  const SLOT_FREE_SQL = `NOT EXISTS (SELECT 1 FROM bookings b WHERE b.slot_id=s.id AND b.status IN ${ACTIVE_SQL}
    AND NOT (b.status='pending' AND b.lock_expires IS NOT NULL AND b.lock_expires<=?))`;

  /** Public calendar: only slots that can be booked right now (booked/locked/blocked slots are hidden). */
  function listAvailableSlots(fromTs, toTs) {
    expireDue();
    const now = ctx.now();
    return q(`SELECT s.id, s.start_ts AS start, s.end_ts AS end FROM slots s
      WHERE s.blocked=0 AND s.start_ts>? AND s.start_ts>=? AND s.start_ts<? AND ${SLOT_FREE_SQL} ORDER BY s.start_ts`).all(now, fromTs, toTs, now);
  }

  // ---- booking creation ----------------------------------------------------------------
  function validateCustomer(input) {
    const name = clampStr(input.name, 100);
    if (name.length < 2) throw new HttpError(400, 'Please enter your name.');
    const mobile = cleanMobile(String(input.mobile ?? ''));
    if (!mobile) throw new HttpError(400, 'Please enter a valid mobile number, e.g. +971501234567.');
    // email is optional (the public form does not ask for it; the admin can add it)
    const email = clampStr(input.email, 254).toLowerCase();
    if (email && !isEmail(email)) throw new HttpError(400, 'Please enter a valid email address.');
    return { name, mobile, email };
  }

  async function createBooking(input, { actor = 'customer', skipCheckout = false } = {}) {
    const s = ctx.settings();
    const cust = validateCustomer(input);
    const service = q('SELECT * FROM services WHERE id=?').get(Number(input.serviceId));
    if (!service || !service.active) throw new HttpError(400, 'Please choose a service.');
    let platform = null;
    if (service.kind === 'online') {
      platform = clampStr(input.platform, 30);
      if (!PLATFORMS.includes(platform)) throw new HttpError(400, 'Please choose phone call, Zoom or Botim for your online session.');
    }
    const slotId = Number(input.slotId);
    if (!Number.isInteger(slotId)) throw new HttpError(400, 'Please choose a time slot.');
    const accepted = input.acceptTerms === true;
    if (actor === 'customer' && !accepted) throw new HttpError(400, 'Please read and accept the Terms & Conditions to continue.');
    const price = breakdown(service.price, s);
    const now = ctx.now();

    const booking = tx(() => {
      expireDue();
      const slot = q('SELECT * FROM slots WHERE id=?').get(slotId);
      if (!slot || slot.blocked) throw new HttpError(409, 'This time slot is not available. Please choose another.');
      if (slot.start_ts <= now) throw new HttpError(409, 'This time slot has already started. Please choose another.');
      let info;
      try {
        info = q(`INSERT INTO bookings(reference,customer_name,mobile,email,service_id,service_name,service_kind,platform,slot_id,start_ts,end_ts,
            status,payment_status,net,vat,total,lock_expires,manage_token,created_at,updated_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,'pending','unpaid',?,?,?,?,?,?,?)`).run(
          `TMP-${crypto.randomUUID()}`, cust.name, cust.mobile, cust.email, service.id, service.name, service.kind, platform,
          slot.id, slot.start_ts, slot.end_ts, price.net, price.vat, price.total,
          now + s.lock_minutes * T.MINUTE, crypto.randomBytes(18).toString('base64url'), now, now,
        );
      } catch (e) {
        if (isUnique(e)) throw new HttpError(409, 'Sorry, this time slot was just taken. Please choose another.');
        throw e;
      }
      const id = Number(info.lastInsertRowid);
      q('UPDATE bookings SET reference=?, terms_accepted_at=? WHERE id=?').run(`CO-${T.yymm(now)}-${String(id).padStart(5, '0')}`, accepted ? now : null, id);
      return bookingById(id);
    });
    audit(actor, 'booking.created', booking.id, `${booking.service_name} ${T.fmtStamp(booking.start_ts)}`);
    if (skipCheckout) return { booking, checkoutUrl: null };

    try {
      const session = await ctx.payments.createCheckout(booking);
      q('UPDATE bookings SET payment_session_id=?, updated_at=? WHERE id=?').run(session.id, ctx.now(), booking.id);
      return { booking: bookingById(booking.id), checkoutUrl: session.url };
    } catch (e) {
      console.error('[createCheckout]', e.message);
      q("UPDATE bookings SET status='cancelled', updated_at=? WHERE id=?").run(ctx.now(), booking.id);
      audit('system', 'booking.checkout_failed', booking.id, e.message);
      throw new HttpError(502, 'The payment service is unavailable right now. Please try again in a moment.');
    }
  }

  // ---- payment handling ----------------------------------------------------------------
  /** Sync part: confirm the booking and issue the invoice. Runs inside a transaction. */
  function applyPayment(bookingId, paymentRef) {
    const b = bookingById(bookingId);
    if (!b) throw new HttpError(404, 'Booking not found');
    if (b.payment_status !== 'unpaid') return { already: true, booking: b };
    if (b.status === 'cancelled' || b.status === 'refunded') return { conflict: true, booking: b };
    const slot = q('SELECT * FROM slots WHERE id=?').get(b.slot_id);
    if (!slot || slot.blocked || slot.start_ts <= ctx.now()) return { conflict: true, booking: b };
    if (b.status === 'expired') {
      // late payment: honour it only if nobody else took the slot meanwhile (the unique index decides)
      try {
        q("UPDATE bookings SET status='pending' WHERE id=?").run(bookingId);
      } catch (e) {
        if (isUnique(e)) return { conflict: true, booking: b };
        throw e;
      }
    }
    const s = ctx.settings();
    const link = b.meeting_link || (b.service_kind === 'online' ? (b.platform === 'Zoom' ? s.zoom_link : b.platform === 'Microsoft Teams' ? s.teams_link : '') || '' : '');
    q(`UPDATE bookings SET status='confirmed', payment_status='paid', paid_at=?, payment_ref=?, lock_expires=NULL, meeting_link=?, updated_at=? WHERE id=?`)
      .run(ctx.now(), paymentRef || null, link, ctx.now(), bookingId);
    const invoice = createInvoice(bookingId);
    return { booking: bookingById(bookingId), invoice };
  }

  /** The ONLY place invoices are created, and only after payment succeeded. */
  function createInvoice(bookingId) {
    const existing = invoiceFull(bookingId);
    if (existing) return existing;
    const b = bookingById(bookingId);
    const s = ctx.settings();
    const rate = b.net > 0 ? T.round2((b.vat / b.net) * 100) : s.vat_rate;
    const info = q(`INSERT INTO invoices(number,booking_id,issued_at,supplier_name,supplier_address,supplier_trn,customer_name,customer_email,customer_mobile,
        description,appointment_text,net,vat_rate,vat,total,payment_ref,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'issued')`).run(
      `TMP-${crypto.randomUUID()}`, bookingId, ctx.now(), s.company_name, s.company_address, s.company_trn, b.customer_name, b.email, b.mobile,
      `Session - ${b.service_name} (1 hour) - Ref ${b.reference}`, T.fmtRange(b.start_ts, b.end_ts), b.net, rate, b.vat, b.total, b.payment_ref,
    );
    const id = Number(info.lastInsertRowid);
    const number = `INV-${T.yearOf(ctx.now())}-${String(id).padStart(6, '0')}`;
    q('UPDATE invoices SET number=? WHERE id=?').run(number, id);
    q('UPDATE bookings SET invoice_number=? WHERE id=?').run(number, bookingId);
    return invoiceFull(bookingId);
  }

  /** Called when a provider reports a successful payment (webhook, return page, expiry check, manual). */
  async function handlePayment(bookingId, paymentRef, { actor = 'payment' } = {}) {
    const r = tx(() => applyPayment(bookingId, paymentRef));
    if (r.conflict) {
      await autoRefund(bookingId, paymentRef);
      return { conflict: true, booking: bookingById(bookingId) };
    }
    if (r.already) return { booking: r.booking, already: true };
    audit(actor, 'payment.confirmed', bookingId, paymentRef || '');
    ctx.background(ctx.notifier.bookingConfirmed(r.booking, r.invoice));
    return { booking: r.booking, invoice: r.invoice };
  }

  /** Payment arrived but the slot can no longer be given to this customer: refund it in full. */
  async function autoRefund(bookingId, paymentRef) {
    const b = bookingById(bookingId);
    try {
      const refund = await ctx.payments.refund({ ...b, payment_ref: paymentRef });
      q(`UPDATE bookings SET status='refunded', payment_status='refunded', payment_ref=?, refund_ref=?, refunded_at=?, updated_at=?,
          admin_notes=admin_notes || ? WHERE id=?`).run(paymentRef || null, refund.id, ctx.now(), ctx.now(), `\n[auto] Payment arrived after the slot hold expired and the slot was no longer free - refunded in full (${refund.id}).`, bookingId);
      audit('system', 'payment.auto_refunded', bookingId, refund.id);
      ctx.background(ctx.notifier.lateConflictRefund(bookingById(bookingId)));
    } catch (e) {
      q(`UPDATE bookings SET payment_ref=?, admin_notes=admin_notes || ?, updated_at=? WHERE id=?`).run(paymentRef || null, `\n[auto] ACTION REQUIRED: customer paid (${paymentRef}) but the slot was unavailable and the automatic refund FAILED: ${e.message}. Refund manually.`, ctx.now(), bookingId);
      audit('system', 'payment.auto_refund_failed', bookingId, e.message);
      const s = ctx.settings();
      if (s.owner_email) ctx.background(ctx.notifier.email({ to: s.owner_email, subject: `ACTION REQUIRED: refund failed for ${b.reference}`, text: `Customer ${b.customer_name} paid for ${b.reference} but the slot was unavailable and the automatic refund failed (${e.message}). Please refund manually.`, bookingId }));
    }
  }

  /** Status page: re-check the provider so the page is correct even before the webhook arrives. */
  async function syncPayment(bookingId) {
    expireDue();
    let b = bookingById(bookingId);
    if (b && b.payment_status === 'unpaid' && b.payment_session_id && (b.status === 'pending' || b.status === 'expired')) {
      try {
        const r = await ctx.payments.retrieve(b.payment_session_id);
        if (r.paid) await handlePayment(bookingId, r.paymentRef, { actor: 'status-page' });
      } catch (e) {
        console.error('[syncPayment]', e.message);
      }
      b = bookingById(bookingId);
    }
    return b;
  }

  // ---- customer self-service ----------------------------------------------------------
  function bookingByToken(ref, token) {
    const b = q('SELECT * FROM bookings WHERE reference=?').get(String(ref || ''));
    if (!b || !safeEqual(b.manage_token, String(token || ''))) throw new HttpError(404, 'Booking not found. Please check your link.');
    return b;
  }
  function lookup(ref, { mobile = '', email = '' } = {}) {
    const b = q('SELECT * FROM bookings WHERE reference=?').get(String(ref || '').trim().toUpperCase());
    const m = whatsappNumber(mobile);
    const e = String(email || '').trim().toLowerCase();
    const ok = b && ((m.length >= 8 && whatsappNumber(b.mobile) === m) || (e && b.email && b.email === e));
    if (!ok) throw new HttpError(404, 'Booking not found. Check the reference and mobile number.');
    return b;
  }
  function manageView(b) {
    const s = ctx.settings();
    const hoursLeft = (b.start_ts - ctx.now()) / T.HOUR;
    const paid = b.payment_status === 'paid' && b.status === 'confirmed';
    return {
      reference: b.reference, name: b.customer_name, service: b.service_name, kind: b.service_kind, platform: b.platform,
      start: b.start_ts, end: b.end_ts, status: b.status, paymentStatus: b.payment_status, total: b.total, vat: b.vat, net: b.net,
      meetingLink: b.meeting_link || '', invoiceNumber: b.invoice_number, rescheduleCount: b.reschedule_count,
      lockExpires: b.status === 'pending' ? b.lock_expires : null, hoursLeft: Math.round(hoursLeft * 10) / 10,
      changesLeft: changesLeft(b),
      maxChanges: s.max_changes,
      changeWindowDays: s.change_window_days,
      canReschedule: paid && hoursLeft >= s.free_reschedule_hours && changesLeft(b) > 0,
      freeRescheduleHours: s.free_reschedule_hours,
      invoiceToken: b.invoice_number ? invoiceToken(b.invoice_number) : null,
      hasEmail: !!b.email,
    };
  }
  const secret = () => q("SELECT value FROM settings WHERE key='_secret'").get().value;
  const invoiceToken = (number) => hmac(secret(), `invoice:${number}`);

  // ---- rescheduling --------------------------------------------------------------------
  // client changes per booking are limited: max_changes within change_window_days (admin changes do not count)
  function changesLeft(b) {
    const s = ctx.settings();
    const used = q("SELECT COUNT(*) n FROM audit WHERE booking_id=? AND action='booking.rescheduled' AND actor='customer' AND ts>=?").get(b.id, ctx.now() - s.change_window_days * T.DAY).n;
    return Math.max(0, s.max_changes - used);
  }
  function reschedule(id, newSlotId, { by = 'customer', reason = '' } = {}) {
    const s = ctx.settings();
    const now = ctx.now();
    const updated = tx(() => {
      expireDue();
      const b = mustBooking(id);
      const okStatus = by === 'admin' ? ['confirmed', 'refund_requested'] : ['confirmed'];
      if (!okStatus.includes(b.status) || b.payment_status !== 'paid') throw new HttpError(409, 'Only confirmed, paid bookings can be rescheduled.');
      if (b.start_ts <= now) throw new HttpError(409, 'This appointment has already started.');
      if (by === 'customer' && (b.start_ts - now) / T.HOUR < s.free_reschedule_hours) {
        throw new HttpError(403, `Free rescheduling closes ${s.free_reschedule_hours} hours before the appointment. Please contact us.`);
      }
      if (by === 'customer' && changesLeft(b) <= 0) {
        throw new HttpError(403, `This booking has already been changed ${s.max_changes} times within ${s.change_window_days} days. No further changes are possible.`);
      }
      const slot = q('SELECT * FROM slots WHERE id=?').get(Number(newSlotId));
      if (!slot || slot.blocked || slot.start_ts <= now) throw new HttpError(409, 'That time slot is not available.');
      if (slot.id === b.slot_id) throw new HttpError(400, 'That is already your current time slot.');
      try {
        q('UPDATE bookings SET slot_id=?, start_ts=?, end_ts=?, reschedule_count=reschedule_count+1, reminder_sent=0, updated_at=? WHERE id=?')
          .run(slot.id, slot.start_ts, slot.end_ts, now, b.id);
      } catch (e) {
        if (isUnique(e)) throw new HttpError(409, 'Sorry, that time slot was just taken. Please choose another.');
        throw e;
      }
      const nb = bookingById(b.id);
      q('UPDATE invoices SET appointment_text=? WHERE booking_id=?').run(T.fmtRange(nb.start_ts, nb.end_ts), b.id);
      if (reason) q('UPDATE bookings SET admin_notes=admin_notes || ? WHERE id=?').run(`\n[${T.fmtStamp(now)}] Rescheduled by ${by}: ${clampStr(reason, 300)}`, b.id);
      return bookingById(b.id);
    });
    audit(by, 'booking.rescheduled', updated.id, T.fmtStamp(updated.start_ts));
    ctx.background(ctx.notifier.rescheduled(updated, by));
    return updated;
  }

  // ---- refunds ---------------------------------------------------------------------------
  function requestRefund(id, reason) {
    const updated = tx(() => {
      const b = mustBooking(id);
      if (b.status !== 'confirmed' || b.payment_status !== 'paid') throw new HttpError(409, 'Only confirmed, paid bookings can be refunded.');
      if (b.start_ts <= ctx.now()) throw new HttpError(409, 'Refunds can only be requested before the appointment time.');
      q("UPDATE bookings SET status='refund_requested', refund_reason=?, updated_at=? WHERE id=?").run(clampStr(reason, 500), ctx.now(), b.id);
      return bookingById(b.id);
    });
    audit('customer', 'refund.requested', updated.id, updated.refund_reason);
    ctx.background(ctx.notifier.refundRequested(updated));
    return updated;
  }

  async function approveRefund(id, actor = 'admin') {
    const b = mustBooking(id);
    if (b.payment_status !== 'paid' || !['confirmed', 'refund_requested'].includes(b.status)) throw new HttpError(409, 'This booking has no paid, active payment to refund.');
    if (b.start_ts <= ctx.now()) throw new HttpError(409, 'Refunds can only be approved before the appointment time.');
    if (refundsInFlight.has(b.id)) throw new HttpError(409, 'A refund is already being processed for this booking.');
    refundsInFlight.add(b.id);
    try {
      let refund;
      if (String(b.payment_ref || '').startsWith('MANUAL')) refund = { id: `MANUAL-REFUND-${ctx.now()}` }; // paid outside the card gateway
      else {
        try { refund = await ctx.payments.refund(b); } catch (e) { throw new HttpError(502, `The payment provider could not process the refund: ${e.message}`); }
      }
      const invoice = tx(() => {
        const cur = mustBooking(id);
        if (cur.payment_status !== 'paid') throw new HttpError(409, 'Already refunded.');
        q("UPDATE bookings SET status='refunded', payment_status='refunded', refund_ref=?, refunded_at=?, updated_at=? WHERE id=?").run(refund.id, ctx.now(), ctx.now(), id);
        const inv = invoiceFull(id);
        if (inv) {
          q("UPDATE invoices SET status='refunded', credit_note_number=?, credit_note_at=? WHERE id=?").run(`CN-${T.yearOf(ctx.now())}-${String(inv.id).padStart(6, '0')}`, ctx.now(), inv.id);
        }
        return invoiceFull(id);
      });
      audit(actor, 'refund.approved', id, refund.id);
      ctx.background(ctx.notifier.refundApproved(bookingById(id), invoice));
      return bookingById(id);
    } finally {
      refundsInFlight.delete(b.id);
    }
  }

  function rejectRefund(id, actor = 'admin') {
    const updated = tx(() => {
      const b = mustBooking(id);
      if (b.status !== 'refund_requested') throw new HttpError(409, 'There is no open refund request for this booking.');
      q("UPDATE bookings SET status='confirmed', updated_at=? WHERE id=?").run(ctx.now(), id);
      return bookingById(id);
    });
    audit(actor, 'refund.rejected', id);
    ctx.background(ctx.notifier.refundRejected(updated));
    return updated;
  }

  // ---- admin actions ---------------------------------------------------------------------
  const str = (v, max) => clampStr(v, max);
  function adminUpdateBooking(id, patch, actor) {
    const b = mustBooking(id);
    const set = {};
    if (patch.customer_name !== undefined) {
      const name = str(patch.customer_name, 100);
      if (name.length < 2) throw new HttpError(400, 'Name is too short.');
      set.customer_name = name;
    }
    if (patch.mobile !== undefined) {
      const m = cleanMobile(String(patch.mobile));
      if (!m) throw new HttpError(400, 'Invalid mobile number.');
      set.mobile = m;
    }
    if (patch.email !== undefined) {
      const e = str(patch.email, 254).toLowerCase();
      if (e && !isEmail(e)) throw new HttpError(400, 'Invalid email address.');
      set.email = e;
    }
    if (patch.platform !== undefined && b.service_kind === 'online') {
      if (![...PLATFORMS, ...LEGACY_PLATFORMS].includes(patch.platform)) throw new HttpError(400, 'Platform must be Phone call, Zoom or Botim.');
      set.platform = patch.platform;
    }
    if (patch.meeting_link !== undefined) {
      const link = str(patch.meeting_link, 500);
      if (link && !/^https?:\/\/\S+$/i.test(link)) throw new HttpError(400, 'Meeting link must start with http:// or https://');
      set.meeting_link = link;
    }
    if (patch.admin_notes !== undefined) set.admin_notes = str(patch.admin_notes, 2000);
    const keys = Object.keys(set);
    if (!keys.length) throw new HttpError(400, 'Nothing to update.');
    q(`UPDATE bookings SET ${keys.map((k) => `${k}=?`).join(', ')}, updated_at=? WHERE id=?`).run(...keys.map((k) => set[k]), ctx.now(), id);
    if (set.customer_name || set.email !== undefined || set.mobile) {
      q('UPDATE invoices SET customer_name=COALESCE(?,customer_name), customer_email=COALESCE(?,customer_email), customer_mobile=COALESCE(?,customer_mobile) WHERE booking_id=?')
        .run(set.customer_name ?? null, set.email ?? null, set.mobile ?? null, id);
    }
    audit(actor, 'booking.updated', id, keys.join(','));
    const nb = bookingById(id);
    const labels = { customer_name: 'Name', email: 'Email', mobile: 'Mobile', platform: 'Meeting platform', meeting_link: 'Meeting link' };
    const changes = Object.keys(labels).filter((k) => k in set && set[k] !== b[k])
      .map((k) => (k === 'meeting_link' ? (set[k] ? `Meeting link: ${set[k]}` : 'Meeting link removed') : `${labels[k]}: ${set[k]}`));
    if (changes.length && ['confirmed', 'refund_requested'].includes(nb.status)) ctx.background(ctx.notifier.bookingUpdated(nb, changes));
    return nb;
  }

  function cancelPending(id, actor = 'admin') {
    const b = mustBooking(id);
    if (b.status !== 'pending' || b.payment_status !== 'unpaid') throw new HttpError(409, 'Only unpaid, pending bookings can be cancelled here. Paid bookings must be refunded.');
    q("UPDATE bookings SET status='cancelled', updated_at=? WHERE id=?").run(ctx.now(), id);
    if (b.payment_session_id) ctx.background(ctx.payments.expireSession(b.payment_session_id).catch(() => {}));
    audit(actor, 'booking.cancelled', id);
    const cb = bookingById(id);
    if (actor !== 'system') ctx.background(ctx.notifier.bookingCancelled(cb));
    return cb;
  }

  async function markPaidManually(id, actor = 'admin') {
    const b = mustBooking(id);
    if (b.payment_status !== 'unpaid') throw new HttpError(409, 'This booking is already settled.');
    const r = await handlePayment(id, `MANUAL-${ctx.now()}`, { actor });
    if (r.conflict) throw new HttpError(409, 'The slot is no longer available for this booking.');
    return r.booking;
  }

  async function adminCreateBooking(input, actor, { markPaid = false } = {}) {
    const { booking, checkoutUrl } = await createBooking(input, { actor, skipCheckout: markPaid });
    if (markPaid) return { booking: await markPaidManually(booking.id, actor), checkoutUrl: null };
    return { booking, checkoutUrl };
  }

  // ---- slots (admin) ---------------------------------------------------------------------
  function setSlotBlocked(slotId, blocked, actor) {
    const slot = q('SELECT * FROM slots WHERE id=?').get(Number(slotId));
    if (!slot) throw new HttpError(404, 'Slot not found');
    if (blocked) {
      expireDue();
      const active = q(`SELECT id FROM bookings WHERE slot_id=? AND status IN ${ACTIVE_SQL}`).get(slot.id);
      if (active) throw new HttpError(409, 'This slot has a booking. Reschedule or refund the booking first.');
    }
    q('UPDATE slots SET blocked=? WHERE id=?').run(blocked ? 1 : 0, slot.id);
    audit(actor, blocked ? 'slot.blocked' : 'slot.unblocked', null, T.fmtStamp(slot.start_ts));
  }

  function adminCalendar(fromTs, toTs) {
    expireDue();
    const slots = q('SELECT id, start_ts AS start, end_ts AS end, blocked FROM slots WHERE start_ts>=? AND start_ts<? ORDER BY start_ts').all(fromTs, toTs);
    const bks = q(`SELECT * FROM bookings WHERE status IN ${ACTIVE_SQL} AND start_ts>=? AND start_ts<?`).all(fromTs, toTs);
    const bySlot = new Map(bks.map((b) => [b.slot_id, b]));
    return slots.map((s) => {
      const b = bySlot.get(s.id);
      return { ...s, blocked: !!s.blocked, booking: b ? publicAdminBooking(b) : null };
    });
  }
  const publicAdminBooking = (b) => ({
    id: b.id, reference: b.reference, customer_name: b.customer_name, mobile: b.mobile, email: b.email, service_name: b.service_name,
    service_kind: b.service_kind, platform: b.platform, slot_id: b.slot_id, start: b.start_ts, end: b.end_ts, status: b.status,
    payment_status: b.payment_status, total: b.total, vat: b.vat, net: b.net, invoice_number: b.invoice_number, meeting_link: b.meeting_link,
    reschedule_count: b.reschedule_count, refund_reason: b.refund_reason, refund_ref: b.refund_ref, admin_notes: b.admin_notes,
    lock_expires: b.lock_expires, terms_accepted_at: b.terms_accepted_at, paid_at: b.paid_at, created_at: b.created_at, payment_ref: b.payment_ref,
  });

  function listBookings({ status, search, limit = 200 } = {}) {
    expireDue();
    const where = [];
    const args = [];
    if (status && status !== 'all') {
      where.push('status=?');
      args.push(status);
    }
    if (search) {
      where.push('(reference LIKE ? OR customer_name LIKE ? OR email LIKE ? OR mobile LIKE ?)');
      const like = `%${String(search).replace(/[%_]/g, '')}%`;
      args.push(like, like, like, like);
    }
    const rows = q(`SELECT * FROM bookings ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY start_ts DESC LIMIT ?`).all(...args, Math.min(Number(limit) || 200, 500));
    return rows.map(publicAdminBooking);
  }

  function dashboard() {
    expireDue();
    const now = ctx.now();
    const today = T.dubaiMidnight(now);
    const one = (sql, ...a) => q(sql).get(...a);
    const confirmed = one("SELECT COUNT(*) n FROM bookings WHERE status='confirmed'").n;
    const upcoming = one("SELECT COUNT(*) n FROM bookings WHERE status='confirmed' AND start_ts>?", now).n;
    const todayN = one("SELECT COUNT(*) n FROM bookings WHERE status='confirmed' AND start_ts>=? AND start_ts<?", today, today + T.DAY).n;
    const pending = one("SELECT COUNT(*) n FROM bookings WHERE status='pending'").n;
    const refundRequests = one("SELECT COUNT(*) n FROM bookings WHERE status='refund_requested'").n;
    const refunded = one("SELECT COUNT(*) n FROM bookings WHERE status='refunded'").n;
    const rev = one("SELECT COALESCE(SUM(total),0) total, COALESCE(SUM(net),0) net, COALESCE(SUM(vat),0) vat FROM bookings WHERE payment_status='paid'");
    const next = q("SELECT * FROM bookings WHERE status IN ('confirmed','refund_requested') AND start_ts>? ORDER BY start_ts LIMIT 6").all(now).map(publicAdminBooking);
    const days = [];
    const counts = q("SELECT start_ts FROM bookings WHERE status='confirmed' AND start_ts>=? AND start_ts<?").all(today, today + 14 * T.DAY);
    for (let i = 0; i < 14; i++) {
      const d = today + i * T.DAY;
      days.push({ date: T.dateKey(d), label: T.fmtDate(d).slice(0, 8), count: counts.filter((r) => r.start_ts >= d && r.start_ts < d + T.DAY).length });
    }
    return { confirmed, upcoming, today: todayN, pending, refundRequests, refunded, revenue: { total: T.round2(rev.total), net: T.round2(rev.net), vat: T.round2(rev.vat) }, next, days };
  }

  // ---- reminders ---------------------------------------------------------------------------
  function upcomingWithin(hours) {
    const now = ctx.now();
    return q("SELECT * FROM bookings WHERE status='confirmed' AND start_ts>? AND start_ts<=? ORDER BY start_ts").all(now, now + hours * T.HOUR);
  }
  /** Emails the owner once per booking when it enters the reminder window (default 2 hours before). */
  async function runReminders() {
    const s = ctx.settings();
    const due = upcomingWithin(s.reminder_hours).filter((b) => !b.reminder_sent);
    for (const b of due) {
      q('UPDATE bookings SET reminder_sent=1 WHERE id=?').run(b.id);
      await ctx.notifier.adminReminder(b);
      audit('system', 'reminder.sent', b.id);
    }
    return due.length;
  }

  // ---- admin settings / services -----------------------------------------------------------
  const URL_RE = /^https?:\/\/\S+$/i;
  function updateSettings(patch, actor) {
    const rules = {
      company_name: (v) => { v = str(v, 100); if (!v) throw new HttpError(400, 'Company name is required.'); return v; },
      company_address: (v) => str(v, 300),
      company_trn: (v) => str(v, 30),
      owner_name: (v) => str(v, 100),
      owner_email: (v) => { v = str(v, 254).toLowerCase(); if (v && !isEmail(v)) throw new HttpError(400, 'Owner email is invalid.'); return v; },
      vat_rate: (v) => { v = Number(v); if (!(v >= 0 && v <= 100)) throw new HttpError(400, 'VAT rate must be between 0 and 100.'); return String(v); },
      prices_include_vat: (v) => (v === true || v === '1' || v === 1 ? '1' : '0'),
      work_start: (v) => intIn(v, 0, 23, 'Working day start'),
      work_end: (v) => intIn(v, 1, 24, 'Working day end'),
      lunch_start: (v) => intIn(v, -1, 23, 'Lunch start (-1 for none)'),
      lock_minutes: (v) => intIn(v, 1, 120, 'Slot lock minutes'),
      free_reschedule_hours: (v) => intIn(v, 0, 720, 'Free reschedule hours'),
      max_changes: (v) => intIn(v, 0, 20, 'Max changes'),
      change_window_days: (v) => intIn(v, 1, 365, 'Change window days'),
      slot_days: (v) => intIn(v, 7, 180, 'Booking window days'),
      reminder_hours: (v) => intIn(v, 1, 72, 'Reminder hours'),
      zoom_link: (v) => url(v),
      teams_link: (v) => url(v),
      company_name_ar: (v) => str(v, 150),
      contact_phone: (v) => str(v, 40),
      contact_email: (v) => { v = str(v, 254).toLowerCase(); if (v && !isEmail(v)) throw new HttpError(400, 'Contact email is invalid.'); return v; },
      facebook: (v) => str(v, 120).replace(/^https?:\/\/(www\.)?facebook\.com\//i, '').replace(/\/+$/, ''),
      terms_text_ar: (v) => { v = String(v ?? '').replace(/\r\n/g, '\n').trim().slice(0, 20000); if (v.length < 20) throw new HttpError(400, 'Arabic Terms & Conditions text is too short.'); return v; },
      terms_text: (v) => { v = String(v ?? '').replace(/\r\n/g, '\n').trim().slice(0, 20000); if (v.length < 20) throw new HttpError(400, 'Terms & Conditions text is too short.'); return v; },
      closed_days: (v) => {
        const arr = (Array.isArray(v) ? v : String(v).split(',')).map((x) => String(x).trim()).filter((x) => x !== '');
        if (arr.some((x) => !/^[0-6]$/.test(x))) throw new HttpError(400, 'Closed days must be numbers 0-6 (0 = Sunday).');
        return [...new Set(arr)].join(',');
      },
    };
    const intIn = (v, lo, hi, label) => { const n = Number(v); if (!Number.isInteger(n) || n < lo || n > hi) throw new HttpError(400, `${label} must be a whole number from ${lo} to ${hi}.`); return String(n); };
    const url = (v) => { v = str(v, 500); if (v && !URL_RE.test(v)) throw new HttpError(400, 'Links must start with http:// or https://'); return v; };
    const out = {};
    for (const [k, v] of Object.entries(patch)) if (rules[k]) out[k] = rules[k](v);
    const cur = { ...ctx.settings(), ...Object.fromEntries(Object.entries(out).map(([k, v]) => [k, ['work_start', 'work_end', 'lunch_start'].includes(k) ? Number(v) : v])) };
    if (Number(cur.work_start) >= Number(cur.work_end)) throw new HttpError(400, 'Working day end must be after the start.');
    tx(() => { for (const [k, v] of Object.entries(out)) q('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k, v); });
    audit(actor, 'settings.updated', null, Object.keys(out).join(','));
    return ctx.settings();
  }

  function upsertService(id, data, actor) {
    const name = str(data.name, 60);
    if (id === null && !['online', 'offline'].includes(data.kind)) throw new HttpError(400, 'Kind must be online or offline.');
    const price = Number(data.price);
    if (!(price >= 0) || !Number.isFinite(price)) throw new HttpError(400, 'Price must be zero or more.');
    try {
      if (id === null) {
        if (!name) throw new HttpError(400, 'Service name is required.');
        const r = q('INSERT INTO services(name,kind,description,price,active) VALUES(?,?,?,?,?)').run(name, data.kind, str(data.description, 300), T.round2(price), data.active === false ? 0 : 1);
        audit(actor, 'service.created', null, name);
        return q('SELECT * FROM services WHERE id=?').get(Number(r.lastInsertRowid));
      }
      const cur = q('SELECT * FROM services WHERE id=?').get(id);
      if (!cur) throw new HttpError(404, 'Service not found');
      q('UPDATE services SET name=?, description=?, price=?, active=? WHERE id=?').run(name || cur.name, data.description !== undefined ? str(data.description, 300) : cur.description, T.round2(price), data.active === undefined ? cur.active : data.active ? 1 : 0, id);
      audit(actor, 'service.updated', null, `${cur.name}: ${cur.price} -> ${T.round2(price)}`);
      return q('SELECT * FROM services WHERE id=?').get(id);
    } catch (e) {
      if (isUnique(e)) throw new HttpError(409, 'A service with that name already exists.');
      throw e;
    }
  }

  // ---- ics feed ------------------------------------------------------------------------------
  function feedEvents() {
    const rows = q("SELECT * FROM bookings WHERE status IN ('confirmed','refund_requested','pending') AND start_ts>? ORDER BY start_ts").all(ctx.now() - 7 * T.DAY);
    return rows;
  }

  return {
    breakdown, generateSlots, expireDue, listAvailableSlots, createBooking, handlePayment, syncPayment, bookingByToken, lookup, manageView,
    invoiceToken, invoiceFull, reschedule, requestRefund, approveRefund, rejectRefund, adminUpdateBooking, cancelPending, markPaidManually,
    adminCreateBooking, setSlotBlocked, adminCalendar, listBookings, dashboard, upcomingWithin, runReminders, updateSettings, upsertService,
    feedEvents, bookingById, publicAdminBooking, audit,
  };
}
