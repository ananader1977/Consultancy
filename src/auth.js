import crypto from 'node:crypto';
import { HttpError } from './http.js';

const SESSION_COOKIE = 'co_session';
const SESSION_TTL_MS = 12 * 3600 * 1000;

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password, stored) {
  const [alg, saltB64, hashB64] = String(stored).split('$');
  if (alg !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = crypto.scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

export function hmac(secret, data) {
  return crypto.createHmac('sha256', secret).update(data).digest('base64url');
}

export function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export function signSession(secret, adminId, now) {
  const payload = Buffer.from(JSON.stringify({ uid: adminId, exp: now + SESSION_TTL_MS })).toString('base64url');
  return `${payload}.${hmac(secret, payload)}`;
}

export function readSession(secret, token, now) {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  if (!safeEqual(sig, hmac(secret, payload))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return data.exp > now ? data : null;
  } catch {
    return null;
  }
}

export function validatePasswordStrength(pw) {
  if (typeof pw !== 'string' || pw.length < 10) throw new HttpError(400, 'Password must be at least 10 characters.');
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) throw new HttpError(400, 'Password must contain letters and numbers.');
}

export function createAuth(ctx) {
  const secret = () => ctx.db.prepare("SELECT value FROM settings WHERE key='_secret'").get().value;

  function startSession(res, adminId) {
    res.setCookie(SESSION_COOKIE, signSession(secret(), adminId, ctx.now()), {
      maxAge: SESSION_TTL_MS / 1000,
      secure: ctx.config.secureCookies,
    });
  }
  function endSession(res) {
    res.setCookie(SESSION_COOKIE, '', { maxAge: 0, secure: ctx.config.secureCookies });
  }
  function currentAdmin(req) {
    const s = readSession(secret(), req.cookies[SESSION_COOKIE], ctx.now());
    if (!s) return null;
    return ctx.db.prepare('SELECT id,email,name FROM admins WHERE id=?').get(s.uid) || null;
  }
  /** Middleware: requires a valid admin session; mutating requests also need the CSRF header. */
  function requireAdmin(req) {
    const admin = currentAdmin(req);
    if (!admin) throw new HttpError(401, 'Please sign in.');
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.headers['x-requested-with'] !== 'co') {
      throw new HttpError(403, 'Missing CSRF header.');
    }
    req.admin = admin;
  }
  return { startSession, endSession, currentAdmin, requireAdmin };
}

export function ensureAdmin(ctx) {
  const n = ctx.db.prepare('SELECT COUNT(*) AS n FROM admins').get().n;
  // If ADMIN_EMAIL and ADMIN_PASSWORD are set, make sure that admin exists with that password
  // (lets you create or reset an admin from the hosting dashboard without a shell).
  if (n > 0 && ctx.config.adminEmail && ctx.config.adminPassword) {
    const email = ctx.config.adminEmail.toLowerCase();
    const hash = hashPassword(ctx.config.adminPassword);
    const row = ctx.db.prepare('SELECT id FROM admins WHERE email=?').get(email);
    if (row) ctx.db.prepare('UPDATE admins SET password_hash=? WHERE id=?').run(hash, row.id);
    else ctx.db.prepare('INSERT INTO admins(email,name,password_hash,created_at) VALUES(?,?,?,?)').run(email, 'Administrator', hash, ctx.now());
    return null;
  }
  if (n > 0) return null;
  const email = (ctx.config.adminEmail || 'admin@example.com').toLowerCase();
  let password = ctx.config.adminPassword;
  let generated = false;
  if (!password) {
    password = crypto.randomBytes(12).toString('base64url');
    generated = true;
  }
  ctx.db
    .prepare('INSERT INTO admins(email,name,password_hash,created_at) VALUES(?,?,?,?)')
    .run(email, 'Administrator', hashPassword(password), ctx.now());
  return { email, password: generated ? password : null, generated };
}
