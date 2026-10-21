import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const SETTING_DEFAULTS = {
  company_name: 'LAMA ALSAFADI RESEARCH & EXPERIMENT DEVELOPMENT ON SOCIAL SCIENCE',
  company_address: '',
  company_trn: '',
  owner_name: 'Owner',
  owner_email: 'info@lamaalsafadi.ae',
  contact_phone: '+971 52 806 6121',
  contact_email: 'info@lamaalsafadi.ae',
  facebook: 'lama_alsafadi',
  vat_rate: '5',
  prices_include_vat: '1',
  work_start: '10',
  work_end: '18',
  lunch_start: '13',
  lock_minutes: '10',
  free_reschedule_hours: '24',
  max_changes: '2',
  change_window_days: '30',
  slot_days: '60',
  zoom_link: '',
  teams_link: '',
  reminder_hours: '2',
  closed_days: '0',
  terms_text: "Terms & Conditions for Session Bookings\n\n1. Booking and payment\nA booking is confirmed only after full payment by card. Your chosen time is held for 10 minutes while you pay; if payment is not completed, the time is released automatically.\n\n2. Prices and VAT\nPrices are in UAE Dirhams (AED) and include VAT at 5%. A tax invoice is issued after payment.\n\n3. Sessions\nEach session lasts 1 hour and takes place Monday to Saturday between 9:00 AM and 6:00 PM (Dubai time). Online sessions are held by phone call, Zoom or Botim, as you choose when booking. Office sessions take place at the address shown in your confirmation.\n\n4. Changing your appointment\nYou can change your appointment free of charge up to 24 hours before it, using \"Manage booking\". Each booking can be changed up to 2 times within 30 calendar days; after that, no further changes are possible. Within 24 hours of the appointment, please contact us; changes are at our discretion.\n\n5. Missed appointments\nIf you cannot attend, please change your appointment in time using \"Manage booking\". An appointment cannot be changed after its start time.\n\n6. Late arrival\nIf you join or arrive late, the session still ends at the scheduled time.\n\n7. Your information\nWe use your name, mobile number and email only to manage your booking and to send confirmations and reminders by email and WhatsApp.\n\n8. Nature of the service\nAt Lama Alsafadi Research & Experiment Development on Social Science,\nWe provide specialised services in preparing experimental and developmental studies and research in the social sciences, including psychology and sociology, as well as studies related to educational technologies and the development of new methods for their practical application.\nPlease note that while we strive to provide accurate and reliable results, we do not issue official reports or certificates on study cases, and our studies and their results are not linked to psychiatry, the health authority, the Community Development Authority, or any other authority.\nOur services are intended for research and development purposes, and we accept no responsibility for the practical application of those results.\nInformation is collected from clients, whether through in-person interviews, by phone or through online communication apps, solely for the purpose of completing the requested study, with full commitment to privacy and confidentiality.\n\n9. Contact\nFor any question about your booking, call or WhatsApp +971 52 806 6121, email info@lamaalsafadi.ae, or message us on Facebook (lama_alsafadi).",
  company_name_ar: "لما الصفدي لدراسات العلوم الإجتماعية",
  terms_text_ar: "الشروط والأحكام لحجز الجلسات\n\n1. الحجز والدفع\nلا يتم تأكيد الحجز إلا بعد دفع المبلغ كاملاً بالبطاقة. يُحجز الموعد الذي اخترته لمدة 10 دقائق أثناء الدفع، وإذا لم يكتمل الدفع يُلغى حجز الموعد تلقائياً.\n\n2. الأسعار وضريبة القيمة المضافة\nالأسعار بالدرهم الإماراتي وتشمل ضريبة القيمة المضافة بنسبة 5%. تصدر الفاتورة الضريبية بعد الدفع.\n\n3. الجلسات\nمدة كل جلسة ساعة واحدة، من الاثنين إلى السبت بين الساعة 9:00 صباحاً و6:00 مساءً بتوقيت دبي. تُعقد الجلسات عن بُعد عبر مكالمة هاتفية أو زوم أو بوتيم حسب اختيارك عند الحجز، وتُعقد الجلسات الحضورية في عنوان المكتب الموضح في رسالة التأكيد.\n\n4. تغيير الموعد\nيمكنك تغيير موعدك مجاناً حتى 24 ساعة قبل الموعد من خلال صفحة \"إدارة الحجز\". يمكن تغيير كل حجز مرتين كحد أقصى خلال 30 يوماً تقويمياً، ولا يمكن إجراء أي تغيير بعد ذلك. وخلال الـ 24 ساعة السابقة للموعد يرجى التواصل معنا، ويخضع أي تغيير لتقديرنا.\n\n5. عدم الحضور\nإذا لم تتمكن من الحضور، يرجى تغيير موعدك في الوقت المناسب من خلال صفحة \"إدارة الحجز\". لا يمكن تغيير الموعد بعد بدء وقته.\n\n6. التأخر\nفي حال التأخر عن الانضمام أو الحضور، تنتهي الجلسة في وقتها المحدد.\n\n7. بياناتك\nنستخدم اسمك ورقم جوالك وبريدك الإلكتروني فقط لإدارة حجزك وإرسال رسائل التأكيد والتذكير عبر البريد الإلكتروني وواتساب.\n\n8. طبيعة الخدمة\nفي لما الصفدي للدراسات الإجتماعية،،،\nنحن نقدم خدمات متخصصة في إعداد الدراسات والبحوث التجريبية والتطويرية في مجال العلوم الاجتماعية، بما في ذلك علم النفس وعلم الاجتماع، بالإضافة إلى الدراسات المتعلقة بتقنيات التعليم وتطوير طرق جديدة لتطبيقاتها العملية.\nيرجى ملاحظة أننا نسعى جاهدين لتقديم نتائج دقيقة وموثوقة، إلا أننا لا نقدم تقارير أو شهادات رسمية حول حالات الدراسة، ولا ترتبط دراساتنا أو نتائجها بالطب النفسي، هيئة الصحة، هيئة تنمية المجتمع، أو أي هيئة أخرى.\nخدماتنا تهدف إلى الأغراض البحثية والتطويرية، ولا نتحمل أي مسؤولية عن التطبيق العملي لتلك النتائج.\nتُجمع المعلومات من العملاء، سواء من خلال المقابلات الشخصية أو الهاتف أو برامج التواصل عبر الإنترنت، فقط لأغراض إنجاز الدراسة المطلوبة، مع الالتزام التام بالخصوصية والسرية.\n\n9. التواصل\nلأي استفسار بخصوص حجزك، اتصل بنا أو راسلنا عبر واتساب على ⁦+971 52 806 6121⁩، أو عبر البريد الإلكتروني info@lamaalsafadi.ae، أو على فيسبوك (lama_alsafadi)."
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('online','offline')),
  description TEXT NOT NULL DEFAULT '',
  price REAL NOT NULL CHECK (price >= 0),
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS slots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  start_ts INTEGER NOT NULL UNIQUE,
  end_ts INTEGER NOT NULL,
  blocked INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reference TEXT NOT NULL UNIQUE,
  customer_name TEXT NOT NULL,
  mobile TEXT NOT NULL,
  email TEXT NOT NULL,
  service_id INTEGER NOT NULL REFERENCES services(id),
  service_name TEXT NOT NULL,
  service_kind TEXT NOT NULL,
  platform TEXT,
  slot_id INTEGER NOT NULL REFERENCES slots(id),
  start_ts INTEGER NOT NULL,
  end_ts INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','confirmed','refund_requested','refunded','expired','cancelled')),
  payment_status TEXT NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid','paid','refunded')),
  net REAL NOT NULL,
  vat REAL NOT NULL,
  total REAL NOT NULL,
  lock_expires INTEGER,
  payment_session_id TEXT,
  payment_ref TEXT,
  paid_at INTEGER,
  invoice_number TEXT,
  meeting_link TEXT NOT NULL DEFAULT '',
  reschedule_count INTEGER NOT NULL DEFAULT 0,
  refund_reason TEXT NOT NULL DEFAULT '',
  refund_ref TEXT,
  refunded_at INTEGER,
  admin_notes TEXT NOT NULL DEFAULT '',
  manage_token TEXT NOT NULL,
  reminder_sent INTEGER NOT NULL DEFAULT 0,
  terms_accepted_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
