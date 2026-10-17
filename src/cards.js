// Cards de estudo do personal. As imagens ficam em /cards, fora da pasta pública.
const fs = require('fs'), path = require('path');
const CARDS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'cards', 'cards.json'), 'utf8'));
/* Sem pagamento confirmado, tudo fica trancado (teste grátis e modo demo).
   Depois do pagamento: Básico trava tudo, Pro abre os 50 marcados como Pro,
   Ilimitado abre os 100. Chave desconhecida vale como Pro. */
function studyTier(plan) {
  if (plan === 'ilimitado') return 'ilimitado';
  if (plan === 'basico') return 'basico';
  return 'pro';
}
function cardLocked(card, plan, paid) {
  if (!paid) return true;
  const tier = studyTier(plan);
  if (tier === 'ilimitado') return false;
  if (tier === 'pro') return card.plano !== 'Pro';
  return true;
}
function cardLockError(plan, paid) {
  if (!paid) return 'Liberado após a assinatura.';
  if (plan === 'basico') return 'No plano Básico os cards ficam bloqueados. Faça upgrade para o Pro ou Ilimitado.';
  return 'Este card faz parte do plano Ilimitado.';
}
function cardFile(card) {
  return path.join(__dirname, '..', 'cards', String(card.n).padStart(3, '0') + '-' + card.slug + '.jpg');
}
module.exports = { CARDS, studyTier, cardLocked, cardLockError, cardFile };
