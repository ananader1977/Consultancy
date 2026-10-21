import { api, h, $, clear, toast, badge, fmtRange, fmtStamp, fmtTime, dow, dayLabel, dateKey, money, DAY, HOUR } from '/js/common.js';

const app = $('#app'), dlg = $('#dlg'), nav = $('#nav');
const S = { me: null, tab: 'dashboard', weekStart: null, cfg: null };
const TABS = [['dashboard', 'Dashboard'], ['calendar', 'Calendar'], ['bookings', 'Bookings'], ['refunds', 'Refunds'], ['invoices', 'Invoices'], ['services', 'Prices'], ['settings', 'Settings'], ['admins', 'Admins'], ['messages', 'Messages']];
const shown = new Set();
let pollTimer;

const A = (m, p, b) => api(m, `/api/admin${p}`, b);
const mondayOf = (ts) => ts - ((new Date(ts + 4 * HOUR).getUTCDay() + 6) % 7) * DAY;
const run = async (fn, ok) => { try { const r = await fn(); if (ok) toast(ok); return r; } catch (e) { toast(e.message, 5000); return null; } };

boot();
async function boot() {
  try { S.me = (await A('GET', '/me')).admin; } catch { return loginView(); }
  S.cfg = await api('GET', '/api/config');
  S.weekStart = mondayOf(S.cfg.today) + (new Date(S.cfg.today + 4 * HOUR).getUTCDay() === 0 ? 7 * DAY : 0);
  nav.replaceChildren(h('span', { class: 'small' }, S.me.email, ' '), h('button', { class: 'btn alt sm', onclick: async () => { await A('POST', '/logout', {}); location.reload(); } }, 'Sign out'));
  go(location.hash.slice(1) || 'dashboard');
  clearInterval(pollTimer); pollTimer = setInterval(reminders, 60000); reminders();
}
function loginView() {
  const err = h('div', { class: 'alert bad hide', role: 'alert' });
  app.replaceChildren(h('div', { class: 'card' }, h('h1', {}, 'Admin sign in'),
    h('form', { onsubmit: async (e) => { e.preventDefault(); const v = Object.fromEntries(new FormData(e.target));
      try { await A('POST', '/login', v); boot(); } catch (x) { err.textContent = x.message; err.classList.remove('hide'); } } },
      h('label', {}, 'Email'), h('input', { name: 'email', type: 'email', autocomplete: 'username', required: true }),
      h('label', {}, 'Password'), h('input', { name: 'password', type: 'password', autocomplete: 'current-password', required: true }), err,
      h('p', {}, h('button', { class: 'btn block' }, 'Sign in')))));
}
async function reminders() {
  const r = await A('GET', '/reminders').catch(() => null);
  if (!r) return;
  for (const b of r.bookings) {
    if (shown.has(b.id)) continue;
    shown.add(b.id);
    if (dlg.open) continue;
    dlg.replaceChildren(h('div', { class: 'dlg' }, h('h2', {}, `⏰ Appointment within ${r.hours} hours`), h('p', {}, h('b', {}, b.customer_name), ` · ${b.service_name}`), h('p', {}, fmtRange(b.start, b.end)), h('p', { class: 'small' }, `${b.mobile} · ${b.email}`),
      h('p', {}, h('button', { class: 'btn', onclick: () => dlg.close() }, 'OK'), ' ', h('button', { class: 'btn alt', onclick: () => { dlg.close(); detail(b.id); } }, 'Open'))));
    dlg.showModal();
  }
}
function go(tab) {
  S.tab = tab; history.replaceState(null, '', `#${tab}`);
  const tabs = h('div', { class: 'tabs' }, TABS.map(([k, l]) => h('button', { class: S.tab === k ? 'on' : '', onclick: () => go(k) }, l)));
  const body = h('div', { id: 'body' }, 'Loading…');
  app.replaceChildren(tabs, body);
  VIEWS[tab]?.(body);
}
const refresh = () => go(S.tab);
function modal(...kids) { dlg.replaceChildren(h('div', { class: 'dlg' }, ...kids, h('p', { class: 'right' }, h('button', { class: 'btn alt sm', onclick: () => dlg.close() }, 'Close')))); if (!dlg.open) dlg.showModal(); }

