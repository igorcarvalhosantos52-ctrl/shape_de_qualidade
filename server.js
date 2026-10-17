// Shape de Qualidade – servidor (Express + SQLite ou Turso)
const express = require('express'), cookieParser = require('cookie-parser'), bcrypt = require('bcrypt'), crypto = require('crypto'), path = require('path');
const db = require('./src/db'), pay = require('./src/payments'), cards = require('./src/cards'), tuition = require('./src/tuition'), publicPage = require('./src/public-page'), ebook = require('./src/ebook'), ownerTest = require('./src/owner-test'), medidas = require('./src/medidas');
const app = express(); app.set('trust proxy', 1);
const PROD = process.env.NODE_ENV === 'production', DAY = 864e5;
app.use(express.json({ limit: '2mb', verify: (req, _r, buf) => { req.rawBody = buf.toString(); } }));
app.use(cookieParser());
app.use((req, res, next) => { res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY' }); next(); });

// ---------- sessões (gravadas no banco antes de responder) ----------
async function newSession(res, role, id) {
  const token = crypto.randomBytes(32).toString('hex');
  await db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(token, role, id, Date.now() + 30 * DAY);
  res.cookie('sq', token, { httpOnly: true, sameSite: 'lax', secure: PROD, maxAge: 30 * DAY });
}
app.use(async (req, res, next) => {
  try {
    const t = req.cookies.sq;
    if (t && req.path.startsWith('/api/')) { const s = await db.prepare('SELECT * FROM sessions WHERE token=? AND expires>?').get(t, Date.now()); if (s) req.sess = s; }
    next();
  } catch (e) { next(e); }
});
const need = role => (req, res, next) => req.sess && req.sess.role === role ? next() : res.status(401).json({ error: 'Faça login.' });
// limitador simples de tentativas de login
const hits = new Map();
function limit(req, res, next) { const k = req.ip + req.path, n = (hits.get(k) || []).filter(t => t > Date.now() - 15 * 60e3); n.push(Date.now()); hits.set(k, n); if (n.length > 20) return res.status(429).json({ error: 'Muitas tentativas. Aguarde 15 minutos.' }); next(); }
const emailOk = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e), userOk = u => /^[a-z0-9._-]{3,30}$/.test(u);
const code = () => crypto.randomBytes(4).toString('hex').toUpperCase();
const pubP = p => ({ id: p.id, nome: p.nome, email: p.email, cref: p.cref, invite_code: p.invite_code, whatsapp: p.whatsapp || "", pix: tuition.pixPublic(p), has_foto: !!(p && p.foto) });
function waNorm(raw) {
  let d = String(raw || "").replace(/\D/g, "");
  if (d.startsWith("55") && d.length > 11) d = d.slice(2);
  if (!d) return "";
  if (!/^\d{10,11}$/.test(d)) { const err = new Error("Informe o DDD e o número, com 10 ou 11 dígitos."); err.status = 400; throw err; }
  return d;
}

// ---------- personal ----------
app.post('/api/personal/signup', limit, async (req, res) => {
  const nome = String(req.body.nome || '').trim(), email = String(req.body.email || '').trim().toLowerCase(), cref = String(req.body.cref || '').trim().toUpperCase(), pw = String(req.body.senha || '');
  if (nome.length < 2) return res.status(400).json({ error: 'Informe seu nome.' });
  if (!emailOk(email)) return res.status(400).json({ error: 'Informe um e-mail válido.' });
  if (cref && !/^\d{6}-[GP]\/[A-Z]{2}$/.test(cref)) return res.status(400).json({ error: 'CREF inválido. Use 012345-G/SP ou deixe em branco.' });
  if (pw.length < 8) return res.status(400).json({ error: 'A senha precisa ter pelo menos 8 caracteres.' });
  if (await db.prepare('SELECT 1 FROM personals WHERE email=?').get(email)) return res.status(409).json({ error: 'Esse e-mail já tem conta. Faça login.' });
  const r = await db.prepare('INSERT INTO personals(nome,email,cref,hash,invite_code,created_at) VALUES(?,?,?,?,?,?)').run(nome, email, cref, await bcrypt.hash(pw, 11), code(), Date.now());
  const plan = (await pay.plans())[req.body.plano] ? req.body.plano : 'pro';
  await pay.startTrial(r.lastInsertRowid, plan);
  await newSession(res, 'personal', r.lastInsertRowid); res.json({ ok: true, trial_days: pay.TRIAL_DAYS });
});
app.post('/api/personal/login', limit, async (req, res) => {
  const p = await db.prepare('SELECT * FROM personals WHERE email=?').get(String(req.body.email || '').trim().toLowerCase());
  if (!p || !(await bcrypt.compare(String(req.body.senha || ''), p.hash))) return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
  await newSession(res, 'personal', p.id); res.json({ ok: true });
});
app.post('/api/logout', async (req, res) => { if (req.cookies.sq) await db.prepare('DELETE FROM sessions WHERE token=?').run(req.cookies.sq); res.clearCookie('sq'); res.json({ ok: true }); });


// ---------- senhas: troca, redefinição por link (1h), pedido de "esqueci a senha" ----------
const sha = t => crypto.createHash('sha256').update(t).digest('hex');
const baseUrl = req => (process.env.BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
async function makeReset(req, role, id) {
  const t = crypto.randomBytes(32).toString('hex');
  await db.prepare('DELETE FROM password_resets WHERE (role=? AND user_id=?) OR expires<?').run(role, id, Date.now());
  await db.prepare('INSERT INTO password_resets VALUES(?,?,?,?,?)').run(sha(t), role, id, Date.now() + 3600e3, Date.now());
  return baseUrl(req) + '/redefinir?t=' + t;
}
const killSessions = (role, id) => db.prepare('DELETE FROM sessions WHERE role=? AND user_id=?').run(role, id);
app.post('/api/personal/forgot', limit, async (req, res) => {
  const p = await db.prepare('SELECT id FROM personals WHERE email=?').get(String(req.body.email || '').trim().toLowerCase());
  if (p) await db.prepare('UPDATE personals SET reset_requested_at=? WHERE id=?').run(Date.now(), p.id);
  res.json({ ok: true, msg: 'Pedido registrado. O suporte do Shape de Qualidade vai te enviar um link para criar uma nova senha' + (process.env.ADMIN_EMAIL ? ` (contato: ${process.env.ADMIN_EMAIL})` : '') + '. O link vale por 1 hora.' });
});
app.get('/api/password/reset/:t', async (req, res) => {
  const r = await db.prepare('SELECT * FROM password_resets WHERE token_hash=? AND expires>?').get(sha(String(req.params.t)), Date.now());
  if (!r) return res.status(400).json({ error: 'Link inválido ou vencido. Peça um novo.' });
  const u = r.role === 'personal' ? await db.prepare('SELECT nome,email login FROM personals WHERE id=?').get(r.user_id) : await db.prepare('SELECT nome,username login FROM students WHERE id=?').get(r.user_id);
  res.json({ ok: true, role: r.role, nome: u && u.nome, login: u && u.login });
});
app.post('/api/password/reset', limit, async (req, res) => {
  const r = await db.prepare('SELECT * FROM password_resets WHERE token_hash=? AND expires>?').get(sha(String(req.body.token || '')), Date.now());
  if (!r) return res.status(400).json({ error: 'Link inválido ou vencido. Peça um novo.' });
  const pw = String(req.body.senha || ''), min = r.role === 'personal' ? 8 : 6;
  if (pw.length < min) return res.status(400).json({ error: `A senha precisa ter pelo menos ${min} caracteres.` });
  const tbl = r.role === 'personal' ? 'personals' : 'students';
  await db.prepare(`UPDATE ${tbl} SET hash=? WHERE id=?`).run(await bcrypt.hash(pw, 11), r.user_id);
  if (r.role === 'personal') await db.prepare('UPDATE personals SET reset_requested_at=NULL WHERE id=?').run(r.user_id);
  await db.prepare('DELETE FROM password_resets WHERE token_hash=?').run(r.token_hash); await killSessions(r.role, r.user_id);
  await newSession(res, r.role, r.user_id); res.json({ ok: true, role: r.role });
});
async function changeOwn(req, res, tbl, min) {
  const u = await db.prepare(`SELECT * FROM ${tbl} WHERE id=?`).get(req.sess.user_id), nova = String(req.body.nova || '');
  if (!u || !(await bcrypt.compare(String(req.body.atual || ''), u.hash))) return res.status(401).json({ error: 'Senha atual incorreta.' });
  if (nova.length < min) return res.status(400).json({ error: `A nova senha precisa ter pelo menos ${min} caracteres.` });
  await db.prepare(`UPDATE ${tbl} SET hash=? WHERE id=?`).run(await bcrypt.hash(nova, 11), u.id);
  await db.prepare('DELETE FROM sessions WHERE role=? AND user_id=? AND token<>?').run(req.sess.role, u.id, req.sess.token); res.json({ ok: true });
}
app.post('/api/personal/password', limit, need('personal'), (req, res) => changeOwn(req, res, 'personals', 8));
app.post('/api/personal/pix', need('personal'), async (req, res) => {
  try { res.json(await tuition.savePix(req.sess.user_id, req.body || {})); }
  catch (e) { res.status(e.status || 400).json({ error: e.message }); }
});
app.get('/api/personal/tuition/:u', need('personal'), async (req, res) => {
  try { res.json(await tuition.detail(req.sess.user_id, req.params.u)); }
  catch (e) { res.status(e.status || 400).json({ error: e.message }); }
});
app.post('/api/personal/tuition/:u', need('personal'), async (req, res) => {
  try { res.json({ ok: true, ...(await tuition.saveStudentFee(req.sess.user_id, req.params.u, req.body || {})) }); }
  catch (e) { res.status(e.status || 400).json({ error: e.message }); }
});
app.post('/api/personal/tuition/:u/confirm', need('personal'), async (req, res) => {
  try { res.json({ ok: true, ...(await tuition.confirm(req.sess.user_id, req.params.u)) }); }
  catch (e) { res.status(e.status || 400).json({ error: e.message }); }
});
app.post('/api/personal/tuition/:u/undo', need('personal'), async (req, res) => {
  try { res.json({ ok: true, ...(await tuition.undo(req.sess.user_id, req.params.u)) }); }
  catch (e) { res.status(e.status || 400).json({ error: e.message }); }
});
app.post('/api/personal/tuition/:u/gate', need('personal'), async (req, res) => {
  try { res.json(await tuition.setGate(req.sess.user_id, req.params.u, String((req.body || {}).acao || ''))); }
  catch (e) { res.status(e.status || 400).json({ error: e.message }); }
});
app.get('/api/student/tuition', need('student'), async (req, res) => {
  try { res.json(await tuition.studentCard(req.sess.user_id)); }
  catch (e) { res.status(e.status || 400).json({ error: e.message }); }
});
app.post('/api/student/tuition/inform', need('student'), async (req, res) => {
  try { res.json({ ok: true, fee: await tuition.inform(req.sess.user_id) }); }
  catch (e) { res.status(e.status || 400).json({ error: e.message }); }
});
app.post('/api/personal/whatsapp', need('personal'), async (req, res) => {
  try { const w = waNorm(req.body.numero); await db.prepare('UPDATE personals SET whatsapp=? WHERE id=?').run(w, req.sess.user_id); res.json({ ok: true, whatsapp: w }); }
  catch (e) { res.status(e.status || 400).json({ error: e.message }); }
});
app.post('/api/student/password', limit, need('student'), (req, res) => changeOwn(req, res, 'students', 6));
// personal redefine a senha de um aluno dele
app.post('/api/personal/student-password', limit, need('personal'), async (req, res) => {
  const s = await db.prepare('SELECT * FROM students WHERE username=? AND personal_id=?').get(String(req.body.usuario || '').trim().toLowerCase(), req.sess.user_id);
  if (!s) return res.status(404).json({ error: 'Aluno não encontrado.' });
  const nova = String(req.body.nova || ''); if (nova.length < 6) return res.status(400).json({ error: 'A nova senha precisa ter pelo menos 6 caracteres.' });
  await db.prepare('UPDATE students SET hash=? WHERE id=?').run(await bcrypt.hash(nova, 11), s.id); await killSessions('student', s.id); res.json({ ok: true });
});
const CUSTOM_GROUPS = new Set(['peito', 'triceps', 'antebraco', 'costas', 'biceps', 'ombro', 'quad', 'post', 'pant', 'gluteo', 'abdomen', 'cardio', 'mobilidade']);
const customClip = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const customList = pid => db.prepare('SELECT id, nome, nota, grupo, series, reps, descanso FROM custom_exercises WHERE personal_id=? ORDER BY nome COLLATE NOCASE, id').all(pid);
app.get('/api/personal/exercises', need('personal'), async (req, res) => {
  res.json({ exercises: await customList(req.sess.user_id) });
});
app.post('/api/personal/exercises', need('personal'), async (req, res) => {
  const body = req.body || {}, nome = customClip(body.nome, 80), nota = customClip(body.nota, 200), grupo = customClip(body.grupo, 40);
  if (nome.length < 2) return res.status(400).json({ error: 'Informe o nome do exercício.' });
  if (!CUSTOM_GROUPS.has(grupo)) return res.status(400).json({ error: 'Esse grupo não faz parte da ficha.' });
  let series = parseInt(body.series, 10); if (!(series >= 1 && series <= 10)) series = 3;
  const reps = customClip(body.reps, 20) || '10–12', descanso = customClip(body.descanso, 20) || '60s', pid = req.sess.user_id;
  const hit = (await customList(pid)).find(x => x.grupo === grupo && x.nome.localeCompare(nome, 'pt-BR', { sensitivity: 'accent' }) === 0);
  if (hit) await db.prepare('UPDATE custom_exercises SET nome=?, nota=?, series=?, reps=?, descanso=? WHERE id=? AND personal_id=?').run(nome, nota, series, reps, descanso, hit.id, pid);
  else await db.prepare('INSERT INTO custom_exercises(personal_id, nome, nota, grupo, series, reps, descanso, created_at) VALUES(?,?,?,?,?,?,?,?)').run(pid, nome, nota, grupo, series, reps, descanso, Date.now());
  res.json({ exercises: await customList(pid) });
});
app.delete('/api/personal/exercises/:id', need('personal'), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'Exercício não encontrado.' });
  const r = await db.prepare('DELETE FROM custom_exercises WHERE id=? AND personal_id=?').run(id, req.sess.user_id);
  if (!r.changes) return res.status(404).json({ error: 'Exercício não encontrado.' });
  res.json({ exercises: await customList(req.sess.user_id) });
});

