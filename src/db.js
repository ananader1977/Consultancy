import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const SETTING_DEFAULTS = {
  company_name: 'Lama Al Safadi Social & Family Consultancy',
  company_address: '',
  company_trn: '',
  owner_name: 'Owner',
  owner_email: 'info@lamaalsafadi.ae',
  contact_phone: '+971 52 806 6121',
  contact_email: 'info@lamaalsafadi.ae',
  facebook: 'lama_alsafadi',
  vat_rate: '5',
  prices_include_vat: '0',
  work_start: '10',
  work_end: '18',
  lunch_start: '13',
  lock_minutes: '10',
  free_reschedule_hours: '24',
  slot_days: '60',
  zoom_link: '',
  teams_link: '',
  reminder_hours: '2',
  closed_days: '0',
  terms_text: "Terms & Conditions for Consultation Bookings\n\n1. Booking and payment\nA booking is confirmed only after full payment by card. Your chosen time is held for 10 minutes while you pay; if payment is not completed, the time is released automatically.\n\n2. Prices and VAT\nPrices are in UAE Dirhams (AED). VAT at 5% is added to the listed price. A tax invoice is issued by email after payment.\n\n3. Sessions\nEach session lasts 1 hour and takes place Monday to Saturday between 9:00 AM and 6:00 PM (Dubai time). Online sessions are held on Zoom or Microsoft Teams; the link is sent by email. Office sessions take place at the address shown in your confirmation.\n\n4. Rescheduling\nYou can reschedule free of charge up to 24 hours before your appointment using \"Manage booking\". Within 24 hours of the appointment, please contact us; changes are at our discretion.\n\n5. Cancellation and refunds\nCancellations requested at least 24 hours before the appointment receive a full refund to the original card. Requests made less than 24 hours before the appointment may not be refunded. No refund is given after the appointment start time or for a missed appointment. Banks may take 5 to 10 working days to show a refund.\n\n6. Late arrival\nIf you join or arrive late, the session still ends at the scheduled time.\n\n7. Your information\nWe use your name, mobile number and email only to manage your booking and to send confirmations and reminders by email and WhatsApp.\n\n8. Nature of the service\nConsultations are not an emergency service. If you or someone else is in immediate danger, call 999 (UAE emergency services).\n\n9. Contact\nFor any question about your booking, call or WhatsApp +971 52 806 6121, email info@lamaalsafadi.ae, or message us on Facebook (lama_alsafadi).",
  company_name_ar: "لمى الصفدي للاستشارات الإجتماعية والأسرية",
  terms_text_ar: "الشروط والأحكام لحجز الاستشارات\n\n1. الحجز والدفع\nلا يتم تأكيد الحجز إلا بعد دفع المبلغ كاملاً بالبطاقة. يُحجز الموعد الذي اخترته لمدة 10 دقائق أثناء الدفع، وإذا لم يكتمل الدفع يُلغى حجز الموعد تلقائياً.\n\n2. الأسعار وضريبة القيمة المضافة\nالأسعار بالدرهم الإماراتي، وتُضاف ضريبة القيمة المضافة بنسبة 5% إلى السعر المعلن. تُرسل الفاتورة الضريبية إلى بريدك الإلكتروني بعد الدفع.\n\n3. الجلسات\nمدة كل جلسة ساعة واحدة، من الاثنين إلى السبت بين الساعة 9:00 صباحاً و6:00 مساءً بتوقيت دبي. تُعقد الجلسات عن بُعد عبر Zoom أو Microsoft Teams ويُرسل الرابط بالبريد الإلكتروني، وتُعقد الجلسات الحضورية في عنوان المكتب الموضح في رسالة التأكيد.\n\n4. إعادة الجدولة\nيمكنك إعادة جدولة موعدك مجاناً حتى 24 ساعة قبل الموعد من خلال صفحة \"إدارة الحجز\". وخلال الـ 24 ساعة السابقة للموعد يرجى التواصل معنا، ويخضع أي تغيير لتقديرنا.\n\n5. الإلغاء والاسترداد\nطلبات الإلغاء المقدمة قبل 24 ساعة أو أكثر من الموعد يُسترد مبلغها كاملاً إلى البطاقة المستخدمة في الدفع. أما الطلبات المقدمة قبل أقل من 24 ساعة من الموعد فقد لا يُسترد مبلغها. ولا يُسترد أي مبلغ بعد بدء الموعد أو في حال عدم الحضور. قد يستغرق ظهور المبلغ المسترد لدى البنك من 5 إلى 10 أيام عمل.\n\n6. التأخر\nفي حال التأخر عن الانضمام أو الحضور، تنتهي الجلسة في وقتها المحدد.\n\n7. بياناتك\nنستخدم اسمك ورقم جوالك وبريدك الإلكتروني فقط لإدارة حجزك وإرسال رسائل التأكيد والتذكير عبر البريد الإلكتروني وواتساب.\n\n8. طبيعة الخدمة\nالاستشارات ليست خدمة طوارئ. إذا كنت أنت أو أي شخص آخر في خطر مباشر، فاتصل بالرقم 999 (خدمات الطوارئ في الإمارات).\n\n9. التواصل\nلأي استفسار بخصوص حجزك، اتصل بنا أو راسلنا عبر واتساب على ⁦+971 52 806 6121⁩، أو عبر البريد الإلكتروني info@lamaalsafadi.ae، أو على فيسبوك (lama_alsafadi)."
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
  for (const [key, oldLine, newLine] of [['terms_text', "For any question about your booking, reply to your confirmation email.", "For any question about your booking, call or WhatsApp +971 52 806 6121, email info@lamaalsafadi.ae, or message us on Facebook (lama_alsafadi)."], ['terms_text_ar', "لأي استفسار بخصوص حجزك، يمكنك الرد على رسالة التأكيد المرسلة إلى بريدك الإلكتروني.", "لأي استفسار بخصوص حجزك، اتصل بنا أو راسلنا عبر واتساب على ⁦+971 52 806 6121⁩، أو عبر البريد الإلكتروني info@lamaalsafadi.ae، أو على فيسبوك (lama_alsafadi)."]]) {
    const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
    if (row && row.value.includes(oldLine)) db.prepare('UPDATE settings SET value=? WHERE key=?').run(row.value.replace(oldLine, newLine), key);
  }
  db.prepare("UPDATE settings SET value=? WHERE key='company_name' AND value='Consultancy Operation'").run(SETTING_DEFAULTS.company_name);
  ins.run('feed_key', crypto.randomBytes(18).toString('base64url'));
  ins.run('_secret', crypto.randomBytes(32).toString('base64url'));
  const svc = db.prepare('SELECT COUNT(*) AS n FROM services').get().n;
  if (svc === 0) {
    const s = db.prepare('INSERT INTO services(name,kind,description,price,active) VALUES(?,?,?,?,1)');
    s.run('Online', 'online', 'One-hour consultation by Zoom or Microsoft Teams', 500);
    s.run('Offline', 'offline', 'One-hour consultation at our office', 1000);
  }
  return db;
}

export function getSettings(db) {
  const rows = db.prepare('SELECT key,value FROM settings').all();
  const raw = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    ...raw,
    vat_rate: Number(raw.vat_rate),
    prices_include_vat: raw.prices_include_vat === '1',
    work_start: Number(raw.work_start),
    work_end: Number(raw.work_end),
    lunch_start: Number(raw.lunch_start),
    lock_minutes: Number(raw.lock_minutes),
    free_reschedule_hours: Number(raw.free_reschedule_hours),
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
