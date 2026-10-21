// Mensalidade do aluno, paga no Pix do próprio personal. Não há consulta ao banco.
const QRCode = require('qrcode');
const db = require('./db');
const pix = require('./pix');

function bad(msg, status) { const e = new Error(msg); e.status = status || 400; throw e; }
const now = () => Date.now();

async function rowOf(studentId) {
  return db.prepare('SELECT * FROM tuition WHERE student_id=?').get(studentId);
}
function resolved(personal, row) {
  if (row && row.exempt) return null;
  const amount = row && row.amount_cents > 0 ? row.amount_cents : (personal.fee_cents || 0);
  const day = row && row.due_day >= 1 ? row.due_day : (personal.fee_day || 0);
  if (!(amount > 0) || !(day >= 1 && day <= 31)) return null;
  return { amount_cents: amount, due_day: day, paid_through: row && row.paid_through, informed_for: row && row.informed_for, informed_at: row && row.informed_at };
}
function viewOf(personal, row) {
  const r = resolved(personal, row);
  if (!r) return { tone: 'none', label: 'Sem mensalidade', amount_cents: 0, informed: false };
  return pix.cycle(r);
}
function pixReady(p) {
  return !!(p && p.pix_chave && pix.pixText(p.pix_nome, 25) && pix.pixText(p.pix_cidade, 15));
}
function pixPublic(p) {
  if (!p) return null;
  return { tipo: p.pix_tipo || '', chave: p.pix_chave || '', nome: p.pix_nome || '', cidade: p.pix_cidade || '', fee_cents: p.fee_cents || 0, fee_day: p.fee_day || 0, bio: p.bio || '' };
}

async function savePix(personalId, body) {
  const b = body || {};
  let tipo = '', chave = '';
  if (String(b.chave || '').trim()) ({ tipo, chave } = pix.normKey(b.tipo, b.chave));
  const nome = String(b.nome || '').trim().slice(0, 60);
  const cidade = String(b.cidade || '').trim().slice(0, 40);
  if (chave && (!pix.pixText(nome, 25) || !pix.pixText(cidade, 15))) bad('Informe o nome de quem recebe e a cidade. Eles entram no código Pix.');
  const fee_cents = pix.moneyToCents(b.valor);
  let fee_day = String(b.dia || '').trim() === '' ? 0 : parseInt(b.dia, 10);
  if (fee_cents && !(fee_day >= 1 && fee_day <= 31)) bad('Escolha o dia de vencimento, de 1 a 31.');
  if (!fee_cents) fee_day = fee_day >= 1 && fee_day <= 31 ? fee_day : 0;
  const bio = String(b.bio || '').trim().slice(0, 280);
  let foto = b.foto == null ? null : String(b.foto || '');
  if (foto != null) {
    if (foto && !/^data:image\/(jpeg|png|webp);base64,[a-z0-9+/=\s]+$/i.test(foto)) bad('A foto precisa ser uma imagem.');
    if (foto.length > 180000) bad('A foto está grande demais. Escolha uma menor.');
  }
  if (foto == null) {
    await db.prepare('UPDATE personals SET pix_tipo=?,pix_chave=?,pix_nome=?,pix_cidade=?,fee_cents=?,fee_day=?,bio=? WHERE id=?').run(tipo, chave, nome, cidade, fee_cents, fee_day, bio, personalId);
  } else {
    await db.prepare('UPDATE personals SET pix_tipo=?,pix_chave=?,pix_nome=?,pix_cidade=?,fee_cents=?,fee_day=?,bio=?,foto=? WHERE id=?').run(tipo, chave, nome, cidade, fee_cents, fee_day, bio, foto, personalId);
  }
  const p = await db.prepare('SELECT * FROM personals WHERE id=?').get(personalId);
  return { ok: true, pix: pixPublic(p), has_foto: !!(p && p.foto) };
}

async function ensureRow(studentId) {
  if (!(await rowOf(studentId))) await db.prepare('INSERT INTO tuition(student_id,exempt) VALUES(?,0)').run(studentId);
}
async function ownStudent(personalId, username) {
  const s = await db.prepare('SELECT * FROM students WHERE username=? AND personal_id=?').get(String(username || '').toLowerCase(), personalId);
  if (!s) bad('Aluno não encontrado.', 404);
  return s;
}

