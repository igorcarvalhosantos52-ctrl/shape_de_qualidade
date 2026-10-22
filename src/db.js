// Banco: Turso (libSQL remoto) quando TURSO_DATABASE_URL existe; senão SQLite local.
// O cliente @libsql/client só resolve execute() depois que o Turso confirma a escrita.
// Não usamos réplica embutida: ela pode adiar o envio e perder dados no restart do Render.
const path = require('path');
const fs = require('fs');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS personals(
  id INTEGER PRIMARY KEY, nome TEXT NOT NULL, email TEXT UNIQUE NOT NULL, cref TEXT DEFAULT '', hash TEXT NOT NULL,
  invite_code TEXT UNIQUE NOT NULL, created_at INTEGER NOT NULL, plan TEXT DEFAULT 'pro', trial_used INTEGER DEFAULT 0,
  reset_requested_at INTEGER, whatsapp TEXT DEFAULT '',
  pix_tipo TEXT DEFAULT '', pix_chave TEXT DEFAULT '', pix_nome TEXT DEFAULT '', pix_cidade TEXT DEFAULT '',
  bio TEXT DEFAULT '', foto TEXT DEFAULT '', fee_cents INTEGER DEFAULT 0, fee_day INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS subscriptions(
  id INTEGER PRIMARY KEY, personal_id INTEGER NOT NULL REFERENCES personals(id) ON DELETE CASCADE,
  provider TEXT NOT NULL, external_id TEXT, status TEXT NOT NULL, amount_cents INTEGER NOT NULL, current_period_end INTEGER,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, plan TEXT DEFAULT 'pro');
CREATE TABLE IF NOT EXISTS payments(
  id INTEGER PRIMARY KEY, personal_id INTEGER NOT NULL REFERENCES personals(id) ON DELETE CASCADE,
  provider TEXT NOT NULL, external_id TEXT, amount_cents INTEGER NOT NULL, status TEXT NOT NULL, test INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL, plan TEXT DEFAULT 'pro', UNIQUE(provider, external_id));
CREATE TABLE IF NOT EXISTS students(
  id INTEGER PRIMARY KEY, personal_id INTEGER NOT NULL REFERENCES personals(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL, nome TEXT NOT NULL, hash TEXT NOT NULL, ficha TEXT, updated_at INTEGER, created_at INTEGER NOT NULL,
  origin TEXT DEFAULT 'convite', gate TEXT DEFAULT '', altura_cm REAL, peso_kg REAL,
  email TEXT, reset_requested_at INTEGER, whatsapp TEXT DEFAULT '', dias_semana TEXT DEFAULT '');
CREATE TABLE IF NOT EXISTS tuition(
  student_id INTEGER PRIMARY KEY, amount_cents INTEGER, due_day INTEGER, exempt INTEGER DEFAULT 0,
  paid_through TEXT, informed_for TEXT, informed_at INTEGER);
CREATE TABLE IF NOT EXISTS tuition_payments(
  id INTEGER PRIMARY KEY, student_id INTEGER NOT NULL, due_on TEXT NOT NULL, amount_cents INTEGER NOT NULL,
  informed_at INTEGER, confirmed_at INTEGER, undone INTEGER DEFAULT 0, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(
  token TEXT PRIMARY KEY, role TEXT NOT NULL, user_id INTEGER NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS password_resets(
  token_hash TEXT PRIMARY KEY, role TEXT NOT NULL, user_id INTEGER NOT NULL, expires INTEGER NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS custom_exercises(
  id INTEGER PRIMARY KEY, personal_id INTEGER NOT NULL REFERENCES personals(id) ON DELETE CASCADE,
  nome TEXT NOT NULL, nota TEXT DEFAULT '', grupo TEXT NOT NULL,
  series INTEGER DEFAULT 3, reps TEXT DEFAULT '', descanso TEXT DEFAULT '', created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS assessments(
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL,
  personal_id INTEGER NOT NULL,
  taken_on TEXT NOT NULL,
  kind TEXT NOT NULL,
  peso REAL, gordura REAL, pescoco REAL, ombros REAL, torax REAL, cintura REAL, abdomen REAL, quadril REAL,
  braco_d REAL, braco_e REAL, antebraco_d REAL, antebraco_e REAL, coxa_d REAL, coxa_e REAL, panturrilha_d REAL, panturrilha_e REAL,
  dobra_tricipital REAL, dobra_bicipital REAL, dobra_abdominal REAL, dobra_subescapular REAL, dobra_coxa REAL, dobra_toracica REAL, dobra_suprailiaca REAL, dobra_axilar REAL,
  sexo TEXT DEFAULT '',
  photo TEXT DEFAULT '',
  created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS assessments_student ON assessments(student_id, taken_on, id);
CREATE TABLE IF NOT EXISTS exercise_videos(
  id INTEGER PRIMARY KEY,
  personal_id INTEGER NOT NULL REFERENCES personals(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  mime TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  ready INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS exercise_video_parts(
  video_id INTEGER NOT NULL REFERENCES exercise_videos(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (video_id, seq));
CREATE UNIQUE INDEX IF NOT EXISTS exercise_videos_ready ON exercise_videos(personal_id, nome) WHERE ready = 1;
CREATE TRIGGER IF NOT EXISTS exercise_videos_personal_del
AFTER DELETE ON personals
BEGIN
  DELETE FROM exercise_video_parts WHERE video_id IN (SELECT id FROM exercise_videos WHERE personal_id = OLD.id);
  DELETE FROM exercise_videos WHERE personal_id = OLD.id;
END;
`;
// Bancos criados antes destas colunas: o CREATE não altera tabela existente.
const ALTERS = [
  "ALTER TABLE personals ADD COLUMN plan TEXT DEFAULT 'pro'",
  "ALTER TABLE personals ADD COLUMN trial_used INTEGER DEFAULT 0",
  "ALTER TABLE personals ADD COLUMN reset_requested_at INTEGER",
  "ALTER TABLE personals ADD COLUMN whatsapp TEXT DEFAULT ''",
  "ALTER TABLE subscriptions ADD COLUMN plan TEXT DEFAULT 'pro'",
  "ALTER TABLE payments ADD COLUMN plan TEXT DEFAULT 'pro'",
  "ALTER TABLE personals ADD COLUMN pix_tipo TEXT DEFAULT ''",
  "ALTER TABLE personals ADD COLUMN pix_chave TEXT DEFAULT ''",
  "ALTER TABLE personals ADD COLUMN pix_nome TEXT DEFAULT ''",
  "ALTER TABLE personals ADD COLUMN pix_cidade TEXT DEFAULT ''",
  "ALTER TABLE personals ADD COLUMN bio TEXT DEFAULT ''",
  "ALTER TABLE personals ADD COLUMN foto TEXT DEFAULT ''",
  "ALTER TABLE personals ADD COLUMN fee_cents INTEGER DEFAULT 0",
  "ALTER TABLE personals ADD COLUMN fee_day INTEGER DEFAULT 0",
  "ALTER TABLE students ADD COLUMN origin TEXT DEFAULT 'convite'",
  "ALTER TABLE students ADD COLUMN gate TEXT DEFAULT ''",
  "ALTER TABLE students ADD COLUMN altura_cm REAL",
  "ALTER TABLE students ADD COLUMN peso_kg REAL",
  "ALTER TABLE students ADD COLUMN email TEXT",
  "ALTER TABLE students ADD COLUMN reset_requested_at INTEGER",
  "ALTER TABLE students ADD COLUMN whatsapp TEXT DEFAULT ''",
  "ALTER TABLE students ADD COLUMN dias_semana TEXT DEFAULT ''",
  "ALTER TABLE assessments ADD COLUMN dobra_tricipital REAL",
  "ALTER TABLE assessments ADD COLUMN dobra_bicipital REAL",
  "ALTER TABLE assessments ADD COLUMN dobra_abdominal REAL",
  "ALTER TABLE assessments ADD COLUMN dobra_subescapular REAL",
  "ALTER TABLE assessments ADD COLUMN dobra_coxa REAL",
  "ALTER TABLE assessments ADD COLUMN dobra_toracica REAL",
  "ALTER TABLE assessments ADD COLUMN dobra_suprailiaca REAL",
  "ALTER TABLE assessments ADD COLUMN dobra_axilar REAL",
  "ALTER TABLE assessments ADD COLUMN sexo TEXT DEFAULT ''",
];

const num = v => (typeof v === 'bigint' ? Number(v) : v);
function plain(row) {
  if (!row) return undefined;
  const o = {};
  for (const k of Object.keys(row)) o[k] = num(row[k]);
  return o;
}
const dupCol = e => /duplicate column name/i.test(String(e && e.message));

function wrapSqlite(raw) {
  return {
    driver: 'sqlite',
    prepare(sql) {
      const stmt = raw.prepare(sql);
      return {
        get: (...args) => Promise.resolve(stmt.get(...args)),
        all: (...args) => Promise.resolve(stmt.all(...args)),
        run: (...args) => {
          const r = stmt.run(...args);
          return Promise.resolve({ lastInsertRowid: Number(r.lastInsertRowid), changes: r.changes });
        },
      };
    },
    exec: sql => Promise.resolve(raw.exec(sql)),
  };
}

function wrapLibsql(client) {
  const argsOf = xs => xs.map(v => (v === undefined ? null : v));
  return {
    driver: 'libsql',
    prepare(sql) {
      return {
        async get(...args) {
          const rs = await client.execute({ sql, args: argsOf(args) });
          return plain(rs.rows[0]);
        },
        async all(...args) {
          const rs = await client.execute({ sql, args: argsOf(args) });
          return rs.rows.map(plain);
        },
        async run(...args) {
          const rs = await client.execute({ sql, args: argsOf(args) });
          return { lastInsertRowid: Number(rs.lastInsertRowid || 0), changes: Number(rs.rowsAffected || 0) };
        },
      };
    },
    exec: sql => client.executeMultiple(sql),
  };
}

function open() {
  const url = process.env.TURSO_DATABASE_URL;
  if (url) {
    const { createClient } = require('@libsql/client');
    const opts = { url, intMode: 'number' };
    if (process.env.TURSO_AUTH_TOKEN) opts.authToken = process.env.TURSO_AUTH_TOKEN;
    return wrapLibsql(createClient(opts));
  }
  const Database = require('better-sqlite3');
  const file = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'shape.db');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const raw = new Database(file);
  raw.pragma('journal_mode = WAL');
  raw.pragma('foreign_keys = ON');
  raw.pragma('busy_timeout = 5000');
  return wrapSqlite(raw);
}

const db = open();

async function migrate() {
  if (db.driver === 'libsql') {
    const file = String(process.env.TURSO_DATABASE_URL).startsWith('file:');
    try { await db.exec('PRAGMA foreign_keys = ON'); } catch (e) { if (file) throw e; }
    if (file) await db.exec('PRAGMA busy_timeout = 5000');
  }
  await db.exec(SCHEMA);
  for (const sql of ALTERS) {
    try { await db.exec(sql); } catch (e) { if (!dupCol(e)) throw e; }
  }
  await db.exec('CREATE UNIQUE INDEX IF NOT EXISTS students_email_uq ON students(email) WHERE email IS NOT NULL');
  await renomearBr();
}

async function renomearBr() {
  const { EX_ALIAS, normalizarFicha } = require('../public/aliases');
  const flag = await db.prepare("SELECT value FROM settings WHERE key='rename_br_v1'").get();
  if (flag && flag.value === '1') return;
  for (const [de, para] of Object.entries(EX_ALIAS)) {
    const drafts = await db.prepare('SELECT id FROM exercise_videos WHERE nome=? AND ready=0').all(de);
    for (const d of drafts) {
      await db.prepare('DELETE FROM exercise_video_parts WHERE video_id=?').run(d.id);
      await db.prepare('DELETE FROM exercise_videos WHERE id=?').run(d.id);
    }
    await db.prepare('UPDATE exercise_videos SET nome=? WHERE nome=? AND NOT EXISTS (SELECT 1 FROM exercise_videos v2 WHERE v2.personal_id=exercise_videos.personal_id AND v2.nome=? AND v2.ready=1)').run(para, de, para);
  }
  let last = 0;
  for (;;) {
    const rows = await db.prepare('SELECT id, ficha FROM students WHERE ficha IS NOT NULL AND id>? ORDER BY id LIMIT 100').all(last);
    if (!rows.length) break;
    for (const row of rows) {
      last = Number(row.id);
      let f = null;
      try { f = JSON.parse(row.ficha); } catch (e) { continue; }
      if (!f || typeof f !== 'object' || Array.isArray(f)) continue;
      if (normalizarFicha(f)) await db.prepare('UPDATE students SET ficha=? WHERE id=?').run(JSON.stringify(f), row.id);
    }
    if (rows.length < 100) break;
  }
  await db.prepare("INSERT INTO settings(key, value) VALUES('rename_br_v1', '1') ON CONFLICT(key) DO UPDATE SET value=excluded.value").run();
}

db.migrate = migrate;
db.ready = migrate();
module.exports = db;
