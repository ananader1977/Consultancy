import { api, h, $, qs, clear, fmtRange, money, badge, dateKey, fmtTime, dow, dayLabel, toast, DAY, HOUR } from '/js/common.js';
const app = $('#app');
let ref = qs('ref'), tok = qs('t');
if (ref && tok) show(); else lookupForm();

function lookupForm() {
  const err = h('div', { class: 'alert bad hide', role: 'alert' });
  app.replaceChildren(h('div', { class: 'card' }, h('h1', {}, 'Manage your booking'), h('p', { class: 'muted' }, 'Enter the booking reference and email used when booking.'),
    h('form', { onsubmit: async (e) => { e.preventDefault(); const v = Object.fromEntries(new FormData(e.target));
      try { const r = await api('POST', '/api/manage/lookup', v); ref = r.reference; tok = r.token; history.replaceState(null, '', `?ref=${encodeURIComponent(ref)}&t=${tok}`); show(); }
      catch (x) { err.textContent = x.message; err.classList.remove('hide'); } } },
      h('label', {}, 'Booking reference'), h('input', { name: 'reference', required: true, placeholder: 'CO-2610-00001' }),
      h('label', {}, 'Email'), h('input', { name: 'email', type: 'email', required: true }), err, h('p', {}, h('button', { class: 'btn block' }, 'Find booking')))));
}

async function show() {
  let b;
  try { b = await api('GET', `/api/manage/${encodeURIComponent(ref)}?t=${encodeURIComponent(tok)}`); } catch (e) { app.replaceChildren(h('div', { class: 'alert bad' }, e.message), h('a', { href: '/manage.html' }, 'Try again')); return; }
  const out = [h('h1', {}, 'Your booking'), h('div', { class: 'card' }, h('dl', { class: 'kv' },
    h('dt', {}, 'Reference'), h('dd', {}, h('b', {}, b.reference)), h('dt', {}, 'Status'), h('dd', {}, badge(b.status)),
    h('dt', {}, 'Service'), h('dd', {}, b.service + (b.platform ? ` (${b.platform})` : '')), h('dt', {}, 'When'), h('dd', {}, fmtRange(b.start, b.end)),
    h('dt', {}, 'Total'), h('dd', {}, money(b.total)),
    b.meetingLink ? [h('dt', {}, 'Meeting link'), h('dd', {}, h('a', { href: b.meetingLink }, b.meetingLink))] : null,
    b.invoiceNumber ? [h('dt', {}, 'Tax invoice'), h('dd', {}, h('a', { href: `/api/invoices/${b.invoiceNumber}/pdf?t=${b.invoiceToken}`, target: '_blank', rel: 'noopener' }, 'Download PDF'))] : null))];
  if (b.status === 'pending') out.push(h('a', { class: 'btn', href: `/status.html?ref=${encodeURIComponent(ref)}&t=${encodeURIComponent(tok)}` }, 'Continue to payment'));
  if (b.status === 'confirmed') {
    out.push(h('div', { class: 'card' }, h('h2', {}, 'Reschedule'),
      b.canReschedule ? h('div', {}, h('p', { class: 'muted' }, `Free until ${b.freeRescheduleHours} hours before your appointment.`), h('div', { id: 'rs' }), h('button', { class: 'btn', onclick: () => pickNew(b) }, 'Choose a new time'))
        : h('p', { class: 'muted' }, `Self-service rescheduling closes ${b.freeRescheduleHours} hours before the appointment. Please contact us to change it.`)));
    out.push(h('div', { class: 'card' }, h('h2', {}, 'Cancel & refund'),
      b.canRequestRefund ? [h('p', { class: 'muted' }, 'Refund requests are reviewed by our team and are possible until the appointment starts.'),
        h('label', {}, 'Reason (optional)'), h('textarea', { id: 'why', rows: 2, maxlength: 300 }),
        h('p', {}, h('button', { class: 'btn danger', onclick: async (e) => { if (!confirm('Request a refund and cancel this booking?')) return; e.target.disabled = true;
          try { await api('POST', `/api/manage/${encodeURIComponent(ref)}/refund-request`, { t: tok, reason: $('#why').value }); toast('Refund requested'); show(); } catch (x) { toast(x.message); e.target.disabled = false; } } }, 'Request refund'))]
        : h('p', { class: 'muted' }, 'The appointment has already started.')));
  }
  if (b.status === 'refund_requested') out.push(h('div', { class: 'alert' }, 'Your refund request is awaiting approval. You will receive an email.'));
  if (b.status === 'refunded') out.push(h('div', { class: 'alert good' }, 'This booking was refunded.'));
  app.replaceChildren(...out);
}

async function pickNew(b) {
  const box = $('#rs'); clear(box).append('Loading…');
  const cfg = await api('GET', '/api/config');
  const from = dateKey(Math.max(cfg.today, Date.now()));
  const r = await api('GET', `/api/slots?from=${from}&to=${dateKey(cfg.today + 28 * DAY)}`);
  const byDay = new Map();
  for (const s of r.slots) { if (s.start - cfg.now < cfg.freeRescheduleHours * HOUR && false) continue; const k = dateKey(s.start); (byDay.get(k) || byDay.set(k, []).get(k)).push(s); }
  const sel = h('select', {}, [...byDay.keys()].map((k) => h('option', { value: k }, `${dow(byDay.get(k)[0].start)} ${dayLabel(byDay.get(k)[0].start)}`)));
  const list = h('div', { class: 'slotlist' });
  const fill = () => list.replaceChildren(...(byDay.get(sel.value) || []).map((s) => h('button', { class: 'slot', onclick: async () => {
    if (!confirm(`Move your booking to ${dow(s.start)} ${dayLabel(s.start)} at ${fmtTime(s.start)}?`)) return;
    try { await api('POST', `/api/manage/${encodeURIComponent(ref)}/reschedule`, { t: tok, slotId: s.id }); toast('Rescheduled'); show(); } catch (x) { toast(x.message); }
  } }, `${fmtTime(s.start)}–${fmtTime(s.end)}`)));
  sel.addEventListener('change', fill);
  box.replaceChildren(h('label', {}, 'Day'), sel, list); fill();
}
