// Shape de Qualidade – servidor (Express + SQLite)
const express = require('express'), cookieParser = require('cookie-parser'), bcrypt = require('bcrypt'), crypto = require('crypto'), path = require('path');
const db = require('./src/db'), pay = require('./src/payments');
const app = express(); app.set('trust proxy', 1);
const PROD = process.env.NODE_ENV === 'production', DAY = 864e5;
app.use(express.json({ limit: '2mb', verify: (req, _r, buf) => { req.rawBody = buf.toString(); } }));
app.use(cookieParser());
app.use((req, res, next) => { res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY' }); next(); });

// ---------- sessões ----------
function newSession(res, role, id) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(token, role, id, Date.now() + 30 * DAY);
  res.cookie('sq', token, { httpOnly: true, sameSite: 'lax', secure: PROD, maxAge: 30 * DAY });
}
app.use((req, _res, next) => {
  const t = req.cookies.sq; if (t) { const s = db.prepare('SELECT * FROM sessions WHERE token=? AND expires>?').get(t, Date.now()); if (s) req.sess = s; }
  next();
});
const need = role => (req, res, next) => req.sess && req.sess.role === role ? next() : res.status(401).json({ error: 'Faça login.' });
// limitador simples de tentativas de login
const hits = new Map();
function limit(req, res, next) { const k = req.ip + req.path, n = (hits.get(k) || []).filter(t => t > Date.now() - 15 * 60e3); n.push(Date.now()); hits.set(k, n); if (n.length > 20) return res.status(429).json({ error: 'Muitas tentativas. Aguarde 15 minutos.' }); next(); }
const emailOk = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e), userOk = u => /^[a-z0-9._-]{3,30}$/.test(u);
const code = () => crypto.randomBytes(4).toString('hex').toUpperCase();
const pubP = p => ({ id: p.id, nome: p.nome, email: p.email, cref: p.cref, invite_code: p.invite_code });

// ---------- personal ----------
app.post('/api/personal/signup', limit, async (req, res) => {
  const nome = String(req.body.nome || '').trim(), email = String(req.body.email || '').trim().toLowerCase(), cref = String(req.body.cref || '').trim().toUpperCase(), pw = String(req.body.senha || '');
  if (nome.length < 2) return res.status(400).json({ error: 'Informe seu nome.' });
  if (!emailOk(email)) return res.status(400).json({ error: 'Informe um e-mail válido.' });
  if (cref && !/^\d{6}-[GP]\/[A-Z]{2}$/.test(cref)) return res.status(400).json({ error: 'CREF inválido. Use 012345-G/SP ou deixe em branco.' });
  if (pw.length < 8) return res.status(400).json({ error: 'A senha precisa ter pelo menos 8 caracteres.' });
  if (db.prepare('SELECT 1 FROM personals WHERE email=?').get(email)) return res.status(409).json({ error: 'Esse e-mail já tem conta. Faça login.' });
  const r = db.prepare('INSERT INTO personals(nome,email,cref,hash,invite_code,created_at) VALUES(?,?,?,?,?,?)').run(nome, email, cref, await bcrypt.hash(pw, 11), code(), Date.now());
  const plan = pay.plans()[req.body.plano] ? req.body.plano : 'pro';
  pay.startTrial(r.lastInsertRowid, plan);
  newSession(res, 'personal', r.lastInsertRowid); res.json({ ok: true, trial_days: pay.TRIAL_DAYS });
});
app.post('/api/personal/login', limit, async (req, res) => {
  const p = db.prepare('SELECT * FROM personals WHERE email=?').get(String(req.body.email || '').trim().toLowerCase());
  if (!p || !(await bcrypt.compare(String(req.body.senha || ''), p.hash))) return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
  newSession(res, 'personal', p.id); res.json({ ok: true });
});
app.post('/api/logout', (req, res) => { if (req.cookies.sq) db.prepare('DELETE FROM sessions WHERE token=?').run(req.cookies.sq); res.clearCookie('sq'); res.json({ ok: true }); });

