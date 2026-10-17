// Cards de estudo do personal. As imagens ficam em /cards, fora da pasta pública.
const fs = require('fs'), path = require('path');
const CARDS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'cards', 'cards.json'), 'utf8'));
/* Plano salvo na assinatura (também no teste de 4 dias). Básico trava tudo.
   Pro abre só os 50 marcados como Pro. Ilimitado abre os 100.
   Chave desconhecida (ou campo vazio) vale como Pro: o cadastro já cai em Pro quando ninguém escolheu plano. */
function studyTier(plan) {
  if (plan === 'ilimitado') return 'ilimitado';
  if (plan === 'basico') return 'basico';
  return 'pro';
}
function cardLocked(card, plan) {
  const tier = studyTier(plan);
  if (tier === 'ilimitado') return false;
  if (tier === 'pro') return card.plano !== 'Pro';
  return true;
}
function cardFile(card) {
  return path.join(__dirname, '..', 'cards', String(card.n).padStart(3, '0') + '-' + card.slug + '.jpg');
}
module.exports = { CARDS, studyTier, cardLocked, cardFile };
