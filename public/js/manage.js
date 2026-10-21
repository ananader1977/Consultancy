import { api, h, $, qs, clear, fmtRange, money, badge, dateKey, fmtTime, dow, dayLabel, toast, DAY, HOUR, timeRange } from '/js/common.js';
import { T, AR, setupPage } from '/js/i18n.js';
setupPage();
const app = $('#app');
let ref = qs('ref'), tok = qs('t');
if (ref && tok) show(); else lookupForm();

function lookupForm() {
  const err = h('div', { class: 'alert bad hide', role: 'alert' });
  app.replaceChildren(h('div', { class: 'card' }, h('h1', {}, T.manageTitle), h('p', { class: 'muted' }, T.manageIntro),
    h('form', { onsubmit: async (e) => { e.preventDefault(); const v = Object.fromEntries(new FormData(e.target));
      try { const r = await api('POST', '/api/manage/lookup', v); ref = r.reference; tok = r.token; history.replaceState(null, '', `?ref=${encodeURIComponent(ref)}&t=${tok}`); show(); }
      catch (x) { err.textContent = x.message; err.classList.remove('hide'); } } },
      h('label', {}, T.bookingRef), h('input', { name: 'reference', required: true, placeholder: 'CO-2610-00001', dir: 'ltr' }),
      h('label', {}, T.mobileL), h('input', { name: 'mobile', type: 'tel', inputmode: 'tel', required: true, placeholder: '+971 50 123 4567', dir: 'ltr' }), err, h('p', {}, h('button', { class: 'btn block' }, T.findBooking)))));
}

async function show() {
  let b;
  try { b = await api('GET', `/api/manage/${encodeURIComponent(ref)}?t=${encodeURIComponent(tok)}`); } catch (e) { app.replaceChildren(h('div', { class: 'alert bad' }, e.message), h('a', { href: '/manage.html' }, T.tryAgain)); return; }
  const out = [h('h1', {}, T.yourBooking), h('div', { class: 'card' }, h('dl', { class: 'kv' },
    h('dt', {}, T.reference), h('dd', {}, h('b', {}, b.reference)), h('dt', {}, T.status), h('dd', {}, badge(b.status)),
    h('dt', {}, T.service), h('dd', {}, (AR ? (b.kind === 'online' ? (b.platform ? `جلسة عن بُعد (${T.platformName(b.platform)})` : T.svcOnline) : T.svcOffline) : b.service + (b.platform ? ` (${b.platform})` : ''))), h('dt', {}, T.when), h('dd', {}, fmtRange(b.start, b.end)),
    h('dt', {}, T.total), h('dd', {}, money(b.total)),
    b.meetingLink ? [h('dt', {}, T.meetingLink), h('dd', {}, h('a', { href: b.meetingLink }, b.meetingLink))] : null,
    b.invoiceNumber ? [h('dt', {}, T.taxInvoice), h('dd', {}, h('a', { href: `/api/invoices/${b.invoiceNumber}/pdf?t=${b.invoiceToken}`, target: '_blank', rel: 'noopener' }, T.downloadPdf))] : null))];
  if (b.status === 'pending') out.push(h('a', { class: 'btn', href: `/status.html?ref=${encodeURIComponent(ref)}&t=${encodeURIComponent(tok)}` }, T.continueToPay));
  if (b.status === 'confirmed') {
    const closed = b.changesLeft <= 0 ? T.noChangesLeft(b.maxChanges, b.changeWindowDays) : T.reschedClosed(b.freeRescheduleHours);
    out.push(h('div', { class: 'card' }, h('h2', {}, T.reschedule),
      b.canReschedule ? h('div', {}, h('p', { class: 'muted' }, T.freeUntil(b.freeRescheduleHours), ' ', T.changesLeft(b.changesLeft, b.maxChanges, b.changeWindowDays)), h('div', { id: 'rs' }), h('button', { class: 'btn', onclick: () => pickNew(b) }, T.chooseNewTime))
        : h('p', { class: 'muted' }, closed)));
  }
  app.replaceChildren(...out);
}

async function pickNew(b) {
  const box = $('#rs'); clear(box).append(T.loading);
  const cfg = await api('GET', '/api/config');
  const from = dateKey(Math.max(cfg.today, Date.now()));
  const r = await api('GET', `/api/slots?from=${from}&to=${dateKey(cfg.today + 28 * DAY)}`);
  const byDay = new Map();
  for (const s of r.slots) { if (s.start - cfg.now < cfg.freeRescheduleHours * HOUR && false) continue; const k = dateKey(s.start); (byDay.get(k) || byDay.set(k, []).get(k)).push(s); }
  const sel = h('select', {}, [...byDay.keys()].map((k) => h('option', { value: k }, `${dow(byDay.get(k)[0].start)} ${dayLabel(byDay.get(k)[0].start)}`)));
  const list = h('div', { class: 'slotlist' });
  const fill = () => list.replaceChildren(...(byDay.get(sel.value) || []).map((s) => h('button', { class: 'slot', onclick: async () => {
    if (!confirm(T.confirmMove(`${dow(s.start)} ${dayLabel(s.start)}`, fmtTime(s.start)))) return;
    try { await api('POST', `/api/manage/${encodeURIComponent(ref)}/reschedule`, { t: tok, slotId: s.id }); toast(T.rescheduled); show(); } catch (x) { toast(x.message); }
  } }, timeRange(s.start, s.end))));
  sel.addEventListener('change', fill);
  box.replaceChildren(h('label', {}, T.day), sel, list); fill();
}