// ---------- aluno ----------
app.get('/api/invite/:code', (req, res) => {
  const p = db.prepare('SELECT id,nome FROM personals WHERE invite_code=?').get(String(req.params.code).toUpperCase());
  if (!p) return res.status(404).json({ error: 'Código de convite inválido.' });
  const sb = pay.subscriptionOf(p.id), cnt = db.prepare('SELECT COUNT(*) n FROM students WHERE personal_id=?').get(p.id).n;
  res.json({ personal: p.nome, full: !!(sb.limit && cnt >= sb.limit), active: sb.active });
});
app.post('/api/student/signup', limit, async (req, res) => {
  const u = String(req.body.usuario || '').trim().toLowerCase(), nome = String(req.body.nome || '').trim(), pw = String(req.body.senha || '');
  const p = db.prepare('SELECT * FROM personals WHERE invite_code=?').get(String(req.body.convite || '').trim().toUpperCase());
  if (!p) return res.status(400).json({ error: 'Código de convite inválido. Peça o link ao seu personal.' });
  if (!pay.subscriptionOf(p.id).active) return res.status(402).json({ error: 'A assinatura do seu personal está inativa. Fale com ele.' });
  const sb = pay.subscriptionOf(p.id), cnt = db.prepare('SELECT COUNT(*) n FROM students WHERE personal_id=?').get(p.id).n;
  if (sb.limit && cnt >= sb.limit) return res.status(403).json({ error: `O seu personal atingiu o limite de ${sb.limit} alunos do plano ${sb.plan_nome}. Peça para ele fazer upgrade do plano para liberar novas vagas.`, code: 'limit' });
  if (!userOk(u)) return res.status(400).json({ error: 'Usuário inválido (mín. 3 letras/números, sem espaços).' });
  if (nome.length < 2) return res.status(400).json({ error: 'Informe seu nome.' });
  if (pw.length < 6) return res.status(400).json({ error: 'A senha precisa ter pelo menos 6 caracteres.' });
  if (db.prepare('SELECT 1 FROM students WHERE username=?').get(u)) return res.status(409).json({ error: 'Esse usuário já existe.' });
  const r = db.prepare('INSERT INTO students(personal_id,username,nome,hash,created_at) VALUES(?,?,?,?,?)').run(p.id, u, nome, await bcrypt.hash(pw, 11), Date.now());
  newSession(res, 'student', r.lastInsertRowid); res.json({ ok: true });
});
app.post('/api/student/login', limit, async (req, res) => {
  const s = db.prepare('SELECT * FROM students WHERE username=?').get(String(req.body.usuario || '').trim().toLowerCase());
  if (!s || !(await bcrypt.compare(String(req.body.senha || ''), s.hash))) return res.status(401).json({ error: 'Usuário ou senha incorretos.' });
  newSession(res, 'student', s.id); res.json({ ok: true });
});

// ---------- estado (bootstrap do app) ----------
const parse = t => { try { return t ? JSON.parse(t) : null; } catch { return null; } };
app.get('/api/me', (req, res) => {
  const P = { plans: pay.plans(), trial_days: pay.TRIAL_DAYS, providers: pay.providers() };
  if (!req.sess) return res.json({ role: null, ...P });
  if (req.sess.role === 'personal') {
    const p = db.prepare('SELECT * FROM personals WHERE id=?').get(req.sess.user_id); if (!p) return res.json({ role: null, ...P });
    const sub = pay.subscriptionOf(p.id);
    const students = sub.active ? db.prepare('SELECT username,nome,ficha FROM students WHERE personal_id=? ORDER BY nome').all(p.id).map(s => ({ u: s.username, nome: s.nome, ficha: parse(s.ficha) })) : [];
    const count = db.prepare('SELECT COUNT(*) n FROM students WHERE personal_id=?').get(p.id).n;
    return res.json({ role: 'personal', personal: pubP(p), sub, students, count, ...P });
  }
  if (req.sess.role === 'student') {
    const s = db.prepare('SELECT s.*,p.nome pnome,p.cref pcref,p.email pemail FROM students s JOIN personals p ON p.id=s.personal_id WHERE s.id=?').get(req.sess.user_id);
    if (!s) return res.json({ role: null, ...P });
    return res.json({ role: 'student', u: s.username, nome: s.nome, personal: { nome: s.pnome, cref: s.pcref }, active: pay.subscriptionOf(s.personal_id).active, ficha: parse(s.ficha), ...P });
  }
  res.json({ role: null, ...P });
});