// ---------- aluno ----------
app.get('/api/invite/:code', async (req, res) => {
  const p = await db.prepare('SELECT id,nome FROM personals WHERE invite_code=?').get(String(req.params.code).toUpperCase());
  if (!p) return res.status(404).json({ error: 'Código de convite inválido.' });
  const sb = await pay.subscriptionOf(p.id), cnt = (await db.prepare('SELECT COUNT(*) n FROM students WHERE personal_id=?').get(p.id)).n;
  res.json({ personal: p.nome, full: !!(sb.limit && cnt >= sb.limit), active: sb.active });
});
app.post('/api/student/signup', limit, async (req, res) => {
  const u = String(req.body.usuario || '').trim().toLowerCase(), nome = String(req.body.nome || '').trim(), pw = String(req.body.senha || '');
  const p = await db.prepare('SELECT * FROM personals WHERE invite_code=?').get(String(req.body.convite || '').trim().toUpperCase());
  if (!p) return res.status(400).json({ error: 'Código de convite inválido. Peça o link ao seu personal.' });
  if (!(await pay.subscriptionOf(p.id)).active) return res.status(402).json({ error: 'A assinatura do seu personal está inativa. Fale com ele.' });
  const sb = await pay.subscriptionOf(p.id), cnt = (await db.prepare('SELECT COUNT(*) n FROM students WHERE personal_id=?').get(p.id)).n;
  if (sb.limit && cnt >= sb.limit) return res.status(403).json({ error: `O seu personal atingiu o limite de ${sb.limit} alunos do plano ${sb.plan_nome}. Peça para ele fazer upgrade do plano para liberar novas vagas.`, code: 'limit' });
  if (!userOk(u)) return res.status(400).json({ error: 'Usuário inválido (mín. 3 letras/números, sem espaços).' });
  if (nome.length < 2) return res.status(400).json({ error: 'Informe seu nome.' });
  if (pw.length < 6) return res.status(400).json({ error: 'A senha precisa ter pelo menos 6 caracteres.' });
  const alturaCm = medidas.altura(req.body.altura), pesoKg = medidas.peso(req.body.peso);
  if (alturaCm == null) return res.status(400).json({ error: 'Informe a altura em centímetros ou em metros. Ex.: 175 ou 1,75.' });
  if (pesoKg == null) return res.status(400).json({ error: 'Informe o peso em quilos. Ex.: 70,5.' });
  if (await db.prepare('SELECT 1 FROM students WHERE username=?').get(u)) return res.status(409).json({ error: 'Esse usuário já existe.' });
  const origin = req.body.origem === 'publico' ? 'publico' : 'convite';
  const r = await db.prepare('INSERT INTO students(personal_id,username,nome,hash,created_at,origin,altura_cm,peso_kg) VALUES(?,?,?,?,?,?,?,?)').run(p.id, u, nome, await bcrypt.hash(pw, 11), Date.now(), origin, alturaCm, pesoKg);
  await newSession(res, 'student', r.lastInsertRowid);
  res.json({ ok: true, pix: origin === 'publico' && (p.fee_cents || 0) > 0 });
});
app.post('/api/student/login', limit, async (req, res) => {
  const s = await db.prepare('SELECT * FROM students WHERE username=?').get(String(req.body.usuario || '').trim().toLowerCase());
  if (!s || !(await bcrypt.compare(String(req.body.senha || ''), s.hash))) return res.status(401).json({ error: 'Usuário ou senha incorretos.' });
  await newSession(res, 'student', s.id); res.json({ ok: true });
});

