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
function maskZap(el) {
  if (!el || el.dataset.mask) return;
  el.dataset.mask = "1";
  el.addEventListener("input", () => {
    let d = el.value.replace(/\D/g, "");
    if (d.startsWith("55") && d.length > 11) d = d.slice(2);
    d = d.slice(0, 11);
    let out = "";
    if (!d) out = "";
    else if (d.length <= 2) out = "(" + d;
    else if (d.length <= 6) out = "(" + d.slice(0, 2) + ") " + d.slice(2);
    else if (d.length <= 10) out = "(" + d.slice(0, 2) + ") " + d.slice(2, 6) + "-" + d.slice(6);
    else out = "(" + d.slice(0, 2) + ") " + d.slice(2, 7) + "-" + d.slice(7);
    if (el.value !== out) el.value = out;
  });
}
function zapDigits(raw) { let d = String(raw || "").replace(/\D/g, ""); if (d.startsWith("55") && d.length > 11) d = d.slice(2); return d; }
maskZap($("#lgZap"));
lgUI = function () { ["#lgNome", "#lgPw2", "#lgCode", "#lgZap", "#lgZapHint"].forEach(i => { const el = $(i); if (el) el.classList.toggle("hide", !lgNew); }); $("#lgGo").textContent = lgNew ? "Criar conta" : "Entrar";
  const mail = $("#lgEmail"); if (mail) mail.placeholder = lgNew ? "Seu e-mail" : "Seu e-mail ou usuário";
  $("#lgMode").textContent = lgNew ? "Já tenho conta, entrar" : "Não tenho conta, criar agora"; $("#lgErr").innerHTML = ""; };