const VIEWS = {
  async dashboard(el) {
    const d = await A('GET', '/dashboard');
    const max = Math.max(1, ...d.days.map((x) => x.count));
    clear(el).append(h('p', { class: 'right' }, h('a', { class: 'btn alt sm', href: '/api/admin/export.xlsx', download: '' }, 'Export to Excel (all data)')),
      h('div', { class: 'kpis' },
      h('div', { class: 'kpi big' }, h('b', {}, d.confirmed), 'Confirmed bookings'), h('div', { class: 'kpi' }, h('b', {}, d.upcoming), 'Upcoming'), h('div', { class: 'kpi' }, h('b', {}, d.today), 'Today'),
      h('div', { class: 'kpi' }, h('b', {}, d.pending), 'Awaiting payment'), h('div', { class: 'kpi' }, h('b', {}, money(d.revenue.total)), 'Paid revenue (incl. VAT)')),
      h('div', { class: 'card' }, h('h2', {}, 'Confirmed per day, next 14 days'), h('div', { class: 'bars' }, d.days.map((x) => { const b = h('div', { title: `${x.label}: ${x.count}` }); b.style.height = `${(x.count / max) * 100}%`; return b; })),
        h('div', { class: 'small muted' }, `${d.days[0].label} → ${d.days[13].label}`)),
      h('div', { class: 'card' }, h('h2', {}, 'Next appointments'), d.next.length ? h('div', { class: 'tablewrap' }, bookingTable(d.next)) : h('p', { class: 'muted' }, 'None scheduled.')));
  },

  async calendar(el) {
    const days = Array.from({ length: 6 }, (_, i) => S.weekStart + i * DAY);
    const slots = (await A('GET', `/calendar?from=${dateKey(S.weekStart)}&to=${dateKey(S.weekStart + 7 * DAY)}`)).slots;
    const now = Date.now();
    const cellFor = (s) => {
      if (!s) return h('span', { class: 'cell none' });
      const b = s.booking;
      const cls = b ? (b.status === 'refund_requested' ? 'refund' : b.payment_status === 'paid' ? 'paid' : 'pending') : s.blocked ? 'blocked' : 'free';
      return h('button', { class: `cell ${cls}${s.end < now ? ' past' : ''}`, onclick: () => (b ? detail(b.id) : slotMenu(s)) },
        b ? [h('div', {}, b.customer_name.split(' ')[0]), h('small', {}, b.service_kind === 'online' ? 'Online' : 'Office')] : s.blocked ? 'Blocked' : '+');
    };
    const grid = h('div', { class: 'grid' }, h('div', { class: 'h' }, ''), days.map((d) => h('div', { class: 'h' }, dow(d), h('br'), dayLabel(d))));
    for (let hr = S.cfg.workStart; hr < S.cfg.workEnd; hr++) {
      grid.append(h('div', { class: 't' }, `${String(hr).padStart(2, '0')}:00`));
      for (const d of days) grid.append(hr === S.cfg.lunchStart ? h('div', { class: 'lunch' }, 'Lunch') : h('div', {}, cellFor(slots.find((x) => x.start === d + hr * HOUR))));
    }
    const mob = h('div', { class: 'mob' }, days.map((d) => h('div', { class: 'card' }, h('h3', {}, `${dow(d)} ${dayLabel(d)}`),
      h('div', { class: 'slotlist' }, slots.filter((s) => s.start >= d && s.start < d + DAY).map((s) => { const c = cellFor(s); c.style.minHeight = '56px'; return c; })))));
    clear(el).append(
      h('div', { class: 'weekbar' }, h('button', { class: 'btn alt sm', onclick: () => { S.weekStart -= 7 * DAY; refresh(); } }, '‹ Prev'), h('b', {}, `${dayLabel(days[0])} – ${dayLabel(days[5])}`),
        h('button', { class: 'btn alt sm', onclick: () => { S.weekStart = mondayOf(S.cfg.today); refresh(); } }, 'Today'), h('button', { class: 'btn alt sm', onclick: () => { S.weekStart += 7 * DAY; refresh(); } }, 'Next ›')),
      h('div', { class: 'legend' }, [['#bbf7d0', 'Paid'], ['#fde68a', 'Awaiting payment'], ['#c7d2fe', 'Refund requested'], ['#d9dce4', 'Blocked'], ['#eef3ff', 'Free']].map(([c, l]) => { const i = h('i'); i.style.background = c; return h('span', {}, i, l); })),
      mob, grid);
  },

  async bookings(el) {
    let status = 'all', q = '';
    const box = h('div', { class: 'tablewrap' });
    const load = async () => { const r = await A('GET', `/bookings?status=${status}&q=${encodeURIComponent(q)}`); box.replaceChildren(r.bookings.length ? bookingTable(r.bookings) : h('p', { class: 'muted' }, 'No bookings.')); };
    clear(el).append(h('div', { class: 'row' },
      h('select', { onchange: (e) => { status = e.target.value; load(); } }, ['all', 'confirmed', 'pending', 'refund_requested', 'refunded', 'expired', 'cancelled'].map((s) => h('option', { value: s }, s.replace('_', ' ')))),
      h('input', { type: 'search', placeholder: 'Search name, email, mobile, ref', oninput: (e) => { q = e.target.value; clearTimeout(load.t); load.t = setTimeout(load, 250); } }),
      h('button', { class: 'btn', onclick: () => newBooking() }, '+ New booking')), box);
    load();
  },

  async refunds(el) {
    const r = await A('GET', '/bookings?status=refund_requested');
    clear(el).append(h('h2', {}, 'Refund requests'), r.bookings.length ? h('div', { class: 'tablewrap' }, bookingTable(r.bookings, true)) : h('p', { class: 'muted' }, 'No pending refund requests.'));
  },

  async invoices(el) {
    const r = await A('GET', '/invoices');
    clear(el).append(h('div', { class: 'tablewrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['Invoice', 'Date', 'Customer', 'Net', 'VAT', 'Total', 'Status', ''].map((x) => h('th', {}, x)))),
      h('tbody', {}, r.invoices.map((i) => h('tr', {}, h('td', {}, i.number), h('td', {}, fmtStamp(i.issued_at)), h('td', {}, i.customer_name), h('td', {}, money(i.net)), h('td', {}, money(i.vat)), h('td', {}, money(i.total)), h('td', {}, badge(i.status)),
        h('td', {}, h('a', { href: `/api/admin/invoices/${i.id}/pdf`, target: '_blank', rel: 'noopener' }, 'PDF'), i.credit_note_number ? [' · ', h('a', { href: `/api/admin/invoices/${i.id}/credit-note.pdf`, target: '_blank', rel: 'noopener' }, 'Credit note')] : null))))),
      !r.invoices.length ? h('p', { class: 'muted' }, 'Invoices appear here once customers have paid.') : null));
  },

  async services(el) {
    const r = await A('GET', '/services');
    const rowFor = (s) => { const price = h('input', { type: 'number', min: 0, step: '0.01', value: s.price }); const name = h('input', { value: s.name }); const act = h('input', { type: 'checkbox', checked: !!s.active });
      return h('div', { class: 'card' }, h('div', { class: 'row' }, h('div', {}, h('label', {}, 'Name'), name), h('div', {}, h('label', {}, `Price (\u20C3, ${S.cfg.pricesIncludeVat ? 'VAT incl.' : 'before VAT'})`), price)),
        h('label', {}, act, ' Active (shown to customers)'), h('p', {}, h('button', { class: 'btn', onclick: () => run(() => A('PUT', `/services/${s.id}`, { name: name.value, price: price.value, active: act.checked }), 'Saved') }, `Save ${s.kind}`))); };
    clear(el).append(h('h2', {}, 'Services & prices'), h('p', { class: 'muted' }, 'Changes apply to new bookings only. Existing bookings keep the price they were booked at.'), r.services.map(rowFor));
  },

  async settings(el) {
    const r = await A('GET', '/settings'); const s = r.settings;
    const fields = [['company_name', 'Company name'], ['company_name_ar', 'Company name (Arabic)'], ['company_address', 'Address'], ['company_trn', 'Tax Registration Number (TRN)'], ['owner_name', 'Owner name'], ['owner_email', 'Admin notification email (new & modified bookings)'], ['contact_phone', 'Contact phone / WhatsApp (shown to clients)'], ['contact_email', 'Contact email (shown to clients)'], ['facebook', 'Facebook page name'], ['vat_rate', 'VAT %'],
      ['work_start', 'Day starts (hour)'], ['work_end', 'Day ends (hour)'], ['lunch_start', 'Lunch hour (-1 = none)'], ['lock_minutes', 'Slot lock (minutes)'], ['free_reschedule_hours', 'Free reschedule until (hours before)'], ['max_changes', 'Max client changes per booking'], ['payment_link_hours', 'Payment link valid for (hours)'], ['change_window_days', 'Within (calendar days)'],
      ['reminder_hours', 'Admin reminder (hours before)'], ['slot_days', 'Booking window (days)'], ['zoom_link', 'Default Zoom link'], ['closed_days', 'Closed weekdays (0=Sun, comma separated)']];
    const inputs = Object.fromEntries(fields.map(([k]) => [k, h('input', { value: Array.isArray(s[k]) ? s[k].join(',') : s[k] ?? '' })]));
    inputs.company_name_ar.dir = 'rtl';
    const inc = h('input', { type: 'checkbox', checked: !!s.prices_include_vat });
    const terms = h('textarea', { rows: 14, value: s.terms_text || '' });
    const termsAr = h('textarea', { rows: 14, value: s.terms_text_ar || '', dir: 'rtl', lang: 'ar' });
    clear(el).append(h('div', { class: 'card' }, h('h2', {}, 'Settings'), h('div', { class: 'row' }, fields.map(([k, l]) => h('div', {}, h('label', {}, l), inputs[k]))),
      h('label', {}, inc, ' Listed prices already include VAT'),
      h('label', {}, 'Terms & Conditions (shown to clients, who must accept before payment)'), terms,
      h('label', {}, 'Terms & Conditions in Arabic (shown on the Arabic pages)'), termsAr,
      h('p', { class: 'small muted' }, 'Blank line between sections; the first line of each section is its heading. Preview: ', h('a', { href: '/terms.html?lang=en', target: '_blank', rel: 'noopener' }, 'English'), ' · ', h('a', { href: '/terms.html?lang=ar', target: '_blank', rel: 'noopener' }, 'العربية')),
      h('p', {}, h('button', { class: 'btn', onclick: () => run(async () => { await A('PUT', '/settings', { ...Object.fromEntries(fields.map(([k]) => [k, inputs[k].value])), prices_include_vat: inc.checked, terms_text: terms.value, terms_text_ar: termsAr.value }); S.cfg = await api('GET', '/api/config'); await A('POST', '/slots/generate', {}); }, 'Settings saved') }, 'Save settings'))),
      h('div', { class: 'card' }, h('h2', {}, 'Integrations'), h('dl', { class: 'kv' },
        h('dt', {}, 'Payments'), h('dd', {}, r.provider === 'stripe' ? 'Stripe (live cards)' : 'Demo (simulated) – set PAYMENT_PROVIDER=stripe'),
        h('dt', {}, 'Email (SMTP)'), h('dd', {}, r.smtpConfigured ? 'Configured' : 'Not configured – emails are only logged', ' ', h('button', { class: 'btn alt sm', onclick: () => run(async () => { const t = await A('POST', '/test-email', {}); toast(t.status === 'sent' ? `Test email sent to ${t.to}` : `Not sent to ${t.to}: ${t.error}`, 6000); }) }, 'Send test email')),
        h('dt', {}, 'WhatsApp'), h('dd', {}, r.whatsappConfigured ? 'Configured' : 'Not configured – messages are only logged'),
        h('dt', {}, 'Calendar feed'), h('dd', {}, h('input', { readonly: true, value: r.feedUrl, onfocus: (e) => e.target.select() }), h('div', { class: 'small muted' }, 'Subscribe to this URL in Zoho Calendar, Outlook or Google Calendar (confirmed bookings, with 2h reminder).')))));
  },

  async admins(el) {
    const r = await A('GET', '/admins');
    const f = h('form', { onsubmit: async (e) => { e.preventDefault(); const v = Object.fromEntries(new FormData(e.target)); if (await run(() => A('POST', '/admins', v), 'Admin added')) refresh(); } },
      h('div', { class: 'row' }, h('input', { name: 'email', type: 'email', placeholder: 'Email', required: true }), h('input', { name: 'name', placeholder: 'Name' }), h('input', { name: 'password', type: 'password', placeholder: 'Password (10+ chars, letters & numbers)', required: true })), h('p', {}, h('button', { class: 'btn' }, 'Add admin')));
    const pw = h('form', { onsubmit: async (e) => { e.preventDefault(); const v = Object.fromEntries(new FormData(e.target)); if (await run(() => A('POST', '/password', v), 'Password changed')) e.target.reset(); } },
      h('div', { class: 'row' }, h('input', { name: 'current', type: 'password', placeholder: 'Current password', required: true }), h('input', { name: 'password', type: 'password', placeholder: 'New password', required: true })), h('p', {}, h('button', { class: 'btn alt' }, 'Change my password')));
    clear(el).append(h('div', { class: 'card' }, h('h2', {}, 'Admin users'), h('table', {}, h('tbody', {}, r.admins.map((a) => h('tr', {}, h('td', {}, a.email), h('td', {}, a.name), h('td', {}, a.id === S.me.id ? 'you' : h('button', { class: 'btn danger sm', onclick: async () => { if (confirm(`Remove ${a.email}?`) && await run(() => A('DELETE', `/admins/${a.id}`), 'Removed')) refresh(); } }, 'Remove')))))), f), h('div', { class: 'card' }, h('h2', {}, 'Password'), pw));
  },

  async messages(el) {
    const r = await A('GET', '/outbox?limit=150');
    clear(el).append(h('p', { class: 'muted' }, 'Every email and WhatsApp message the system sent (or logged, if not configured).'), h('div', { class: 'tablewrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['When', 'Channel', 'To', 'Subject', 'Status'].map((x) => h('th', {}, x)))),
      h('tbody', {}, r.messages.map((m) => h('tr', {}, h('td', {}, fmtStamp(m.ts)), h('td', {}, m.channel), h('td', {}, m.to_addr), h('td', {}, m.subject), h('td', {}, badge(m.status === 'sent' ? 'confirmed' : m.status === 'failed' ? 'cancelled' : 'pending'), m.error ? h('div', { class: 'small muted' }, m.error) : null)))))));
  },
};