async function saveStudentFee(personalId, username, body) {
  const s = await ownStudent(personalId, username);
  const b = body || {};
  await ensureRow(s.id);
  if (b.nao_cobrar) {
    await db.prepare('UPDATE tuition SET amount_cents=NULL,due_day=NULL,exempt=1 WHERE student_id=?').run(s.id);
  } else if (String(b.valor || '').trim() === '' && String(b.dia || '').trim() === '') {
    await db.prepare('UPDATE tuition SET amount_cents=NULL,due_day=NULL,exempt=0 WHERE student_id=?').run(s.id);
  } else {
    const cents = pix.moneyToCents(b.valor);
    const day = parseInt(b.dia, 10);
    if (!(cents > 0)) bad('Informe o valor da mensalidade deste aluno, ou deixe em branco para usar o valor público.');
    if (!(day >= 1 && day <= 31)) bad('Escolha o dia de vencimento, de 1 a 31.');
    await db.prepare('UPDATE tuition SET amount_cents=?,due_day=?,exempt=0 WHERE student_id=?').run(cents, day, s.id);
  }
  return feeState(personalId, s.id);
}

async function feeState(personalId, studentId) {
  const p = await db.prepare('SELECT * FROM personals WHERE id=?').get(personalId);
  const row = await rowOf(studentId);
  const fee = viewOf(p, row);
  const custom = !!(row && (row.exempt || row.amount_cents > 0));
  return { fee, custom, exempt: !!(row && row.exempt) };
}

async function inform(studentId) {
  const s = await db.prepare('SELECT * FROM students WHERE id=?').get(studentId);
  if (!s) bad('Aluno não encontrado.', 404);
  const p = await db.prepare('SELECT * FROM personals WHERE id=?').get(s.personal_id);
  const row = await rowOf(s.id);
  const base = resolved(p, row);
  if (!base) bad('Seu personal ainda não definiu a mensalidade.');
  const cur = pix.cycle(base);
  if (cur.tone === 'ok') bad('Este ciclo já está pago.');
  await ensureRow(s.id);
  await db.prepare('UPDATE tuition SET informed_for=?,informed_at=? WHERE student_id=?').run(cur.due, now(), s.id);
  return (await feeState(s.personal_id, s.id)).fee;
}

async function confirm(personalId, username) {
  const s = await ownStudent(personalId, username);
  const p = await db.prepare('SELECT * FROM personals WHERE id=?').get(personalId);
  const row = (await rowOf(s.id)) || {};
  const base = resolved(p, row);
  if (!base) bad('Defina o valor da mensalidade antes de confirmar.');
  const cur = pix.cycle(base);
  if (cur.tone === 'ok') bad('Este ciclo já está pago.');
  await ensureRow(s.id);
  const informedAt = row.informed_for === cur.due ? row.informed_at : null;
  await db.prepare('INSERT INTO tuition_payments(student_id,due_on,amount_cents,informed_at,confirmed_at,undone,created_at) VALUES(?,?,?,?,?,0,?)').run(s.id, cur.due, cur.amount_cents, informedAt, now(), now());
  await db.prepare('UPDATE tuition SET paid_through=?,informed_for=NULL,informed_at=NULL WHERE student_id=?').run(cur.due, s.id);
  return feeState(personalId, s.id);
}

async function undo(personalId, username) {
  const s = await ownStudent(personalId, username);
  const last = await db.prepare('SELECT * FROM tuition_payments WHERE student_id=? AND undone=0 ORDER BY id DESC LIMIT 1').get(s.id);
  if (!last) bad('Não há recebimento para desfazer.');
  await db.prepare('UPDATE tuition_payments SET undone=1 WHERE id=?').run(last.id);
  const prev = await db.prepare('SELECT due_on FROM tuition_payments WHERE student_id=? AND undone=0 ORDER BY id DESC LIMIT 1').get(s.id);
  await ensureRow(s.id);
  await db.prepare('UPDATE tuition SET paid_through=?,informed_for=?,informed_at=? WHERE student_id=?').run(prev ? prev.due_on : null, last.informed_at ? last.due_on : null, last.informed_at || null, s.id);
  return feeState(personalId, s.id);
}

