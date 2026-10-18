// Altura, peso e dias da semana. O mesmo arquivo vale no navegador (window.Voz) e no Node.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Voz = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const ORDEM = ["segunda", "terca", "quarta", "quinta", "sexta", "sabado", "domingo"];
  const ROT = { segunda: "Segunda", terca: "Terça", quarta: "Quarta", quinta: "Quinta", sexta: "Sexta", sabado: "Sábado", domingo: "Domingo" };
  const PEQ = { zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12, treze: 13, catorze: 14, quatorze: 14, quinze: 15, dezesseis: 16, dezasseis: 16, dezessete: 17, dezoito: 18, dezenove: 19 };
  const DEZ = { vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80, noventa: 90 };
  const CEN = { cem: 100, cento: 100, duzentos: 200, duzentas: 200, trezentos: 300, trezentas: 300, quatrocentos: 400, quatrocentas: 400 };
  const FILLER = new Set("de da do das dos altura peso meu minha tenho uns por volta aproximadamente mais ou menos cerca eh ah o a com medida uns cerca favor porfavor".split(" "));

  function semAcento(s) {
    return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[-_/]/g, " ").replace(/[.,!?;:]/g, " ").replace(/\s+/g, " ").trim();
  }
  function tokens(raw) {
    return semAcento(raw).split(" ").filter(w => w && !FILLER.has(w) && !/^(cm|centimetro|centimetros|kg|quilo|quilos|kilo|kilos)$/.test(w));
  }
  function numBr(raw) {
    let s = String(raw ?? "").trim().toLowerCase().replace(/\s+/g, "");
    s = s.replace(/(cm|kg|m|quilos?|kilos?)$/, "");
    if (!/^\d+([.,]\d+)?$/.test(s)) return null;
    const n = Number(s.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  function valorPalavras(words) {
    if (!words || !words.length) return null;
    let total = 0, cur = null, seen = false;
    const flush = () => { if (cur != null) { total += cur; cur = null; } };
    for (const w of words) {
      if (w === "e") continue;
      if (w === "meio" || w === "meia") { flush(); total += 0.5; seen = true; continue; }
      if (/^\d+([.,]\d+)?$/.test(w)) { flush(); cur = Number(String(w).replace(",", ".")); seen = true; continue; }
      if (Object.prototype.hasOwnProperty.call(CEN, w)) { flush(); cur = CEN[w]; seen = true; continue; }
      if (Object.prototype.hasOwnProperty.call(DEZ, w)) {
        if (cur != null && cur >= 100 && cur % 100 === 0) cur += DEZ[w];
        else { flush(); cur = DEZ[w]; }
        seen = true; continue;
      }
      if (Object.prototype.hasOwnProperty.call(PEQ, w)) {
        const v = PEQ[w];
        if (cur != null && ((cur >= 20 && cur % 10 === 0) || (cur >= 100 && cur % 100 === 0))) cur += v;
        else { flush(); cur = v; }
        seen = true; continue;
      }
      return null;
    }
    flush();
    return seen ? Math.round(total * 10) / 10 : null;
  }
  function valorSimples(words) {
    if (!words.length) return null;
    if (words.length === 1 && /^\d+([.,]\d+)?$/.test(words[0])) return Number(String(words[0]).replace(",", "."));
    if (words.length === 1 && Object.prototype.hasOwnProperty.call(PEQ, words[0])) return PEQ[words[0]];
    if (words.length === 1 && Object.prototype.hasOwnProperty.call(DEZ, words[0])) return DEZ[words[0]];
    if (words.length === 1 && Object.prototype.hasOwnProperty.call(CEN, words[0])) return CEN[words[0]];
    return valorPalavras(words);
  }
  function metroDe(words) {
    const core = [];
    let saw = false;
    words.forEach(w => { if (w === "metro" || w === "metros") saw = true; else core.push(w); });
    if (!core.length) return null;
    const iE = core.indexOf("e");
    const head = iE >= 0 ? core.slice(0, iE) : core;
    const tail = iE >= 0 ? core.slice(iE + 1) : [];
    const headN = valorSimples(head.filter(w => w !== "e"));
    if (headN !== 1 && headN !== 2) return null;
    if (!tail.length) return saw ? headN * 100 : null;
    const rest = valorPalavras(tail);
    if (rest == null) return null;
    if (rest < 1) return Math.round((headN + rest) * 1000) / 10;
    if (rest >= 1 && rest <= 99) return headN * 100 + rest;
    return null;
  }
  function altura(raw) {
    const n = numBr(raw);
    if (n != null) {
      const cm = n < 3 ? Math.round(n * 1000) / 10 : Math.round(n * 10) / 10;
      if (cm < 50 || cm > 250) return null;
      return cm;
    }
    const words = tokens(raw);
    if (!words.length) return null;
    let cm = metroDe(words);
    if (cm == null) {
      const v = valorPalavras(words.filter(w => w !== "metro" && w !== "metros"));
      if (v == null) return null;
      cm = v < 3 ? Math.round(v * 1000) / 10 : Math.round(v * 10) / 10;
    } else cm = Math.round(cm * 10) / 10;
    if (cm < 50 || cm > 250) return null;
    return cm;
  }
  function peso(raw) {
    const n = numBr(raw);
    let kg = n;
    if (kg == null) {
      const words = tokens(raw).filter(w => w !== "metro" && w !== "metros");
      kg = valorPalavras(words);
    }
    if (kg == null) return null;
    kg = Math.round(Number(kg) * 10) / 10;
    if (kg < 20 || kg > 400) return null;
    return kg;
  }
  const DIA = "(segunda|terca|quarta|quinta|sexta|sabado|domingo)(?:\\s+feira)?";
  function faixa(a, b) {
    const i = ORDEM.indexOf(a), j = ORDEM.indexOf(b), out = [];
    if (i < 0 || j < 0) return out;
    if (i <= j) { for (let k = i; k <= j; k++) out.push(ORDEM[k]); }
    else { for (let k = i; k < ORDEM.length; k++) out.push(ORDEM[k]); for (let k = 0; k <= j; k++) out.push(ORDEM[k]); }
    return out;
  }
  function dias(raw) {
    const s = semAcento(raw);
    if (!s) return [];
    if (/\b(semana toda|toda a semana|semana inteira|a semana inteira|todos os dias)\b/.test(s)) return ORDEM.slice();
    const picked = new Set();
    const rangeRe = new RegExp("\\b" + DIA + "\\s+(?:a|ate)\\s+(?:a\\s+)?" + DIA, "g");
    let m;
    while ((m = rangeRe.exec(s))) faixa(m[1], m[2]).forEach(d => picked.add(d));
    const one = new RegExp("\\b" + DIA, "g");
    while ((m = one.exec(s))) picked.add(m[1]);
    if (/\b(fim de semana|final de semana|fins de semana)\b/.test(s)) { picked.add("sabado"); picked.add("domingo"); }
    if (/\bdias? uteis\b/.test(s)) ORDEM.slice(0, 5).forEach(d => picked.add(d));
    return ORDEM.filter(d => picked.has(d));
  }
  function msgDias(disse, n) {
    const d = Number(disse), c = Number(n);
    return "Você disse " + d + (d === 1 ? " dia" : " dias") + ", mas citou " + c + ". Qual vale?";
  }
  function numeroSolto(s) {
    const digits = s.match(/\d+/g);
    if (digits && digits.length) return digits.map(n => parseInt(n, 10));
    const words = s.split(" ").filter(w => w === "e" || w === "meio" || w === "meia" || Object.prototype.hasOwnProperty.call(PEQ, w) || Object.prototype.hasOwnProperty.call(DEZ, w) || Object.prototype.hasOwnProperty.call(CEN, w));
    if (!words.length) return [];
    const v = valorPalavras(words);
    return v != null && v === Math.round(v) ? [v] : [];
  }
  function escolherDias(disse, citados, resposta) {
    const cit = Array.isArray(citados) ? citados.filter(d => ORDEM.includes(d)) : [];
    const listed = dias(resposta);
    const s = semAcento(resposta);
    if (listed.length) return { acao: "dias", dias: listed };
    const nums = numeroSolto(s);
    const querDias = /\b(os dias|citei|esses|essas|os que citei|os que eu disse)\b/.test(s);
    const querNum = /\b(o numero|quantos|a quantidade|o tanto)\b/.test(s);
    if (nums.length === 1) {
      if (nums[0] === cit.length) return { acao: "dias", dias: cit };
      if (nums[0] === Number(disse)) return { acao: "numero" };
    }
    if (querDias && !querNum) return { acao: "dias", dias: cit };
    if (querNum && !querDias) return { acao: "numero" };
    return { acao: "incerto" };
  }
  function rotulos(ids) { return (ids || []).map(id => ROT[id] || id); }
  return { altura, peso, dias, msgDias, escolherDias, rotulos, semAcento };
});
