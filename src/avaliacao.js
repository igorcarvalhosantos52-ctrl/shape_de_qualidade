// Avaliação física do aluno. As fotos ficam no banco (o disco do Render é efêmero).
const db = require('./db');

const CAMPOS = [
  { key: 'peso', nome: 'Peso', un: 'kg', min: 20, max: 400 },
  { key: 'gordura', nome: 'Gordura', un: '%', min: 1, max: 80 },
  { key: 'pescoco', nome: 'Pescoço', un: 'cm', min: 5, max: 250 },
  { key: 'ombros', nome: 'Ombros', un: 'cm', min: 5, max: 250 },
  { key: 'torax', nome: 'Peito/tórax', un: 'cm', min: 5, max: 250 },
  { key: 'cintura', nome: 'Cintura', un: 'cm', min: 5, max: 250 },
  { key: 'abdomen', nome: 'Abdômen', un: 'cm', min: 5, max: 250 },
  { key: 'quadril', nome: 'Quadril', un: 'cm', min: 5, max: 250 },
  { key: 'braco_d', nome: 'Braço direito', un: 'cm', min: 5, max: 250 },
  { key: 'braco_e', nome: 'Braço esquerdo', un: 'cm', min: 5, max: 250 },
  { key: 'antebraco_d', nome: 'Antebraço direito', un: 'cm', min: 5, max: 250 },
  { key: 'antebraco_e', nome: 'Antebraço esquerdo', un: 'cm', min: 5, max: 250 },
  { key: 'coxa_d', nome: 'Coxa direita', un: 'cm', min: 5, max: 250 },
  { key: 'coxa_e', nome: 'Coxa esquerda', un: 'cm', min: 5, max: 250 },
  { key: 'panturrilha_d', nome: 'Panturrilha direita', un: 'cm', min: 5, max: 250 },
  { key: 'panturrilha_e', nome: 'Panturrilha esquerda', un: 'cm', min: 5, max: 250 },
];
const CAI = new Set(['gordura', 'cintura', 'abdomen']);
const FOTO_MAX = 220 * 1024;

function fail(status, message) { const e = new Error(message); e.status = status; throw e; }

function parseValor(raw, min, max) {
  if (raw == null || String(raw).trim() === '') return null;
  const s = String(raw).trim().replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(s)) return undefined;
  const n = Math.round(Number(s) * 10) / 10;
  if (!(n >= min && n <= max)) return undefined;
  return n;
}

function fotoOk(foto) {
  if (foto == null || String(foto).trim() === '') return '';
  const s = String(foto).replace(/\s/g, '');
  const m = /^data:image\/(jpeg|png|webp);base64,([a-z0-9+/=]+)$/i.exec(s);
  if (!m) return null;
  const bytes = Math.floor(m[2].length * 3 / 4);
  if (bytes < 32 || bytes > FOTO_MAX) return null;
  return 'data:' + m[1].toLowerCase() + ';base64,' + m[2];
}

function fmtNum(n) {
  const x = Math.round(Number(n) * 10) / 10;
  if (Math.abs(x - Math.round(x)) < 1e-6) return String(Math.round(x));
  return x.toFixed(1).replace('.', ',');
}

function tempoTexto(isoA, isoB) {
  const da = new Date(isoA + 'T00:00:00'), db = new Date(isoB + 'T00:00:00');
  const ini = da <= db ? da : db, fim = da <= db ? db : da;
  let months = (fim.getFullYear() - ini.getFullYear()) * 12 + (fim.getMonth() - ini.getMonth());
  if (fim.getDate() < ini.getDate()) months -= 1;
  if (months <= 0) {
    const dias = Math.round((fim - ini) / 864e5);
    if (dias <= 0) return 'mesmo dia';
    if (dias === 1) return '1 dia';
    return dias + ' dias';
  }
  const anos = Math.floor(months / 12), rest = months % 12, p = [];
  if (anos === 1) p.push('1 ano');
  else if (anos > 1) p.push(anos + ' anos');
  if (rest === 1) p.push('1 mês');
  else if (rest > 1) p.push(rest + ' meses');
  return p.join(' e ');
}

function ordenar(rows) {
  return rows.slice().sort((a, b) => String(a.taken_on).localeCompare(String(b.taken_on)) || (a.created_at - b.created_at) || (a.id - b.id));
}

function publico(row) {
  const o = { id: row.id, taken_on: row.taken_on, kind: row.kind, created_at: row.created_at, has_photo: !!(row.photo && String(row.photo).length > 20) };
  for (const c of CAMPOS) o[c.key] = row[c.key] == null ? null : Number(row[c.key]);
  return o;
}