// ---------- estado (bootstrap do app) ----------
const parse = t => { try { return t ? JSON.parse(t) : null; } catch { return null; } };
app.get('/api/me', async (req, res) => {
  const P = { plans: await pay.plans(), trial_days: pay.TRIAL_DAYS, providers: pay.providers() };
  if (!req.sess) return res.json({ role: null, ...P });
  if (req.sess.role === 'personal') {
    const p = await db.prepare('SELECT * FROM personals WHERE id=?').get(req.sess.user_id); if (!p) return res.json({ role: null, ...P });
    const sub = await pay.subscriptionOf(p.id);
    const paid = await pay.hasPaidAccess(p.id);
    const owner_test = await ownerTest.isOwner(p.id);
    const fees = sub.active ? await tuition.summaryForPersonal(p.id) : {};
    const students = sub.active ? (await db.prepare('SELECT username,nome,ficha,altura_cm,peso_kg FROM students WHERE personal_id=? ORDER BY nome').all(p.id)).map(s => ({ u: s.username, nome: s.nome, ficha: parse(s.ficha), altura_cm: s.altura_cm == null ? null : Number(s.altura_cm), peso_kg: s.peso_kg == null ? null : Number(s.peso_kg), fee: fees[s.username] || { tone: 'none', label: 'Sem mensalidade', origin: 'convite', gate: '' } })) : [];
    const count = (await db.prepare('SELECT COUNT(*) n FROM students WHERE personal_id=?').get(p.id)).n;
    return res.json({ role: 'personal', personal: { ...pubP(p), foto: p.foto || '' }, sub, paid, owner_test, students, count, ...P });
  }
  if (req.sess.role === 'student') {
    const s = await db.prepare('SELECT s.*,p.nome pnome,p.cref pcref,p.whatsapp pzap FROM students s JOIN personals p ON p.id=s.personal_id WHERE s.id=?').get(req.sess.user_id);
    if (!s) return res.json({ role: null, ...P });
    const extra = await tuition.attachStudent(s);
    return res.json({ role: 'student', u: s.username, nome: s.nome, altura_cm: s.altura_cm == null ? null : Number(s.altura_cm), peso_kg: s.peso_kg == null ? null : Number(s.peso_kg), personal: { nome: s.pnome, cref: s.pcref, whatsapp: s.pzap || "" }, active: (await pay.subscriptionOf(s.personal_id)).active, ficha: parse(s.ficha), ...extra, ...P });
  }
  res.json({ role: null, ...P });
});