function bookingTable(list, withRefundActions) {
  return h('table', {}, h('thead', {}, h('tr', {}, ['Ref', 'Customer', 'When', 'Service', 'Total', 'Status', ''].map((x) => h('th', {}, x)))),
    h('tbody', {}, list.map((b) => h('tr', {}, h('td', {}, b.reference), h('td', {}, b.customer_name, h('div', { class: 'small muted' }, b.mobile)), h('td', {}, fmtStamp(b.start)), h('td', {}, b.service_name), h('td', {}, money(b.total)), h('td', {}, badge(b.status), ' ', badge(b.payment_status)),
      h('td', {}, h('button', { class: 'btn alt sm', onclick: () => detail(b.id) }, 'Open'),
        withRefundActions ? [' ', h('button', { class: 'btn ok sm', onclick: () => approve(b) }, 'Approve'), ' ', h('button', { class: 'btn danger sm', onclick: () => reject(b) }, 'Reject')] : null)))));
}
async function approve(b) { if (confirm(`Refund AED ${Number(b.total).toFixed(2)} to ${b.customer_name} and cancel the booking?`) && await run(() => A('POST', `/bookings/${b.id}/refund/approve`, {}), 'Refund approved')) { dlg.close(); refresh(); } }
async function reject(b) { if (await run(() => A('POST', `/bookings/${b.id}/refund/reject`, {}), 'Refund rejected')) { dlg.close(); refresh(); } }

