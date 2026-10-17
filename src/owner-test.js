// Teste do dono: libera os 100 cards e o ebook sem olhar plano nem pagamento.
// Para desligar depois, defina OWNER_TEST_EMAILS=off. É o único interruptor.
const db = require('./db');

function norm(s) { return String(s || '').trim().toLowerCase(); }

function config() {
  const raw = process.env.OWNER_TEST_EMAILS;
  if (raw !== undefined) {
    const t = String(raw).trim();
    if (!t || /^(off|0|false|no|nao)$/i.test(t)) return { on: false, emails: [] };
    const emails = t.split(',').map(norm).filter(Boolean);
    const admin = norm(process.env.ADMIN_EMAIL);
    if (admin && !emails.includes(admin)) emails.push(admin);
    return { on: true, emails };
  }
  const admin = norm(process.env.ADMIN_EMAIL);
  return { on: true, emails: admin ? [admin] : [] };
}

function allows(email, count, cfg) {
  const c = cfg || config();
  if (!c.on) return false;
  const e = norm(email);
  if (e && c.emails.includes(e)) return true;
  return Number(count) === 1;
}

async function isOwner(personalId) {
  const cfg = config();
  if (!cfg.on || !personalId) return false;
  const p = await db.prepare('SELECT email FROM personals WHERE id=?').get(personalId);
  if (!p) return false;
  const n = await db.prepare('SELECT COUNT(*) n FROM personals').get();
  return allows(p.email, n && n.n, cfg);
}

module.exports = { config, allows, isOwner };
