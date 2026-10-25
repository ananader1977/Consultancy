// Arabic versions of the customer-facing error messages (used when the page sends X-Lang: ar).
const AR = {
  'Please enter your full name.': 'يرجى إدخال اسمك الكامل.',
  'Please enter a valid mobile number, e.g. +971501234567.': 'يرجى إدخال رقم جوال صحيح، مثل ‎+971501234567.',
  'Please enter a valid email address.': 'يرجى إدخال بريد إلكتروني صحيح.',
  'Please choose a service.': 'يرجى اختيار الخدمة.',
  'Please choose phone call, Zoom or Botim for your online session.': 'يرجى اختيار مكالمة هاتفية أو زوم أو بوتيم للجلسة عن بُعد.',
  'Please choose a time slot.': 'يرجى اختيار موعد.',
  'Please read and accept the Terms & Conditions to continue.': 'يرجى قراءة الشروط والأحكام والموافقة عليها للمتابعة.',
  'Sorry, this time slot was just taken. Please choose another.': 'عذراً، تم حجز هذا الموعد للتو. يرجى اختيار موعد آخر.',
  'Sorry, that time slot was just taken. Please choose another.': 'عذراً، تم حجز هذا الموعد للتو. يرجى اختيار موعد آخر.',
  'This time slot is not available. Please choose another.': 'هذا الموعد غير متاح. يرجى اختيار موعد آخر.',
  'This time slot has already started. Please choose another.': 'لقد بدأ هذا الموعد بالفعل. يرجى اختيار موعد آخر.',
  'That time slot is not available.': 'هذا الموعد غير متاح.',
  'That is already your current time slot.': 'هذا هو موعدك الحالي بالفعل.',
  'The slot is no longer available for this booking.': 'لم يعد هذا الموعد متاحاً لهذا الحجز.',
  'Booking not found. Please check your link.': 'لم يتم العثور على الحجز. يرجى التحقق من الرابط.',
  'Booking not found. Check the reference and email.': 'لم يتم العثور على الحجز. تحقّق من رقم الحجز والبريد الإلكتروني.',
  'Booking not found. Check the reference and mobile number.': 'لم يتم العثور على الحجز. تحقّق من رقم الحجز ورقم الجوال.',
  'Please enter your name.': 'يرجى إدخال اسمك.',
  'Only confirmed, paid bookings can be rescheduled.': 'يمكن إعادة جدولة الحجوزات المؤكدة والمدفوعة فقط.',
  'Only confirmed, paid bookings can be cancelled.': 'يمكن إلغاء الحجوزات المؤكدة والمدفوعة فقط.',
  'This appointment has already started.': 'لقد بدأ الموعد بالفعل.',
  'A refund is already being processed for this booking.': 'طلب الاسترداد لهذا الحجز قيد المعالجة بالفعل.',
  'Already refunded.': 'تم الاسترداد بالفعل.',
  'This payment session has expired.': 'انتهت صلاحية جلسة الدفع.',
  'Payment session not found': 'لم يتم العثور على جلسة الدفع.',
  'Too many requests. Please wait a moment and try again.': 'طلبات كثيرة. يرجى الانتظار قليلاً ثم المحاولة مرة أخرى.',
  'Online cancellation is not available. Please contact us.': 'الإلغاء عبر الإنترنت غير متاح. يرجى التواصل معنا.',
  'This payment link has expired. Please contact us for a new link.': 'انتهت صلاحية رابط الدفع. يرجى التواصل معنا للحصول على رابط جديد.',
  'Please choose a payment method.': 'يرجى اختيار طريقة الدفع.',
  'Bank transfer is not available. Please choose another payment method.': 'التحويل البنكي غير متاح حالياً. يرجى اختيار طريقة دفع أخرى.',
  'Cash payment is only available for office sessions.': 'الدفع نقداً متاح لجلسات المكتب فقط.',
  'Internal server error': 'حدث خطأ في الخادم. يرجى المحاولة مرة أخرى.',
};
const AR_PATTERNS = [
  [/^Cancellation is possible up to (\d+) hours before the appointment\. Please contact us\.$/, 'يمكن الإلغاء حتى $1 ساعة قبل الموعد. يرجى التواصل معنا.'],
  [/^Free rescheduling closes (\d+) hours before the appointment\. Please contact us\.$/, 'تُغلق إعادة الجدولة المجانية قبل $1 ساعة من الموعد. يرجى التواصل معنا.'],
  [/^This booking has already been changed (\d+) times within (\d+) days\. No further changes are possible\.$/, 'تم تغيير هذا الحجز $1 مرات خلال $2 يوماً. لا يمكن إجراء أي تغيير آخر.'],
];
export function translateError(msg, lang) {
  if (lang !== 'ar' || !msg) return msg;
  if (AR[msg]) return AR[msg];
  for (const [re, out] of AR_PATTERNS) if (re.test(msg)) return msg.replace(re, out);
  return msg;
}
