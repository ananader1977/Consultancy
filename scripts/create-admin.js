// Usage: node scripts/create-admin.js <email> <password> [name]
import { loadConfig } from '../src/config.js';
import { openDb } from '../src/db.js';
import { hashPassword, validatePasswordStrength } from '../src/auth.js';
const [email, password, name = ''] = process.argv.slice(2);
if (!email || !password) { console.error('Usage: node scripts/create-admin.js <email> <password> [name]'); process.exit(1); }
validatePasswordStrength(password);
const db = openDb(loadConfig().dbPath);
db.prepare('INSERT INTO admins(email,name,password_hash,created_at) VALUES(?,?,?,?) ON CONFLICT(email) DO UPDATE SET password_hash=excluded.password_hash')
  .run(email.toLowerCase(), name, hashPassword(password), Date.now());
console.log(`Admin ${email} saved.`);
