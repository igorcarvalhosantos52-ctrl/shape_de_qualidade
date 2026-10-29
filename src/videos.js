// Vídeos de exercício.
// O vídeo do personal fica no Turso, em partes, porque o disco do Render some a cada deploy.
// Os mp4 de demonstração em public/videos ficam no repositório e não entram na gaveta.
const fs = require('fs');
const path = require('path');
const db = require('./db');
const { exNome, EX_ALIAS } = require('../public/aliases');

const MAX_BYTES = 4 * 1024 * 1024;
const MAX_PART = 300 * 1024;
const MAX_MS = 30000;
const MAX_PARTS = 20;
const MIMES = new Set(['video/mp4', 'video/webm']);

function slug(nome) {
  const s = String(nome || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  return s || 'exercicio';
}

let _cat = null;
function catalogo() {
  if (_cat) return _cat;
  const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  const start = src.indexOf('const EX={');
  const end = src.indexOf('const GN=', start);
  const body = start >= 0 && end > start ? src.slice(start, end) : '';
  const nomes = [];
  for (const m of body.matchAll(/\{n:"((?:\\.|[^"\\])*)"/g)) {
    const nome = JSON.parse('"' + m[1] + '"');
    if (nome && !nomes.includes(nome)) nomes.push(nome);
  }
  _cat = nomes;
  return nomes;
}

function padroes() {
  return {};
}

function dec64(data) {
  const s = String(data || '').replace(/\s/g, '');
  if (!s || s.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(s)) return Buffer.alloc(0);
  return Buffer.from(s, 'base64');
}

function fail(msg, status) { const e = new Error(msg); e.status = status || 400; return e; }

async function apagarId(id) {
  await db.prepare('DELETE FROM exercise_video_parts WHERE video_id=?').run(id);
  await db.prepare('DELETE FROM exercise_videos WHERE id=?').run(id);
}

async function lista(personalId) {
  const rows = await db.prepare('SELECT id, nome, bytes, duration_ms FROM exercise_videos WHERE personal_id=? AND ready=1 ORDER BY nome COLLATE NOCASE, id').all(personalId);
  const custom = {};
  const meus = [];
  for (const r of rows) {
    custom[r.nome] = '/api/exercise-videos/' + r.id + '/file';
    meus.push({ id: r.id, nome: r.nome, bytes: r.bytes, duration_ms: r.duration_ms });
  }
  return { defaults: comChaveAntiga(padroes()), custom: comChaveAntiga(custom), meus };
}

function comChaveAntiga(out) {
  for (const [antigo, novo] of Object.entries(EX_ALIAS)) {
    if (out[novo]) out[antigo] = out[novo];
  }
  return out;
}

