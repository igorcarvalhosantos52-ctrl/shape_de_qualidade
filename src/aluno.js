// E-mail e primeiro nome do aluno. O identificador interno não aparece para ele.
function emailNorm(raw) {
  return String(raw ?? '').replace(/\s+/g, '').toLowerCase();
}
function emailOk(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ''));
}
function primeiroNome(nome) {
  return String(nome || '').trim().split(/\s+/)[0] || '';
}
module.exports = { emailNorm, emailOk, primeiroNome };
