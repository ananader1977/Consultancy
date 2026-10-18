import { api, h, $, qs, money } from '/js/common.js';
import { T, setupPage } from '/js/i18n.js';
setupPage();
const app = $('#app'), sid = qs('s'), ref = qs('ref'), t = qs('t');
const back = `/status.html?ref=${encodeURIComponent(ref)}&t=${encodeURIComponent(t)}`;
try {
  const s = await api('GET', `/api/pay/mock/${encodeURIComponent(sid)}`);
  if (s.status !== 'open' && s.status !== 'pending') location.replace(back);
  const msg = h('div', { id: 'msg', class: 'alert bad hide' });
  const btn = h('button', { class: 'btn block ok', onclick: async () => {
    btn.disabled = true; btn.textContent = T.processing;
    try { await api('POST', `/api/pay/mock/${encodeURIComponent(sid)}/complete`, {}); location.href = back; }
    catch (e) { msg.textContent = e.message; msg.classList.remove('hide'); btn.disabled = false; btn.textContent = T.payNow; }
  } }, T.pay(money(s.amount)));
  app.replaceChildren(h('div', { class: 'card' }, h('h1', {}, T.demoCheckout),
    h('div', { class: 'alert' }, T.demoNote),
    h('dl', { class: 'kv' }, h('dt', {}, T.reference), h('dd', {}, s.reference), h('dt', {}, T.service), h('dd', {}, s.service), h('dt', {}, T.when), h('dd', {}, s.when), h('dt', {}, T.amount), h('dd', {}, h('b', {}, money(s.amount)))),
    h('label', {}, T.cardNumber), h('input', { value: '4242 4242 4242 4242', disabled: true }), msg, h('p', {}, btn),
    h('a', { href: back }, T.cancel)));
} catch (e) { app.replaceChildren(h('div', { class: 'alert bad' }, e.message)); }
