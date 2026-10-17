// Shared helpers. No inline scripts/styles anywhere (strict CSP).
export const TZ = 'Asia/Dubai';
const f = (opts) => new Intl.DateTimeFormat('en-GB', { timeZone: TZ, ...opts });
const fDate = f({ weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
const fTime = f({ hour: '2-digit', minute: '2-digit', hour12: false });
const fKey = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const fDow = f({ weekday: 'short' });
const fDay = f({ day: '2-digit', month: 'short' });
export const dateKey = (ts) => fKey.format(ts);
export const fmtDate = (ts) => fDate.format(ts);
export const fmtTime = (ts) => fTime.format(ts);
export const fmtRange = (a, b) => `${fmtDate(a)}, ${fmtTime(a)}-${fmtTime(b)} (Dubai)`;
export const fmtStamp = (ts) => `${fmtDate(ts)} ${fmtTime(ts)}`;
export const dow = (ts) => fDow.format(ts);
export const dayLabel = (ts) => fDay.format(ts);
export const money = (n) => `AED ${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const DAY = 86400000;
export const HOUR = 3600000;
/** Dubai-midnight timestamp for a YYYY-MM-DD key. */
export const keyToTs = (k) => Date.parse(`${k}T00:00:00+04:00`);

export class ApiError extends Error { constructor(msg, status) { super(msg); this.status = status; } }
export async function api(method, path, body) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (path.startsWith('/api/admin')) headers['X-Requested-With'] = 'co';
  let res;
  try { res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), credentials: 'same-origin' }); }
  catch { throw new ApiError('Network error. Please check your connection.', 0); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || `Request failed (${res.status})`, res.status);
  return data;
}

/** Tiny DOM builder (no innerHTML => no XSS from customer-entered text). */
export function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'value') e.value = v;
    else if (k === 'checked' || k === 'disabled' || k === 'selected') e[k] = !!v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat(9)) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(String(k)));
  return e;
}
export const $ = (s, r = document) => r.querySelector(s);
export const clear = (e) => { while (e.firstChild) e.removeChild(e.firstChild); return e; };
export function toast(msg, ms = 3500) {
  const t = h('div', { class: 'toast', role: 'status' }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), ms);
}
export const badge = (s) => h('span', { class: `badge ${s}` }, String(s).replace('_', ' '));
export const qs = (k) => new URLSearchParams(location.search).get(k);
export function countdown(el, until, onDone) {
  const tick = () => {
    const left = Math.max(0, until - Date.now());
    el.textContent = `${Math.floor(left / 60000)}:${String(Math.floor(left / 1000) % 60).padStart(2, '0')}`;
    if (left <= 0) { clearInterval(iv); onDone?.(); }
  };
  const iv = setInterval(tick, 1000);
  tick();
  return () => clearInterval(iv);
}
