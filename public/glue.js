/* Integração do app (versão de teste aprovada) com o servidor:
   logins, assinatura do personal, paywall e convite de alunos. */
const ME = window.__ME || { role: null };
const brl = c => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
async function api(url, body, method) {
  const r = await fetch(url, { method: method || (body ? "POST" : "GET"), headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "Erro " + r.status); return j;
}
async function logoutAll() { try { speechSynthesis.cancel(); } catch (e) {} await api("/api/logout", {}); location.href = "/"; }
const inviteFromUrl = (location.pathname.match(/^\/convite\/([A-Za-z0-9]+)/) || [])[1] || new URLSearchParams(location.search).get("convite");

/* ---------- Login / cadastro do aluno (servidor) ---------- */
lgUI = function () { ["#lgNome", "#lgPw2", "#lgCode"].forEach(i => $(i).classList.toggle("hide", !lgNew)); $("#lgGo").textContent = lgNew ? "Criar conta" : "Entrar";
  $("#lgMode").textContent = lgNew ? "Já tenho conta – entrar" : "Não tenho conta – criar com o convite do personal"; $("#lgErr").innerHTML = ""; };
$("#lgMode").onclick = e => { e.preventDefault(); lgNew = !lgNew; lgUI(); };
$("#lgGo").onclick = async () => {
  const err = m => ($("#lgErr").innerHTML = `<div class="alert bad">${esc(m)}</div>`);
  const usuario = $("#lgUser").value.trim().toLowerCase(), senha = $("#lgPw").value;
  try {
    if (lgNew) { if (senha !== $("#lgPw2").value) return err("As senhas não conferem.");
      await api("/api/student/signup", { usuario, senha, nome: $("#lgNome").value.trim(), convite: $("#lgCode").value.trim() }); }
    else await api("/api/student/login", { usuario, senha });
    location.href = "/";
  } catch (e) { err(e.message); }
};
$("#logout").onclick = logoutAll;
// link para o personal na tela de login
$("#t-login .lockbox").insertAdjacentHTML("beforeend", `<p style="font-size:.85rem;color:var(--mut)">É personal trainer? <a href="#" id="goPers">Entre ou assine aqui</a></p>`);
$("#goPers").onclick = e => { e.preventDefault(); showTab("personal"); };

/* ---------- Planos ---------- */
const PLANS = ME.plans || {}; let selPlan = (ME.sub && ME.sub.plan) || "pro";
const limTxt = l => (l ? "até " + l + " alunos" : "alunos ilimitados");
function plansHTML(cur, btnLabel) {
  return `<div id="planos" style="display:grid;gap:8px;margin:10px 0">${Object.entries(PLANS).map(([k, p]) => `<label class="plan" data-plan="${k}" style="display:flex;gap:10px;align-items:center;border:2px solid ${selPlan === k ? "#d4a017" : "#ddd"};border-radius:12px;padding:10px;cursor:pointer;background:${selPlan === k ? "#fffaf0" : "#fff"}">
   <input type="radio" name="plano" value="${k}" ${selPlan === k ? "checked" : ""} style="width:auto"><div style="flex:1"><b>${esc(p.nome)}</b>${k === "pro" ? ' <span class="badge apr">mais escolhido</span>' : ""}${cur === k ? ' <span class="badge pend">seu plano</span>' : ""}<br><small>${limTxt(p.limit)}</small></div><b>${brl(p.price_cents)}<small>/mês</small></b></label>`).join("")}</div>${btnLabel || ""}`;
}
function bindPlans(cb) { document.querySelectorAll("#planos input[name=plano]").forEach(r => (r.onchange = () => { selPlan = r.value; if (cb) return cb();
  document.querySelectorAll("#planos .plan").forEach(l => { const on = l.dataset.plan === selPlan; l.style.borderColor = on ? "#d4a017" : "#ddd"; l.style.background = on ? "#fffaf0" : "#fff"; }); })); }

/* ---------- Área do personal ---------- */
let pView = "login";
lockHTML = function () {
  const f = (id, ph, t) => `<input type="${t || "text"}" id="${id}" placeholder="${ph}" style="margin-bottom:8px">`;
  if (ME.role === "personal" && !(ME.sub && ME.sub.active)) return paywallHTML();
  if (pView === "signup") return `<div class="lockbox"><h2>🏋️ Criar conta do Personal</h2><p style="color:var(--mut)">Crie sua conta, use grátis e depois assine o plano que combina com você.</p>${f("pNomeAcc", "Seu nome")}${f("pEmail", "E-mail", "email")}${f("pCrefAcc", "CREF (opcional, ex.: 012345-G/SP)")}${f("pw1", "Senha (mínimo 8 caracteres)", "password")}${f("pw2", "Confirme a senha", "password")}<h3 style="margin:8px 0 0">Escolha seu plano</h3>${plansHTML()}<div class="alert ok">🎁 <b>${ME.trial_days || 4} dias grátis</b> para testar, sem cartão. Depois é só assinar.</div><div id="pwErr"></div><button class="btn" id="pwGo" style="width:100%">Criar conta e começar o teste grátis</button><p><a href="#" id="pSwap">Já tenho conta – entrar</a></p></div>`;
  return `<div class="lockbox"><h2>🔒 Login do Personal</h2><p style="color:var(--mut)">Entre com seu e-mail e senha.</p>${f("pEmail", "E-mail", "email")}${f("pw1", "Senha", "password")}<div id="pwErr"></div><button class="btn" id="pwGo" style="width:100%">Entrar</button><p><a href="#" id="pSwap">Ainda não tenho conta – criar e assinar</a></p></div>`;
};
function paywallHTML() {
  const P = ME.providers || {}, st = ME.sub && ME.sub.status, exp = st === "expired" || st === "trial_expired";
  return `<div class="lockbox" id="paywall"><h2>💳 ${st === "trial_expired" ? "Seu teste grátis acabou" : exp ? "Sua assinatura venceu" : "Assine o Shape de Qualidade"}</h2>
  <p>Olá, <b>${esc(ME.personal.nome)}</b>! Escolha o plano para usar o app com seus alunos${ME.count ? ` (você tem <b>${ME.count}</b>)` : ""}.</p>
  ${plansHTML(ME.sub && ME.sub.plan)}<small style="color:var(--mut)">Todos os planos: anamnese por voz · treinos e ajustes diários · painel de fichas.</small>
  ${P.mercadopago ? `<button class="btn" data-pay="mp_pix" style="width:100%;margin-top:8px">Pagar 1 mês com Pix / boleto / cartão (Mercado Pago)</button><button class="btn sec" data-pay="mp_card" style="width:100%;margin-top:8px">Assinatura automática no cartão (Mercado Pago)</button>` : ""}
  ${P.stripe ? `<button class="btn sec" data-pay="stripe" style="width:100%;margin-top:8px">Assinar com cartão (Stripe)</button>` : ""}
  ${P.demo ? `<div class="alert warn" style="margin-top:10px">🧪 <b>MODO TESTE</b> – nenhuma cobrança real. Este botão simula um pagamento aprovado.</div><button class="btn" data-pay="demo" id="payDemo" style="width:100%">Simular pagamento (teste)</button>` : ""}
  <div id="pwErr"></div><p><a href="#" id="pOut">Sair</a></p></div>`;
}
bindLock = function () {
  const err = m => ($("#pwErr").innerHTML = `<div class="alert bad">${esc(m)}</div>`), v = id => { const e = $("#" + id); return e ? e.value.trim() : ""; };
  const sw = $("#pSwap"); if (sw) sw.onclick = e => { e.preventDefault(); pView = pView === "signup" ? "login" : "signup"; render(); };
  const po = $("#pOut"); if (po) po.onclick = e => { e.preventDefault(); logoutAll(); };
  document.querySelectorAll("[data-pay]").forEach(b => (b.onclick = async () => {
    b.disabled = true; try { const r = await api("/api/billing/checkout", { method: b.dataset.pay, plano: selPlan }); location.href = r.url; } catch (e) { err(e.message); b.disabled = false; } }));
  bindPlans(); const go = $("#pwGo"); if (!go) return;
  const doIt = async () => {
    try {
      if (pView === "signup") { if ($("#pw1").value !== $("#pw2").value) return err("As senhas não conferem.");
        await api("/api/personal/signup", { nome: v("pNomeAcc"), email: v("pEmail"), cref: v("pCrefAcc"), senha: $("#pw1").value, plano: selPlan }); }
      else await api("/api/personal/login", { email: v("pEmail"), senha: $("#pw1").value });
      location.href = "/?area=personal";
    } catch (e) { err(e.message); }
  };
  go.onclick = doIt; $("#pw1").onkeydown = e => { if (e.key === "Enter") doIt(); };
};
// convite + assinatura no topo do painel lateral
const _renderPanel = renderPanel;
renderPanel = function () {
  _renderPanel();
  if (!unlocked || ME.role !== "personal") return;
  const link = location.origin + "/convite/" + ME.personal.invite_code, end = new Date(ME.sub.current_period_end).toLocaleDateString("pt-BR");
  $("#stuPanel").insertAdjacentHTML("afterbegin", `<div class="alert ok noprint" id="invBox" style="font-size:.85rem">📨 <b>Convide seus alunos</b><br>Código: <b id="invCode">${esc(ME.personal.invite_code)}</b><br><input id="invLink" readonly value="${esc(link)}" style="margin:6px 0;font-size:.8rem"><button class="btn sm" id="invCopy">Copiar link</button> <a class="btn sm sec" target="_blank" href="https://wa.me/?text=${encodeURIComponent("Crie sua conta no app Shape de Qualidade: " + link)}">WhatsApp</a></div>${planBox(end)}`);
  bindPlanBox();
  $("#invCopy").onclick = () => { navigator.clipboard && navigator.clipboard.writeText(link); __toast("Link copiado!"); };
};
function planBox(end) {
  const S2 = ME.sub, L = S2.limit, full = L && ME.count >= L, left = Math.max(0, Math.ceil((S2.current_period_end - Date.now()) / 864e5));
  return `<div class="alert ${full ? "bad" : "ok"} noprint" id="planBox" style="font-size:.85rem">⭐ Plano <b>${esc(S2.plan_nome)}</b> ${S2.trial ? `<span class="badge pend">TESTE GRÁTIS – ${left} dia(s)</span>` : S2.provider === "demo" ? "(TESTE)" : ""}<br>
  Alunos: <b id="stuCount">${ME.count}${L ? " / " + L : ""}</b>${full ? "<br><b>Limite atingido.</b> Faça upgrade para convidar mais alunos." : ""}<br><small>${S2.trial ? "Teste" : "Ativo"} até ${end}</small>
  <details id="chgPlan" style="margin-top:6px"><summary>Mudar de plano</summary>${plansHTML(S2.plan, `<button class="btn sm" id="planGo">Mudar para o plano selecionado</button><div id="planErr"></div>`)}</details></div>`;
}
function bindPlanBox() {
  bindPlans(() => { const o = $("#chgPlan").open; renderPanel(); $("#chgPlan").open = o; });
  const g = $("#planGo"); if (!g) return;
  g.onclick = async () => { const err = m => ($("#planErr").innerHTML = `<div class="alert bad">${esc(m)}</div>`);
    try { const r = await api("/api/billing/plan", { plano: selPlan });
      if (r.needCheckout) { ME.sub.active = false; pc_paywall(); return; }
      location.href = "/?area=personal&plano=1"; } catch (e) { err(e.message); } };
}
function pc_paywall() { const pc = $("#persCard"); pc.innerHTML = paywallHTML().replace("Assine o Shape de Qualidade", "Pagar o upgrade de plano"); bindLock(); pc.scrollIntoView(); }
const _render = render;
render = function () {
  _render();
  document.querySelectorAll("#lockNow").forEach(b => (b.onclick = logoutAll));
  const fg = $("#pwForgot"); if (fg) fg.remove();
};
// o "Reiniciar" apaga também no servidor (save() envia a ficha nova)

/* ---------- Início ---------- */
if (ME.role === "student" && !ME.active) {
  $("#t-login .lockbox").innerHTML = `<h2>⏸️ Acesso pausado</h2><p>Olá, <b>${esc(ME.nome)}</b>. A assinatura do seu personal (<b>${esc(ME.personal.nome)}</b>) está inativa no momento. Fale com ele para reativar.</p><button class="btn" id="out2">Sair</button>`;
  ["login", "aluno", "personal"].forEach(x => $("#t-" + x).classList.toggle("hide", x !== "login")); $("#out2").onclick = logoutAll;
} else {
  boot();
  if (ME.role === "personal" || new URLSearchParams(location.search).get("area") === "personal") showTab("personal");
  if (ME.role === "personal") $("#backAluno").classList.add("hide");
  if (!ME.role && inviteFromUrl) { lgNew = true; lgUI(); $("#lgCode").value = inviteFromUrl.toUpperCase();
    api("/api/invite/" + inviteFromUrl).then(r => ($("#lgInfo").innerHTML = r.full ? `<div class="alert bad">O personal <b>${esc(r.personal)}</b> atingiu o limite de alunos do plano dele. Peça para ele fazer upgrade.</div>` : `Você foi convidado por <b>${esc(r.personal)}</b>. Crie sua conta:`)).catch(e => ($("#lgInfo").textContent = e.message)); }
  if (new URLSearchParams(location.search).get("plano")) __toast("Plano alterado!");
  if (new URLSearchParams(location.search).get("pago")) { __toast("Pagamento recebido! Assinatura ativa."); history.replaceState(null, "", "/"); }
}
