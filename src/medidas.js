// Altura (cm, ou metros com vírgula) e peso (kg com vírgula) da anamnese.
function numBr(raw) {
  let s = String(raw ?? '').trim().toLowerCase().replace(/\s+/g, '');
  s = s.replace(/(cm|kg|m)$/, '');
  if (!/^\d+([.,]\d+)?$/.test(s)) return null;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}
function altura(raw) {
  const n = numBr(raw);
  if (n == null) return null;
  const cm = n < 3 ? Math.round(n * 1000) / 10 : Math.round(n * 10) / 10;
  if (cm < 50 || cm > 250) return null;
  return cm;
}
function peso(raw) {
  const n = numBr(raw);
  if (n == null) return null;
  const kg = Math.round(n * 10) / 10;
  if (kg < 20 || kg > 400) return null;
  return kg;
}
module.exports = { altura, peso };
