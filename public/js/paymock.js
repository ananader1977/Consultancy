import { api, h, $, qs, money } from '/js/common.js';
const app = $('#app'), sid = qs('s'), ref = qs('ref'), t = qs('t');
const back = `/status.html?ref=${encodeURIComponent(ref)}&t=${encodeURIComponent(t)}`;
try {
  const s = await api('GET', `/api/pay/mock/${encodeURIComponent(sid)}`);
  if (s.status !== 'open' && s.status !== 'pending') location.replace(back);
  const msg = h('div', { id: 'msg', class: 'alert bad hide' });
  const btn = h('button', { class: 'btn block ok', onclick: async () => {
    btn.disabled = true; btn.textContent = 'Processing…';
    try { await api('POST', `/api/pay/mock/${encodeURIComponent(sid)}/complete`, {}); location.href = back; }
    catch (e) { msg.textContent = e.message; msg.classList.remove('hide'); btn.disabled = false; btn.textContent = 'Pay now'; }
  } }, `Pay ${money(s.amount)}`);
  app.replaceChildren(h('div', { class: 'card' }, h('h1', {}, 'Demo checkout'),
    h('div', { class: 'alert' }, 'This is a simulated payment page. No real card is charged. Set PAYMENT_PROVIDER=stripe for live card payments.'),
    h('dl', { class: 'kv' }, h('dt', {}, 'Reference'), h('dd', {}, s.reference), h('dt', {}, 'Service'), h('dd', {}, s.service), h('dt', {}, 'When'), h('dd', {}, s.when), h('dt', {}, 'Amount'), h('dd', {}, h('b', {}, money(s.amount)))),
    h('label', {}, 'Card number'), h('input', { value: '4242 4242 4242 4242', disabled: true }), msg, h('p', {}, btn),
    h('a', { href: back }, 'Cancel')));
} catch (e) { app.replaceChildren(h('div', { class: 'alert bad' }, e.message)); }
