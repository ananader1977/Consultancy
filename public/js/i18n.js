// Client-side translations for the customer pages (English / Arabic, RTL).
const param = new URLSearchParams(location.search).get('lang');
let saved = null;
try { saved = localStorage.getItem('lang'); } catch { /* storage unavailable */ }
const ADMIN = location.pathname.startsWith('/admin');
export const LANG = ADMIN ? 'en' : param === 'ar' || param === 'en' ? param : saved === 'ar' ? 'ar' : 'en';
try { if (param === 'ar' || param === 'en') localStorage.setItem('lang', param); } catch { /* ignore */ }
// Arabic: 3-10 hours take the plural 'ساعات'
const hrsAr = (n) => `${n} ${n >= 3 && n <= 10 ? 'ساعات' : 'ساعة'}`;
export const AR = LANG === 'ar';
export const BRAND_AR = 'لما الصفدي لدراسات العلوم الإجتماعية';

const D = {
  en: {
    manageNav: 'Manage booking', langBtn: 'العربية', dubai: 'Dubai',
    contactUs: 'Contact us', phoneL: 'Phone', whatsappL: 'WhatsApp', phoneWa: 'Phone / WhatsApp', emailF: 'Email', facebookL: 'Instagram',
    network: 'Network error. Please check your connection.',
    bookTitle: 'Book an appointment',
    intro: (a, b, m) => `Mon–Sat, ${a}:00–${b}:00 Dubai time · 1-hour sessions · your slot stays available for ${m} minutes to complete the payment.`,
    steps: ['1 Session', '2 Time', '3 Details', '4 Pay'],
    chooseService: '1. Choose a session', pickTime: '2. Pick a time', yourDetails: '3. Your details',
    svcOnline: 'Online', svcOffline: 'Office',
    onlineDesc: 'Phone Call, Zoom or Botim', offlineDesc: 'In person at our office',
    inclVat: (r) => `incl. ${r}% VAT`, plusVat: (p, r) => `${p} + ${r}% VAT`,
    prev: '‹ Prev', next: 'Next ›', prevWeek: 'Previous week', nextWeek: 'Next week', weekly: 'Weekly availability',
    lunch: 'Lunch', book: 'Book',
    noSlots: 'No free slots this week. Try the next week.',
    onlyAvail: (h) => `Only available slots are shown. Free rescheduling up to ${h} hours before your appointment.`,
    fullName: 'Name *', mobile: 'Mobile (with country code) *', email: 'Email *', platform: 'How should we connect? *', platformName: (p) => p,
    termsA: 'I have read and accept the ', termsLink: 'Terms & Conditions', termsB: ', including the rules for changing my appointment. *',
    notMedicalTitle: '', notMedical: [
      "At Lama Alsafadi Research & Experiment Development on Social Science,",
      "We provide specialised services in preparing experimental and developmental studies and research in the social sciences, including psychology and sociology, as well as studies related to educational technologies and the development of new methods for their practical application.",
      "Please note that while we strive to provide accurate and reliable results, we do not issue official reports or certificates on study cases, and our studies and their results are not linked to psychiatry, the health authority, the Community Development Authority, or any other authority.",
      "Our services are intended for research and development purposes, and we accept no responsibility for the practical application of those results.",
      "Information is collected from clients, whether through in-person interviews, by phone or through online communication apps, solely for the purpose of completing the requested study, with full commitment to privacy and confidentiality.",
    ],
    chooseSlot: 'Choose a time slot above.', continuePay: 'Continue to secure payment',
    payMethodL: 'Payment method *', pmCard: 'Card (pay online now)', pmBank: 'Bank transfer', pmCash: 'Cash at our office', confirmBooking: 'Confirm booking',
    pmBankHint: (h) => `Your time is reserved for ${h} hours while you make the transfer.`, pmCashHint: (h) => `Your time is reserved for ${h} hours; pay in cash at our office.`,
    payMethod: { card: 'Card', bank_transfer: 'Bank transfer', cash: 'Cash' }, payMethodDt: 'Payment method',
    bankTitle: 'Bank transfer details', bankName: 'Bank', bankAccName: 'Account name', iban: 'IBAN', transferRef: 'Reference (write it in the transfer)', amountL: 'Amount',
    bankSteps: 'Transfer the amount, then send us the receipt by WhatsApp. Your booking is confirmed once the payment is received.', sendReceipt: 'Send receipt on WhatsApp', receiptText: (ref) => `Bank transfer receipt for booking ${ref}`,
    cashInfo: 'Please pay in cash at our office before the deadline above. Your booking is confirmed once the payment is received.', payByCard: 'Pay by card instead',
    demoMode: 'Demo mode: payments are simulated, no card is charged.',
    errName: 'Please enter your name.', errMobile: 'Please enter your mobile number.', errEmail: 'Please enter a valid email.',
    errTerms: 'Please accept the Terms & Conditions to continue.', reserving: 'Reserving your slot…',
    slotTaken: 'Sorry, that slot was just taken. Please choose another.',
    confirmedTitle: 'Booking confirmed ✔', waitingPay: 'Waiting for payment', bookingIs: (s) => `Booking ${s}`,
    thanks: 'Thank you! A confirmation with your tax invoice and calendar invite has been emailed to you.',
    thanksNoEmail: 'Thank you! Your booking is confirmed. Save your booking link.',
    heldA: 'Time left to pay: ', heldB: '. Complete the payment to confirm your booking.',
    expired: 'The payment window expired and the slot was released. If you were charged, your payment will be returned automatically. ',
    bookAgain: 'Book again', payCancelled: 'Payment was cancelled. You can try again below.',
    reference: 'Reference', status: 'Status', service: 'Service', when: 'When', total: 'Total',
    inclVatAmt: (v) => ` (incl. VAT ${v})`, meetingLink: 'Meeting link', taxInvoice: 'Tax invoice',
    chooseAnother: 'Choose another slot', reschedOrRefund: 'Change appointment', print: 'Print',
    saveTitle: 'Save your booking link',
    saveText: 'Use this link any time to view or change your booking. We have also emailed it to you.',
    saveTextNoEmail: 'Bookmark or copy this link: use it any time to view or change your booking. You can also find your booking with its reference and your mobile number.',
    copy: 'Copy link', copyShort: 'Copy', copied: 'Copied', payLinkTitle: 'Payment link', payLinkText: 'Save or share this link to complete the payment (while your time is still held).', waPayText: (ref, url) => `Payment link for booking ${ref}: ${url}`,
    cancelTitle: 'Cancel appointment', cancelInfo: (h) => `You can request cancellation up to ${h} hours before the appointment. Our team will review your request.`, reasonL: 'Reason (optional)', confirmCancel: 'Send a request to cancel this appointment?', cancelSent: 'Cancellation request sent', requestCancel: 'Request cancellation', cancelClosed: (h) => `Cancellation is possible up to ${h} hours before the appointment. Please contact us.`, awaitingCancel: 'Your cancellation request is being reviewed. We will contact you.', wasCancelled: 'This booking was cancelled.', share: 'Share', shareWa: 'Share on WhatsApp', waText: (ref, url) => `My booking ${ref}: ${url}`,
    manageTitle: 'Manage your booking', manageIntro: 'Enter your booking reference and the mobile number used when booking.',
    findBooking: 'Find booking', bookingRef: 'Booking reference', emailL: 'Email', mobileL: 'Mobile number', tryAgain: 'Try again',
    yourBooking: 'Your booking', downloadPdf: 'Download PDF', continueToPay: 'Continue to payment',
    reschedule: 'Change appointment', freeUntil: (h) => `Free until ${h} hours before your appointment.`,
    changesLeft: (n, max, d) => `You can change this booking ${n === 1 ? '1 more time' : `${n} more times`} (maximum ${max} changes within ${d} days).`,
    noChangesLeft: (max, d) => `This booking has already been changed ${max} times within ${d} days. No further changes are possible.`, chooseNewTime: 'Choose a new time',
    reschedClosed: (h) => `Self-service rescheduling closes ${h} hours before the appointment. Please contact us to change it.`, started: 'The appointment has already started.',
    loading: 'Loading…', day: 'Day', confirmMove: (d, t) => `Move your booking to ${d} at ${t}?`, rescheduled: 'Rescheduled',
    demoCheckout: 'Demo checkout', demoNote: 'This is a simulated payment page. No real card is charged. Set PAYMENT_PROVIDER=stripe for live card payments.',
    amount: 'Amount', cardNumber: 'Card number', pay: (x) => `Pay ${x}`, processing: 'Processing…', payNow: 'Pay now', cancel: 'Cancel',
    backToBooking: '‹ Back to booking',
    badge: { confirmed: 'confirmed', pending: 'pending', paid: 'paid', unpaid: 'unpaid', refund_requested: 'under review', refunded: 'cancelled', expired: 'expired', cancelled: 'cancelled' },
  },
  ar: {
    manageNav: 'إدارة الحجز', langBtn: 'English', dubai: 'بتوقيت دبي',
    contactUs: 'تواصل معنا', phoneL: 'الهاتف', whatsappL: 'واتساب', phoneWa: 'الهاتف / واتساب', emailF: 'البريد الإلكتروني', facebookL: 'إنستغرام',
    network: 'خطأ في الشبكة. يرجى التحقق من الاتصال.',
    bookTitle: 'احجز موعداً',
    intro: (a, b, m) => `من الاثنين إلى السبت، ${a}:00–${b}:00 بتوقيت دبي · جلسات مدتها ساعة · يبقى الموعد متاحاً لمدة ${m} دقائق لإتمام عملية الدفع.`,
    steps: ['1 الجلسة', '2 الموعد', '3 البيانات', '4 الدفع'],
    chooseService: '1. اختر الجلسة', pickTime: '2. اختر الموعد', yourDetails: '3. بياناتك',
    svcOnline: 'مكالمة هاتف، زوم أو بوتيم', svcOffline: 'جلسة في المكتب',
    onlineDesc: 'جلسة عن بُعد مدتها ساعة', offlineDesc: 'حضورياً في مكتبنا',
    inclVat: (r) => `شامل ضريبة القيمة المضافة ${r}%`, plusVat: (p, r) => `${p} + ضريبة القيمة المضافة ${r}%`,
    prev: 'السابق', next: 'التالي', prevWeek: 'الأسبوع السابق', nextWeek: 'الأسبوع التالي', weekly: 'المواعيد الأسبوعية المتاحة',
    lunch: 'استراحة', book: 'احجز',
    noSlots: 'لا توجد مواعيد متاحة هذا الأسبوع. جرّب الأسبوع التالي.',
    onlyAvail: (h) => `تظهر المواعيد المتاحة فقط. إعادة الجدولة مجانية حتى ${hrsAr(h)} قبل موعدك.`,
    fullName: 'الاسم *', mobile: 'رقم الجوال (مع رمز الدولة) *', email: 'البريد الإلكتروني *', platform: 'طريقة الاتصال *', platformName: (p) => ({ 'Phone call': 'مكالمة هاتفية', Zoom: 'زوم', Botim: 'بوتيم', 'Microsoft Teams': 'مايكروسوفت تيمز' }[p] || p),
    termsA: 'قرأت وأوافق على ', termsLink: 'الشروط والأحكام', termsB: '، بما في ذلك قواعد تغيير الموعد. *',
    notMedicalTitle: '', notMedical: [
      'في لما الصفدي للدراسات الإجتماعية،،،',
      'نحن نقدم خدمات متخصصة في إعداد الدراسات والبحوث التجريبية والتطويرية في مجال العلوم الاجتماعية، بما في ذلك علم النفس وعلم الاجتماع، بالإضافة إلى الدراسات المتعلقة بتقنيات التعليم وتطوير طرق جديدة لتطبيقاتها العملية.',
      'يرجى ملاحظة أننا نسعى جاهدين لتقديم نتائج دقيقة وموثوقة، إلا أننا لا نقدم تقارير أو شهادات رسمية حول حالات الدراسة، ولا ترتبط دراساتنا أو نتائجها بالطب النفسي، هيئة الصحة، هيئة تنمية المجتمع، أو أي هيئة أخرى.',
      'خدماتنا تهدف إلى الأغراض البحثية والتطويرية، ولا نتحمل أي مسؤولية عن التطبيق العملي لتلك النتائج.',
      'تُجمع المعلومات من العملاء، سواء من خلال المقابلات الشخصية أو الهاتف أو برامج التواصل عبر الإنترنت، فقط لأغراض إنجاز الدراسة المطلوبة، مع الالتزام التام بالخصوصية والسرية.',
    ],
    chooseSlot: 'اختر موعداً من الأعلى.', continuePay: 'المتابعة إلى الدفع الآمن',
    payMethodL: 'طريقة الدفع *', pmCard: 'البطاقة (الدفع الآن عبر الإنترنت)', pmBank: 'تحويل بنكي', pmCash: 'نقداً في مكتبنا', confirmBooking: 'تأكيد الحجز',
    pmBankHint: (h) => `يبقى موعدك محجوزاً لمدة ${h} ساعة لإتمام التحويل.`, pmCashHint: (h) => `يبقى موعدك محجوزاً لمدة ${h} ساعة؛ ادفع نقداً في مكتبنا.`,
    payMethod: { card: 'بطاقة', bank_transfer: 'تحويل بنكي', cash: 'نقداً' }, payMethodDt: 'طريقة الدفع',
    bankTitle: 'بيانات التحويل البنكي', bankName: 'البنك', bankAccName: 'اسم الحساب', iban: 'رقم الآيبان (IBAN)', transferRef: 'المرجع (اكتبه في التحويل)', amountL: 'المبلغ',
    bankSteps: 'حوّل المبلغ ثم أرسل لنا إيصال التحويل عبر واتساب. يتم تأكيد حجزك بعد استلام المبلغ.', sendReceipt: 'إرسال الإيصال عبر واتساب', receiptText: (ref) => `إيصال التحويل البنكي للحجز ${ref}`,
    cashInfo: 'يرجى الدفع نقداً في مكتبنا قبل الموعد النهائي الموضح أعلاه. يتم تأكيد حجزك بعد استلام المبلغ.', payByCard: 'الدفع بالبطاقة بدلاً من ذلك',
    demoMode: 'وضع تجريبي: الدفع محاكاة ولن يتم خصم أي مبلغ من البطاقة.',
    errName: 'يرجى إدخال اسمك.', errMobile: 'يرجى إدخال رقم الجوال.', errEmail: 'يرجى إدخال بريد إلكتروني صحيح.',
    errTerms: 'يرجى الموافقة على الشروط والأحكام للمتابعة.', reserving: 'جارٍ حجز موعدك…',
    slotTaken: 'عذراً، تم حجز هذا الموعد للتو. يرجى اختيار موعد آخر.',
    confirmedTitle: 'تم تأكيد الحجز ✔', waitingPay: 'بانتظار الدفع', bookingIs: (s) => `الحجز: ${s}`,
    thanks: 'شكراً لك! أرسلنا إلى بريدك الإلكتروني تأكيد الحجز مع الفاتورة الضريبية ودعوة التقويم.',
    thanksNoEmail: 'شكراً لك! تم تأكيد حجزك. احفظ رابط حجزك.',
    heldA: 'الوقت المتبقي للدفع: ', heldB: '. أكمل الدفع لتأكيد حجزك.',
    expired: 'انتهت مهلة الدفع وأُلغي حجز الموعد. إذا تم خصم أي مبلغ فسيُعاد إليك تلقائياً. ',
    bookAgain: 'احجز مجدداً', payCancelled: 'تم إلغاء الدفع. يمكنك المحاولة مرة أخرى.',
    reference: 'رقم الحجز', status: 'الحالة', service: 'الخدمة', when: 'الموعد', total: 'الإجمالي',
    inclVatAmt: (v) => ` (شامل ضريبة القيمة المضافة ${v})`, meetingLink: 'رابط الاجتماع', taxInvoice: 'الفاتورة الضريبية',
    chooseAnother: 'اختر موعداً آخر', reschedOrRefund: 'تغيير الموعد', print: 'طباعة',
    saveTitle: 'احفظ رابط حجزك',
    saveText: 'استخدم هذا الرابط في أي وقت لعرض حجزك أو تغييره. أرسلناه أيضاً إلى بريدك الإلكتروني.',
    saveTextNoEmail: 'احفظ هذا الرابط أو انسخه لاستخدامه في أي وقت لعرض حجزك أو تغييره. ويمكنك أيضاً العثور على حجزك برقم الحجز ورقم جوالك.',
    copy: 'نسخ الرابط', copyShort: 'نسخ', copied: 'تم النسخ', payLinkTitle: 'رابط الدفع', payLinkText: 'احفظ هذا الرابط أو شاركه لإتمام الدفع (ما دام الموعد محجوزاً).', waPayText: (ref, url) => `رابط الدفع للحجز ${ref}: ${url}`,
    cancelTitle: 'إلغاء الموعد', cancelInfo: (h) => `يمكنك طلب الإلغاء حتى ${hrsAr(h)} قبل الموعد، وسيراجع فريقنا طلبك.`, reasonL: 'السبب (اختياري)', confirmCancel: 'هل تريد إرسال طلب لإلغاء هذا الموعد؟', cancelSent: 'تم إرسال طلب الإلغاء', requestCancel: 'طلب الإلغاء', cancelClosed: (h) => `يمكن الإلغاء حتى ${hrsAr(h)} قبل الموعد. يرجى التواصل معنا.`, awaitingCancel: 'طلب الإلغاء قيد المراجعة، وسنتواصل معك.', wasCancelled: 'تم إلغاء هذا الحجز.', share: 'مشاركة', shareWa: 'مشاركة عبر واتساب', waText: (ref, url) => `حجزي ${ref}: ${url}`,
    manageTitle: 'إدارة حجزك', manageIntro: 'أدخل رقم الحجز ورقم الجوال المستخدم عند الحجز.',
    findBooking: 'البحث عن الحجز', bookingRef: 'رقم الحجز', emailL: 'البريد الإلكتروني', mobileL: 'رقم الجوال', tryAgain: 'حاول مرة أخرى',
    yourBooking: 'حجزك', downloadPdf: 'تنزيل PDF', continueToPay: 'المتابعة إلى الدفع',
    reschedule: 'تغيير الموعد',
    changesLeft: (n, max, d) => `يمكنك تغيير هذا الحجز ${n === 1 ? 'مرة واحدة أخرى' : n === 2 ? 'مرتين أخريين' : `${n} مرات أخرى`} (بحد أقصى ${max === 2 ? 'مرتين' : `${max} مرات`} خلال ${d} يوماً).`,
    noChangesLeft: (max, d) => `تم تغيير هذا الحجز ${max === 2 ? 'مرتين' : `${max} مرات`} خلال ${d} يوماً. لا يمكن إجراء أي تغيير آخر.`,
    freeUntil: (h) => `مجاناً حتى ${hrsAr(h)} قبل موعدك.`, chooseNewTime: 'اختر موعداً جديداً',
    reschedClosed: (h) => `تُغلق إعادة الجدولة الذاتية قبل ${hrsAr(h)} من الموعد. يرجى التواصل معنا لتغييره.`, started: 'لقد بدأ الموعد بالفعل.',
    loading: 'جارٍ التحميل…', day: 'اليوم', confirmMove: (d, t) => `هل تريد نقل حجزك إلى ${d} الساعة ${t}؟`, rescheduled: 'تمت إعادة الجدولة',
    demoCheckout: 'دفع تجريبي', demoNote: 'هذه صفحة دفع تجريبية، ولن يتم خصم أي مبلغ من البطاقة.',
    amount: 'المبلغ', cardNumber: 'رقم البطاقة', pay: (x) => `ادفع ${x}`, processing: 'جارٍ المعالجة…', payNow: 'ادفع الآن', cancel: 'إلغاء',
    backToBooking: 'العودة إلى الحجز',
    badge: { confirmed: 'مؤكد', pending: 'قيد الانتظار', paid: 'مدفوع', unpaid: 'غير مدفوع', refund_requested: 'قيد المراجعة', refunded: 'ملغى', expired: 'منتهي', cancelled: 'ملغى' },
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
    items.push(el('li', {}, el('span', { class: 'k' }, T.phoneWa), el('a', { href: `tel:+${digits}`, dir: 'ltr' }, c.phone),
      el('a', { class: 'wa', href: `https://wa.me/${digits}`, target: '_blank', rel: 'noopener', 'aria-label': `${T.whatsappL} ${c.phone}` }, T.whatsappL)));
  }
  if (c.email) items.push(el('li', {}, el('span', { class: 'k' }, T.emailF), el('a', { href: `mailto:${c.email}`, dir: 'ltr' }, c.email)));
  if (c.facebook) items.push(el('li', {}, el('span', { class: 'k' }, T.facebookL), el('a', { href: `https://www.instagram.com/${encodeURIComponent(c.facebook)}`, target: '_blank', rel: 'noopener', dir: 'ltr' }, c.facebook)));
  const name = AR ? c.companyAr || BRAND_AR : c.company;
  const foot = el('footer', { class: 'site-foot' }, el('div', { class: 'wrap' }, el('ul', {}, el('li', { class: 'h' }, T.contactUs), ...items), el('p', { class: 'name' }, name)));
  document.body.append(foot);
}
