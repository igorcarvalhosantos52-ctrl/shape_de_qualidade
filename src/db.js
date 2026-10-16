const Database = require('better-sqlite3');
const path = require('path'); const fs = require('fs');
const file = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'shape.db');
fs.mkdirSync(path.dirname(file), { recursive: true });
const db = new Database(file);
db.pragma('journal_mode = WAL'); db.pragma('foreign_keys = ON');
db.exec(`
CREATE TABLE IF NOT EXISTS personals(id INTEGER PRIMARY KEY, nome TEXT NOT NULL, email TEXT UNIQUE NOT NULL, cref TEXT DEFAULT '', hash TEXT NOT NULL,
  invite_code TEXT UNIQUE NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS subscriptions(id INTEGER PRIMARY KEY, personal_id INTEGER NOT NULL REFERENCES personals(id) ON DELETE CASCADE,
  provider TEXT NOT NULL, external_id TEXT, status TEXT NOT NULL, amount_cents INTEGER NOT NULL, current_period_end INTEGER,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS payments(id INTEGER PRIMARY KEY, personal_id INTEGER NOT NULL REFERENCES personals(id) ON DELETE CASCADE,
  provider TEXT NOT NULL, external_id TEXT, amount_cents INTEGER NOT NULL, status TEXT NOT NULL, test INTEGER DEFAULT 0, created_at INTEGER NOT NULL,
  UNIQUE(provider, external_id));
CREATE TABLE IF NOT EXISTS students(id INTEGER PRIMARY KEY, personal_id INTEGER NOT NULL REFERENCES personals(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL, nome TEXT NOT NULL, hash TEXT NOT NULL, ficha TEXT, updated_at INTEGER, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, role TEXT NOT NULL, user_id INTEGER NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT);
`);
module.exports = db;
// migrações (planos)
for (const sql of ["ALTER TABLE personals ADD COLUMN plan TEXT DEFAULT 'pro'", "ALTER TABLE personals ADD COLUMN trial_used INTEGER DEFAULT 0",
  "ALTER TABLE subscriptions ADD COLUMN plan TEXT DEFAULT 'pro'", "ALTER TABLE payments ADD COLUMN plan TEXT DEFAULT 'pro'"]) { try { db.exec(sql); } catch (e) {} }
db.exec(`CREATE TABLE IF NOT EXISTS password_resets(token_hash TEXT PRIMARY KEY, role TEXT NOT NULL, user_id INTEGER NOT NULL, expires INTEGER NOT NULL, created_at INTEGER NOT NULL)`);
try { db.exec("ALTER TABLE personals ADD COLUMN reset_requested_at INTEGER"); } catch (e) {}
try { db.exec("ALTER TABLE personals ADD COLUMN whatsapp TEXT DEFAULT ''"); } catch (e) {}
