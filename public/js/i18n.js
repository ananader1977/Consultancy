// Client-side translations for the customer pages (English / Arabic, RTL).
const param = new URLSearchParams(location.search).get('lang');
let saved = null;
try { saved = localStorage.getItem('lang'); } catch { /* storage unavailable */ }
const ADMIN = location.pathname.startsWith('/admin');
export const LANG = ADMIN ? 'en' : param === 'ar' || param === 'en' ? param : saved === 'ar' ? 'ar' : 'en';
try { if (param === 'ar' || param === 'en') localStorage.setItem('lang', param); } catch { /* ignore */ }
export const AR = LANG === 'ar';
export const BRAND_AR = 'لما الصفدي لدراسات العلوم الإجتماعية';

const D = {
  en: {
    manageNav: 'Manage booking', langBtn: 'العربية', dubai: 'Dubai',
    contactUs: 'Contact us', phoneL: 'Phone', whatsappL: 'WhatsApp', emailF: 'Email', facebookL: 'Facebook',
    network: 'Network error. Please check your connection.',
    bookTitle: 'Book a consultation',
    intro: (a, b, m) => `Mon–Sat, ${a}:00–${b}:00 Dubai time · 1-hour sessions · your slot is held for ${m} minutes while you pay.`,
    steps: ['1 Service', '2 Time', '3 Details', '4 Pay'],
    chooseService: '1. Choose a service', pickTime: '2. Pick a time', yourDetails: '3. Your details',
    svcOnline: 'Online', svcOffline: 'Offline',
    onlineDesc: 'Online via Zoom or Microsoft Teams', offlineDesc: 'In person at our office',
    inclVat: (r) => `incl. ${r}% VAT`, plusVat: (p, r) => `${p} + ${r}% VAT`,
    prev: '‹ Prev', next: 'Next ›', prevWeek: 'Previous week', nextWeek: 'Next week', weekly: 'Weekly availability',
    lunch: 'Lunch', book: 'Book',
    noSlots: 'No free slots this week. Try the next week.',
    onlyAvail: (h) => `Only available slots are shown. Free rescheduling up to ${h} hours before your appointment.`,
    fullName: 'Full name *', mobile: 'Mobile (with country code) *', email: 'Email *', platform: 'Meeting platform *',
    termsA: 'I have read and accept the ', termsLink: 'Terms & Conditions', termsB: ', including the cancellation and refund policy. *',
    chooseSlot: 'Choose a time slot above.', continuePay: 'Continue to secure payment',
    demoMode: 'Demo mode: payments are simulated, no card is charged.',
    errName: 'Please enter your name.', errMobile: 'Please enter your mobile number.', errEmail: 'Please enter a valid email.',
    errTerms: 'Please accept the Terms & Conditions to continue.', reserving: 'Reserving your slot…',
    slotTaken: 'Sorry, that slot was just taken. Please choose another.',
    confirmedTitle: 'Booking confirmed ✔', waitingPay: 'Waiting for payment', bookingIs: (s) => `Booking ${s}`,
    thanks: 'Thank you! A confirmation with your tax invoice and calendar invite has been emailed to you.',
    heldA: 'Your slot is held for ', heldB: ' minutes. Complete payment to confirm it.',
    expired: 'The payment window expired and the slot was released. If you were charged you will be refunded automatically. ',
    bookAgain: 'Book again', payCancelled: 'Payment was cancelled. You can try again below.',
    reference: 'Reference', status: 'Status', service: 'Service', when: 'When', total: 'Total',
    inclVatAmt: (v) => ` (incl. VAT ${v})`, meetingLink: 'Meeting link', taxInvoice: 'Tax invoice',
    chooseAnother: 'Choose another slot', reschedOrRefund: 'Reschedule or request refund', print: 'Print',
    saveTitle: 'Save your booking link',
    saveText: 'Use this link any time to view, reschedule or cancel your booking. We have also emailed it to you.',
    copy: 'Copy link', copied: 'Link copied', share: 'Share',
    manageTitle: 'Manage your booking', manageIntro: 'Enter the booking reference and email used when booking.',
    findBooking: 'Find booking', bookingRef: 'Booking reference', emailL: 'Email', tryAgain: 'Try again',
    yourBooking: 'Your booking', downloadPdf: 'Download PDF', continueToPay: 'Continue to payment',
    reschedule: 'Reschedule', freeUntil: (h) => `Free until ${h} hours before your appointment.`, chooseNewTime: 'Choose a new time',
    reschedClosed: (h) => `Self-service rescheduling closes ${h} hours before the appointment. Please contact us to change it.`,
    cancelRefund: 'Cancel & refund', refundInfo: 'Refund requests are reviewed by our team and are possible until the appointment starts.',
    reason: 'Reason (optional)', confirmRefund: 'Request a refund and cancel this booking?', refundRequested: 'Refund requested',
    requestRefund: 'Request refund', started: 'The appointment has already started.',
    awaitingRefund: 'Your refund request is awaiting approval. You will receive an email.', wasRefunded: 'This booking was refunded.',
    loading: 'Loading…', day: 'Day', confirmMove: (d, t) => `Move your booking to ${d} at ${t}?`, rescheduled: 'Rescheduled',
    demoCheckout: 'Demo checkout', demoNote: 'This is a simulated payment page. No real card is charged. Set PAYMENT_PROVIDER=stripe for live card payments.',
    amount: 'Amount', cardNumber: 'Card number', pay: (x) => `Pay ${x}`, processing: 'Processing…', payNow: 'Pay now', cancel: 'Cancel',
    backToBooking: '‹ Back to booking',
    badge: { confirmed: 'confirmed', pending: 'pending', paid: 'paid', unpaid: 'unpaid', refund_requested: 'refund requested', refunded: 'refunded', expired: 'expired', cancelled: 'cancelled' },
  },
  ar: {
    manageNav: 'إدارة الحجز', langBtn: 'English', dubai: 'بتوقيت دبي',
    contactUs: 'تواصل معنا', phoneL: 'الهاتف', whatsappL: 'واتساب', emailF: 'البريد الإلكتروني', facebookL: 'فيسبوك',
    network: 'خطأ في الشبكة. يرجى التحقق من الاتصال.',
    bookTitle: 'احجز استشارة',
    intro: (a, b, m) => `من الاثنين إلى السبت، ${a}:00–${b}:00 بتوقيت دبي · جلسات مدتها ساعة · يُحجز موعدك لمدة ${m} دقائق أثناء الدفع.`,
    steps: ['1 الخدمة', '2 الموعد', '3 البيانات', '4 الدفع'],
    chooseService: '1. اختر الخدمة', pickTime: '2. اختر الموعد', yourDetails: '3. بياناتك',
    svcOnline: 'استشارة عن بُعد', svcOffline: 'استشارة في المكتب',
    onlineDesc: 'عن بُعد عبر Zoom أو Microsoft Teams', offlineDesc: 'حضورياً في مكتبنا',
    inclVat: (r) => `شامل ضريبة القيمة المضافة ${r}%`, plusVat: (p, r) => `${p} + ضريبة القيمة المضافة ${r}%`,
    prev: 'السابق', next: 'التالي', prevWeek: 'الأسبوع السابق', nextWeek: 'الأسبوع التالي', weekly: 'المواعيد الأسبوعية المتاحة',
    lunch: 'استراحة', book: 'احجز',
    noSlots: 'لا توجد مواعيد متاحة هذا الأسبوع. جرّب الأسبوع التالي.',
    onlyAvail: (h) => `تظهر المواعيد المتاحة فقط. إعادة الجدولة مجانية حتى ${h} ساعة قبل موعدك.`,
    fullName: 'الاسم الكامل *', mobile: 'رقم الجوال (مع رمز الدولة) *', email: 'البريد الإلكتروني *', platform: 'منصة الاجتماع *',
    termsA: 'قرأت وأوافق على ', termsLink: 'الشروط والأحكام', termsB: '، بما في ذلك سياسة الإلغاء والاسترداد. *',
    chooseSlot: 'اختر موعداً من الأعلى.', continuePay: 'المتابعة إلى الدفع الآمن',
    demoMode: 'وضع تجريبي: الدفع محاكاة ولن يتم خصم أي مبلغ من البطاقة.',
    errName: 'يرجى إدخال اسمك.', errMobile: 'يرجى إدخال رقم الجوال.', errEmail: 'يرجى إدخال بريد إلكتروني صحيح.',
    errTerms: 'يرجى الموافقة على الشروط والأحكام للمتابعة.', reserving: 'جارٍ حجز موعدك…',
    slotTaken: 'عذراً، تم حجز هذا الموعد للتو. يرجى اختيار موعد آخر.',
    confirmedTitle: 'تم تأكيد الحجز ✔', waitingPay: 'بانتظار الدفع', bookingIs: (s) => `الحجز: ${s}`,
    thanks: 'شكراً لك! أرسلنا إلى بريدك الإلكتروني تأكيد الحجز مع الفاتورة الضريبية ودعوة التقويم.',
    heldA: 'موعدك محجوز لمدة ', heldB: ' دقيقة. أكمل الدفع لتأكيده.',
    expired: 'انتهت مهلة الدفع وأُلغي حجز الموعد. إذا تم خصم أي مبلغ فسيُسترد تلقائياً. ',
    bookAgain: 'احجز مجدداً', payCancelled: 'تم إلغاء الدفع. يمكنك المحاولة مرة أخرى.',
    reference: 'رقم الحجز', status: 'الحالة', service: 'الخدمة', when: 'الموعد', total: 'الإجمالي',
    inclVatAmt: (v) => ` (شامل ضريبة القيمة المضافة ${v})`, meetingLink: 'رابط الاجتماع', taxInvoice: 'الفاتورة الضريبية',
    chooseAnother: 'اختر موعداً آخر', reschedOrRefund: 'إعادة الجدولة أو طلب استرداد', print: 'طباعة',
    saveTitle: 'احفظ رابط حجزك',
    saveText: 'استخدم هذا الرابط في أي وقت لعرض حجزك أو إعادة جدولته أو إلغائه. أرسلناه أيضاً إلى بريدك الإلكتروني.',
    copy: 'نسخ الرابط', copied: 'تم نسخ الرابط', share: 'مشاركة',
    manageTitle: 'إدارة حجزك', manageIntro: 'أدخل رقم الحجز والبريد الإلكتروني المستخدم عند الحجز.',
    findBooking: 'البحث عن الحجز', bookingRef: 'رقم الحجز', emailL: 'البريد الإلكتروني', tryAgain: 'حاول مرة أخرى',
    yourBooking: 'حجزك', downloadPdf: 'تنزيل PDF', continueToPay: 'المتابعة إلى الدفع',
    reschedule: 'إعادة الجدولة', freeUntil: (h) => `مجاناً حتى ${h} ساعة قبل موعدك.`, chooseNewTime: 'اختر موعداً جديداً',
    reschedClosed: (h) => `تُغلق إعادة الجدولة الذاتية قبل ${h} ساعة من الموعد. يرجى التواصل معنا لتغييره.`,
    cancelRefund: 'الإلغاء والاسترداد', refundInfo: 'يراجع فريقنا طلبات الاسترداد، ويمكن تقديمها حتى بدء الموعد.',
    reason: 'السبب (اختياري)', confirmRefund: 'هل تريد طلب استرداد وإلغاء هذا الحجز؟', refundRequested: 'تم إرسال طلب الاسترداد',
    requestRefund: 'طلب استرداد', started: 'لقد بدأ الموعد بالفعل.',
    awaitingRefund: 'طلب الاسترداد بانتظار الموافقة. ستصلك رسالة بالبريد الإلكتروني.', wasRefunded: 'تم استرداد مبلغ هذا الحجز.',
    loading: 'جارٍ التحميل…', day: 'اليوم', confirmMove: (d, t) => `هل تريد نقل حجزك إلى ${d} الساعة ${t}؟`, rescheduled: 'تمت إعادة الجدولة',
    demoCheckout: 'دفع تجريبي', demoNote: 'هذه صفحة دفع تجريبية، ولن يتم خصم أي مبلغ من البطاقة.',
    amount: 'المبلغ', cardNumber: 'رقم البطاقة', pay: (x) => `ادفع ${x}`, processing: 'جارٍ المعالجة…', payNow: 'ادفع الآن', cancel: 'إلغاء',
    backToBooking: 'العودة إلى الحجز',
    badge: { confirmed: 'مؤكد', pending: 'قيد الانتظار', paid: 'مدفوع', unpaid: 'غير مدفوع', refund_requested: 'طلب استرداد', refunded: 'مسترد', expired: 'منتهي', cancelled: 'ملغى' },
  },
};
export const T = D[LANG];
export const svcName = (s) => (AR ? (s.kind === 'online' ? T.svcOnline : T.svcOffline) : s.name);