function comparar(rows) {
  if (!rows.length) return null;
  const ord = ordenar(rows);
  const inicial = rows.find(r => r.kind === 'inicial') || ord[0];
  const recente = ord.filter(r => r.id !== inicial.id).pop() || null;
  if (!recente) return null;
  const aIso = String(inicial.taken_on), bIso = String(recente.taken_on);
  const linhas = [];
  for (const c of CAMPOS) {
    const a = inicial[c.key] == null ? null : Number(inicial[c.key]);
    const b = recente[c.key] == null ? null : Number(recente[c.key]);
    if (a == null || b == null) continue;
    const dif = Math.round((b - a) * 10) / 10;
    const sinal = dif < 0 ? '−' : dif > 0 ? '+' : '';
    const tom = dif < 0 && CAI.has(c.key) ? 'ok' : '';
    linhas.push({ k: c.key, nome: c.nome, un: c.un, de: a, para: b, dif, tom, texto: c.nome + ' ' + fmtNum(a) + ' → ' + fmtNum(b) + ' ' + c.un + ' (' + sinal + fmtNum(Math.abs(dif)) + ')' });
  }
  return {
    tempo: tempoTexto(aIso, bIso),
    de: aIso,
    para: bIso,
    antes_id: inicial.photo ? inicial.id : null,
    depois_id: recente.photo ? recente.id : null,
    linhas,
  };
}

async function rowsOf(personalId, studentId) {
  return db.prepare('SELECT * FROM assessments WHERE student_id=? AND personal_id=?').all(studentId, personalId);
}

async function aluno(personalId, username) {
  const u = String(username || '').toLowerCase();
  if (!u) return null;
  return db.prepare('SELECT id FROM students WHERE username=? AND personal_id=?').get(u, personalId);
}

async function listar(personalId, username) {
  const s = await aluno(personalId, username);
  if (!s) fail(404, 'Aluno não encontrado.');
  const rows = await rowsOf(personalId, s.id);
  return { items: ordenar(rows).map(publico), compare: comparar(rows), campos: CAMPOS.map(c => ({ k: c.key, nome: c.nome, un: c.un })) };
}

async function salvar(personalId, username, body) {
  const s = await aluno(personalId, username);
  if (!s) fail(404, 'Aluno não encontrado.');
  const b = body || {};
  const kind = b.kind === 'atual' ? 'atual' : b.kind === 'inicial' ? 'inicial' : '';
  if (!kind) fail(400, 'Escolha medida inicial ou atual.');
  const taken = String(b.taken_on || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(taken)) fail(400, 'Data inválida.');
  const [yy, mm, dd] = taken.split('-').map(Number);
  const dt = new Date(Date.UTC(yy, mm - 1, dd));
  if (dt.getUTCFullYear() !== yy || dt.getUTCMonth() !== mm - 1 || dt.getUTCDate() !== dd || yy < 1990 || yy > 2100) fail(400, 'Data inválida.');
  const vals = {};
  for (const c of CAMPOS) {
    const v = parseValor(b[c.key], c.min, c.max);
    if (v === undefined) fail(400, 'Confira o valor de ' + c.nome + '.');
    vals[c.key] = v;
  }
  let photo;
  if (Object.prototype.hasOwnProperty.call(b, 'photo')) {
    photo = fotoOk(b.photo);
    if (photo == null) fail(400, 'A foto precisa ser uma imagem de até 200 KB.');
  }
  const algum = CAMPOS.some(c => vals[c.key] != null);
  const atual = kind === 'inicial' ? await db.prepare("SELECT * FROM assessments WHERE student_id=? AND personal_id=? AND kind='inicial'").get(s.id, personalId) : null;
  const ph = photo === undefined ? (atual && atual.photo) || '' : photo;
  if (!algum && !ph) fail(400, 'Informe ao menos uma medida.');
  const cols = CAMPOS.map(c => vals[c.key]);
  if (atual) {
    await db.prepare('UPDATE assessments SET taken_on=?,peso=?,gordura=?,pescoco=?,ombros=?,torax=?,cintura=?,abdomen=?,quadril=?,braco_d=?,braco_e=?,antebraco_d=?,antebraco_e=?,coxa_d=?,coxa_e=?,panturrilha_d=?,panturrilha_e=?,photo=? WHERE id=? AND personal_id=?')
      .run(taken, ...cols, ph, atual.id, personalId);
  } else {
    await db.prepare('INSERT INTO assessments(student_id,personal_id,taken_on,kind,peso,gordura,pescoco,ombros,torax,cintura,abdomen,quadril,braco_d,braco_e,antebraco_d,antebraco_e,coxa_d,coxa_e,panturrilha_d,panturrilha_e,photo,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(s.id, personalId, taken, kind, ...cols, ph, Date.now());
  }
  return listar(personalId, username);
}

async function lerFoto(personalId, id) {
  const n = parseInt(id, 10);
  if (!n) return null;
  const row = await db.prepare('SELECT photo FROM assessments WHERE id=? AND personal_id=?').get(n, personalId);
  if (!row || !row.photo) return null;
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([a-z0-9+/=]+)$/i.exec(String(row.photo).replace(/\s/g, ''));
  if (!m) return null;
  return { type: m[1].toLowerCase(), buf: Buffer.from(m[2], 'base64') };
}

async function apagar(studentId) {
  await db.prepare('DELETE FROM assessments WHERE student_id=?').run(studentId);
}

module.exports = { CAMPOS, listar, salvar, lerFoto, apagar, comparar, tempoTexto };
