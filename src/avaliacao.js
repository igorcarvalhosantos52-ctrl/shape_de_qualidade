// Avaliação física do aluno. As fotos ficam no banco (o disco do Render é efêmero).
const db = require('./db');

const CAMPOS = [
  { key: 'peso', nome: 'Peso', un: 'kg', min: 20, max: 400, grupo: 'base' },
  { key: 'gordura', nome: 'Gordura', un: '%', min: 1, max: 80, grupo: 'base' },
  { key: 'dobra_tricipital', nome: 'Tricipital', un: 'mm', min: 1, max: 80, grupo: 'dobra' },
  { key: 'dobra_bicipital', nome: 'Bicipital', un: 'mm', min: 1, max: 80, grupo: 'dobra' },
  { key: 'dobra_abdominal', nome: 'Abdominal', un: 'mm', min: 1, max: 80, grupo: 'dobra' },
  { key: 'dobra_subescapular', nome: 'Subescapular', un: 'mm', min: 1, max: 80, grupo: 'dobra' },
  { key: 'dobra_coxa', nome: 'Coxa', un: 'mm', min: 1, max: 80, grupo: 'dobra' },
  { key: 'dobra_toracica', nome: 'Torácica (peitoral)', un: 'mm', min: 1, max: 80, grupo: 'dobra' },
  { key: 'dobra_suprailiaca', nome: 'Suprailíaca', un: 'mm', min: 1, max: 80, grupo: 'dobra' },
  { key: 'dobra_axilar', nome: 'Axilar média', un: 'mm', min: 1, max: 80, grupo: 'dobra' },
  { key: 'pescoco', nome: 'Pescoço', un: 'cm', min: 5, max: 250, grupo: 'circ' },
  { key: 'ombros', nome: 'Ombros', un: 'cm', min: 5, max: 250, grupo: 'circ' },
  { key: 'torax', nome: 'Peito/tórax', un: 'cm', min: 5, max: 250, grupo: 'circ' },
  { key: 'cintura', nome: 'Cintura', un: 'cm', min: 5, max: 250, grupo: 'circ' },
  { key: 'abdomen', nome: 'Abdômen', un: 'cm', min: 5, max: 250, grupo: 'circ' },
  { key: 'quadril', nome: 'Quadril', un: 'cm', min: 5, max: 250, grupo: 'circ' },
  { key: 'braco_d', nome: 'Braço direito', un: 'cm', min: 5, max: 250, grupo: 'circ' },
  { key: 'braco_e', nome: 'Braço esquerdo', un: 'cm', min: 5, max: 250, grupo: 'circ' },
  { key: 'antebraco_d', nome: 'Antebraço direito', un: 'cm', min: 5, max: 250, grupo: 'circ' },
  { key: 'antebraco_e', nome: 'Antebraço esquerdo', un: 'cm', min: 5, max: 250, grupo: 'circ' },
  { key: 'coxa_d', nome: 'Coxa direita', un: 'cm', min: 5, max: 250, grupo: 'circ' },
  { key: 'coxa_e', nome: 'Coxa esquerda', un: 'cm', min: 5, max: 250, grupo: 'circ' },
  { key: 'panturrilha_d', nome: 'Panturrilha direita', un: 'cm', min: 5, max: 250, grupo: 'circ' },
  { key: 'panturrilha_e', nome: 'Panturrilha esquerda', un: 'cm', min: 5, max: 250, grupo: 'circ' },
];
const CAI = new Set(['gordura', 'cintura', 'abdomen', ...CAMPOS.filter(c => c.grupo === 'dobra').map(c => c.key)]);
const GOAL = { hipertrofia: 'Hipertrofia', emagrecimento: 'Emagrecimento', forca: 'Força', condicionamento: 'Condicionamento', mobilidade: 'Mobilidade', saude: 'Saúde e qualidade de vida', outro: 'Outro' };
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

