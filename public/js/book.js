import { api, h, $, clear, toast, dateKey, keyToTs, fmtTime, dow, dayLabel, money, DAY, HOUR } from '/js/common.js';

const app = $('#app');
const S = { cfg: null, svc: null, slot: null, weekStart: 0, slots: [], day: null };

init();
async function init() {
  try { S.cfg = await api('GET', '/api/config'); } catch (e) { return void app.replaceChildren(h('div', { class: 'alert bad' }, e.message)); }
  $('#brand').textContent = S.cfg.company;
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
    h('div', {}, h('b', {}, s.name), h('div', { class: 'price' }, money(s.total)),
      h('div', { class: 'small muted' }, cfg.pricesIncludeVat ? `incl. ${cfg.vatRate}% VAT` : `${money(s.price)} + ${cfg.vatRate}% VAT`),
      h('div', { class: 'small' }, s.kind === 'online' ? 'Online via Zoom or Microsoft Teams' : 'In person at our office'))));
  const svc = cfg.services.find((s) => s.id === S.svc);

  const prev = h('button', { class: 'btn alt sm', disabled: S.weekStart <= mondayOf(cfg.today) || S.weekStart - 7 * DAY + 6 * DAY <= cfg.today - 1, 'aria-label': 'Previous week', onclick: async () => { S.weekStart -= 7 * DAY; await loadWeek(); render(); } }, '‹ Prev');
  const next = h('button', { class: 'btn alt sm', disabled: S.weekStart + 7 * DAY >= maxStart(), 'aria-label': 'Next week', onclick: async () => { S.weekStart += 7 * DAY; await loadWeek(); render(); } }, 'Next ›');
  const days = weekDays();

  // desktop week grid
  const hours = [];
  for (let hr = cfg.workStart; hr < cfg.workEnd; hr++) hours.push(hr);
  const grid = h('div', { class: 'grid', role: 'grid', 'aria-label': 'Weekly availability' }, h('div', { class: 'h' }, ''), days.map((d) => h('div', { class: 'h' }, dow(d), h('br'), dayLabel(d))));
  for (const hr of hours) {
    grid.append(h('div', { class: 't' }, `${String(hr).padStart(2, '0')}:00`));
    for (const d of days) {
      if (hr === cfg.lunchStart) { grid.append(h('div', { class: 'lunch' }, 'Lunch')); continue; }
      const s = S.slots.find((x) => x.start === d + hr * HOUR);
      grid.append(h('div', {}, s ? h('button', { class: `cell free${S.slot?.id === s.id ? ' on' : ''}`, 'aria-label': `${dow(d)} ${hr}:00`, onclick: () => pick(s) }, 'Book') : h('span', { class: 'cell none' })));
    }
  }
  // mobile: day pills + list
  const pills = h('div', { class: 'pills', role: 'tablist' }, days.map((d) => h('button', { class: `pill${S.day === d ? ' on' : ''}`, disabled: !slotsOn(d).length, onclick: () => { S.day = d; render(); } }, h('small', {}, dow(d)), dayLabel(d))));
  const list = h('div', { class: 'slotlist' }, (slotsOn(S.day) || []).map((s) => h('button', { class: `slot${S.slot?.id === s.id ? ' on' : ''}`, onclick: () => pick(s) }, `${fmtTime(s.start)} – ${fmtTime(s.end)}`)));
  if (!slotsOn(S.day).length) list.replaceChildren(h('p', { class: 'muted' }, 'No free slots this week. Try the next week.'));

  const form = h('form', { id: 'f', novalidate: true, onsubmit: submit },
    h('label', { for: 'name' }, 'Full name *'), h('input', { id: 'name', name: 'name', autocomplete: 'name', required: true, maxlength: 100 }),
    h('div', { class: 'row' },
      h('div', {}, h('label', { for: 'mobile' }, 'Mobile (with country code) *'), h('input', { id: 'mobile', name: 'mobile', type: 'tel', inputmode: 'tel', autocomplete: 'tel', placeholder: '+971 50 123 4567', required: true })),
      h('div', {}, h('label', { for: 'email' }, 'Email *'), h('input', { id: 'email', name: 'email', type: 'email', autocomplete: 'email', required: true }))),
    svc?.kind === 'online' ? [h('label', { for: 'platform' }, 'Meeting platform *'), h('select', { id: 'platform', name: 'platform' }, cfg.platforms.map((p) => h('option', { value: p }, p)))] : null,
    h('label', { class: 'terms' }, h('input', { type: 'checkbox', id: 'terms', name: 'acceptTerms', required: true }),
      h('span', {}, 'I have read and accept the ', h('a', { href: '/terms.html', target: '_blank', rel: 'noopener' }, 'Terms & Conditions'), ', including the cancellation and refund policy. *')),
    h('div', { id: 'err', class: 'alert bad hide', role: 'alert' }),
    h('div', { class: 'sticky' },
      h('div', { class: 'small', id: 'sum' }, S.slot ? `${svc.name} · ${dow(S.slot.start)} ${dayLabel(S.slot.start)} ${fmtTime(S.slot.start)}–${fmtTime(S.slot.end)} · ${money(svc.total)}` : 'Choose a time slot above.'),
      h('button', { class: 'btn block', id: 'go', type: 'submit', disabled: !S.slot }, `Continue to secure payment${svc ? ' · ' + money(svc.total) : ''}`)));

  const keep = app.querySelector('#f') ? Object.fromEntries(new FormData(app.querySelector('#f'))) : {};
  app.replaceChildren(
    h('h1', {}, 'Book a consultation'),
    h('p', { class: 'muted' }, `Mon–Sat, ${cfg.workStart}:00–${cfg.workEnd}:00 Dubai time · 1-hour sessions · your slot is held for ${cfg.lockMinutes} minutes while you pay.`),
    h('ol', { class: 'steps' }, h('li', { class: 'on' }, '1 Service'), h('li', { class: 'on' }, '2 Time'), h('li', { class: 'on' }, '3 Details'), h('li', {}, '4 Pay')),
    h('section', { class: 'card' }, h('h2', {}, '1. Choose a service'), h('div', { class: 'svc' }, svcCards)),
    h('section', { class: 'card' }, h('h2', {}, '2. Pick a time'),
      h('div', { class: 'weekbar' }, prev, h('b', {}, `${dayLabel(days[0])} – ${dayLabel(days[5])}`), next),
      h('div', { class: 'mob' }, pills, list), grid, h('p', { class: 'small muted' }, 'Only available slots are shown. Free rescheduling up to ' + cfg.freeRescheduleHours + ' hours before your appointment.')),
    h('section', { class: 'card' }, h('h2', {}, '3. Your details'), form),
    cfg.paymentProvider === 'mock' ? h('div', { class: 'alert' }, 'Demo mode: payments are simulated, no card is charged.') : null);
  for (const [k, v] of Object.entries(keep)) { const i = app.querySelector(`#f [name="${k}"]`); if (!i || !v) continue; if (i.type === 'checkbox') i.checked = true; else i.value = v; }
}
function pick(s) { S.slot = s; render(); $('#f').scrollIntoView({ behavior: 'smooth', block: 'center' }); }

