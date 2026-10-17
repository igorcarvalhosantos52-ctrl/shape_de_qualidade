// Ebook do personal. O PDF fica em /ebooks, fora da pasta pública.
const path = require('path');
/* Só o plano Ilimitado com assinatura paga de verdade (payments.test = 0,
   ativa e fora do teste). Teste grátis e pagamento simulado não abrem. */
function gate(sub, paid) {
  if (paid && sub && sub.plan === 'ilimitado') return { open: true, message: '' };
  if (!paid || (sub && sub.trial)) return { open: false, message: 'Liberado após a assinatura' };
  return { open: false, message: 'Exclusivo do plano Ilimitado' };
}
function file() {
  return path.join(__dirname, '..', 'ebooks', 'ebook-completo.pdf');
}
module.exports = { gate, file };