// salvar ficha: aluno salva a própria; personal salva fichas dos seus alunos
app.put('/api/ficha/:u', (req, res) => {
  const s = db.prepare('SELECT * FROM students WHERE username=?').get(String(req.params.u).toLowerCase()); if (!s || !req.sess) return res.status(404).json({ error: 'não encontrado' });
  let F = req.body; if (!F || typeof F !== 'object') return res.status(400).json({ error: 'ficha inválida' });
  if (req.sess.role === 'student') {
    if (req.sess.user_id !== s.id) return res.status(403).json({ error: 'proibido' });
    if (!pay.subscriptionOf(s.personal_id).active) return res.status(402).json({ error: 'Assinatura do personal inativa.' });
    const old = parse(s.ficha) || {};
    // o aluno não pode se autoaprovar nem mudar a revisão
    if (F.status === 'aprovado' && old.status !== 'aprovado') { F.status = old.status || 'pendente'; F.aprov = old.aprov || null; }
    if (F.status === 'aprovado') { F.aprov = old.aprov; F.plan = old.plan; }
    F.rev = old.rev || null;
  } else if (req.sess.role === 'personal') {
    if (req.sess.user_id !== s.personal_id) return res.status(403).json({ error: 'proibido' });
    if (!pay.subscriptionOf(s.personal_id).active) return res.status(402).json({ error: 'Assinatura inativa.' });
  } else return res.status(403).json({ error: 'proibido' });
  db.prepare('UPDATE students SET ficha=?,updated_at=? WHERE id=?').run(JSON.stringify(F), Date.now(), s.id); res.json({ ok: true });
});