// salvar ficha: aluno salva a própria; personal salva fichas dos seus alunos
app.put('/api/ficha/:u', async (req, res) => {
  const s = await db.prepare('SELECT * FROM students WHERE username=?').get(String(req.params.u).toLowerCase()); if (!s || !req.sess) return res.status(404).json({ error: 'não encontrado' });
  let F = req.body; if (!F || typeof F !== 'object') return res.status(400).json({ error: 'ficha inválida' });
  if (req.sess.role === 'student') {
    if (req.sess.user_id !== s.id) return res.status(403).json({ error: 'proibido' });
    if (!(await pay.subscriptionOf(s.personal_id)).active) return res.status(402).json({ error: 'Assinatura do personal inativa.' });
    const old = parse(s.ficha) || {};
    // o aluno não pode se autoaprovar nem mudar a revisão
    if (F.status === 'aprovado' && old.status !== 'aprovado') { F.status = old.status || 'pendente'; F.aprov = old.aprov || null; }
    if (F.status === 'aprovado') { F.aprov = old.aprov; F.plan = old.plan; }
    // divisão e troca de hoje são do personal: o aluno não altera o plano do colega nem o de outro personal
    if (old.plan && ((old.plan.split && old.plan.split.custom) || old.plan.swapHoje)) F.plan = old.plan;
    F.rev = old.rev || null;
  } else if (req.sess.role === 'personal') {
    if (req.sess.user_id !== s.personal_id) return res.status(403).json({ error: 'proibido' });
    if (!(await pay.subscriptionOf(s.personal_id)).active) return res.status(402).json({ error: 'Assinatura inativa.' });
    if (F.status === 'aprovado') await tuition.clearGateOnApprove(s.id);
  } else return res.status(403).json({ error: 'proibido' });
  await db.prepare('UPDATE students SET ficha=?,updated_at=? WHERE id=?').run(JSON.stringify(F), Date.now(), s.id); res.json({ ok: true });
});