/** Set direction/lang and add the language switch + translated nav to the page header. */
export function setupPage() {
  document.documentElement.lang = LANG;
  document.documentElement.dir = AR ? 'rtl' : 'ltr';
  const nav = document.querySelector('.top nav');
  const brand = document.getElementById('brand');
  if (AR && brand) brand.textContent = BRAND_AR;
  if (nav) {
    const link = nav.querySelector('a');
    if (link) link.textContent = T.manageNav;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'lang';
    btn.textContent = T.langBtn;
    btn.lang = AR ? 'en' : 'ar';
    btn.addEventListener('click', () => {
      const u = new URL(location.href);
      u.searchParams.set('lang', AR ? 'en' : 'ar');
      location.href = u.toString();
    });
    nav.append(btn);
  }
  addFooter();
}

function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  for (const k of kids) e.append(k);
  return e;
}
async function addFooter() {
  let c;
  try { c = await (await fetch('/api/contact', { headers: { 'X-Lang': LANG } })).json(); } catch { return; }
  if (!c || (!c.phone && !c.email && !c.facebook)) return;
  const items = [];
  const digits = String(c.phone || '').replace(/[^\d]/g, '');
  if (c.phone) {
    items.push(el('li', {}, el('span', { class: 'k' }, T.phoneL), el('a', { href: `tel:+${digits}`, dir: 'ltr' }, c.phone)));
    items.push(el('li', {}, el('span', { class: 'k' }, T.whatsappL), el('a', { href: `https://wa.me/${digits}`, target: '_blank', rel: 'noopener', dir: 'ltr' }, c.phone)));
  }
  if (c.email) items.push(el('li', {}, el('span', { class: 'k' }, T.emailF), el('a', { href: `mailto:${c.email}`, dir: 'ltr' }, c.email)));
  if (c.facebook) items.push(el('li', {}, el('span', { class: 'k' }, T.facebookL), el('a', { href: `https://www.facebook.com/${encodeURIComponent(c.facebook)}`, target: '_blank', rel: 'noopener', dir: 'ltr' }, c.facebook)));
  const name = AR ? c.companyAr || BRAND_AR : c.company;
  const foot = el('footer', { class: 'site-foot' }, el('div', { class: 'wrap' }, el('h2', {}, T.contactUs), el('ul', {}, ...items), el('p', { class: 'small muted' }, name)));
  document.body.append(foot);
}
