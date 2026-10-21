import { api, h, $, clear, toast, dateKey, keyToTs, fmtTime, dow, dayLabel, money, DAY, HOUR, timeRange, ltr } from '/js/common.js';
import { T, AR, setupPage, svcName } from '/js/i18n.js';
setupPage();

const app = $('#app');
const S = { cfg: null, svc: null, slot: null, weekStart: 0, slots: [], day: null };

init();
async function init() {
  try { S.cfg = await api('GET', '/api/config'); } catch (e) { return void app.replaceChildren(h('div', { class: 'alert bad' }, e.message)); }
  $('#brand').textContent = AR ? (S.cfg.companyAr || $('#brand').textContent) : S.cfg.company;
  S.svc = S.cfg.services[0]?.id ?? null;
  S.weekStart = mondayOf(S.cfg.today);
  if (new Date(S.cfg.today + 4 * HOUR).getUTCDay() === 0) S.weekStart += 7 * DAY; // Sunday: closed, show next week
  await loadWeek();
  for (let i = 0; i < 4 && !S.slots.length && S.weekStart + 7 * DAY < maxStart(); i++) { S.weekStart += 7 * DAY; await loadWeek(); }
  render();
}
function mondayOf(ts) { const d = new Date(ts + 4 * HOUR).getUTCDay(); return ts - ((d + 6) % 7) * DAY; }
async function loadWeek() {
  const from = Math.max(S.weekStart, S.cfg.today);
  const r = await api('GET', `/api/slots?from=${dateKey(from)}&to=${dateKey(S.weekStart + 7 * DAY)}`).catch(() => ({ slots: [] }));
  S.slots = r.slots;
  const days = weekDays().filter((d) => slotsOn(d).length);
  if (!S.day || !weekDays().includes(S.day) || !slotsOn(S.day).length) S.day = days[0] ?? weekDays()[0];
  if (S.slot && !S.slots.some((s) => s.id === S.slot.id) && !(S.slot.start >= S.weekStart + 7 * DAY || S.slot.start < S.weekStart)) S.slot = null;
}
const weekDays = () => Array.from({ length: 6 }, (_, i) => S.weekStart + i * DAY); // Mon-Sat
const slotsOn = (d) => S.slots.filter((s) => s.start >= d && s.start < d + DAY);
const maxStart = () => S.cfg.today + S.cfg.slotDays * DAY;