async function history(studentId) {
  const rows = await db.prepare('SELECT due_on,amount_cents,informed_at,confirmed_at,undone FROM tuition_payments WHERE student_id=? ORDER BY id DESC LIMIT 24').all(studentId);
  return rows.map(r => ({ due_on: r.due_on, due_br: pix.brDate(r.due_on), amount_cents: r.amount_cents, informed_at: r.informed_at || null, confirmed_at: r.confirmed_at || null, undone: !!r.undone }));
}

async function detail(personalId, username) {
  const s = await ownStudent(personalId, username);
  const st = await feeState(personalId, s.id);
  const p = await db.prepare('SELECT * FROM personals WHERE id=?').get(personalId);
  return { ...st, origin: s.origin || 'convite', gate: s.gate || '', pix_ok: pixReady(p), history: await history(s.id) };
}

async function setGate(personalId, username, acao) {
  const s = await ownStudent(personalId, username);
  if ((s.origin || 'convite') !== 'publico') bad('Quem entrou pelo convite direto você aprova na ficha, como sempre.');
  if (acao === 'recusar') await db.prepare("UPDATE students SET gate='recusado' WHERE id=?").run(s.id);
  else if (acao === 'reabrir') await db.prepare("UPDATE students SET gate='' WHERE id=?").run(s.id);
  else bad('Ação inválida.');
  return { ok: true, gate: acao === 'recusar' ? 'recusado' : '' };
}

async function studentCard(studentId) {
  const s = await db.prepare('SELECT * FROM students WHERE id=?').get(studentId);
  if (!s) bad('Aluno não encontrado.', 404);
  const p = await db.prepare('SELECT * FROM personals WHERE id=?').get(s.personal_id);
  const fee = viewOf(p, await rowOf(s.id));
  const out = { fee, pix_ok: pixReady(p), chave: '', tipo: '', payload: '', qr: '' };
  if (fee.tone === 'ok') return { fee, pix_ok: false, chave: '', tipo: '', payload: '', qr: '' };
  if (fee.amount_cents && pixReady(p)) {
    out.chave = p.pix_chave;
    out.tipo = p.pix_tipo;
    out.payload = pix.payload({ chave: p.pix_chave, nome: p.pix_nome, cidade: p.pix_cidade, cents: fee.amount_cents, txid: '***' });
    if (out.payload) out.qr = await QRCode.toDataURL(out.payload, { errorCorrectionLevel: 'M', margin: 1, width: 280 });
  }
  return out;
}

async function summaryForPersonal(personalId) {
  const p = await db.prepare('SELECT * FROM personals WHERE id=?').get(personalId);
  const students = await db.prepare('SELECT id,username,origin,gate FROM students WHERE personal_id=?').all(personalId);
  const rows = await db.prepare('SELECT t.* FROM tuition t JOIN students s ON s.id=t.student_id WHERE s.personal_id=?').all(personalId);
  const byId = {};
  rows.forEach(r => { byId[r.student_id] = r; });
  const map = {};
  students.forEach(s => { map[s.username] = { ...viewOf(p, byId[s.id]), origin: s.origin || 'convite', gate: s.gate || '' }; });
  return map;
}

async function attachStudent(s) {
  const p = await db.prepare('SELECT * FROM personals WHERE id=?').get(s.personal_id);
  const fee = viewOf(p, await rowOf(s.id));
  return { origin: s.origin || 'convite', gate: s.gate || '', fee, pix_ok: pixReady(p) };
}

function clearGateOnApprove(studentId) {
  return db.prepare("UPDATE students SET gate='' WHERE id=? AND gate='recusado'").run(studentId);
}

module.exports = { savePix, pixPublic, viewOf, summaryForPersonal, attachStudent, saveStudentFee, inform, confirm, undo, detail, setGate, studentCard, clearGateOnApprove, pixReady };
