// Pix copia e cola (BR Code EMV) com CRC16-CCITT-FALSE, o mesmo do Banco Central.
function tlv(id, value) {
  const v = String(value);
  if (v.length > 99) throw new Error('Campo Pix longo demais.');
  return id + String(v.length).padStart(2, '0') + v;
}
function crc16(str) {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}
function pixText(s, max) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}
function normKey(tipo, raw) {
  const t = String(tipo || '').trim().toLowerCase();
  const s = String(raw || '').trim();
  if (!s) return { tipo: '', chave: '' };
  if (t === 'cpf') { const d = s.replace(/\D/g, ''); if (d.length !== 11) throw new Error('CPF da chave Pix precisa ter 11 dígitos.'); return { tipo: t, chave: d }; }
  if (t === 'cnpj') { const d = s.replace(/\D/g, ''); if (d.length !== 14) throw new Error('CNPJ da chave Pix precisa ter 14 dígitos.'); return { tipo: t, chave: d }; }
  if (t === 'email') { const e = s.toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new Error('E-mail da chave Pix inválido.'); return { tipo: t, chave: e }; }
  if (t === 'telefone') {
    let d = s.replace(/\D/g, '');
    if (d.startsWith('55') && d.length > 11) d = d.slice(2);
    if (!/^\d{10,11}$/.test(d)) throw new Error('Telefone da chave Pix: DDD e número, com 10 ou 11 dígitos.');
    return { tipo: t, chave: '+55' + d };
  }
  if (t === 'aleatoria') {
    const k = s.toLowerCase();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(k)) throw new Error('Chave aleatória precisa ser um código no formato xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx.');
    return { tipo: t, chave: k };
  }
  throw new Error('Escolha o tipo da chave Pix.');
}
function payload({ chave, nome, cidade, cents, txid }) {
  const nomeN = pixText(nome, 25), cidadeN = pixText(cidade, 15);
  if (!chave || !nomeN || !cidadeN) return '';
  const mai = tlv('00', 'br.gov.bcb.pix') + tlv('01', chave);
  let body = tlv('00', '01') + tlv('26', mai) + tlv('52', '0000') + tlv('53', '986');
  if (cents > 0) body += tlv('54', (cents / 100).toFixed(2));
  body += tlv('58', 'BR') + tlv('59', nomeN) + tlv('60', cidadeN);
  const id = String(txid || '***').replace(/[^A-Za-z0-9*]/g, '').slice(0, 25) || '***';
  body += tlv('62', tlv('05', id)) + '6304';
  return body + crc16(body);
}
function iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function parseISO(s) { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); }
function clampDay(y, m0, day) { return Math.min(Math.max(1, day), new Date(y, m0 + 1, 0).getDate()); }
function dateISO(y, m0, day) { return iso(new Date(y, m0, clampDay(y, m0, day))); }
function firstDue(dueDay, now) {
  const y = now.getFullYear(), m = now.getMonth(), today = new Date(y, m, now.getDate());
  const thisDue = new Date(y, m, clampDay(y, m, dueDay));
  if (today <= thisDue) return iso(thisDue);
  const nm = m + 1;
  return dateISO(nm > 11 ? y + 1 : y, nm % 12, dueDay);
}
function addMonth(isoDate, dueDay) {
  const d = parseISO(isoDate), nm = d.getMonth() + 1;
  return dateISO(nm > 11 ? d.getFullYear() + 1 : d.getFullYear(), nm % 12, dueDay);
}
function daysUntil(isoDate, now) {
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((parseISO(isoDate) - a) / 864e5);
}
function brDate(isoDate) { const [y, m, d] = String(isoDate || '').split('-'); return d && m && y ? d + '/' + m + '/' + y : ''; }
function cycle(row, now = new Date()) {
  const due = row.paid_through ? addMonth(row.paid_through, row.due_day) : firstDue(row.due_day, now);
  const days = daysUntil(due, now);
  const informed = row.informed_for === due;
  let tone, label;
  if (row.paid_through && days > 3) { tone = 'ok'; label = 'Pago'; }
  else if (days < 0) { tone = 'bad'; label = 'Atrasado'; }
  else if (days <= 3) { tone = 'soon'; label = days === 0 ? 'Vence hoje' : 'Vence em ' + days + ' dia(s)'; }
  else { tone = 'open'; label = 'Em aberto'; }
  return { tone, label, due, due_br: brDate(due), days, informed, amount_cents: row.amount_cents, due_day: row.due_day, paid_through: row.paid_through || null, informed_at: informed ? (row.informed_at || null) : null };
}
function moneyToCents(v) {
  const s = String(v == null ? '' : v).trim().replace(/\s/g, '');
  if (!s) return 0;
  const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
  if (!isFinite(n) || n < 0 || n > 100000) throw new Error('Valor da mensalidade inválido.');
  return Math.round(n * 100);
}
module.exports = { tlv, crc16, pixText, normKey, payload, firstDue, addMonth, daysUntil, brDate, cycle, moneyToCents, iso };