// ---------- pagamentos ----------
app.post('/api/billing/checkout', need('personal'), async (req, res) => {
  try { const p = await db.prepare('SELECT * FROM personals WHERE id=?').get(req.sess.user_id); const plan = String(req.body.plano || 'pro'); await pay.planOf(plan);
    const cnt = (await db.prepare('SELECT COUNT(*) n FROM students WHERE personal_id=?').get(p.id)).n, L = (await pay.plans())[plan].limit;
    if (L && cnt > L) throw new Error(`Você tem ${cnt} alunos; o plano ${(await pay.plans())[plan].nome} permite ${L}. Escolha um plano maior.`);
    res.json(await pay.checkout(req, p, String(req.body.method || 'demo'), plan)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
// trocar de plano: upgrade de assinatura paga exige pagar o novo plano; downgrade bloqueado se passar do limite
app.post('/api/billing/plan', need('personal'), async (req, res) => {
  try {
    const id = req.sess.user_id, plan = String(req.body.plano || ''), P = await pay.plans(), NP = await pay.planOf(plan), sub = await pay.subscriptionOf(id);
    const cnt = (await db.prepare('SELECT COUNT(*) n FROM students WHERE personal_id=?').get(id)).n;
    if (NP.limit && cnt > NP.limit) return res.status(409).json({ error: `Não dá para mudar para o ${NP.nome}: você tem ${cnt} alunos e o limite é ${NP.limit}. Remova alunos ou escolha outro plano.` });
    if (!sub.active) return res.status(402).json({ error: 'Assine um plano primeiro.' });
    if (sub.plan === plan) return res.json({ ok: true });
    const up = NP.price_cents > P[sub.plan].price_cents;
    if (sub.trial || !up) {
      if (sub.trial) {
        await db.prepare("UPDATE subscriptions SET plan=? WHERE id=(SELECT id FROM subscriptions WHERE personal_id=? ORDER BY id DESC LIMIT 1)").run(plan, id);
        await db.prepare('UPDATE personals SET plan=? WHERE id=?').run(plan, id);
      } else await pay.changeRecurring(id, plan);
      return res.json({ ok: true, changed: true });
    }
    res.json({ ok: true, needCheckout: true }); // upgrade de plano pago: o front leva ao pagamento do novo plano
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/webhooks/mercadopago', async (req, res) => { try { await pay.mpWebhook(req); res.sendStatus(200); } catch (e) { console.error('MP webhook', e.message); res.sendStatus(400); } });
app.post('/api/webhooks/stripe', async (req, res) => { try { await pay.stripeWebhook(req); res.sendStatus(200); } catch (e) { console.error('Stripe webhook', e.message); res.sendStatus(400); } });

// ---------- admin (dono) ----------
function admin(req, res, next) {
  const [u, p] = Buffer.from(String(req.get('authorization') || '').replace(/^Basic /, ''), 'base64').toString().split(':');
  const E = process.env.ADMIN_EMAIL, PW = process.env.ADMIN_PASSWORD;
  const eq = (a, b) => a && b && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  if (E && PW && eq(u, E) && eq(p, PW)) return next();
  res.set('WWW-Authenticate', 'Basic realm="admin"').status(401).send(E ? 'Login do administrador' : 'Defina ADMIN_EMAIL e ADMIN_PASSWORD para usar o painel admin.');
}
app.get('/api/admin/summary', admin, async (req, res) => {
  const rows = await db.prepare('SELECT p.id,p.nome,p.email,p.cref,p.created_at,p.reset_requested_at,(SELECT COUNT(*) FROM students s WHERE s.personal_id=p.id) alunos FROM personals p ORDER BY p.created_at DESC').all();
  const ps = await Promise.all(rows.map(async p => ({ ...p, sub: await pay.subscriptionOf(p.id) })));
  const rev = await db.prepare("SELECT COALESCE(SUM(amount_cents),0) total, COALESCE(SUM(CASE WHEN test=0 THEN amount_cents END),0) real FROM payments WHERE status='approved'").get();
  const mes = await db.prepare("SELECT COALESCE(SUM(CASE WHEN test=0 THEN amount_cents END),0) real, COALESCE(SUM(amount_cents),0) total FROM payments WHERE status='approved' AND created_at>?").get(Date.now() - 30 * DAY);
  const byPlan = await db.prepare("SELECT plan, COUNT(*) n, COALESCE(SUM(CASE WHEN test=0 THEN amount_cents END),0) real, COALESCE(SUM(amount_cents),0) total FROM payments WHERE status='approved' GROUP BY plan").all();
  const pays = await db.prepare('SELECT pa.*,p.email FROM payments pa JOIN personals p ON p.id=pa.personal_id ORDER BY pa.created_at DESC LIMIT 100').all();
  res.json({ plans: await pay.plans(), byPlan, personals: ps, revenue: rev, last30: mes, payments: pays, providers: pay.providers(), ativos: ps.filter(p => p.sub.active).length });
});
app.post('/api/admin/reset-link', admin, async (req, res) => { const p = await db.prepare('SELECT id,email FROM personals WHERE id=?').get(+req.body.personal_id); if (!p) return res.status(404).json({ error: 'Personal não encontrado.' }); res.json({ ok: true, email: p.email, link: await makeReset(req, 'personal', p.id), expira_em_min: 60 }); });
app.post('/api/admin/plans', admin, async (req, res) => { try { res.json({ ok: true, plans: await pay.setPlans(req.body || {}) }); } catch (e) { res.status(400).json({ error: e.message }); } });
app.get('/admin', admin, (_q, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/teste-voz', (_q, res) => res.sendFile(path.join(__dirname, 'public', 'teste-voz.html')));

function onlyPersonal(req, res, next) {
  if (!req.sess) return res.status(401).json({ error: 'Faça login.' });
  if (req.sess.role !== 'personal') return res.status(403).json({ error: 'Só o personal pode ver os cards de estudo.' });
  next();
}
app.get('/api/cards', onlyPersonal, async (req, res) => {
  const sub = await pay.subscriptionOf(req.sess.user_id);
  const paid = await pay.hasPaidAccess(req.sess.user_id);
  const owner = await ownerTest.isOwner(req.sess.user_id);
  res.json({
    plan: sub.plan, plan_nome: sub.plan_nome, trial: !!sub.trial, paid: owner || paid, owner_test: owner,
    cards: cards.CARDS.map(c => ({ id: c.n, titulo: c.titulo, regiao: c.regiao, plano: c.plano, locked: owner ? false : cards.cardLocked(c, sub.plan, paid) })),
  });
});
const TUTOS = { link: '01-convidar.mp4', aprovar: '02-aprovar.mp4', dias: '03-dias.mp4', troca: '04-troca.mp4', pix: '05-pix.mp4', mensalidade: '08-mensalidade.mp4', cards: '06-cards.mp4', acesso: '07-whatsapp-senhas.mp4' };
app.get('/api/tutoriais/:id', need('personal'), (req, res) => {
  const file = TUTOS[req.params.id];
  if (!file) return res.status(404).json({ error: 'Vídeo não encontrado.' });
  res.set('Cache-Control', 'private, no-store');
  res.sendFile(path.join(__dirname, 'tutoriais', file), { acceptRanges: true });
});
app.get('/api/ebook', async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  if (!req.sess) return res.status(401).json({ error: 'Faça login.' });
  if (req.sess.role !== 'personal') return res.status(403).json({ error: 'Só o personal pode abrir o ebook.' });
  const sub = await pay.subscriptionOf(req.sess.user_id);
  const paid = await pay.hasPaidAccess(req.sess.user_id);
  const owner = await ownerTest.isOwner(req.sess.user_id);
  const g = owner ? { open: true } : ebook.gate(sub, paid);
  if (!g.open) return res.status(403).json({ error: g.message });
  res.set('Content-Disposition', 'inline; filename="guia-pratico-dos-exercicios.pdf"');
  res.type('pdf');
  res.sendFile(ebook.file());
});
app.get('/api/cards/:id/img', onlyPersonal, async (req, res) => {
  const card = cards.CARDS.find(c => c.n === +req.params.id);
  if (!card) return res.status(404).json({ error: 'Card não encontrado.' });
  const sub = await pay.subscriptionOf(req.sess.user_id);
  const paid = await pay.hasPaidAccess(req.sess.user_id);
  const owner = await ownerTest.isOwner(req.sess.user_id);
  if (!owner && cards.cardLocked(card, sub.plan, paid)) return res.status(403).json({ error: cards.cardLockError(sub.plan, paid) });
  res.set('Cache-Control', 'private, max-age=86400');
  res.type('jpg');
  res.sendFile(cards.cardFile(card));
});

app.use(express.static(path.join(__dirname, 'public'), { index: 'index.html' }));
app.get('/redefinir', (_q, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/convite/:code', (_q, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/p/:code', async (req, res) => {
  try {
    const code = String(req.params.code || '').toUpperCase();
    const p = await db.prepare('SELECT * FROM personals WHERE invite_code=?').get(code);
    if (!p) return res.status(404).send('Link não encontrado.');
    const sb = await pay.subscriptionOf(p.id);
    const cnt = (await db.prepare('SELECT COUNT(*) n FROM students WHERE personal_id=?').get(p.id)).n;
    res.type('html').send(publicPage.page({ nome: p.nome, bio: p.bio || '', foto: p.foto || '', fee_cents: p.fee_cents || 0, active: !!sb.active, full: !!(sb.limit && cnt >= sb.limit), code }));
  } catch (e) { res.status(500).send('Não foi possível abrir este link.'); }
});
setInterval(() => { db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now()).catch(e => console.error('limpeza de sessões', e.message)); }, 3600e3).unref();
const PORT = process.env.PORT || 3000;
if (require.main === module) {
  db.ready.then(() => {
    app.listen(PORT, () => console.log(`Shape de Qualidade rodando em http://localhost:${PORT} [banco ${db.driver}]` + (pay.providers().demo ? '  [MODO TESTE/DEMO: pagamentos simulados]' : '')));
  }).catch(e => { console.error('banco', e); process.exit(1); });
}
module.exports = app;