const deliveryText = (d) => !d ? '' : d.status === 'sent' ? `Email sent to ${d.email}.` : d.status === 'none' ? 'No email on this booking (WhatsApp only).' : `EMAIL NOT SENT to ${d.email}: ${d.error || d.status}`;
async function detail(id) {
  const r = await run(() => A('GET', `/bookings/${id}`)); if (!r) return;
  const b = r.booking;
  const link = h('input', { value: b.meeting_link || '', placeholder: 'https://…' }), notes = h('textarea', { rows: 2 }, b.admin_notes || '');
  const name = h('input', { value: b.customer_name }), mobile = h('input', { value: b.mobile }), email = h('input', { value: b.email });
  const btns = [h('button', { class: 'btn', onclick: async () => { if (await run(() => A('PATCH', `/bookings/${id}`, { customer_name: name.value, mobile: mobile.value, email: email.value, meeting_link: link.value, admin_notes: notes.value }), 'Saved')) refresh(); } }, 'Save changes')];
  if (['confirmed', 'pending'].includes(b.status)) btns.push(h('button', { class: 'btn alt', onclick: () => reschedulePicker(b) }, 'Reschedule'));
  if (b.status === 'pending') btns.push(h('button', { class: 'btn', onclick: async () => { const r = await run(() => A('POST', `/bookings/${id}/payment-link`, {})); if (r) { toast(`Payment link ready (valid until ${fmtStamp(r.booking.lock_expires)}, copied). ${deliveryText(r.delivery)}`, 12000); try { await navigator.clipboard.writeText(r.payUrl); } catch { /* clipboard blocked */ } refresh(); } } }, 'Send payment link'));
  if (b.status === 'pending') btns.push(h('button', { class: 'btn ok', onclick: async () => { if (await run(() => A('POST', `/bookings/${id}/mark-paid`, {}), 'Marked paid')) { dlg.close(); refresh(); } } }, 'Mark paid'), h('button', { class: 'btn danger', onclick: async () => { if (await run(() => A('POST', `/bookings/${id}/cancel`, {}), 'Cancelled')) { dlg.close(); refresh(); } } }, 'Cancel'));
  if (b.status === 'refund_requested') btns.push(h('button', { class: 'btn ok', onclick: () => approve(b) }, 'Approve refund'), h('button', { class: 'btn danger', onclick: () => reject(b) }, 'Reject'));
  if (b.status === 'confirmed') btns.push(h('button', { class: 'btn danger', onclick: () => approve(b) }, 'Refund & cancel'));
  modal(h('h2', {}, b.reference, ' ', badge(b.status), ' ', badge(b.payment_status)),
    h('dl', { class: 'kv' }, h('dt', {}, 'When'), h('dd', {}, fmtRange(b.start, b.end)), h('dt', {}, 'Service'), h('dd', {}, `${b.service_name}${b.platform ? ' · ' + b.platform : ''}`), h('dt', {}, 'Total'), h('dd', {}, money(b.total)),
      r.invoice ? [h('dt', {}, 'Invoice'), h('dd', {}, r.invoice.number, ' ', h('a', { href: `/api/admin/invoices/${r.invoice.id}/pdf`, target: '_blank', rel: 'noopener' }, 'PDF'))] : null,
      b.status === 'pending' && b.lock_expires ? [h('dt', {}, 'Pay by'), h('dd', {}, fmtStamp(b.lock_expires))] : null,
      h('dt', {}, 'Terms accepted'), h('dd', {}, b.terms_accepted_at ? fmtStamp(b.terms_accepted_at) : 'n/a (created by admin)'),
      b.refund_reason ? [h('dt', {}, 'Refund reason'), h('dd', {}, b.refund_reason)] : null),
    h('label', {}, 'Name'), name, h('div', { class: 'row' }, h('div', {}, h('label', {}, 'Mobile'), mobile), h('div', {}, h('label', {}, 'Email (optional)'), email)),
    h('label', {}, 'Meeting link (optional)'), link, h('label', {}, 'Internal notes'), notes, h('p', { class: 'row' }, btns),
    h('details', {}, h('summary', {}, 'History'), h('ul', { class: 'small' }, r.audit.map((a) => h('li', {}, `${fmtStamp(a.ts)} · ${a.actor} · ${a.action}${a.detail ? ' · ' + a.detail : ''}`)))));
}
async function reschedulePicker(b) {
  const from = dateKey(Math.max(S.cfg.today, Date.now()));
  const cal = (await A('GET', `/calendar?from=${from}&to=${dateKey(S.cfg.today + 42 * DAY)}`)).slots.filter((s) => !s.booking && !s.blocked && s.start > Date.now());
  const byDay = new Map(); for (const s of cal) { const k = dateKey(s.start); (byDay.get(k) || byDay.set(k, []).get(k)).push(s); }
  const sel = h('select', {}, [...byDay.keys()].map((k) => h('option', { value: k }, `${dow(byDay.get(k)[0].start)} ${dayLabel(byDay.get(k)[0].start)}`)));
  const list = h('div', { class: 'slotlist' });
  const fill = () => list.replaceChildren(...(byDay.get(sel.value) || []).map((s) => h('button', { class: 'slot', onclick: async () => { if (await run(() => A('POST', `/bookings/${b.id}/reschedule`, { slotId: s.id }), 'Rescheduled')) { dlg.close(); refresh(); } } }, `${fmtTime(s.start)}`)));
  sel.addEventListener('change', fill); fill();
  modal(h('h2', {}, `Reschedule ${b.reference}`), h('p', { class: 'muted' }, 'Admin can move bookings at any time (no 24h limit). The customer is notified.'), sel, list);
}
function slotMenu(s) {
  modal(h('h2', {}, `${dow(s.start)} ${dayLabel(s.start)} ${fmtTime(s.start)}`), h('p', { class: 'row' },
    h('button', { class: 'btn', onclick: () => newBooking(s) }, '+ Book for a customer'),
    h('button', { class: 'btn alt', onclick: async () => { if (await run(() => A('POST', `/slots/${s.id}/block`, { blocked: !s.blocked }), s.blocked ? 'Slot opened' : 'Slot blocked')) { dlg.close(); refresh(); } } }, s.blocked ? 'Unblock slot' : 'Block slot (holiday / busy)')));
}
async function newBooking(slot) {
  const cal = slot ? [slot] : (await A('GET', `/calendar?from=${dateKey(Math.max(S.cfg.today, Date.now()))}&to=${dateKey(S.cfg.today + 28 * DAY)}`)).slots.filter((s) => !s.booking && !s.blocked && s.start > Date.now());
  const f = h('form', { onsubmit: async (e) => { e.preventDefault(); const v = Object.fromEntries(new FormData(e.target)); v.markPaid = v.markPaid === 'on'; v.serviceId = Number(v.serviceId); v.slotId = Number(v.slotId);
    const svc = S.cfg.services.find((x) => x.id === v.serviceId); if (svc?.kind !== 'online') delete v.platform;
    const r = await run(() => A('POST', '/bookings', v)); if (r) { toast(r.payUrl ? `Booking created – payment link copied. ${deliveryText(r.delivery)}` : 'Booking created and confirmed', 12000); if (r.payUrl) { try { await navigator.clipboard.writeText(r.payUrl); } catch { /* clipboard blocked */ } } dlg.close(); refresh(); } } },
    h('label', {}, 'Slot'), h('select', { name: 'slotId' }, cal.map((s) => h('option', { value: s.id }, `${dow(s.start)} ${dayLabel(s.start)} ${fmtTime(s.start)}`))),
    h('label', {}, 'Service'), h('select', { name: 'serviceId' }, S.cfg.services.map((x) => h('option', { value: x.id }, `${x.name} – ${money(x.total)}`))),
    h('label', {}, 'Platform (online only)'), h('select', { name: 'platform' }, S.cfg.platforms.map((p) => h('option', {}, p))),
    h('label', {}, 'Name'), h('input', { name: 'name', required: true }), h('label', {}, 'Mobile'), h('input', { name: 'mobile', required: true }), h('label', {}, 'Email (optional)'), h('input', { name: 'email', type: 'email' }),
    h('label', {}, h('input', { name: 'markPaid', type: 'checkbox' }), ' Already paid (cash / bank transfer) – confirm and issue invoice'), h('p', {}, h('button', { class: 'btn' }, 'Create booking')));
  modal(h('h2', {}, 'New booking'), f);
}