-- The double-booking guard: at most ONE active booking per slot, enforced by the database itself.
CREATE UNIQUE INDEX IF NOT EXISTS ux_bookings_active_slot
  ON bookings(slot_id) WHERE status IN ('pending','confirmed','refund_requested');
CREATE INDEX IF NOT EXISTS ix_bookings_start ON bookings(start_ts);
CREATE INDEX IF NOT EXISTS ix_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS ix_bookings_email ON bookings(email);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT NOT NULL UNIQUE,
  booking_id INTEGER NOT NULL UNIQUE REFERENCES bookings(id),
  issued_at INTEGER NOT NULL,
  supplier_name TEXT NOT NULL,
  supplier_address TEXT NOT NULL DEFAULT '',
  supplier_trn TEXT NOT NULL DEFAULT '',
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_mobile TEXT NOT NULL,
  description TEXT NOT NULL,
  appointment_text TEXT NOT NULL DEFAULT '',
  net REAL NOT NULL,
  vat_rate REAL NOT NULL,
  vat REAL NOT NULL,
  total REAL NOT NULL,
  payment_ref TEXT,
  status TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('issued','refunded')),
  credit_note_number TEXT,
  credit_note_at INTEGER
);

CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS payment_sessions (
  id TEXT PRIMARY KEY,
  booking_id INTEGER NOT NULL,
  provider TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','paid','expired')),
  payment_ref TEXT,
  amount REAL NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  channel TEXT NOT NULL,
  to_addr TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  error TEXT,
  booking_id INTEGER,
  attachment TEXT
);

CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  booking_id INTEGER,
  detail TEXT NOT NULL DEFAULT ''
);
`;

export function openDb(dbPath) {
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  db.exec(SCHEMA);
  // migrations for databases created by older versions
  const cols = db.prepare('PRAGMA table_info(bookings)').all().map((c) => c.name);
  if (!cols.includes('terms_accepted_at')) db.exec('ALTER TABLE bookings ADD COLUMN terms_accepted_at INTEGER');
  const ins = db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)');
  for (const [k, v] of Object.entries(SETTING_DEFAULTS)) ins.run(k, v);
  // rename installs that still use the old placeholder name
  db.prepare("UPDATE settings SET value=? WHERE key='owner_email' AND value=''").run(SETTING_DEFAULTS.owner_email);
  // one-time: admin notifications go to info@lamaalsafadi.ae (still editable in Admin > Settings afterwards)
  if (!db.prepare("SELECT 1 FROM settings WHERE key='_m_owner_email_1'").get()) {
    db.prepare("UPDATE settings SET value=? WHERE key='owner_email'").run(SETTING_DEFAULTS.owner_email);
    db.prepare("INSERT INTO settings(key,value) VALUES('_m_owner_email_1','1')").run();
  }
  for (const [key, oldLine, newLine] of [['terms_text', "For any question about your booking, reply to your confirmation email.", "For any question about your booking, call or WhatsApp +971 52 806 6121, email info@lamaalsafadi.ae, or message us on Facebook (lama_alsafadi)."], ['terms_text_ar', "لأي استفسار بخصوص حجزك، يمكنك الرد على رسالة التأكيد المرسلة إلى بريدك الإلكتروني.", "لأي استفسار بخصوص حجزك، اتصل بنا أو راسلنا عبر واتساب على ⁦+971 52 806 6121⁩، أو عبر البريد الإلكتروني info@lamaalsafadi.ae، أو على فيسبوك (lama_alsafadi)."]]) {
    const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
    if (row && row.value.includes(oldLine)) db.prepare('UPDATE settings SET value=? WHERE key=?').run(row.value.replace(oldLine, newLine), key);
  }
  // replace the old rescheduling + refund sections in stored terms (no refunds offered to clients; change limit)
  for (const [key, re] of [['terms_text', /4\. Rescheduling\n[\s\S]*?(?=\n\n6\. )/], ['terms_text_ar', /4\. إعادة الجدولة\n[\s\S]*?(?=\n\n6\. )/]]) {
    const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
    const fresh = SETTING_DEFAULTS[key].match(key === 'terms_text' ? /4\. Changing your appointment\n[\s\S]*?(?=\n\n6\. )/ : /4\. تغيير الموعد\n[\s\S]*?(?=\n\n6\. )/)[0];
    if (row && re.test(row.value)) db.prepare('UPDATE settings SET value=? WHERE key=?').run(row.value.replace(re, fresh), key);
  }
  // one-time (Oct 2026): prices include VAT, online 300 / office 500; terms say prices include VAT and the service is not medical
  if (!db.prepare("SELECT 1 FROM settings WHERE key='_m_prices_2'").get()) {
    db.prepare("UPDATE settings SET value='1' WHERE key='prices_include_vat'").run();
    db.prepare("UPDATE services SET price=300 WHERE kind='online'").run();
    db.prepare("UPDATE services SET price=500 WHERE kind='offline'").run();
    db.prepare("INSERT INTO settings(key,value) VALUES('_m_prices_2','1')").run();
  }
  for (const [oldText, newText] of [
    [JSON.parse('"Prices are in UAE Dirhams (AED). VAT at 5% is added to the listed price. A tax invoice is issued by email after payment."'), JSON.parse('"Prices are in UAE Dirhams (AED) and include VAT at 5%. A tax invoice is issued after payment."')],
    [JSON.parse('"8. Nature of the service\\nConsultations are not an emergency service."'), JSON.parse('"8. Nature of the service\\nThis service is not a medical service and does not replace diagnosis or treatment by a doctor or licensed healthcare professional. It provides support and guidance only. Consultations are not an emergency service."')],
    [JSON.parse('"الأسعار بالدرهم الإماراتي، وتُضاف ضريبة القيمة المضافة بنسبة 5% إلى السعر المعلن. تُرسل الفاتورة الضريبية إلى بريدك الإلكتروني بعد الدفع."'), JSON.parse('"الأسعار بالدرهم الإماراتي وتشمل ضريبة القيمة المضافة بنسبة 5%. تصدر الفاتورة الضريبية بعد الدفع."')],
    [JSON.parse('"8. طبيعة الخدمة\\nالاستشارات ليست خدمة طوارئ."'), JSON.parse('"8. طبيعة الخدمة\\nهذه الخدمة ليست خدمة طبية، ولا تُغني عن التشخيص أو العلاج لدى طبيب أو أخصائي رعاية صحية مرخّص، وهي للدعم والإرشاد فقط. الاستشارات ليست خدمة طوارئ."')],
  ]) {
    for (const key of ['terms_text', 'terms_text_ar']) {
      const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
      if (row && row.value.includes(oldText)) db.prepare('UPDATE settings SET value=? WHERE key=?').run(row.value.replace(oldText, newText), key);
    }
  }
  // remove the 999 emergency line from stored terms (Oct 2026)
  for (const [key, line] of [['terms_text', ' If you or someone else is in immediate danger, call 999 (UAE emergency services).'], ['terms_text_ar', ' إذا كنت أنت أو أي شخص آخر في خطر مباشر، فاتصل بالرقم 999 (خدمات الطوارئ في الإمارات).']]) {
    const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
    if (row && row.value.includes(line)) db.prepare('UPDATE settings SET value=? WHERE key=?').run(row.value.replace(line, ''), key);
  }
  // Arabic wording: "جلسة" instead of "استشارة" in stored terms (Oct 2026)
  for (const [a, b] of [['الشروط والأحكام لحجز الاستشارات', 'الشروط والأحكام لحجز الجلسات'], ['الاستشارات ليست خدمة طوارئ', 'الجلسات ليست خدمة طوارئ']]) {
    const row = db.prepare("SELECT value FROM settings WHERE key='terms_text_ar'").get();
    if (row && row.value.includes(a)) db.prepare("UPDATE settings SET value=? WHERE key='terms_text_ar'").run(row.value.replace(a, b));
  }
  // English wording: "session" instead of "consultation" (Oct 2026)
  for (const [a, b] of [['Terms & Conditions for Consultation Bookings', 'Terms & Conditions for Session Bookings'], ['Consultations are not an emergency service.', 'Sessions are not an emergency service.']]) {
    const row = db.prepare("SELECT value FROM settings WHERE key='terms_text'").get();
    if (row && row.value.includes(a)) db.prepare("UPDATE settings SET value=? WHERE key='terms_text'").run(row.value.replace(a, b));
  }
  db.prepare("UPDATE services SET description=replace(description, 'consultation', 'session') WHERE description LIKE '%consultation%'").run();
  // online sessions: phone call, Zoom or Botim (Oct 2026)
  for (const [key, a, b] of [['terms_text', ' Online sessions are held on Zoom or Microsoft Teams; the link is sent by email.', ' Online sessions are held by phone call, Zoom or Botim, as you choose when booking.'], ['terms_text_ar', ' تُعقد الجلسات عن بُعد عبر Zoom أو Microsoft Teams ويُرسل الرابط بالبريد الإلكتروني، وتُعقد', ' تُعقد الجلسات عن بُعد عبر مكالمة هاتفية أو زوم أو بوتيم حسب اختيارك عند الحجز، وتُعقد']]) {
    const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
    if (row && row.value.includes(a)) db.prepare('UPDATE settings SET value=? WHERE key=?').run(row.value.replace(a, b), key);
  }
  db.prepare("UPDATE services SET description='One-hour session by phone call, Zoom or Botim' WHERE description='One-hour session by Zoom or Microsoft Teams'").run();
  // section 8: research & development statement replaces the earlier wording (Oct 2026)
  for (const [key, re, head] of [['terms_text', /8\. Nature of the service\n[\s\S]*?(?=\n\n9\. )/, '8. Nature of the service'], ['terms_text_ar', /8\. طبيعة الخدمة\n[\s\S]*?(?=\n\n9\. )/, '8. طبيعة الخدمة']]) {
    const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
    const fresh = SETTING_DEFAULTS[key].match(re)[0];
    if (row && re.test(row.value) && !row.value.includes(fresh)) db.prepare('UPDATE settings SET value=? WHERE key=?').run(row.value.replace(re, fresh), key);
  }
  db.prepare("UPDATE services SET name='Office' WHERE name='Offline'").run(); // renamed Oct 2026
  db.prepare("UPDATE settings SET value=? WHERE key='company_name' AND value IN ('Consultancy Operation', 'Lama Al Safadi Social & Family Consultancy')").run(SETTING_DEFAULTS.company_name);
  db.prepare("UPDATE settings SET value=? WHERE key='company_name_ar' AND value=?").run(SETTING_DEFAULTS.company_name_ar, 'لمى الصفدي للاستشارات الإجتماعية والأسرية');
  ins.run('feed_key', crypto.randomBytes(18).toString('base64url'));
  ins.run('_secret', crypto.randomBytes(32).toString('base64url'));
  const svc = db.prepare('SELECT COUNT(*) AS n FROM services').get().n;
  if (svc === 0) {
    const s = db.prepare('INSERT INTO services(name,kind,description,price,active) VALUES(?,?,?,?,1)');
    s.run('Online', 'online', 'One-hour session by phone call, Zoom or Botim', 300);
    s.run('Office', 'offline', 'One-hour session at our office', 500);
  }
  return db;
}

export function getSettings(db) {
  const rows = db.prepare('SELECT key,value FROM settings').all();
  const raw = Object.fromEntries(rows.filter((r) => !r.key.startsWith('_m_')).map((r) => [r.key, r.value]));
  return {
    ...raw,
    vat_rate: Number(raw.vat_rate),
    prices_include_vat: raw.prices_include_vat === '1',
    work_start: Number(raw.work_start),
    work_end: Number(raw.work_end),
    lunch_start: Number(raw.lunch_start),
    lock_minutes: Number(raw.lock_minutes),
    free_reschedule_hours: Number(raw.free_reschedule_hours),
    max_changes: Number(raw.max_changes),
    change_window_days: Number(raw.change_window_days),
    slot_days: Number(raw.slot_days),
    reminder_hours: Number(raw.reminder_hours),
    closed_days: String(raw.closed_days || '').split(',').filter((x) => x !== '').map(Number),
  };
}

export function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch { /* already rolled back */ }
    throw e;
  }
}
