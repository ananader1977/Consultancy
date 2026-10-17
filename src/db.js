import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const SETTING_DEFAULTS = {
  company_name: 'Consultancy Operation',
  company_address: '',
  company_trn: '',
  owner_name: 'Owner',
  owner_email: '',
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
  const ins = db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)');
  for (const [k, v] of Object.entries(SETTING_DEFAULTS)) ins.run(k, v);
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