async function submit(ev) {
  ev.preventDefault();
  const f = ev.target, err = $('#err'), btn = $('#go');
  const v = Object.fromEntries(new FormData(f));
  const terms = $('#terms').checked;
  delete v.acceptTerms;
  const bad = !v.name?.trim() ? 'Please enter your name.' : !v.mobile?.trim() ? 'Please enter your mobile number.' : !/^\S+@\S+\.\S+$/.test(v.email || '') ? 'Please enter a valid email.' : !terms ? 'Please accept the Terms & Conditions to continue.' : null;
  if (bad) { err.textContent = bad; err.classList.remove('hide'); return; }
  err.classList.add('hide'); btn.disabled = true; btn.textContent = 'Reserving your slot…';
  try {
    const r = await api('POST', '/api/bookings', { ...v, acceptTerms: terms, serviceId: S.svc, slotId: S.slot.id });
    location.href = r.checkoutUrl;
  } catch (e) {
    err.textContent = e.status === 409 ? 'Sorry, that slot was just taken. Please choose another.' : e.message;
    err.classList.remove('hide'); btn.disabled = false;
    if (e.status === 409) { S.slot = null; await loadWeek(); render(); $('#err').textContent = 'Sorry, that slot was just taken. Please choose another.'; $('#err').classList.remove('hide'); }
  }
}