function render() {
  const cfg = S.cfg;
  const svcCards = cfg.services.map((s) => h('label', {},
    h('input', { type: 'radio', name: 'svc', value: s.id, checked: s.id === S.svc, onchange: () => { S.svc = s.id; render(); } }),
    h('div', {}, h('b', {}, svcName(s)), h('div', { class: 'price' }, money(s.total)),
      h('div', { class: 'small' }, s.kind === 'online' ? T.onlineDesc : T.offlineDesc))));
  const svc = cfg.services.find((s) => s.id === S.svc);

  const prev = h('button', { class: 'btn alt sm', disabled: S.weekStart <= mondayOf(cfg.today) || S.weekStart - 7 * DAY + 6 * DAY <= cfg.today - 1, 'aria-label': T.prevWeek, onclick: async () => { S.weekStart -= 7 * DAY; await loadWeek(); render(); } }, T.prev);
  const next = h('button', { class: 'btn alt sm', disabled: S.weekStart + 7 * DAY >= maxStart(), 'aria-label': T.nextWeek, onclick: async () => { S.weekStart += 7 * DAY; await loadWeek(); render(); } }, T.next);
  const days = weekDays();

  // desktop week grid
  const hours = [];
  for (let hr = cfg.workStart; hr < cfg.workEnd; hr++) hours.push(hr);
  const grid = h('div', { class: 'grid', role: 'grid', 'aria-label': T.weekly }, h('div', { class: 'h' }, ''), days.map((d) => h('div', { class: 'h' }, dow(d), h('br'), dayLabel(d))));
  for (const hr of hours) {
    grid.append(h('div', { class: 't' }, `${String(hr).padStart(2, '0')}:00`));
    for (const d of days) {
      if (hr === cfg.lunchStart) { grid.append(h('div', { class: 'lunch' }, T.lunch)); continue; }
      const s = S.slots.find((x) => x.start === d + hr * HOUR);
      grid.append(h('div', {}, s ? h('button', { class: `cell free${S.slot?.id === s.id ? ' on' : ''}`, 'aria-label': `${dow(d)} ${hr}:00`, onclick: () => pick(s) }, T.book) : h('span', { class: 'cell none' })));
    }
  }
  // mobile: day pills + list
  const pills = h('div', { class: 'pills', role: 'tablist' }, days.map((d) => h('button', { class: `pill${S.day === d ? ' on' : ''}`, disabled: !slotsOn(d).length, onclick: () => { S.day = d; render(); } }, h('small', {}, dow(d)), dayLabel(d))));
  const list = h('div', { class: 'slotlist' }, (slotsOn(S.day) || []).map((s) => h('button', { class: `slot${S.slot?.id === s.id ? ' on' : ''}`, onclick: () => pick(s) }, timeRange(s.start, s.end, ' – '))));
  if (!slotsOn(S.day).length) list.replaceChildren(h('p', { class: 'muted' }, T.noSlots));

  const form = h('form', { id: 'f', novalidate: true, onsubmit: submit },
    h('label', { for: 'name' }, T.fullName), h('input', { id: 'name', name: 'name', autocomplete: 'name', required: true, maxlength: 100 }),
    h('label', { for: 'mobile' }, T.mobile), h('input', { id: 'mobile', name: 'mobile', type: 'tel', inputmode: 'tel', autocomplete: 'tel', placeholder: '+971 50 123 4567', required: true, dir: 'ltr' }),
    svc?.kind === 'online' ? [h('label', { for: 'platform' }, T.platform), h('select', { id: 'platform', name: 'platform' }, cfg.platforms.map((p) => h('option', { value: p }, p)))] : null,
    h('label', { class: 'terms' }, h('input', { type: 'checkbox', id: 'terms', name: 'acceptTerms', required: true }),
      h('span', {}, T.termsA, h('a', { href: '/terms.html', target: '_blank', rel: 'noopener' }, T.termsLink), T.termsB)),
    h('p', { class: 'notice', role: 'note' }, h('b', {}, T.notMedicalTitle), ' ', T.notMedical),
    h('div', { id: 'err', class: 'alert bad hide', role: 'alert' }),
    h('div', { class: 'sticky' },
      h('div', { class: 'small', id: 'sum' }, S.slot ? `${svcName(svc)} · ${dow(S.slot.start)} ${dayLabel(S.slot.start)} ${timeRange(S.slot.start, S.slot.end)} · ${ltr(money(svc.total))}` : T.chooseSlot),
      h('button', { class: 'btn block', id: 'go', type: 'submit', disabled: !S.slot }, `${T.continuePay}${svc ? ' · ' + money(svc.total) : ''}`)));

  const keep = app.querySelector('#f') ? Object.fromEntries(new FormData(app.querySelector('#f'))) : {};
  // keep the page exactly where the user is: no jump to the top when a day, time or service is picked
  const y = window.scrollY, pillsX = app.querySelector('.pills')?.scrollLeft ?? null;
  app.style.minHeight = `${app.offsetHeight}px`;
  app.replaceChildren(
    h('h1', {}, T.bookTitle),
    h('p', { class: 'muted' }, T.intro(cfg.workStart, cfg.workEnd, cfg.lockMinutes)),
    h('ol', { class: 'steps' }, T.steps.map((x, i) => h('li', { class: i < 3 ? 'on' : '' }, x))),
    h('section', { class: 'card' }, h('h2', {}, T.chooseService), h('div', { class: 'svc' }, svcCards)),
    h('section', { class: 'card' }, h('h2', {}, T.pickTime),
      h('div', { class: 'weekbar' }, prev, h('b', {}, `${dayLabel(days[0])} – ${dayLabel(days[5])}`), next),
      h('div', { class: 'mob' }, pills, list), grid, h('p', { class: 'small muted' }, T.onlyAvail(cfg.freeRescheduleHours))),
    h('section', { class: 'card' }, h('h2', {}, T.yourDetails), form),
    cfg.paymentProvider === 'mock' ? h('div', { class: 'alert' }, T.demoMode) : null);
  for (const [k, v] of Object.entries(keep)) { const i = app.querySelector(`#f [name="${k}"]`); if (!i || !v) continue; if (i.type === 'checkbox') i.checked = true; else i.value = v; }
  if (pillsX !== null) app.querySelector('.pills').scrollLeft = pillsX;
  window.scrollTo({ top: y, left: 0, behavior: 'instant' });
  app.style.minHeight = '';
}
function pick(s) { S.slot = s; render(); }

async function submit(ev) {
  ev.preventDefault();
  const f = ev.target, err = $('#err'), btn = $('#go');
  const v = Object.fromEntries(new FormData(f));
  const terms = $('#terms').checked;
  delete v.acceptTerms;
  const bad = !v.name?.trim() ? T.errName : !v.mobile?.trim() ? T.errMobile : !terms ? T.errTerms : null;
  if (bad) { err.textContent = bad; err.classList.remove('hide'); return; }
  err.classList.add('hide'); btn.disabled = true; btn.textContent = T.reserving;
  try {
    const r = await api('POST', '/api/bookings', { ...v, acceptTerms: terms, serviceId: S.svc, slotId: S.slot.id });
    location.href = r.checkoutUrl;
  } catch (e) {
    err.textContent = e.status === 409 ? T.slotTaken : e.message;
    err.classList.remove('hide'); btn.disabled = false;
    if (e.status === 409) { S.slot = null; await loadWeek(); render(); $('#err').textContent = T.slotTaken; $('#err').classList.remove('hide'); }
  }
}