// ---------- pagamentos ----------
app.post('/api/billing/checkout', need('personal'), async (req, res) => {
  try { const p = db.prepare('SELECT * FROM personals WHERE id=?').get(req.sess.user_id); const plan = String(req.body.plano || 'pro'); pay.planOf(plan);
    const cnt = db.prepare('SELECT COUNT(*) n FROM students WHERE personal_id=?').get(p.id).n, L = pay.plans()[plan].limit;
    if (L && cnt > L) throw new Error(`Você tem ${cnt} alunos; o plano ${pay.plans()[plan].nome} permite ${L}. Escolha um plano maior.`);
    res.json(await pay.checkout(req, p, String(req.body.method || 'demo'), plan)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
// trocar de plano: upgrade de assinatura paga exige pagar o novo plano; downgrade bloqueado se passar do limite
app.post('/api/billing/plan', need('personal'), async (req, res) => {
  try {
    const id = req.sess.user_id, plan = String(req.body.plano || ''), P = pay.plans(), NP = pay.planOf(plan), sub = pay.subscriptionOf(id);
    const cnt = db.prepare('SELECT COUNT(*) n FROM students WHERE personal_id=?').get(id).n;
    if (NP.limit && cnt > NP.limit) return res.status(409).json({ error: `Não dá para mudar para o ${NP.nome}: você tem ${cnt} alunos e o limite é ${NP.limit}. Remova alunos ou escolha outro plano.` });
    if (!sub.active) return res.status(402).json({ error: 'Assine um plano primeiro.' });
    if (sub.plan === plan) return res.json({ ok: true });
    const up = NP.price_cents > P[sub.plan].price_cents;
    if (sub.trial || !up) { if (sub.trial) db.prepare("UPDATE subscriptions SET plan=? WHERE id=(SELECT id FROM subscriptions WHERE personal_id=? ORDER BY id DESC LIMIT 1)").run(plan, id), db.prepare('UPDATE personals SET plan=? WHERE id=?').run(plan, id);
      else await pay.changeRecurring(id, plan); return res.json({ ok: true, changed: true }); }
    res.json({ ok: true, needCheckout: true }); // upgrade de plano pago: o front leva ao pagamento do novo plano
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/webhooks/mercadopago', async (req, res) => { try { await pay.mpWebhook(req); res.sendStatus(200); } catch (e) { console.error('MP webhook', e.message); res.sendStatus(400); } });
app.post('/api/webhooks/stripe', (req, res) => { try { pay.stripeWebhook(req); res.sendStatus(200); } catch (e) { console.error('Stripe webhook', e.message); res.sendStatus(400); } });

// ---------- admin (dono) ----------
function admin(req, res, next) {
  const [u, p] = Buffer.from(String(req.get('authorization') || '').replace(/^Basic /, ''), 'base64').toString().split(':');
  const E = process.env.ADMIN_EMAIL, PW = process.env.ADMIN_PASSWORD;
  const eq = (a, b) => a && b && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  if (E && PW && eq(u, E) && eq(p, PW)) return next();
  res.set('WWW-Authenticate', 'Basic realm="admin"').status(401).send(E ? 'Login do administrador' : 'Defina ADMIN_EMAIL e ADMIN_PASSWORD para usar o painel admin.');
}
app.get('/api/admin/summary', admin, (req, res) => {
  const ps = db.prepare('SELECT p.id,p.nome,p.email,p.cref,p.created_at,(SELECT COUNT(*) FROM students s WHERE s.personal_id=p.id) alunos FROM personals p ORDER BY p.created_at DESC').all()
    .map(p => ({ ...p, sub: pay.subscriptionOf(p.id) }));
  const rev = db.prepare("SELECT COALESCE(SUM(amount_cents),0) total, COALESCE(SUM(CASE WHEN test=0 THEN amount_cents END),0) real FROM payments WHERE status='approved'").get();
  const mes = db.prepare("SELECT COALESCE(SUM(CASE WHEN test=0 THEN amount_cents END),0) real, COALESCE(SUM(amount_cents),0) total FROM payments WHERE status='approved' AND created_at>?").get(Date.now() - 30 * DAY);
  const byPlan = db.prepare("SELECT plan, COUNT(*) n, COALESCE(SUM(CASE WHEN test=0 THEN amount_cents END),0) real, COALESCE(SUM(amount_cents),0) total FROM payments WHERE status='approved' GROUP BY plan").all();
  const pays = db.prepare('SELECT pa.*,p.email FROM payments pa JOIN personals p ON p.id=pa.personal_id ORDER BY pa.created_at DESC LIMIT 100').all();
  res.json({ plans: pay.plans(), byPlan, personals: ps, revenue: rev, last30: mes, payments: pays, providers: pay.providers(), ativos: ps.filter(p => p.sub.active).length });
});
app.post('/api/admin/plans', admin, (req, res) => { try { res.json({ ok: true, plans: pay.setPlans(req.body || {}) }); } catch (e) { res.status(400).json({ error: e.message }); } });
app.get('/admin', admin, (_q, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

app.use(express.static(path.join(__dirname, 'public'), { index: 'index.html' }));
app.get('/convite/:code', (_q, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
setInterval(() => db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now()), 3600e3).unref();
const PORT = process.env.PORT || 3000;
if (require.main === module) app.listen(PORT, () => console.log(`Shape de Qualidade rodando em http://localhost:${PORT}` + (pay.providers().demo ? '  [MODO TESTE/DEMO: pagamentos simulados]' : '')));
module.exports = app;