$("#lgMode").onclick = e => { e.preventDefault(); lgNew = !lgNew; lgUI(); };
$("#lgGo").onclick = async () => {
  const err = m => ($("#lgErr").innerHTML = `<div class="alert bad">${esc(m)}</div>`);
  const email = ($("#lgEmail").value || "").replace(/\s+/g, "").toLowerCase(), senha = $("#lgPw").value;
  try {
    if (lgNew) {
      const nome = $("#lgNome").value.trim();
      if (nome.length < 2) return err("Informe seu nome.");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return err("Informe um e-mail válido.");
      if (senha.length < 6) return err("A senha precisa ter pelo menos 6 caracteres.");
      if (senha !== $("#lgPw2").value) return err("As senhas não conferem.");
      const zap = zapDigits($("#lgZap").value);
      if (!/^\d{10,11}$/.test(zap)) return err("Informe o WhatsApp com DDD, com 10 ou 11 dígitos.");
      await api("/api/student/signup", { email, senha, nome, whatsapp: zap, convite: $("#lgCode").value.trim() });
    } else {
      if (!email) return err("Informe seu e-mail.");
      await api("/api/student/login", { email, senha });
    }
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
  if (pView === "signup") return `<div class="lockbox"><h2>🏋️ Criar conta do Personal</h2><p style="color:var(--mut)">Crie sua conta, use grátis e depois assine o plano que combina com você.</p>${f("pNomeAcc", "Seu nome")}${f("pEmail", "E-mail", "email")}${f("pCrefAcc", "CREF (opcional, ex.: 012345-G/SP)")}${f("pw1", "Senha (mínimo 8 caracteres)", "password")}${f("pw2", "Confirme a senha", "password")}<h3 style="margin:8px 0 0">Escolha seu plano</h3>${plansHTML()}<div class="alert ok">🎁 <b>${ME.trial_days || 2} dias grátis</b> para testar, sem cartão. Depois é só assinar.</div><div id="pwErr"></div><button class="btn" id="pwGo" style="width:100%">Criar conta e começar o teste grátis</button><p><a href="#" id="pSwap">Já tenho conta – entrar</a></p></div>`;
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
  const pub = location.origin + "/p/" + ME.personal.invite_code, direto = location.origin + "/convite/" + ME.personal.invite_code, end = new Date(ME.sub.current_period_end).toLocaleDateString("pt-BR");
  const soft = s => esc(s).replace(/([/.-])/g, "$1<wbr>");
  $("#stuPanel").insertAdjacentHTML("afterbegin", `<div class="alert ok noprint" id="invBox">🔗 <b>Seu link público</b><small>Para a bio do Instagram ou o WhatsApp. Código: <b id="invCode">${esc(ME.personal.invite_code)}</b></small><input id="invLink" readonly value="${esc(pub)}"><div class="invActs"><button class="btn sm" id="invCopy" type="button">Copiar link</button><a class="btn sm sec" id="invShare" target="_blank" href="https://wa.me/?text=${encodeURIComponent("Treine comigo no Shape de Qualidade: " + pub)}">Compartilhar no WhatsApp</a></div><small>Quem você já combinou direto entra por <span id="invDireto">${soft(direto)}</span> e você aprova na hora.</small></div>${planBox(end)}`);
  bindPlanBox();
  $("#invCopy").onclick = () => { navigator.clipboard && navigator.clipboard.writeText(pub); __toast("Link copiado!"); };
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
function waDigits(raw) { let d = String(raw || "").replace(/\D/g, ""); if (d.startsWith("55") && d.length > 11) d = d.slice(2); return d; }
function waBlock() {
  const nome = (ME && ME.nome) || (typeof S !== "undefined" && S.a && S.a.nome) || "aluno";
  const d = waDigits(ME && ME.personal && ME.personal.whatsapp);
  if (!/^\d{10,11}$/.test(d)) return `<p class="waOff">Seu personal ainda não cadastrou o WhatsApp</p>`;
  const href = "https://wa.me/55" + d + "?text=" + encodeURIComponent("Olá, sou " + nome + " do Shape de Qualidade. Quero falar com você.");
  return `<a class="btn waPers" href="${esc(href)}" target="_blank" rel="noopener">Falar com o personal</a>`;
}
function mountWa() {
  if (!ME || ME.role !== "student") return;
  const html = `<div class="waSlot">${waBlock()}</div>`;
  const who = $("#whoName");
  if (who && who.parentElement && !$("#waTop")) who.parentElement.insertAdjacentHTML("afterend", `<div id="waTop">${html}</div>`);
  const adj = $("#adjCard");
  if (adj && !$("#waAdj")) { const row = adj.querySelector(".row"); if (row) row.insertAdjacentHTML("afterend", `<div id="waAdj">${html}</div>`); }
  document.querySelectorAll("#adjOut, #chat, #statusCard").forEach(el => {
    if (!/consulte o seu personal/i.test(el.innerText || "")) return;
    if (el.querySelector(".waPers, .waOff")) return;
    el.insertAdjacentHTML("beforeend", html);
  });
}
const _render = render;
function pedirZapUmaVez() {
  if (!ME || ME.role !== "student" || ME.whatsapp) return;
  const k = "sq_zap_pedido_" + (ME.u || "");
  try { if (window.localStorage.getItem(k)) return; } catch (e) { return; }
  if ($("#zapPedido")) return;
  const host = $("#whoName") && $("#whoName").parentElement;
  if (!host) return;
  host.insertAdjacentHTML("afterend", `<div class="card" id="zapPedido"><p>Qual é o seu WhatsApp com DDD? Para o seu personal falar com você se precisar.</p><input id="zapPedidoNum" placeholder="WhatsApp (com DDD)" inputmode="tel" autocomplete="tel"><div id="zapPedidoMsg"></div><button class="btn sm" id="zapPedidoGo" type="button">Salvar</button> <button class="btn sm sec" id="zapPedidoSkip" type="button">Agora não</button></div>`);
  const num = $("#zapPedidoNum"); maskZap(num);
  $("#zapPedidoSkip").onclick = () => { try { window.localStorage.setItem(k, "1"); } catch (e) {} const n = $("#zapPedido"); if (n) n.remove(); };
  $("#zapPedidoGo").onclick = async () => {
    try {
      const r = await api("/api/student/whatsapp", { numero: num.value });
      ME.whatsapp = r.whatsapp; if (window.__ME) window.__ME.whatsapp = r.whatsapp;
      try { window.localStorage.setItem(k, "1"); } catch (e) {}
      const n = $("#zapPedido"); if (n) n.remove();
    } catch (e) { $("#zapPedidoMsg").innerHTML = `<div class="alert bad">${esc(e.message)}</div>`; }
  };
}
render = function () {
  _render();
  document.querySelectorAll("#lockNow").forEach(b => (b.onclick = logoutAll));
  const fg = $("#pwForgot"); if (fg) fg.remove();
  mountWa();
  mountFeeStudent();
  mountFeeEditor();
  pedirZapUmaVez();
};
const _renderChat = renderChat;
renderChat = function () { _renderChat(); mountWa(); };
// o "Reiniciar" apaga também no servidor (save() envia a ficha nova)

/* ---------- Início ---------- */
if (ME.role === "student" && !ME.active) {
  $("#t-login .lockbox").innerHTML = `<h2>⏸️ Acesso pausado</h2><p>Olá, <b>${esc(primeiroNome(ME.nome))}</b>. A assinatura do seu personal (<b>${esc(ME.personal.nome)}</b>) está inativa no momento. Fale com ele para reativar.</p><div class="waSlot">${waBlock()}</div><button class="btn" id="out2">Sair</button>`;
  ["login", "aluno", "personal"].forEach(x => $("#t-" + x).classList.toggle("hide", x !== "login")); $("#out2").onclick = logoutAll;
} else if (ME.role === "student" && ME.gate === "recusado") {
  ["login", "aluno", "personal"].forEach(x => $("#t-" + x).classList.toggle("hide", x !== "aluno"));
  $("#whoName").textContent = "👤 " + primeiroNome(ME.nome || "");
  $("#anamCard").classList.add("hide");
  if (!$("#feeHold")) $("#whoName").parentElement.insertAdjacentHTML("afterend", `<div class="card" id="feeHold"><h2>Aguardando o personal</h2><p>Seu personal ainda não aprovou seu acesso. Fale com ele por aqui.</p></div>`);
  mountWa();
} else if (pixAntesDaAnamnese()) {
  ["login", "aluno", "personal"].forEach(x => $("#t-" + x).classList.toggle("hide", x !== "aluno"));
  $("#whoName").textContent = "👤 " + primeiroNome(ME.nome || "");
  $("#anamCard").classList.add("hide");
  mountWa();
  mountFeeStudent();
} else {
  boot();
  if (ME.role === "personal" || new URLSearchParams(location.search).get("area") === "personal") showTab("personal");
  if (ME.role === "personal") $("#backAluno").classList.add("hide");
  if (!ME.role && inviteFromUrl) { lgNew = true; lgUI(); $("#lgCode").value = inviteFromUrl.toUpperCase();
    api("/api/invite/" + inviteFromUrl).then(r => ($("#lgInfo").innerHTML = r.full ? `<div class="alert bad">O personal <b>${esc(r.personal)}</b> atingiu o limite de alunos do plano dele. Peça para ele fazer upgrade.</div>` : `Você foi convidado por <b>${esc(r.personal)}</b>. Crie sua conta:`)).catch(e => ($("#lgInfo").textContent = e.message)); }
  if (new URLSearchParams(location.search).get("plano")) __toast("Plano alterado!");
  if (new URLSearchParams(location.search).get("pago")) { __toast("Pagamento recebido! Assinatura ativa."); history.replaceState(null, "", "/"); }
}

/* ---------- Voz: o navegador só libera fala e microfone depois de um toque ----------
   Depois do login a página recarrega; sem um toque o celular bloqueia a voz do coach.
   Este botão "destrava" a voz e repete a última pergunta. */
(function voiceStart() {
  if (ME.role !== "student" || !ME.active) return;
  const hasTTS = "speechSynthesis" in window, mic = $("#mic"); if (!mic) return;
  const box = document.createElement("div"); box.id = "voiceGo"; box.className = "alert ok noprint";
  box.style.cssText = "text-align:center;cursor:pointer;font-weight:700";
  box.innerHTML = "🎙️ Toque aqui para conversar por voz com o coach";
  mic.parentNode.insertBefore(box, mic);
  box.onclick = () => { box.remove(); window.__ttsUnlocked = true; try { speechSynthesis.resume(); } catch (e) {}
    const last = lastCoachText(); if (last && ttsEnabled()) speak(last, null, { interrupt: true }); };
  if (!SR) { const tip = document.createElement("div"); tip.className = "alert warn"; tip.textContent = "Seu navegador não tem reconhecimento de voz. Responda digitando abaixo (no Android use o Chrome; no iPhone, o Safari)."; mic.parentNode.insertBefore(tip, mic); }
})();

/* ---------- Senhas ---------- */
const qs = new URLSearchParams(location.search);
// esqueci a senha – aluno
$("#t-login .lockbox").insertAdjacentHTML("beforeend", `<p style="font-size:.85rem"><a href="#" id="stuForgot">Esqueci a senha</a></p><div id="stuForgotMsg"></div>`);
$("#stuForgot").onclick = e => { e.preventDefault(); $("#stuForgotMsg").innerHTML = `<div class="alert warn" style="font-size:.9rem">Digite o e-mail da sua conta e toque em <b>Pedir nova senha</b>. O suporte envia um link para criar uma senha nova (vale 1 hora).<input id="stuFgEmail" type="email" placeholder="Seu e-mail" style="margin:8px 0"><button class="btn sm" id="stuFgGo" type="button">Pedir nova senha</button><div id="stuFgOut"></div><p style="margin:8px 0 0">Conta antiga sem e-mail? Peça ao personal uma senha nova, no painel dele, em Senhas.</p></div>`;
  const atual = $("#lgEmail") && $("#lgEmail").value; if (atual && $("#stuFgEmail")) $("#stuFgEmail").value = atual;
  $("#stuFgGo").onclick = async () => { try { const r = await api("/api/student/forgot", { email: $("#stuFgEmail").value }); $("#stuFgOut").innerHTML = `<div class="alert ok">${esc(r.msg)}</div>`; } catch (err) { $("#stuFgOut").innerHTML = `<div class="alert bad">${esc(err.message)}</div>`; } }; };
// esqueci a senha – personal (na tela de login do personal)
const _lockHTML = lockHTML;
lockHTML = function () { let h = _lockHTML(); if (pView === "login" && !ME.role) h = h.replace('<p><a href="#" id="pSwap">', '<p style="font-size:.9rem"><a href="#" id="pForgot">Esqueci a senha</a></p><div id="pForgotBox"></div><p><a href="#" id="pSwap">'); return h; };
const _bindLock = bindLock;
bindLock = function () { _bindLock(); const f = $("#pForgot"); if (!f) return;
  f.onclick = e => { e.preventDefault(); $("#pForgotBox").innerHTML = `<div class="alert warn" style="font-size:.9rem">Digite o e-mail da sua conta e toque em <b>Pedir nova senha</b>. Você vai receber do suporte um link para criar uma senha nova (vale 1 hora).<input id="fgEmail" type="email" placeholder="Seu e-mail" style="margin:8px 0"><button class="btn sm" id="fgGo">Pedir nova senha</button><div id="fgMsg"></div></div>`;
    if ($("#pEmail").value) $("#fgEmail").value = $("#pEmail").value;
    $("#fgGo").onclick = async () => { try { const r = await api("/api/personal/forgot", { email: $("#fgEmail").value.trim() }); $("#fgMsg").innerHTML = `<div class="alert ok">${esc(r.msg)}</div>`; } catch (e) { $("#fgMsg").innerHTML = `<div class="alert bad">${esc(e.message)}</div>`; } }; }; };
// página /redefinir?t=...
if (location.pathname === "/redefinir" && qs.get("t")) {
  const t = qs.get("t"), lb = $("#t-login .lockbox");
  ["login", "aluno", "personal"].forEach(x => $("#t-" + x).classList.toggle("hide", x !== "login"));
  lb.innerHTML = `<h2>🔑 Criar nova senha</h2><div id="rsInfo">Verificando o link...</div>`;
  api("/api/password/reset/" + encodeURIComponent(t)).then(r => {
    const min = r.role === "personal" ? 8 : 6;
    $("#rsInfo").innerHTML = `<p>Olá, <b>${esc(r.nome || "")}</b> (${esc(r.login || "")}). Digite a nova senha (mínimo ${min} caracteres).</p><input type="password" id="rs1" placeholder="Nova senha" style="margin-bottom:8px"><input type="password" id="rs2" placeholder="Repita a nova senha" style="margin-bottom:8px"><div id="rsErr"></div><button class="btn" id="rsGo" style="width:100%">Salvar nova senha</button>`;
    $("#rsGo").onclick = async () => { const er = m => ($("#rsErr").innerHTML = `<div class="alert bad">${esc(m)}</div>`);
      if ($("#rs1").value !== $("#rs2").value) return er("As senhas não conferem.");
      try { const x = await api("/api/password/reset", { token: t, senha: $("#rs1").value }); lb.innerHTML = `<div class="alert ok">✅ Senha alterada! Entrando...</div>`; setTimeout(() => (location.href = x.role === "personal" ? "/?area=personal" : "/"), 1200); } catch (e) { er(e.message); } };
  }).catch(e => ($("#rsInfo").innerHTML = `<div class="alert bad">${esc(e.message)}</div>`));
}
// personal logado: trocar a própria senha e redefinir senha de aluno
function zapBox() {
  const cur = (ME.personal && ME.personal.whatsapp) || "";
  return `<details class="alert ok noprint" id="zapBox" style="font-size:.85rem"><summary><b>Meu WhatsApp</b></summary>
  <p style="margin:8px 0 4px">Número com DDD. O aluno usa esse número no botão <b>Falar com o personal</b>.</p>
  <input id="zapNum" inputmode="numeric" autocomplete="tel" placeholder="11999998888" value="${esc(cur)}" style="margin-bottom:6px">
  <button class="btn sm" id="zapGo" type="button">Salvar</button><div id="zapMsg"></div></details>`;
}
function senhaBox() {
  const opts = (ME.students || []).map(s => `<option value="${esc(s.u)}">${esc(s.nome)} (${esc(s.email || s.u)})</option>`).join("");
  return `<details class="alert ok noprint" id="pwdBox" style="font-size:.85rem"><summary><b>🔑 Senhas</b></summary>
  <p style="margin:8px 0 4px"><b>Trocar minha senha</b></p><input type="password" id="myOld" placeholder="Senha atual" style="margin-bottom:6px"><input type="password" id="myNew" placeholder="Nova senha (mín. 8)" style="margin-bottom:6px"><button class="btn sm" id="myGo">Trocar minha senha</button>
  <p style="margin:12px 0 4px"><b>Nova senha para um aluno</b> (quando ele esquecer)</p>${opts ? `<select id="stSel" style="margin-bottom:6px">${opts}</select><input type="text" id="stNew" placeholder="Nova senha do aluno (mín. 6)" style="margin-bottom:6px"><button class="btn sm" id="stGo">Definir senha do aluno</button>` : "<small>Você ainda não tem alunos.</small>"}<div id="pwdMsg"></div></details>`;
}
const TUTOS = [["link", "Cadastrar e convidar aluno"], ["aprovar", "Aprovar a ficha"], ["dias", "Montar os dias da semana"], ["troca", "Trocar o treino de hoje"], ["pix", "Chave Pix e mensalidade"], ["mensalidade", "Como funciona a mensalidade"], ["cards", "Cards de memorização"], ["acesso", "WhatsApp e senhas"]];
function tutoBox() {
  return `<details class="alert ok noprint" id="tutoBox"><summary><b>🎬 Como usar o app</b></summary>
  <div class="tutoList">${TUTOS.map(([id, t]) => `<button type="button" class="btn sm sec tutoItem" data-tuto="${id}">${esc(t)}</button>`).join("")}</div>
  <video id="tutoPlayer" controls playsinline preload="none" hidden></video></details>`;
}
function bindTuto(prev) {
  const box = $("#tutoBox"); if (!box) return;
  const player = $("#tutoPlayer");
  const show = id => {
    const url = "/api/tutoriais/" + encodeURIComponent(id);
    player.hidden = false;
    if (player.getAttribute("src") !== url) player.setAttribute("src", url);
    const go = player.play(); if (go && go.catch) go.catch(() => {});
    box.querySelectorAll("[data-tuto]").forEach(b => b.classList.toggle("on", b.dataset.tuto === id));
  };
  box.querySelectorAll("[data-tuto]").forEach(b => { b.onclick = () => show(b.dataset.tuto); });
  if (!prev || !prev.id) return;
  player.hidden = false;
  player.setAttribute("src", "/api/tutoriais/" + encodeURIComponent(prev.id));
  box.querySelectorAll("[data-tuto]").forEach(b => b.classList.toggle("on", b.dataset.tuto === prev.id));
  const resume = () => {
    if (prev.t > 0.2) { try { player.currentTime = prev.t; } catch (e) {} }
    if (prev.playing) { const go = player.play(); if (go && go.catch) go.catch(() => {}); }
  };
  if (player.readyState >= 1) resume(); else player.addEventListener("loadedmetadata", resume, { once: true });
}
function reais(c) { return c > 0 ? (c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ""; }
function pixBox() {
  const px = (ME.personal && ME.personal.pix) || {}, foto = ME.personal && ME.personal.foto;
  const tipos = [["cpf", "CPF"], ["cnpj", "CNPJ"], ["email", "E-mail"], ["telefone", "Telefone"], ["aleatoria", "Aleatória"]];
  return `<details class="alert ok noprint" id="pixBox" style="font-size:.85rem"><summary><b>Minha chave Pix</b></summary>
  <p style="margin:8px 0 4px">O aluno paga você direto. O app gera o código e avisa quando ele diz que pagou. Você confirma o recebimento.</p>
  <label>Tipo da chave<select id="pixTipo">${tipos.map(([k, l]) => `<option value="${k}" ${px.tipo === k ? "selected" : ""}>${l}</option>`).join("")}</select></label>
  <input id="pixChave" placeholder="Sua chave Pix" value="${esc(px.chave || "")}" style="margin-bottom:6px">
  <input id="pixNome" placeholder="Nome de quem recebe" value="${esc(px.nome || ME.personal.nome || "")}" style="margin-bottom:6px">
  <input id="pixCidade" placeholder="Cidade" value="${esc(px.cidade || "")}" style="margin-bottom:6px">
  <p style="margin:8px 0 4px"><b>Valor da mensalidade</b> (aparece no link público e vale para os alunos sem valor próprio)</p>
  <input id="pixValor" inputmode="decimal" placeholder="150,00" value="${esc(reais(px.fee_cents))}" style="margin-bottom:6px">
  <label>Dia do vencimento <input id="pixDia" type="number" min="1" max="31" placeholder="10" value="${px.fee_day || ""}" style="max-width:90px"></label>
  <p style="margin:8px 0 4px"><b>Bio curta</b> do link público</p>
  <textarea id="pixBio" maxlength="280" placeholder="Uma frase sobre você" style="margin-bottom:6px">${esc(px.bio || "")}</textarea>
  <p style="margin:8px 0 4px"><b>Foto</b> (opcional)</p>
  <img id="pixPrev" alt="" src="${foto ? esc(foto) : ""}" style="width:72px;height:72px;object-fit:cover;border-radius:50%;display:${foto ? "block" : "none"};margin-bottom:6px">
  <input id="pixFoto" type="file" accept="image/*" style="margin-bottom:6px">
  <button class="btn sm" id="pixGo" type="button">Salvar</button><div id="pixMsg"></div></details>`;
}
let pixFotoNova = null, pixFotoWait = null;
function bindPix() {
  const go = $("#pixGo"); if (!go) return;
  pixFotoNova = null; pixFotoWait = null;
  const file = $("#pixFoto");
  if (file) file.onchange = () => {
    const f = file.files && file.files[0];
    pixFotoNova = null;
    if (!f) { pixFotoWait = null; return; }
    pixFotoWait = new Promise(res => {
      const img = new Image(), url = URL.createObjectURL(f);
      img.onload = () => {
        const max = 320, sc = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(img.width * sc)); c.height = Math.max(1, Math.round(img.height * sc));
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        pixFotoNova = c.toDataURL("image/jpeg", 0.72);
        const prev = $("#pixPrev"); if (prev) { prev.src = pixFotoNova; prev.style.display = "block"; }
        URL.revokeObjectURL(url); res();
      };
      img.onerror = () => { URL.revokeObjectURL(url); res(); };
      img.src = url;
    });
  };
  go.onclick = async () => {
    const msg = (m, ok) => ($("#pixMsg").innerHTML = `<div class="alert ${ok ? "ok" : "bad"}">${esc(m)}</div>`);
    if (pixFotoWait) await pixFotoWait;
    try {
      const r = await api("/api/personal/pix", { tipo: $("#pixTipo").value, chave: $("#pixChave").value, nome: $("#pixNome").value, cidade: $("#pixCidade").value, valor: $("#pixValor").value, dia: $("#pixDia").value, bio: $("#pixBio").value, foto: pixFotoNova });
      ME.personal.pix = r.pix; ME.personal.has_foto = r.has_foto;
      if (pixFotoNova) ME.personal.foto = pixFotoNova;
      pixFotoNova = null; pixFotoWait = null;
      msg("Salvo. O link público já mostra esses dados.", 1);
    } catch (e) { msg(e.message); }
  };
}
function paintFeeDots() {
  if (!ME || ME.role !== "personal" || !ME.students) return;
  const det = $("#stuDet"); if (!det) return;
  const by = {}; ME.students.forEach(s => { by[s.u] = s.fee || {}; });
  det.querySelectorAll(".stu").forEach(el => {
    const fee = by[el.dataset.u] || {}, b = el.querySelector("b"), small = el.querySelector("small"), badge = el.querySelector(".badge");
    if (b && fee.tone && fee.tone !== "none" && !b.querySelector(".feeDot")) b.insertAdjacentHTML("beforeend", `<i class="feeDot ${esc(fee.tone)}" title="${esc(fee.label || "")}"></i>`);
    if (small && fee.informed && !small.querySelector(".feeChip")) small.insertAdjacentHTML("beforeend", `<span class="feeChip">Pagamento informado</span>`);
    if (badge && fee.origin === "publico" && fee.gate !== "recusado") {
      const t = badge.textContent.trim();
      if (t === "Sem treino" || t === "Pendente") { badge.textContent = "Pendente de aprovação"; badge.classList.add("pend"); }
    }
    if (badge && fee.gate === "recusado") { badge.textContent = "Recusado"; badge.classList.remove("pend", "apr"); badge.classList.add("blk"); }
  });
  if (!$("#feeLegend")) det.insertAdjacentHTML("beforeend", `<p class="feeLegend" id="feeLegend"><i class="feeDot ok"></i> pago <i class="feeDot soon"></i> vence em até 3 dias <i class="feeDot bad"></i> atrasado <i class="feeDot open"></i> em aberto <i class="feeDot none"></i> sem mensalidade</p>`);
}
function pixAntesDaAnamnese() {
  const f = ME && ME.fee;
  return !!(ME && ME.role === "student" && ME.active !== false && ME.origin === "publico" && ME.gate !== "recusado" && f && f.amount_cents > 0 && !f.informed && f.tone !== "ok");
}
function mountFeeStudent() {
  if (!ME || ME.role !== "student" || !ME.fee || !(ME.fee.amount_cents > 0) || $("#feeCard")) return;
  const html = `<div class="card feeCard" id="feeCard"><h2>Mensalidade</h2><div id="feeCardBody">Carregando…</div></div>`;
  const wa = $("#waTop"), who = document.querySelector("#t-aluno .whoami");
  if (wa) wa.insertAdjacentHTML("afterend", html);
  else if (who) who.insertAdjacentHTML("afterend", html);
  loadFeeCard();
}
async function loadFeeCard() {
  const body = $("#feeCardBody"); if (!body) return;
  try {
    const d = await api("/api/student/tuition");
    ME.fee = d.fee;
    if (!$("#feeCardBody")) return;
    const f = d.fee || {}, pago = f.tone === "ok" || f.informed;
    body.innerHTML = `<p><b>${brl(f.amount_cents || 0)}</b>${f.due_br ? " · vence " + esc(f.due_br) : ""}<br>${esc(f.label || "")}${f.informed ? " · Pagamento informado" : ""}</p>` +
      (d.pix_ok && d.payload ? `<p>Chave Pix: <b id="feeChave">${esc(d.chave)}</b> <button class="btn sm sec" type="button" id="feeCopyKey">Copiar</button></p><textarea id="feePayload" readonly>${esc(d.payload)}</textarea><button class="btn sm sec" type="button" id="feeCopyPix">Copiar código</button>${d.qr ? `<img alt="QR Code Pix" src="${d.qr}">` : ""}` : `<p>Seu personal ainda não concluiu a chave Pix. Fale com ele.</p>`) +
      (pago ? "" : `<button class="btn" type="button" id="feeJa" style="width:100%;margin-top:8px">Já paguei</button>`) + `<div id="feeCardMsg"></div>`;
    const copy = (id, text) => { const b = $(id); if (b) b.onclick = () => { navigator.clipboard && navigator.clipboard.writeText(text); __toast("Copiado!"); }; };
    copy("#feeCopyKey", d.chave || ""); copy("#feeCopyPix", d.payload || "");
    const ja = $("#feeJa");
    if (ja) ja.onclick = async () => {
      ja.disabled = true;
      try {
        const r = await api("/api/student/tuition/inform", {});
        ME.fee = r.fee;
        if ($("#anamCard") && $("#anamCard").classList.contains("hide") && ME.origin === "publico") { location.href = "/"; return; }
        const card = $("#feeCard"); if (card) card.remove();
        mountFeeStudent();
      } catch (e) { ja.disabled = false; const el = $("#feeCardMsg"); if (el) el.innerHTML = `<div class="alert bad">${esc(e.message)}</div>`; }
    };
  } catch (e) { body.innerHTML = `<div class="alert bad">${esc(e.message)}</div>`; }
}
function mountFeeEditor() {
  if (!ME || ME.role !== "personal" || typeof viewing === "undefined" || !viewing) return;
  const pc = $("#persCard"); if (!pc || $("#feeEdit")) return;
  pc.insertAdjacentHTML("afterbegin", `<details class="alert ok noprint" id="feeEdit"><summary><b>Mensalidade</b></summary><div id="feeEditBody">Carregando…</div></details>`);
  loadFeeEdit(viewing);
}
async function loadFeeEdit(u) {
  const body = $("#feeEditBody"); if (!body) return;
  try {
    const d = await api("/api/personal/tuition/" + encodeURIComponent(u));
    if (viewing !== u || !$("#feeEditBody")) return;
    const fee = d.fee || {}, valor = d.custom && !d.exempt && fee.amount_cents ? reais(fee.amount_cents) : "", dia = d.custom && !d.exempt && fee.due_day ? fee.due_day : "";
    const hist = (d.history || []).map(h => `<li>${esc(h.due_br)} · ${brl(h.amount_cents)}${h.undone ? " (desfeito)" : ""}</li>`).join("");
    const canPay = fee.tone !== "ok" && fee.amount_cents > 0;
    body.innerHTML = `<p style="margin:8px 0">${esc(fee.label || "Sem mensalidade")}${fee.due_br ? " · vence " + esc(fee.due_br) : ""}${fee.amount_cents ? " · " + brl(fee.amount_cents) : ""}</p>` +
      (fee.informed ? `<div class="alert warn">Pagamento informado</div><button class="btn sm" id="feeOk" type="button">Confirmar recebimento</button> ` : (canPay ? `<button class="btn sm sec" id="feeOk" type="button">Marcar como pago</button> ` : "")) +
      ((d.history || []).some(h => !h.undone) ? `<button class="btn sm sec" id="feeUndo" type="button">Desfazer</button> ` : "") +
      (d.origin === "publico" && d.gate !== "recusado" ? `<button class="btn sm bad" id="feeNo" type="button">Recusar</button> ` : "") +
      (d.gate === "recusado" ? `<button class="btn sm" id="feeRe" type="button">Reabrir</button> ` : "") +
      `<p style="margin:10px 0 4px">Valor deste aluno (em branco usa o valor público)</p><input id="feeValor" inputmode="decimal" placeholder="valor público" value="${esc(valor)}" style="margin-bottom:6px"><label>Dia <input id="feeDia" type="number" min="1" max="31" value="${esc(String(dia))}" style="max-width:90px"></label><label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="feeIsento" style="width:auto" ${d.exempt ? "checked" : ""}> não cobrar</label><button class="btn sm" id="feeSave" type="button">Salvar</button>${hist ? `<ul id="feeHist">${hist}</ul>` : ""}<div id="feeEditMsg"></div>`;
    const box = $("#feeEdit"); if (box && (fee.informed || (d.history || []).length || fee.tone === "bad" || fee.tone === "soon")) box.open = true;
    const apply = st => { const i = (ME.students || []).findIndex(s => s.u === u); if (i >= 0) ME.students[i].fee = { ...st.fee, origin: d.origin, gate: st.gate != null ? st.gate : d.gate }; render(); };
    const msg = (m, ok) => { const el = $("#feeEditMsg"); if (el) el.innerHTML = `<div class="alert ${ok ? "ok" : "bad"}">${esc(m)}</div>`; };
    const post = async (path, body) => apply(await api("/api/personal/tuition/" + encodeURIComponent(u) + path, body || {}));
    const okb = $("#feeOk"); if (okb) okb.onclick = async () => { try { await post("/confirm"); } catch (e) { msg(e.message); } };
    const un = $("#feeUndo"); if (un) un.onclick = async () => { try { await post("/undo"); } catch (e) { msg(e.message); } };
    const gate = async acao => { const r = await api("/api/personal/tuition/" + encodeURIComponent(u) + "/gate", { acao }); const i = (ME.students || []).findIndex(s => s.u === u); if (i >= 0) ME.students[i].fee = { ...(ME.students[i].fee || {}), origin: d.origin, gate: r.gate }; render(); };
    const no = $("#feeNo"); if (no) no.onclick = async () => { try { await gate("recusar"); } catch (e) { msg(e.message); } };
    const re = $("#feeRe"); if (re) re.onclick = async () => { try { await gate("reabrir"); } catch (e) { msg(e.message); } };
    $("#feeSave").onclick = async () => { try { await post("", { valor: $("#feeValor").value, dia: $("#feeDia").value, nao_cobrar: $("#feeIsento").checked }); } catch (e) { msg(e.message); } };
  } catch (e) { body.innerHTML = `<div class="alert bad">${esc(e.message)}</div>`; }
}
const _renderPanel2 = renderPanel;
renderPanel = function () { _renderPanel2(); paintFeeDots(); if (!unlocked || ME.role !== "personal" || !$("#planBox")) return;
  const o = $("#pwdBox") && $("#pwdBox").open, zo = $("#zapBox") && $("#zapBox").open, po = $("#pixBox") && $("#pixBox").open, to = $("#tutoBox") && $("#tutoBox").open;
  const tv = $("#tutoPlayer"), prev = tv && tv.getAttribute("src") ? { id: tv.getAttribute("src").split("/").pop(), t: tv.currentTime || 0, playing: !tv.paused && !tv.ended } : null;
  $("#planBox").insertAdjacentHTML("afterend", zapBox() + pixBox() + senhaBox() + tutoBox()); if (o) $("#pwdBox").open = true; if (zo) $("#zapBox").open = true; if (po) $("#pixBox").open = true; if (to) $("#tutoBox").open = true;
  bindTuto(prev);
  bindPix();
  const zmsg = (m, ok) => ($("#zapMsg").innerHTML = `<div class="alert ${ok ? "ok" : "bad"}">${esc(m)}</div>`);
  $("#zapGo").onclick = async () => { try { const r = await api("/api/personal/whatsapp", { numero: $("#zapNum").value }); ME.personal.whatsapp = r.whatsapp; $("#zapNum").value = r.whatsapp; zmsg(r.whatsapp ? "WhatsApp salvo. Seus alunos já podem falar com você." : "Número apagado.", 1); } catch (e) { zmsg(e.message); } };
  const msg = (m, ok) => ($("#pwdMsg").innerHTML = `<div class="alert ${ok ? "ok" : "bad"}">${esc(m)}</div>`);
  $("#myGo").onclick = async () => { try { await api("/api/personal/password", { atual: $("#myOld").value, nova: $("#myNew").value }); $("#myOld").value = $("#myNew").value = ""; msg("Sua senha foi trocada.", 1); } catch (e) { msg(e.message); } };
  const sg = $("#stGo"); if (sg) sg.onclick = async () => { const u = $("#stSel").value, n = $("#stNew").value, s = (ME.students || []).find(x => x.u === u); try { await api("/api/personal/student-password", { usuario: u, nova: n }); $("#stNew").value = ""; msg(s && s.email ? `Pronto! Passe para o aluno o e-mail ${s.email} e a senha ${n}. Ele entra com esse e-mail.` : `Pronto! Passe para o aluno o usuário ${u} e a senha ${n}.`, 1); } catch (e) { msg(e.message); } };
};
if (ME.role === "personal" && typeof unlocked !== "undefined" && unlocked) renderPanel();
if (!$("#t-personal").classList.contains("hide")) render();

/* ---------- Puxar para atualizar (no app instalado não há botão de recarregar) ---------- */
(function ptr() {
  const ind = document.createElement("div"); ind.id = "ptr";
  ind.style.cssText = "position:fixed;left:50%;top:0;transform:translate(-50%,-60px);background:#111;color:#d4a017;border:1px solid #d4a017;padding:6px 14px;border-radius:0 0 12px 12px;font-size:.85rem;z-index:9998;transition:transform .15s;pointer-events:none";
  document.body.appendChild(ind);
  let y0 = null, dy = 0; const TH = 80;
  const blocked = t => (t.closest && t.closest("#detDrawer,#detOv,#stuPanel,#cardView,#chat,select,textarea,input,.open")) || (document.getElementById("detDrawer") || {}).classList?.contains("open");
  addEventListener("touchstart", e => { y0 = (scrollY <= 0 && e.touches.length === 1 && !blocked(e.target)) ? e.touches[0].clientY : null; dy = 0; }, { passive: true });
  addEventListener("touchmove", e => { if (y0 === null) return; if (scrollY > 0) { y0 = null; ind.style.transform = "translate(-50%,-60px)"; return; }
    dy = e.touches[0].clientY - y0; if (dy <= 10) return; ind.textContent = dy > TH ? "↻ Solte para atualizar" : "↓ Puxe para atualizar";
    ind.style.transform = `translate(-50%,${Math.min(dy / 2, 40) - 20}px)`; }, { passive: true });
  addEventListener("touchend", () => { if (y0 !== null && dy > TH) { ind.textContent = "Atualizando..."; location.reload(); } else ind.style.transform = "translate(-50%,-60px)"; y0 = null; dy = 0; });
})();
// nova versão do app publicada: recarrega só se já havia um service worker ao abrir a página (troca de versão), no máximo uma vez
if ("serviceWorker" in navigator) { const hadController = !!navigator.serviceWorker.controller; let reloading = false; navigator.serviceWorker.addEventListener("controllerchange", () => { if (!hadController || reloading || !navigator.serviceWorker.controller) return; reloading = true; if (!document.querySelector("input:focus,textarea:focus")) location.reload(); }); navigator.serviceWorker.getRegistration().then(r => r && r.update()).catch(() => {}); }

/* Chrome Android pausa a fala longa sozinho; resume() periódico segura. Não espera onvoiceschanged para falar. */
(function ttsKeepAlive() {
  if (!("speechSynthesis" in window)) return;
  setInterval(() => { if (speechSynthesis.speaking) try { speechSynthesis.resume(); } catch (e) {} }, 5000);
})();
