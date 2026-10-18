// Email (SMTP) + WhatsApp (Meta Cloud API) notifications. Every message is recorded in the outbox table.
// With no SMTP / WhatsApp credentials configured, messages are logged to the outbox only (status "logged").
import { sendMail } from './smtp.js';
import { buildIcs } from './ics.js';
import { renderInvoicePdf } from './invoice.js';
import { fmtRange, fmtStamp, money, MINUTE } from './time.js';
import { escHtml, whatsappNumber } from './util.js';

export function createNotifier(ctx) {
  const { db, config } = ctx;

  const logRow = (channel, to, subject, body, status, error, bookingId, attachment) =>
    db.prepare('INSERT INTO outbox(ts,channel,to_addr,subject,body,status,error,booking_id,attachment) VALUES(?,?,?,?,?,?,?,?,?)').run(
      ctx.now(), channel, to, subject, body.slice(0, 4000), status, error || null, bookingId || null, attachment || null,
    );

  async function email({ to, subject, text, html, attachments = [], bookingId }) {
    const attach = attachments.map((a) => a.filename).join(', ');
    if (!config.smtp.host) return logRow('email', to, subject, text, 'logged', 'SMTP not configured', bookingId, attach);
    try {
      const from = config.smtp.from || config.smtp.user;
      await sendMail({ ...config.smtp, from, to, subject, text, html, attachments });
      logRow('email', to, subject, text, 'sent', null, bookingId, attach);
    } catch (e) {
      logRow('email', to, subject, text, 'failed', String(e.message || e), bookingId, attach);
    }
  }

  async function whatsapp({ booking, kind }) {
    const w = config.whatsapp;
    const to = whatsappNumber(booking.mobile);
    const template = kind === 'confirmation' ? w.templateConfirm : w.templateUpdate;
    const params = [booking.customer_name, booking.reference, fmtRange(booking.start_ts, booking.end_ts), booking.service_name];
    const summary = `[template:${template}] ${params.join(' | ')}`;
    if (!w.token || !w.phoneNumberId) return logRow('whatsapp', to, template, summary, 'logged', 'WhatsApp not configured', booking.id);
    try {
      const res = await fetch(`${w.baseUrl}/${w.apiVersion}/${w.phoneNumberId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${w.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'template',
          template: { name: template, language: { code: w.language }, components: [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text })) }] },
        }),
      });
      if (!res.ok) throw new Error(`WhatsApp API ${res.status}: ${(await res.text()).slice(0, 300)}`);
      logRow('whatsapp', to, template, summary, 'sent', null, booking.id);
    } catch (e) {
      logRow('whatsapp', to, template, summary, 'failed', String(e.message || e), booking.id);
    }
  }

  // ---- email templates -------------------------------------------------------------------
  const layout = (s, title, inner) => `<!doctype html><html><body style="margin:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#1f2937">
<div style="max-width:560px;margin:0 auto;padding:16px"><div style="background:#fff;border-bottom:3px solid #5b4a8a;padding:16px 22px;border-radius:12px 12px 0 0"><table style="border-collapse:collapse"><tr><td style="padding:0 12px 0 0;vertical-align:middle"><img src="${escHtml(config.baseUrl)}/logo.png" width="48" height="48" alt="" style="display:block"></td><td style="vertical-align:middle"><div style="font-size:13px;color:#6b7280">${escHtml(s.company_name)}</div><div style="font-size:20px;font-weight:bold;color:#5b4a8a">${escHtml(title)}</div></td></tr></table></div>
<div style="background:#fff;padding:22px;border-radius:0 0 12px 12px;line-height:1.5">${inner}</div>
<p style="font-size:12px;color:#6b7280;text-align:center">${escHtml(s.company_name)}${s.company_address ? ' - ' + escHtml(s.company_address) : ''}</p></div></body></html>`;

  const details = (b, s) => {
    const where = b.service_kind === 'online'
      ? `Online via ${escHtml(b.platform || 'Zoom/Teams')}${b.meeting_link ? ` - <a href="${escHtml(b.meeting_link)}">join link</a>` : ' (link will be sent before the appointment)'}`
      : `At our office${s.company_address ? ': ' + escHtml(s.company_address) : ''}`;
    const row = (k, v) => `<tr><td style="padding:6px 12px 6px 0;color:#6b7280;white-space:nowrap">${k}</td><td style="padding:6px 0"><b>${v}</b></td></tr>`;
    return `<table style="border-collapse:collapse;font-size:14px">${row('Reference', escHtml(b.reference))}${row('Service', escHtml(b.service_name))}${row('When', escHtml(fmtRange(b.start_ts, b.end_ts)))}${row('Where', where)}${row('Amount', `AED ${money(b.total)} (incl. VAT ${money(b.vat)})`)}${b.invoice_number ? row('Invoice', escHtml(b.invoice_number)) : ''}</table>`;
  };
  const plain = (b) => `Reference: ${b.reference}\nService: ${b.service_name}\nWhen: ${fmtRange(b.start_ts, b.end_ts)}\nAmount: AED ${money(b.total)}${b.invoice_number ? `\nInvoice: ${b.invoice_number}` : ''}`;
  const manageUrl = (b) => `${config.baseUrl}/manage.html?ref=${encodeURIComponent(b.reference)}&t=${b.manage_token}`;
  const ownerTo = (s) => s.owner_email || config.smtp.from || '';
  const icsAttachment = (b, s, method) => ({
    filename: `${b.reference}.ics`,
    contentType: 'text/calendar; charset=utf-8',
    content: Buffer.from(
      buildIcs([{ uid: `${b.reference}@consultancy-operation`, start: b.start_ts, end: b.end_ts, summary: `${s.company_name}: ${b.service_name} consultation`, description: plain(b), location: b.service_kind === 'online' ? b.meeting_link || b.platform || 'Online' : s.company_address || 'Office' }], { name: s.company_name, alarmMinutes: 60, now: ctx.now(), method }),
    ),
  });
  const invoiceAttachment = (inv, creditNote = false) => ({
    filename: `${creditNote ? inv.credit_note_number : inv.number}.pdf`,
    contentType: 'application/pdf',
    content: renderInvoicePdf({ ...inv, reference: inv.reference }, { creditNote }),
  });
  const sendBoth = async (b, s, { subject, headline, intro, extraClient = '', attachments = [], ownerNote, waKind }) => {
    const clientHtml = layout(s, headline, `<p>Dear ${escHtml(b.customer_name)},</p><p>${intro}</p>${details(b, s)}${extraClient}`);
    await email({ to: b.email, subject, text: `Dear ${b.customer_name},\n\n${intro.replace(/<[^>]+>/g, '')}\n\n${plain(b)}\n\nManage your booking: ${manageUrl(b)}`, html: clientHtml, attachments, bookingId: b.id });
    const owner = ownerTo(s);
    if (owner) {
      const ownerHtml = layout(s, `[Admin] ${headline}`, `<p>${ownerNote}</p>${details(b, s)}<p style="font-size:14px">Customer: <b>${escHtml(b.customer_name)}</b><br>Mobile: ${escHtml(b.mobile)}<br>Email: ${escHtml(b.email)}</p>`);
      await email({ to: owner, subject: `[Admin] ${subject}`, text: `${ownerNote.replace(/<[^>]+>/g, '')}\n\n${plain(b)}\nCustomer: ${b.customer_name} | ${b.mobile} | ${b.email}`, html: ownerHtml, bookingId: b.id });
    }
    if (waKind) await whatsapp({ booking: b, kind: waKind });
  };

  return {
    email,
    whatsapp,
    async bookingConfirmed(b, inv) {
      const s = ctx.settings();
      await sendBoth(b, s, {
        subject: `Booking confirmed - ${b.reference}`,
        headline: 'Your appointment is confirmed',
        intro: 'Thank you - your payment was received and your appointment is confirmed. Your tax invoice and a calendar entry are attached.',
        extraClient: `<p style="font-size:14px">Need to change it? Rescheduling is free up to ${s.free_reschedule_hours} hours before the appointment: <a href="${escHtml(manageUrl(b))}">manage my booking</a>.</p>`,
        attachments: [invoiceAttachment(inv), icsAttachment(b, s, 'PUBLISH')],
        ownerNote: `New paid booking received (AED ${money(b.total)}).`,
        waKind: 'confirmation',
      });
    },
    async rescheduled(b, by) {
      const s = ctx.settings();
      await sendBoth(b, s, {
        subject: `Appointment rescheduled - ${b.reference}`,
        headline: 'Your appointment was rescheduled',
        intro: `Your appointment has been moved to <b>${escHtml(fmtRange(b.start_ts, b.end_ts))}</b>. An updated calendar entry is attached.`,
        attachments: [icsAttachment(b, s, 'PUBLISH')],
        ownerNote: `Booking ${escHtml(b.reference)} was rescheduled by ${escHtml(by)}.`,
        waKind: 'update',
      });
    },
    async refundRequested(b) {
      const s = ctx.settings();
      await sendBoth(b, s, {
        subject: `Refund request received - ${b.reference}`,
        headline: 'We received your refund request',
        intro: 'We received your cancellation and refund request. We will review it and update you by email. Your slot stays reserved until then.',
        ownerNote: `Refund requested for ${escHtml(b.reference)}. Reason: ${escHtml(b.refund_reason || '-')}. Approve it in the admin console before the appointment time.`,
      });
    },
    async refundApproved(b, inv) {
      const s = ctx.settings();
      await sendBoth(b, s, {
        subject: `Refund approved - ${b.reference}`,
        headline: 'Your refund was approved',
        intro: `Your refund of <b>AED ${money(b.total)}</b> has been approved and sent to your card (it can take 5-10 business days to appear). A tax credit note is attached.`,
        attachments: inv ? [invoiceAttachment(inv, true)] : [],
        ownerNote: `Refund processed for ${escHtml(b.reference)} (AED ${money(b.total)}). Reference: ${escHtml(b.refund_ref || '')}.`,
        waKind: 'update',
      });
    },
    async refundRejected(b) {
      const s = ctx.settings();
      await sendBoth(b, s, {
        subject: `Refund request update - ${b.reference}`,
        headline: 'Your refund request was not approved',
        intro: 'We could not approve your refund request. Your appointment remains confirmed.',
        ownerNote: `Refund request rejected for ${escHtml(b.reference)}.`,
      });
    },
    async lateConflictRefund(b) {
      const s = ctx.settings();
      await sendBoth(b, s, {
        subject: `Booking could not be completed - ${b.reference}`,
        headline: 'Your payment was refunded',
        intro: `Your payment arrived after the ${s.lock_minutes}-minute reservation expired and the time slot was taken by someone else. Your payment of <b>AED ${money(b.total)}</b> has been refunded in full. Please book another slot.`,
        ownerNote: `Automatic refund issued for ${escHtml(b.reference)} (payment arrived after the slot hold expired and the slot was re-booked).`,
      });
    },
    async meetingLink(b) {
      const s = ctx.settings();
      await email({
        to: b.email,
        subject: `Meeting link - ${b.reference}`,
        text: `Dear ${b.customer_name},\n\nHere is the link for your online appointment (${fmtRange(b.start_ts, b.end_ts)}):\n${b.meeting_link}`,
        html: layout(s, 'Your meeting link', `<p>Dear ${escHtml(b.customer_name)},</p><p>Here is the link for your online appointment:</p><p><a href="${escHtml(b.meeting_link)}">${escHtml(b.meeting_link)}</a></p>${details(b, s)}`),
        bookingId: b.id,
      });
    },
    async adminReminder(b) {
      const s = ctx.settings();
      const owner = ownerTo(s);
      if (!owner) return;
      const inner = `<p><b>Reminder:</b> appointment starts in about ${s.reminder_hours} hours (${escHtml(fmtStamp(b.start_ts))}).</p>${details(b, s)}<p style="font-size:14px">Customer: <b>${escHtml(b.customer_name)}</b><br>Mobile: ${escHtml(b.mobile)}<br>Email: ${escHtml(b.email)}</p>`;
      await email({ to: owner, subject: `Reminder (${s.reminder_hours}h): ${b.customer_name} - ${fmtStamp(b.start_ts)}`, text: `Reminder: appointment in ~${s.reminder_hours}h\n\n${plain(b)}\nCustomer: ${b.customer_name} | ${b.mobile} | ${b.email}`, html: layout(s, 'Appointment reminder', inner), bookingId: b.id });
    },
  };
}
