import { api, h, $ } from '/js/common.js';
import { T, AR, setupPage } from '/js/i18n.js';
setupPage();
const app = $('#app');
try {
  const t = await api('GET', `/api/terms?lang=${AR ? 'ar' : 'en'}`);
  $('#brand').textContent = t.company;
  const blocks = String(t.text || '').split(/\n\s*\n/);
  const out = [];
  blocks.forEach((b, i) => {
    const lines = b.split('\n');
    if (i === 0 && lines.length === 1) { out.push(h('h1', {}, lines[0])); return; }
    const isHead = lines.length > 1 && lines[0].length < 80;
    out.push(h('section', { class: 'card' }, isHead ? [h('h2', {}, lines[0]), ...lines.slice(1).map((l) => h('p', {}, l))] : lines.map((l) => h('p', {}, l))));
  });
  out.push(h('p', {}, h('a', { class: 'btn alt', href: '/' }, T.backToBooking)));
  app.replaceChildren(...out);
} catch (e) { app.replaceChildren(h('div', { class: 'alert bad' }, e.message)); }
