/* Botão de instalar o app. O Chrome guarda o beforeinstallprompt; iPhone e Safari abrem o passo a passo. */
(function () {
  if (window.__baixarInit) return;
  window.__baixarInit = true;
  var IOS = "No iPhone, toque em Compartilhar e depois em Adicionar à Tela de Início.";
  var AND = "No Android, toque nos três pontinhos e depois em Instalar app.";
  var promptEv = null;
  function installed() {
    if (window.__pwaInstalled) return true;
    try { if (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) return true; } catch (e) {}
    return navigator.standalone === true;
  }
  function iosLike() {
    var ua = navigator.userAgent || "";
    var iOS = /iPad|iPhone|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    var safari = /Safari/i.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|Android/i.test(ua);
    return iOS || safari;
  }
  function hideBar() {
    var bar = document.getElementById("baixarBar");
    if (bar) bar.classList.add("hide");
  }
  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    promptEv = e;
    window.__pwaPrompt = e;
  });
  window.addEventListener("appinstalled", function () { promptEv = null; window.__pwaPrompt = null; window.__pwaInstalled = true; hideBar(); });
  function mount() {
    if (!document.body || installed() || document.getElementById("baixarBar")) return;
    var css = document.createElement("style");
    css.textContent = "#baixarBar{background:#000;padding:10px 14px;display:flex;justify-content:center;border-bottom:3px solid #D4AF37}#baixarBar.hide,#baixarOv.hide{display:none!important}#baixarApp{width:min(520px,100%);min-height:52px;background:linear-gradient(135deg,#BF953F,#FCF6BA 30%,#B38728 55%,#FBF5B7 78%,#AA771C);color:#111;border:0;border-radius:12px;padding:14px 16px;font-weight:800;font-size:1.2rem;cursor:pointer;font-family:system-ui,-apple-system,sans-serif}#baixarOv{position:fixed;inset:0;z-index:220;background:#0008;display:flex;align-items:center;justify-content:center;padding:18px}#baixarBox{background:#fff;color:#1a1a1a;max-width:360px;width:100%;border-radius:16px;padding:18px;border:1px solid #e6d7a8;box-sizing:border-box}#baixarBox h2{margin:0 0 8px;font-size:1.15rem}#baixarBox p{margin:0 0 14px;line-height:1.45}#baixarOk{width:100%;background:#111;color:#f4e2a8;border:0;border-radius:12px;padding:12px;font-weight:700;cursor:pointer;font-family:system-ui,-apple-system,sans-serif}";
    document.head.appendChild(css);
    var bar = document.createElement("div");
    bar.id = "baixarBar";
    bar.innerHTML = '<button type="button" id="baixarApp">📲 Baixar app</button>';
    var header = document.querySelector("header");
    if (header && header.nextSibling) header.parentNode.insertBefore(bar, header.nextSibling);
    else document.body.insertBefore(bar, document.body.firstChild);
    var ov = document.createElement("div");
    ov.id = "baixarOv";
    ov.className = "hide";
    ov.setAttribute("role", "dialog");
    ov.setAttribute("aria-modal", "true");
    ov.setAttribute("aria-labelledby", "baixarTit");
    ov.innerHTML = '<div id="baixarBox"><h2 id="baixarTit">Baixar o app</h2><p id="baixarPasso"></p><button type="button" id="baixarOk">Entendi</button></div>';
    document.body.appendChild(ov);
    var waiting = false;
    function pronto(ev) { return ev && typeof ev.prompt === "function"; }
    function pegar() { return pronto(window.__pwaPrompt) ? window.__pwaPrompt : (pronto(promptEv) ? promptEv : null); }
    function abrirPrompt(ev) {
      promptEv = null;
      window.__pwaPrompt = null;
      var pending, choice = ev.userChoice;
      try { pending = ev.prompt(); }
      catch (e) { passoAPasso(); return; }
      var after = function (c) { if (c && c.outcome === "accepted") hideBar(); };
      if (pending && pending.then) pending.then(function () { return choice; }).then(after).catch(function () { passoAPasso(); });
      else if (choice && choice.then) choice.then(after).catch(function () { passoAPasso(); });
      else after(choice);
    }
    function passoAPasso() {
      document.getElementById("baixarPasso").textContent = iosLike() ? IOS : AND;
      ov.classList.remove("hide");
    }
    document.getElementById("baixarApp").onclick = function () {
      var ev = pegar();
      if (ev) { abrirPrompt(ev); return; }
      if (waiting) return;
      waiting = true;
      var t0 = Date.now();
      var timer = setInterval(function () {
        var got = pegar();
        if (got) { clearInterval(timer); waiting = false; abrirPrompt(got); return; }
        if (Date.now() - t0 >= 3000) { clearInterval(timer); waiting = false; passoAPasso(); }
      }, 100);
    };
    document.getElementById("baixarOk").onclick = function () { ov.classList.add("hide"); };
    ov.addEventListener("click", function (e) { if (e.target === ov) ov.classList.add("hide"); });
  }
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);
})();
