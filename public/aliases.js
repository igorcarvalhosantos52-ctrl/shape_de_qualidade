// Nomes antigos continuam válidos. Uma ficha salva ou um app em cache
// pode voltar meses depois, então este mapa não é apagado.
const EX_ALIAS = {
  "Abdominal crunch no colchonete": "Abdominal supra no colchonete",
  "Escada (simulador)": "Simulador de escada",
  "Crucifixo invertido no peck deck": "Crucifixo invertido no voador",
  "Concha (clamshell) com elástico": "Ostra com elástico",
  "Passada lateral com miniband": "Caminhada lateral com miniband",
  "Serrote com halter": "Remada serrote com halter",
  "Isometria na parede (wall sit) em ângulo confortável": "Agachamento isométrico na parede (cadeirinha)",
  "Pendurar na barra (dead hang)": "Suspensão na barra (dead hang)",
  "Bom dia com barra": "Good morning com barra",
  "World's greatest stretch (passo longo com rotação)": "World's greatest stretch (afundo com rotação)",
};
const EQUIP_ALIAS = {
  "Escada (simulador)": "Simulador de escada",
  "Hack/Agachamento máquina": "Hack machine",
  "Barra livre": "Barra e anilhas",
};
function exNome(n) { return EX_ALIAS[n] || n; }
function andarBlocos(blocos, mudou) {
  if (!Array.isArray(blocos)) return mudou;
  for (const b of blocos) {
    if (!b || !Array.isArray(b.ex)) continue;
    for (const ex of b.ex) {
      if (!ex || typeof ex.n !== "string" || !EX_ALIAS[ex.n]) continue;
      ex.n = EX_ALIAS[ex.n];
      mudou = true;
    }
  }
  return mudou;
}
function normalizarFicha(o) {
  if (!o || typeof o !== "object" || Array.isArray(o)) return false;
  let mudou = false;
  if (Array.isArray(o.equip)) {
    const next = [];
    for (const e of o.equip) {
      const n = (typeof e === "string" && EQUIP_ALIAS[e]) || e;
      if (n !== e) mudou = true;
      if (!next.includes(n)) next.push(n);
    }
    if (next.length !== o.equip.length) mudou = true;
    o.equip = next;
  }
  const plan = o.plan;
  if (plan && typeof plan === "object") {
    if (Array.isArray(plan.treinos)) {
      for (const t of plan.treinos) if (t) mudou = andarBlocos(t.blocos, mudou);
    }
    if (plan.swapHoje && typeof plan.swapHoje === "object") mudou = andarBlocos(plan.swapHoje.blocos, mudou);
  }
  return mudou;
}
if (typeof module === "object" && module && module.exports) {
  module.exports = { EX_ALIAS, EQUIP_ALIAS, exNome, normalizarFicha };
}