async function receber(personalId, body) {
  const nome = exNome(String(body.nome || ''));
  if (!catalogo().includes(nome)) throw fail('Escolha um exercício do catálogo.');
  const mime = String(body.mime || '');
  if (!MIMES.has(mime)) throw fail('Envie um vídeo MP4 ou WebM.');
  const duration = parseInt(body.duration_ms, 10);
  if (!(duration >= 1 && duration <= MAX_MS)) throw fail('O vídeo pode ter no máximo 30 segundos.');
  const bytes = parseInt(body.bytes, 10);
  if (!(bytes >= 1 && bytes <= MAX_BYTES)) throw fail('O vídeo pode ter no máximo 4 MB.');
  const seq = parseInt(body.seq, 10);
  const total = parseInt(body.total, 10);
  if (!(total >= 1 && total <= MAX_PARTS) || !(seq >= 0 && seq < total)) throw fail('Não consegui receber o vídeo. Tente de novo.');
  const parte = dec64(body.data);
  if (!parte.length || parte.length > MAX_PART) throw fail('Não consegui receber o vídeo. Tente de novo.');
  const data = parte.toString('base64');
  let id = parseInt(body.id, 10) || 0;
  if (seq === 0) {
    const drafts = await db.prepare('SELECT id FROM exercise_videos WHERE personal_id=? AND nome=? AND ready=0').all(personalId, nome);
    for (const d of drafts) await apagarId(d.id);
    const r = await db.prepare('INSERT INTO exercise_videos(personal_id, nome, mime, bytes, duration_ms, ready, created_at) VALUES(?,?,?,?,?,0,?)').run(personalId, nome, mime, bytes, duration, Date.now());
    id = r.lastInsertRowid;
  } else {
    const row = await db.prepare('SELECT id, nome, mime, bytes, duration_ms FROM exercise_videos WHERE id=? AND personal_id=? AND ready=0').get(id, personalId);
    if (!row || row.nome !== nome || row.mime !== mime || row.bytes !== bytes || row.duration_ms !== duration) throw fail('Não consegui receber o vídeo. Tente de novo.');
    const n = await db.prepare('SELECT COUNT(*) n FROM exercise_video_parts WHERE video_id=?').get(id);
    if (Number(n.n) !== seq) throw fail('Não consegui receber o vídeo. Tente de novo.');
  }
  await db.prepare('INSERT INTO exercise_video_parts(video_id, seq, data) VALUES(?,?,?)').run(id, seq, data);
  const gravadas = await db.prepare('SELECT data FROM exercise_video_parts WHERE video_id=? ORDER BY seq').all(id);
  const somado = gravadas.reduce((n, p) => n + dec64(p.data).length, 0);
  if (somado > bytes) {
    await apagarId(id);
    throw fail('O vídeo pode ter no máximo 4 MB.');
  }
  if (seq === total - 1) {
    if (somado !== bytes) {
      await apagarId(id);
      throw fail('Não consegui receber o vídeo. Tente de novo.');
    }
    const old = await db.prepare('SELECT id FROM exercise_videos WHERE personal_id=? AND nome=? AND ready=1').get(personalId, nome);
    if (old) await apagarId(old.id);
    await db.prepare('UPDATE exercise_videos SET ready=1 WHERE id=?').run(id);
  }
  return { id, pronto: seq === total - 1 };
}

async function remover(personalId, id) {
  const row = await db.prepare('SELECT id FROM exercise_videos WHERE id=? AND personal_id=?').get(id, personalId);
  if (!row) return false;
  await apagarId(id);
  return true;
}

async function ler(id, sess) {
  const row = await db.prepare('SELECT id, personal_id, mime FROM exercise_videos WHERE id=? AND ready=1').get(id);
  if (!row) return null;
  let dono = 0;
  if (sess.role === 'personal') dono = sess.user_id;
  else if (sess.role === 'student') {
    const s = await db.prepare('SELECT personal_id FROM students WHERE id=?').get(sess.user_id);
    dono = s ? s.personal_id : 0;
  }
  if (!dono || dono !== row.personal_id) return null;
  const parts = await db.prepare('SELECT data FROM exercise_video_parts WHERE video_id=? ORDER BY seq').all(id);
  if (!parts.length) return null;
  return { mime: row.mime, buf: Buffer.concat(parts.map(p => dec64(p.data))) };
}

function enviar(req, res, mime, buf) {
  const total = buf.length;
  res.set('Accept-Ranges', 'bytes');
  res.set('Cache-Control', 'private, no-store');
  res.set('Content-Disposition', 'inline');
  const range = String(req.headers.range || '');
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!m) { res.set('Content-Range', 'bytes */' + total); return res.status(416).end(); }
    let start = m[1] ? parseInt(m[1], 10) : 0;
    let end = m[2] ? parseInt(m[2], 10) : total - 1;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= total) {
      res.set('Content-Range', 'bytes */' + total);
      return res.status(416).end();
    }
    end = Math.min(end, total - 1);
    res.status(206);
    res.set('Content-Range', 'bytes ' + start + '-' + end + '/' + total);
    res.set('Content-Length', String(end - start + 1));
    res.type(mime);
    return res.end(buf.subarray(start, end + 1));
  }
  res.type(mime);
  res.set('Content-Length', String(total));
  res.end(buf);
}

module.exports = { slug, catalogo, padroes, lista, receber, remover, ler, enviar, MAX_BYTES, MAX_MS };