function sexoOk(raw) {
  if (raw == null || String(raw).trim() === '') return '';
  const s = String(raw).trim().toUpperCase();
  if (s === 'M' || s === 'F') return s;
  return undefined;
}

function fotoOk(foto) {
  if (foto == null || String(foto).trim() === '') return '';
  const s = String(foto).replace(/\s/g, '');
  const m = /^data:image\/(jpeg|png|webp);base64,([a-z0-9+/=]+)$/i.exec(s);
  if (!m) return null;
  const bytes = Math.floor(m[2].length * 3 / 4);
  if (bytes < 32 || bytes > FOTO_MAX) return null;
  return 'data:image/' + m[1].toLowerCase() + ';base64,' + m[2];
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

function fichaA(raw) {
  if (!raw) return {};
  try {
    const f = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return f && f.a && typeof f.a === 'object' ? f.a : {};
  } catch (e) { return {}; }
}

function listaDias(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== 'string' || !raw.trim()) return [];
  try { const j = JSON.parse(raw); return Array.isArray(j) ? j : []; } catch (e) { return []; }
}

function idadeDe(a) {
  const n = Number(a && a.idade);
  if (!Number.isFinite(n) || n < 10 || n > 100) return null;
  return Math.round(n);
}

function alturaDe(student, a) {
  const n = student && student.altura_cm != null ? Number(student.altura_cm) : Number(a && a.altura);
  if (!Number.isFinite(n) || n < 100 || n > 250) return null;
  return n;
}

function frequenciaDe(a, diasSemana) {
  const d = Number(a && a.dias);
  if (Number.isFinite(d) && d >= 1 && d <= 7) return Math.round(d);
  const arr = listaDias(a && a.diasSemana).length ? listaDias(a.diasSemana) : listaDias(diasSemana);
  if (arr.length >= 1 && arr.length <= 7) return arr.length;
  return null;
}

function objetivoDe(a) {
  const txt = String((a && a.objTxt) || '').trim();
  if (txt) return txt;
  const k = (a && a.objetivo) || (Array.isArray(a && a.objetivos) ? a.objetivos[0] : '') || '';
  return GOAL[k] || (k ? String(k) : '');
}

