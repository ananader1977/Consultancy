import { payLinkCard, api, h, $, qs, fmtRange, money, badge, countdown, toast } from '/js/common.js';
import { T, AR, setupPage } from '/js/i18n.js';
setupPage();
const app = $('#app'), ref = qs('ref'), t = qs('t');
let stop;
async function load() {
  stop?.();
  let b;
  try { b = await api('GET', `/api/bookings/${encodeURIComponent(ref)}/status?t=${encodeURIComponent(t)}`); }
  catch (e) { return void app.replaceChildren(h('div', { class: 'alert bad' }, e.message)); }
  const manage = `/manage.html?ref=${encodeURIComponent(ref)}&t=${encodeURIComponent(t)}`;
  const kids = [h('h1', {}, b.status === 'confirmed' ? T.confirmedTitle : b.status === 'pending' ? T.waitingPay : T.bookingIs(T.badge[b.status] || b.status))];
  if (b.status === 'confirmed') kids.push(h('div', { class: 'alert good' }, b.hasEmail ? T.thanks : T.thanksNoEmail));
  if (b.status === 'pending') {
    const cd = h('b', {});
    kids.push(h('div', { class: 'alert' }, T.heldA, cd, T.heldB));
    stop = countdown(cd, b.lockExpires, load);
  }
  if (b.status === 'expired') kids.push(h('div', { class: 'alert bad' }, T.expired, h('a', { href: '/' }, T.bookAgain)));
  if ((qs('cancelled') || qs('failed')) && b.status === 'pending') kids.push(h('div', { class: 'alert' }, T.payCancelled));
  kids.push(h('div', { class: 'card' }, h('dl', { class: 'kv' },
    h('dt', {}, T.reference), h('dd', {}, h('b', {}, b.reference)), h('dt', {}, T.status), h('dd', {}, badge(b.status), ' ', badge(b.paymentStatus)),
    h('dt', {}, T.service), h('dd', {}, (AR ? (b.kind === 'online' ? (b.platform ? `جلسة عن بُعد (${T.platformName(b.platform)})` : T.svcOnline) : T.svcOffline) : b.service + (b.platform ? ` (${b.platform})` : ''))), h('dt', {}, T.when), h('dd', {}, fmtRange(b.start, b.end)),
    b.paymentMethod ? [h('dt', {}, T.payMethodDt), h('dd', {}, T.payMethod[b.paymentMethod] || b.paymentMethod)] : null,
    h('dt', {}, T.total), h('dd', {}, money(b.total), h('span', { class: 'muted small' }, T.inclVatAmt(money(b.vat)))),
    b.meetingLink ? [h('dt', {}, T.meetingLink), h('dd', {}, h('a', { href: b.meetingLink }, b.meetingLink))] : null,
    b.invoiceNumber ? [h('dt', {}, T.taxInvoice), h('dd', {}, h('a', { href: `/api/invoices/${b.invoiceNumber}/pdf?t=${b.invoiceToken}`, target: '_blank', rel: 'noopener' }, `${b.invoiceNumber} (PDF)`))] : null)));
  const actions = h('p', { class: 'row' });
  if (b.status === 'pending') actions.append(h('a', { class: b.paymentMethod === 'card' ? 'btn' : 'btn alt', href: `/pay.html?ref=${encodeURIComponent(ref)}&t=${encodeURIComponent(t)}` }, b.paymentMethod === 'card' ? T.payNow : T.payByCard), h('a', { class: 'btn alt', href: '/' }, T.chooseAnother));
  if (b.status === 'confirmed' || b.status === 'refund_requested') actions.append(h('a', { class: 'btn', href: manage }, T.reschedOrRefund), h('button', { class: 'btn alt', onclick: () => print() }, T.print));
  if (b.status === 'pending' && b.paymentMethod === 'bank_transfer' && b.bank) {
    const row = (k, v, copy) => [h('dt', {}, k), h('dd', {}, h('b', { dir: 'ltr' }, v), copy ? [' ', h('button', { class: 'btn alt sm', type: 'button', onclick: async () => { try { await navigator.clipboard.writeText(v); toast(T.copied); } catch { /* ignore */ } } }, T.copyShort)] : null)];
    kids.push(h('div', { class: 'card' }, h('h2', {}, T.bankTitle), h('dl', { class: 'kv' },
      b.bank.name ? row(T.bankName, b.bank.name) : null, b.bank.accountName ? row(T.bankAccName, b.bank.accountName) : null,
      row(T.iban, b.bank.iban, true), row(T.amountL, money(b.total)), row(T.transferRef, b.reference, true)),
      h('p', { class: 'muted' }, T.bankSteps),
      b.contactPhone ? h('p', {}, h('a', { class: 'btn wa sm', href: `https://wa.me/${b.contactPhone}?text=${encodeURIComponent(T.receiptText(b.reference))}`, target: '_blank', rel: 'noopener' }, T.sendReceipt)) : null));
  }
  if (b.status === 'pending' && b.paymentMethod === 'cash') kids.push(h('div', { class: 'alert' }, T.cashInfo));
  kids.push(actions);
  if (b.status === 'pending' && b.paymentMethod === 'card') kids.push(payLinkCard(T, ref, t));
  if (b.status === 'confirmed' || b.status === 'refund_requested') {
    const full = new URL(manage, location.origin).toString();
    const copyBtn = h('button', { class: 'btn alt sm', type: 'button', onclick: async () => {
      try { await navigator.clipboard.writeText(full); toast(T.copied); } catch { box.select(); }
    } }, T.copy);
    const box = h('input', { readonly: true, value: full, onfocus: (e) => e.target.select(), 'aria-label': T.saveTitle });
    kids.push(h('div', { class: 'card save-link' }, h('h2', {}, T.saveTitle), h('p', { class: 'muted' }, b.hasEmail ? T.saveText : T.saveTextNoEmail),
      h('div', { class: 'row' }, box), h('p', { class: 'row' }, copyBtn,
        h('a', { class: 'btn wa sm', href: `https://wa.me/?text=${encodeURIComponent(T.waText(b.reference, full))}`, target: '_blank', rel: 'noopener' }, T.shareWa),
        navigator.share ? h('button', { class: 'btn alt sm', type: 'button', onclick: () => navigator.share({ title: T.yourBooking, url: full }).catch(() => {}) }, T.share) : null)));
  }
  app.replaceChildren(...kids);
}
load();
