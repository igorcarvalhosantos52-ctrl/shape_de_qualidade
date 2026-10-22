/* Camada de dados: o app original usava localStorage. Aqui trocamos por um
   armazenamento em memória sincronizado com o servidor (API REST). */
const FKEY = "coachvoz_v1_";
const __timers = {};
function __mkStore(persist) {
  const m = new Map();
  return {
    getItem: k => (m.has(k) ? m.get(k) : persist ? window.localStorage.getItem("sqp_" + k) : null),
    setItem(k, v) { v = String(v); m.set(k, v);
      if (k.startsWith(FKEY)) { const u = k.slice(FKEY.length); clearTimeout(__timers[u]);
        __timers[u] = setTimeout(() => __push(u, v), 400); }
      else if (persist && k === "coachvoz_voz") window.localStorage.setItem("sqp_" + k, v); },
    removeItem: k => m.delete(k), _set: (k, v) => m.set(k, v),
  };
}
const localStorage = __mkStore(true), sessionStorage = __mkStore(false);
const __pending = new Set();
async function __push(u, v) {
  __pending.add(u);
  try { const r = await fetch("/api/ficha/" + encodeURIComponent(u), { method: "PUT", headers: { "Content-Type": "application/json" }, body: v });
    if (!r.ok) { const j = await r.json().catch(() => ({})); __toast(j.error || "Não foi possível salvar."); } }
  catch (e) { __toast("Sem conexão – tente de novo."); } finally { __pending.delete(u); }
}
window.addEventListener("beforeunload", e => { if (__pending.size) e.preventDefault(); });
function __toast(t) { let d = document.getElementById("sqToast"); if (!d) { d = document.createElement("div"); d.id = "sqToast";
  d.style.cssText = "position:fixed;left:50%;bottom:18px;transform:translateX(-50%);background:#111;color:#fff;padding:10px 16px;border-radius:10px;z-index:9999;font-size:.9rem;border:1px solid #d4a017"; document.body.appendChild(d); }
  d.textContent = t; d.style.display = "block"; clearTimeout(d._t); d._t = setTimeout(() => (d.style.display = "none"), 4000); }
function __load(src) { return new Promise((ok, err) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = err; document.body.appendChild(s); }); }
(async () => {
  let me = { role: null };
  try { me = await (await fetch("/api/me", { cache: "no-store" })).json(); } catch (e) { __toast("Sem conexão com o servidor."); }
  window.__ME = me;
  if (me.role === "student") {
    localStorage._set("sq_sessao", me.u);
    localStorage._set("sq_alunos", JSON.stringify({ [me.u]: { nome: me.nome, email: me.email || "" } }));
    if (me.ficha) localStorage._set(FKEY + me.u, JSON.stringify(me.ficha));
  } else if (me.role === "personal" && me.sub && me.sub.active) {
    const A = {}; me.students.forEach(s => { A[s.u] = { nome: s.nome, email: s.email || "" }; if (s.ficha) localStorage._set(FKEY + s.u, JSON.stringify(s.ficha)); });
    localStorage._set("sq_alunos", JSON.stringify(A));
    localStorage._set("sq_personal", JSON.stringify({ ...me.personal, hash: "server" }));
    sessionStorage._set("sq_personal_sessao", me.personal.email);
  }
  await __load("/aliases.js"); await __load("/voz.js"); await __load("/audio/clips.js").catch(() => {}); await __load("/app.js"); await __load("/glue.js");
})();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