function numOuNull(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Mifflin-St Jeor, em kcal. Homem: +5. Mulher: -161.
function geb(peso, altura, idade, sexo) {
  if (peso == null || altura == null || idade == null || (sexo !== 'M' && sexo !== 'F')) return null;
  const base = 10 * Number(peso) + 6.25 * Number(altura) - 5 * Number(idade);
  const kcal = Math.round(base + (sexo === 'M' ? 5 : -161));
  if (!Number.isFinite(kcal) || kcal < 400 || kcal > 6000) return null;
  return kcal;
}

function montarPerfil(student, rows) {
  const a = fichaA(student && student.ficha);
  const ord = ordenar(rows || []);
  const inicial = (rows || []).find(r => r.kind === 'inicial') || ord[0] || null;
  const recente = ord.length ? ord[ord.length - 1] : null;
  const anamnese = numOuNull(student && student.peso_kg);
  const pesoInicial = inicial && numOuNull(inicial.peso) != null ? numOuNull(inicial.peso) : anamnese;
  const comPeso = ord.filter(r => numOuNull(r.peso) != null);
  const pesoAtual = comPeso.length ? numOuNull(comPeso[comPeso.length - 1].peso) : (ord.length ? null : anamnese);
  const pesoGeb = recente ? numOuNull(recente.peso) : null;
  let sexo = '';
  for (let i = ord.length - 1; i >= 0 && !sexo; i--) {
    if (ord[i].sexo === 'M' || ord[i].sexo === 'F') sexo = ord[i].sexo;
  }
  const altura = alturaDe(student, a);
  const idade = idadeDe(a);
  return {
    nome: (student && student.nome) || '',
    idade,
    objetivo: objetivoDe(a),
    frequencia: frequenciaDe(a, student && student.dias_semana),
    altura_cm: altura,
    peso_inicial: pesoInicial,
    peso_atual: pesoAtual,
    sexo,
    geb: geb(pesoGeb, altura, idade, sexo),
  };
}

function publico(row) {
  const o = { id: row.id, taken_on: row.taken_on, kind: row.kind, created_at: row.created_at, has_photo: !!(row.photo && String(row.photo).length > 20), sexo: row.sexo === 'M' || row.sexo === 'F' ? row.sexo : '' };
  for (const c of CAMPOS) o[c.key] = numOuNull(row[c.key]);
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
    const a = numOuNull(inicial[c.key]);
    const b = numOuNull(recente[c.key]);
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
  return db.prepare('SELECT id, nome, ficha, altura_cm, peso_kg, dias_semana FROM students WHERE username=? AND personal_id=?').get(u, personalId);
}

function resposta(s, rows) {
  return {
    items: ordenar(rows).map(publico),
    compare: comparar(rows),
    campos: CAMPOS.map(c => ({ k: c.key, nome: c.nome, un: c.un, grupo: c.grupo })),
    perfil: montarPerfil(s, rows),
  };
}

async function listar(personalId, username) {
  const s = await aluno(personalId, username);
  if (!s) fail(404, 'Aluno não encontrado.');
  return resposta(s, await rowsOf(personalId, s.id));
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
  let sexo;
  if (Object.prototype.hasOwnProperty.call(b, 'sexo')) {
    sexo = sexoOk(b.sexo);
    if (sexo === undefined) fail(400, 'Confira o sexo.');
  }
  let photo;
  if (Object.prototype.hasOwnProperty.call(b, 'photo')) {
    photo = fotoOk(b.photo);
    if (photo == null) fail(400, 'A foto precisa ser uma imagem de até 200 KB.');
  }
  const rows = await rowsOf(personalId, s.id);
  const atual = kind === 'inicial' ? rows.find(r => r.kind === 'inicial') || null : null;
  const conhecido = ordenar(rows).reverse().find(r => r.sexo === 'M' || r.sexo === 'F');
  const sx = sexo === undefined ? ((atual && atual.sexo) || (conhecido && conhecido.sexo) || '') : sexo;
  const algum = CAMPOS.some(c => vals[c.key] != null);
  const ph = photo === undefined ? (atual && atual.photo) || '' : photo;
  if (!algum && !ph) fail(400, 'Informe ao menos uma medida.');
  const keys = CAMPOS.map(c => c.key);
  const nums = keys.map(k => vals[k]);
  if (atual) {
    await db.prepare('UPDATE assessments SET taken_on=?,' + keys.map(k => k + '=?').join(',') + ',sexo=?,photo=? WHERE id=? AND personal_id=?')
      .run(taken, ...nums, sx, ph, atual.id, personalId);
  } else {
    await db.prepare('INSERT INTO assessments(student_id,personal_id,taken_on,kind,' + keys.join(',') + ',sexo,photo,created_at) VALUES(' + new Array(4 + keys.length + 3).fill('?').join(',') + ')')
      .run(s.id, personalId, taken, kind, ...nums, sx, ph, Date.now());
  }
  return listar(personalId, username);
}

async function lerFoto(personalId, id) {
  const n = parseInt(id, 10);
  if (!n) return null;
  const row = await db.prepare('SELECT photo FROM assessments WHERE id=? AND personal_id=?').get(n, personalId);
  if (!row || !row.photo) return null;
  const s = String(row.photo).replace(/\s/g, '');
  const m = /^data:(?:image\/)?(jpeg|png|webp);base64,([a-z0-9+/=]+)$/i.exec(s);
  if (!m) return null;
  return { type: 'image/' + m[1].toLowerCase(), buf: Buffer.from(m[2], 'base64') };
}

async function apagar(studentId) {
  await db.prepare('DELETE FROM assessments WHERE student_id=?').run(studentId);
}

module.exports = { CAMPOS, listar, salvar, lerFoto, apagar, comparar, tempoTexto, geb, montarPerfil };
