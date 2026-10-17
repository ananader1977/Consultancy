import { api, h, $, qs, fmtRange, money, badge, countdown } from '/js/common.js';
const app = $('#app'), ref = qs('ref'), t = qs('t');
let stop;
async function load() {
  stop?.();
  let b;
  try { b = await api('GET', `/api/bookings/${encodeURIComponent(ref)}/status?t=${encodeURIComponent(t)}`); }
  catch (e) { return void app.replaceChildren(h('div', { class: 'alert bad' }, e.message)); }
  const manage = `/manage.html?ref=${encodeURIComponent(ref)}&t=${encodeURIComponent(t)}`;
  const kids = [h('h1', {}, b.status === 'confirmed' ? 'Booking confirmed ✔' : b.status === 'pending' ? 'Waiting for payment' : 'Booking ' + b.status.replace('_', ' '))];
  if (b.status === 'confirmed') kids.push(h('div', { class: 'alert good' }, 'Thank you! A confirmation with your tax invoice and calendar invite has been emailed to you.'));
  if (b.status === 'pending') {
    const cd = h('b', {});
    kids.push(h('div', { class: 'alert' }, 'Your slot is held for ', cd, ' minutes. Complete payment to confirm it.'));
    stop = countdown(cd, b.lockExpires, load);
  }
  if (b.status === 'expired') kids.push(h('div', { class: 'alert bad' }, 'The payment window expired and the slot was released. If you were charged you will be refunded automatically. ', h('a', { href: '/' }, 'Book again')));
  if (qs('cancelled') && b.status === 'pending') kids.push(h('div', { class: 'alert' }, 'Payment was cancelled. You can try again below.'));
  kids.push(h('div', { class: 'card' }, h('dl', { class: 'kv' },
    h('dt', {}, 'Reference'), h('dd', {}, h('b', {}, b.reference)), h('dt', {}, 'Status'), h('dd', {}, badge(b.status), ' ', badge(b.paymentStatus)),
    h('dt', {}, 'Service'), h('dd', {}, b.service + (b.platform ? ` (${b.platform})` : '')), h('dt', {}, 'When'), h('dd', {}, fmtRange(b.start, b.end)),
    h('dt', {}, 'Total'), h('dd', {}, money(b.total), h('span', { class: 'muted small' }, ` (incl. VAT ${money(b.vat)})`)),
    b.meetingLink ? [h('dt', {}, 'Meeting link'), h('dd', {}, h('a', { href: b.meetingLink }, b.meetingLink))] : null,
    b.invoiceNumber ? [h('dt', {}, 'Tax invoice'), h('dd', {}, h('a', { href: `/api/invoices/${b.invoiceNumber}/pdf?t=${b.invoiceToken}`, target: '_blank', rel: 'noopener' }, `${b.invoiceNumber} (PDF)`))] : null)));
  const actions = h('p', { class: 'row' });
  if (b.status === 'pending') actions.append(h('a', { class: 'btn', href: '/' }, 'Choose another slot'));
  if (b.status === 'confirmed' || b.status === 'refund_requested') actions.append(h('a', { class: 'btn', href: manage }, 'Reschedule or request refund'), h('button', { class: 'btn alt', onclick: () => print() }, 'Print'));
  kids.push(actions);
  app.replaceChildren(...kids);
}
load();
