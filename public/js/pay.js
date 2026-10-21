import { api, h, $, qs } from '/js/common.js';
import { T, setupPage } from '/js/i18n.js';
setupPage();
// Payment link page: opens a fresh secure checkout for a pending booking.
const app = $('#app');
const ref = qs('ref'), t = qs('t');
const status = `/status.html?ref=${encodeURIComponent(ref || '')}&t=${encodeURIComponent(t || '')}`;
(async () => {
  try {
    const r = await api('POST', `/api/bookings/${encodeURIComponent(ref || '')}/pay`, { t });
    location.replace(r.checkoutUrl || status);
  } catch (e) {
    app.replaceChildren(h('div', { class: 'alert bad' }, e.message), h('p', {}, h('a', { class: 'btn alt', href: '/' }, T.bookAgain)));
  }
})();
