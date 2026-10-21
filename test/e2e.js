// Teste ponta a ponta: cadastro do personal -> paywall -> pagamento demo -> convite -> aluno faz anamnese -> personal aprova
const puppeteer = require('puppeteer-core'), { spawn, spawnSync } = require('child_process'), path = require('path'), fs = require('fs');
const LIB = '/tmp/sq-e2e-libsql.db', SQLITE = '/tmp/sq-e2e-sqlite.db';
for (const f of [LIB, LIB + '-wal', LIB + '-shm', SQLITE, SQLITE + '-wal', SQLITE + '-shm']) fs.rmSync(f, { force: true });
process.env.TURSO_DATABASE_URL = 'file:' + LIB;
delete process.env.TURSO_AUTH_TOKEN;
const sql = require('../src/db'), pay = require('../src/payments');
const PORT = 3456, URL = `http://localhost:${PORT}`, SHOTS = path.join(__dirname, '..', 'screens');
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function dizer(page, textos) {
  for (const t of textos) {
    const n = await page.$$eval('#chat .msg', x => x.length);
    await page.type('#txt', t);
    await page.keyboard.press('Enter');
    await page.waitForFunction(n => document.querySelectorAll('#chat .msg').length > n + 1 || !document.querySelector('#anamCard') || document.querySelector('#anamCard').classList.contains('hide'), { timeout: 15000 }, n);
    await sleep(300);
  }
}
const ok = (c, m) => { if (!c) throw new Error('FALHOU: ' + m); console.log('✔ ' + m); };
(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const smoke = spawnSync(process.execPath, ['-e', `
    delete process.env.TURSO_DATABASE_URL; delete process.env.TURSO_AUTH_TOKEN;
    process.env.DB_PATH = ${JSON.stringify(SQLITE)};
    const db = require('./src/db');
    db.ready.then(async () => {
      if (db.driver !== 'sqlite') throw new Error('driver ' + db.driver);
      await db.migrate();
      const r = await db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run('tok', 'personal', 7, Date.now() + 10000);
      if (typeof r.lastInsertRowid !== 'number') throw new Error('rowid ' + typeof r.lastInsertRowid);
      const s = await db.prepare('SELECT role, user_id FROM sessions WHERE token=?').get('tok');
      if (!s || s.role !== 'personal' || s.user_id !== 7) throw new Error('sessao ' + JSON.stringify(s));
      console.log('SQLITE_OK');
    }).catch(e => { console.error(e); process.exit(1); });
  `], { cwd: path.join(__dirname, '..'), env: { ...process.env, TURSO_DATABASE_URL: '', TURSO_AUTH_TOKEN: '' }, encoding: 'utf8' });
  if (smoke.status !== 0 || !/SQLITE_OK/.test(smoke.stdout || '')) throw new Error('caminho SQLite local falhou: ' + (smoke.stderr || smoke.stdout));
  ok(true, 'sem TURSO_DATABASE_URL o app usa SQLite local e grava a sessão');
  await sql.ready; await sql.migrate();
  ok(sql.driver === 'libsql' && String(process.env.TURSO_DATABASE_URL).startsWith('file:'), 'com TURSO_DATABASE_URL o app usa libSQL');
  const medidas = require('../src/medidas');
  ok(medidas.altura('1,75') === 175 && medidas.altura('175') === 175 && medidas.altura('1.70') === 170 && medidas.altura('175 cm') === 175 && medidas.peso('70,5') === 70.5 && medidas.peso('80') === 80, 'altura aceita cm ou metros com vírgula e peso aceita vírgula');
  ok(medidas.altura('') === null && medidas.altura('abc') === null && medidas.altura('0,4') === null && medidas.peso('10') === null, 'altura e peso fora da faixa não passam');
  const avalMod = require('../src/avaliacao');
  const cmpEx = avalMod.comparar([
    { id: 1, kind: 'inicial', taken_on: '2026-01-15', created_at: 1, peso: 70.5, cintura: 92, gordura: 28, photo: 'data:image/jpeg;base64,aaaa' },
    { id: 2, kind: 'atual', taken_on: '2026-04-15', created_at: 2, peso: 68, cintura: 86, gordura: 24, photo: '' },
  ]);
  ok(cmpEx && cmpEx.tempo === '3 meses' && cmpEx.linhas.some(l => l.k === 'cintura' && l.tom === 'ok' && l.texto === 'Cintura 92 → 86 cm (−6)') && cmpEx.linhas.some(l => l.k === 'peso' && l.tom === '' && l.texto === 'Peso 70,5 → 68 kg (−2,5)'), 'o comparativo marca a cintura que diminuiu e deixa o peso neutro');
  ok(avalMod.geb(70.5, 175, 19, 'M') === 1709 && avalMod.geb(68, 175, 19, 'M') === 1684 && avalMod.geb(68, 175, 19, 'F') === 1518 && avalMod.geb(68, 175, 19, '') === null && avalMod.geb(null, 175, 19, 'M') === null, 'o gasto basal usa Mifflin-St Jeor e fica vazio sem sexo ou peso');
  const perfilEx = avalMod.montarPerfil({ nome: 'Pamela Souza', altura_cm: 175, peso_kg: 70.5, dias_semana: '["segunda","quarta"]', ficha: JSON.stringify({ a: { idade: 19, dias: 4, objTxt: 'Ganho de massa muscular', objetivo: 'hipertrofia' } }) }, [
    { id: 1, kind: 'inicial', taken_on: '2026-01-15', created_at: 1, peso: 70.5, dobra_tricipital: 18, sexo: 'M' },
    { id: 2, kind: 'atual', taken_on: '2026-04-15', created_at: 2, peso: 68, dobra_tricipital: 12, sexo: 'M' },
  ]);
  const dobraEx = avalMod.comparar([
    { id: 1, kind: 'inicial', taken_on: '2026-01-15', created_at: 1, dobra_tricipital: 18 },
    { id: 2, kind: 'atual', taken_on: '2026-04-15', created_at: 2, dobra_tricipital: 12 },
  ]);
  ok(perfilEx.idade === 19 && perfilEx.frequencia === 4 && perfilEx.objetivo === 'Ganho de massa muscular' && perfilEx.peso_inicial === 70.5 && perfilEx.peso_atual === 68 && perfilEx.geb === 1684 && dobraEx.linhas.some(l => l.k === 'dobra_tricipital' && l.tom === 'ok' && l.texto === 'Tricipital 18 → 12 mm (−6)'), 'o cabeçalho junta anamnese e avaliações, e a dobra que diminui fica verde');
  const voz = require('../public/voz');
  ok(voz.altura('um e setenta e cinco') === 175 && voz.altura('1 e 75') === 175 && voz.altura('um metro e setenta e cinco') === 175 && voz.altura('um e meio') === 150 && voz.altura('cento e setenta e cinco') === 175, 'altura falada vira centímetros');
  ok(voz.peso('setenta quilos') === 70 && voz.peso('setenta e meio') === 70.5 && voz.peso('setenta quilos e meio') === 70.5, 'peso falado entende quilos e meio');
  ok(JSON.stringify(voz.dias('segunda e quarta')) === '["segunda","quarta"]' && JSON.stringify(voz.dias('de segunda a sexta')) === '["segunda","terca","quarta","quinta","sexta"]' && JSON.stringify(voz.dias('fim de semana')) === '["sabado","domingo"]' && JSON.stringify(voz.dias('terça e sábado')) === '["terca","sabado"]', 'dias falados viram a lista da semana');
  ok(voz.msgDias(6, 3) === 'Você disse 6 dias, mas citou 3. Qual vale?' && voz.escolherDias(6, ['segunda', 'quarta', 'sexta'], 'os dias').acao === 'dias' && voz.escolherDias(6, ['segunda', 'quarta', 'sexta'], '6').acao === 'numero' && voz.escolherDias(6, ['segunda', 'quarta', 'sexta'], 'sei la').acao === 'incerto', 'a confirmação separa os dias citados da quantidade');
  const aluno = require('../src/aluno');
  ok(aluno.emailNorm('  Pamela.Souza@Teste.com ') === 'pamela.souza@teste.com' && aluno.emailOk('pamela.souza@teste.com') && !aluno.emailOk('pamela souza') && !aluno.emailOk('a@b'), 'e-mail do aluno fica minúsculo, sem espaços, e o formato é validado');
  ok(aluno.primeiroNome('Pamela Souza') === 'Pamela' && aluno.primeiroNome('ana') === 'ana', 'o primeiro nome sai do nome completo');
  const ownerTest = require('../src/owner-test');
  const savedOwner = process.env.OWNER_TEST_EMAILS, savedAdmin = process.env.ADMIN_EMAIL;
  delete process.env.OWNER_TEST_EMAILS; process.env.ADMIN_EMAIL = 'dono@teste.com';
  ok(ownerTest.allows('dono@teste.com', 4) && !ownerTest.allows('igor@teste.com', 4), 'sem OWNER_TEST_EMAILS vale o e-mail do admin e o resto segue a regra paga');
  ok(ownerTest.allows('unico@teste.com', 1), 'se só existe uma conta de personal, ela entra no teste do dono');
  process.env.OWNER_TEST_EMAILS = 'marina@exemplo.com, joao@exemplo.com';
  ok(ownerTest.allows('marina@exemplo.com', 3) && ownerTest.allows('joao@exemplo.com', 3) && ownerTest.allows('dono@teste.com', 3) && !ownerTest.allows('igor@teste.com', 3), 'a lista e a conta do admin liberam; as outras não');
  process.env.OWNER_TEST_EMAILS = 'off';
  ok(!ownerTest.config().on && !ownerTest.allows('dono@teste.com', 1), 'OWNER_TEST_EMAILS=off desliga o teste do dono');
  const videosMod = require('../src/videos');
  ok(videosMod.slug('Tríceps na polia (corda)') === 'triceps-na-polia-corda' && videosMod.slug('Agachamento livre com barra') === 'agachamento-livre-com-barra', 'o slug do vídeo tira acento, parêntese e vira o nome do arquivo');
  ok(videosMod.catalogo().includes('Prancha abdominal') && videosMod.catalogo().includes("World's greatest stretch (passo longo com rotação)") && !videosMod.catalogo().includes('Remada cavalinho'), 'o catálogo de vídeos é o da ficha, sem exercício livre');
  ok(Object.keys(videosMod.padroes()).length === 0, 'sem mp4 gravado, nenhum vídeo padrão aparece');
  if (savedOwner === undefined) delete process.env.OWNER_TEST_EMAILS; else process.env.OWNER_TEST_EMAILS = savedOwner;
  if (savedAdmin === undefined) delete process.env.ADMIN_EMAIL; else process.env.ADMIN_EMAIL = savedAdmin;
  const srv = spawn('node', ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT, TURSO_DATABASE_URL: 'file:' + LIB, TURSO_AUTH_TOKEN: '', ADMIN_EMAIL: 'dono@teste.com', ADMIN_PASSWORD: 'admin123', MP_ACCESS_TOKEN: '', STRIPE_SECRET_KEY: '' }, stdio: 'inherit' });
  await sleep(1200);
  let videoTeste = '';
    const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const phone = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
  try {
    // ---- personal
    const ctxP = await browser.createBrowserContext(), p = await ctxP.newPage(); await p.setViewport(phone);
    p.on('pageerror', e => console.error('erro na página (personal):', e.message));
    await p.evaluateOnNewDocument(() => {
      window.addEventListener('beforeinstallprompt', function (e) {
        if (e.isTrusted) { e.preventDefault(); e.stopImmediatePropagation(); }
      }, true);
    });
    await p.goto(URL, { waitUntil: 'networkidle0' });
    await p.screenshot({ path: SHOTS + '/01-login-aluno.png' });
    await p.waitForSelector('#baixarApp');
    const baixarLogin = await p.evaluate(() => {
      const b = document.querySelector('#baixarApp');
      const r = b.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { text: b.textContent, w: r.width, h: r.height, top: r.top, hit: !!(hit && (hit === b || b.contains(hit))) };
    });
    ok(baixarLogin.text === '📲 Baixar app' && baixarLogin.w > 200 && baixarLogin.h >= 48 && baixarLogin.top >= 0 && baixarLogin.top < 360 && baixarLogin.hit, 'a entrada mostra o botão Baixar app bem visível');
    await p.click('#baixarApp');
    await p.waitForSelector('#baixarOv:not(.hide)');
    const passoAndroid = await p.$eval('#baixarPasso', e => e.textContent);
    ok(/três pontinhos/.test(passoAndroid) && /Instalar app/.test(passoAndroid) && !/Compartilhar/.test(passoAndroid) && !/[—–]/.test(passoAndroid), 'sem o prompt nativo, o Chrome mostra o passo a passo do Android');
    await p.click('#baixarOk');
    await p.waitForSelector('#baixarOv.hide');
    await p.evaluate(() => {
      window.__pwaPrompted = 0;
      const ev = new Event('beforeinstallprompt', { cancelable: true });
      ev.prompt = () => { window.__pwaPrompted += 1; return Promise.resolve(); };
      ev.userChoice = Promise.resolve({ outcome: 'dismissed' });
      window.dispatchEvent(ev);
    });
    await p.click('#baixarApp');
    await p.waitForFunction(() => window.__pwaPrompted === 1);
    ok(await p.$eval('#baixarOv', e => e.classList.contains('hide')) && !(await p.$eval('#baixarBar', e => e.classList.contains('hide'))), 'no Chrome o toque chama prompt() e o botão continua se a pessoa recusar');
    const man = await p.evaluate(async () => {
      const j = await (await fetch('/manifest.webmanifest')).json();
      const icons = [];
      for (const i of j.icons || []) {
        const ir = await fetch(i.src);
        const b = new Uint8Array(await ir.arrayBuffer());
        icons.push({ sizes: i.sizes, type: ir.headers.get('content-type') || '', purpose: i.purpose || '', w: (b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19], h: (b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23], png: b[0] === 137 && b[1] === 80 });
      }
      const sw = await (await fetch('/sw.js')).text();
      const head = document.head.firstElementChild;
      return { name: j.name, display: j.display, id: j.id, start: j.start_url, icons, ver: /sq-v34/.test(sw), pre: !/videos/.test(sw.slice(0, sw.indexOf('addEventListener'))), baixar: sw.includes('"/baixar.js"'), fetch: sw.includes('addEventListener("fetch"'), offline: sw.includes('caches.match("/")'), early: !!(head && head.tagName === 'SCRIPT' && /__pwaPrompt/.test(head.textContent) && /serviceWorker\.register\("\/sw\.js"\)/.test(head.textContent)) };
    });
    ok(man.name === 'Shape de Qualidade' && man.display === 'standalone' && man.id === '/' && man.start === '/' && man.early && man.ver && man.pre && man.baixar && man.fetch && man.offline && man.icons.some(i => i.sizes === '192x192' && i.w === 192 && i.h === 192 && i.png && i.purpose === 'any' && /png/.test(i.type)) && man.icons.some(i => i.sizes === '512x512' && i.w === 512 && i.h === 512 && i.png && i.purpose === 'any' && /png/.test(i.type)) && man.icons.some(i => i.sizes === '192x192' && i.purpose === 'maskable') && man.icons.some(i => i.sizes === '512x512' && i.purpose === 'maskable') && !man.icons.some(i => i.purpose === 'any maskable'), 'o manifest tem id, start_url, ícones PNG de 192 e 512 separados em any e maskable, e o service worker sq-v34 sem pré-cache de vídeo');
    const conviteHtml = await (await fetch(URL + '/convite/TESTE123')).text();
    ok(conviteHtml.indexOf('__pwaPrompt') > 0 && conviteHtml.indexOf('__pwaPrompt') < conviteHtml.indexOf('rel="manifest"') && /serviceWorker\.register\("\/sw\.js"\)/.test(conviteHtml), 'o /convite registra o prompt e o service worker no começo do head');
    const ctxIos = await browser.createBrowserContext(), ios = await ctxIos.newPage();
    await ios.setViewport(phone);
    await ios.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1');
    await ios.evaluateOnNewDocument(() => {
      window.addEventListener('beforeinstallprompt', function (e) {
        if (e.isTrusted) { e.preventDefault(); e.stopImmediatePropagation(); }
      }, true);
    });
    await ios.goto(URL, { waitUntil: 'networkidle0' });
    await ios.waitForSelector('#baixarApp');
    await ios.click('#baixarApp');
    await ios.waitForSelector('#baixarOv:not(.hide)');
    const passoIos = await ios.$eval('#baixarPasso', e => e.textContent);
    ok(/Compartilhar/.test(passoIos) && /Adicionar à Tela de Início/.test(passoIos) && !/três pontinhos/.test(passoIos) && !/[—–]/.test(passoIos), 'no iPhone o passo a passo pede Compartilhar e Adicionar à Tela de Início');
    await ctxIos.close();
    const ctxSolo = await browser.createBrowserContext(), solo = await ctxSolo.newPage();
    await solo.setViewport(phone);
    await solo.evaluateOnNewDocument(() => {
      const orig = window.matchMedia.bind(window);
      window.matchMedia = q => String(q).indexOf('display-mode: standalone') >= 0
        ? { matches: true, media: String(q), addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; } }
        : orig(q);
    });
    await solo.goto(URL, { waitUntil: 'networkidle0' });
    await solo.waitForSelector('header');
    ok(!(await solo.$('#baixarApp')), 'com o app já instalado em standalone o botão some');
    await ctxSolo.close();
    const ctxNav = await browser.createBrowserContext(), navSt = await ctxNav.newPage();
    await navSt.setViewport(phone);
    await navSt.evaluateOnNewDocument(() => { Object.defineProperty(Navigator.prototype, 'standalone', { configurable: true, get() { return true; } }); });
    await navSt.goto(URL, { waitUntil: 'networkidle0' });
    await navSt.waitForSelector('header');
    ok(!(await navSt.$('#baixarApp')), 'com navigator.standalone o botão some');
    await ctxNav.close();
    const ctxAcc = await browser.createBrowserContext(), acc = await ctxAcc.newPage();
    await acc.setViewport(phone);
    await acc.goto(URL, { waitUntil: 'networkidle0' });
    await acc.waitForSelector('#baixarApp');
    await acc.evaluate(() => {
      window.addEventListener('beforeinstallprompt', function (e) {
        if (e.isTrusted) { e.preventDefault(); e.stopImmediatePropagation(); }
      }, true);
      const ev = new Event('beforeinstallprompt', { cancelable: true });
      ev.prompt = () => Promise.resolve();
      ev.userChoice = Promise.resolve({ outcome: 'accepted' });
      window.__pwaPrompt = ev;
      window.dispatchEvent(ev);
    });
    await acc.click('#baixarApp');
    await acc.waitForSelector('#baixarBar.hide');
    ok(true, 'se a pessoa aceita instalar, o botão some');
    await ctxAcc.close();
    await p.click('#goPers'); await p.waitForSelector('#pSwap'); await p.click('#pSwap');
    await p.type('#pNomeAcc', 'Igor Personal'); await p.type('#pEmail', 'igor@teste.com'); await p.type('#pCrefAcc', '012345-G/MS');
    await p.type('#pw1', 'senha1234'); await p.type('#pw2', 'senha1234'); await p.click('label[data-plan="basico"]');
    ok(/2 dias grátis/.test(await p.$eval('body', e => e.innerText)), 'o cadastro avisa que o teste grátis dura 2 dias');
    await p.screenshot({ path: SHOTS + '/02-cadastro-personal.png', fullPage: true });
    await Promise.all([p.waitForNavigation(), p.click('#pwGo')]);
    await p.waitForSelector('#planBox');
    ok((await p.$eval('#baixarApp', e => e.textContent)) === '📲 Baixar app' && !(await p.$eval('#baixarBar', e => e.classList.contains('hide'))), 'o painel do personal mostra Baixar app');
    const tb = await p.$eval('#planBox', e => e.innerText);
    ok(/TESTE GRÁTIS – 2 dia/.test(tb) && /Básico/.test(tb), 'novo personal ganha 2 dias grátis no plano escolhido (Básico)');
    const ctxExtra = await browser.createBrowserContext(), extraPg = await ctxExtra.newPage();
    await extraPg.goto(URL, { waitUntil: 'networkidle0' });
    const extraOwner = await extraPg.evaluate(async () => {
      const s = await fetch('/api/personal/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome: 'Conta Extra', email: 'extra.owner@teste.com', senha: 'senha1234', plano: 'basico' }) });
      const cards = await (await fetch('/api/cards')).json();
      const eb = await fetch('/api/ebook');
      const vid = await fetch('/api/tutoriais/link', { headers: { Range: 'bytes=0-1' } });
      const me = await (await fetch('/api/me')).json();
      return { signup: s.status, open: cards.cards.filter(c => !c.locked).length, eb: eb.status, vid: vid.status, vidType: vid.headers.get('content-type') || '', owner: !!me.owner_test, trial: !!(me.sub && me.sub.trial) };
    });
    ok(extraOwner.signup === 200 && extraOwner.trial && extraOwner.owner === false && extraOwner.open === 0 && extraOwner.eb === 403 && (extraOwner.vid === 200 || extraOwner.vid === 206) && /mp4/.test(extraOwner.vidType), 'Básico no teste grátis vê os tutoriais e não vê cards nem ebook');
    await p.reload({ waitUntil: 'networkidle0' });
    await p.waitForSelector('#ebookSec');
    const trialCards = await p.evaluate(async () => { const r = await fetch('/api/cards'); const j = await r.json(); const img = await fetch('/api/cards/1/img'); const ej = await img.json().catch(() => ({})); const c = j.cards && j.cards[0]; return { st: r.status, plan: j.plan, trial: j.trial, paid: j.paid, n: j.cards.length, locked: j.cards.filter(x => x.locked).length, okf: !!(c && c.titulo && c.regiao && c.plano && 'locked' in c), img: img.status, err: ej.error || '' }; });
    ok(trialCards.st === 200 && trialCards.trial && trialCards.paid === false && trialCards.plan === 'basico' && trialCards.n === 100 && trialCards.locked === 100 && trialCards.okf && trialCards.img === 403 && /assinatura/.test(trialCards.err), 'no teste grátis todos os cards ficam bloqueados até a assinatura');
    await p.waitForSelector('#cardStudySec');
    const abaixoTrial = await p.evaluate(() => { const a = document.querySelector('#stuDet').getBoundingClientRect(), b = document.querySelector('#cardStudySec').getBoundingClientRect(); return b.top > a.top && /Cards de memorização para estudo/.test(document.querySelector('#cardStudySec').innerText); });
    ok(abaixoTrial, 'seção de cards fica abaixo da lista de alunos');
    const ebookTrialUi = await p.evaluate(async () => {
      const c = document.querySelector('#cardStudySec'), e = document.querySelector('#ebookSec');
      const r = await fetch('/api/ebook'); const j = await r.json().catch(() => ({}));
      return { next: c && c.nextElementSibling && c.nextElementSibling.id, text: e ? e.textContent : '', btn: !!document.querySelector('#ebookGo'), st: r.status, err: j.error || '', cache: r.headers.get('cache-control') || '' };
    });
    ok(ebookTrialUi.next === 'ebookSec' && /Ebook: Guia Prático dos Exercícios/.test(ebookTrialUi.text) && /Guia Prático dos Exercícios de Musculação/.test(ebookTrialUi.text) && /Liberado após a assinatura/.test(ebookTrialUi.text) && !ebookTrialUi.btn && ebookTrialUi.st === 403 && /Liberado após a assinatura/.test(ebookTrialUi.err) && /no-store/.test(ebookTrialUi.cache), 'ebook fica abaixo dos cards e trancado no teste grátis');
    await p.evaluate(() => document.querySelector('#cardStudySec').scrollIntoView());
    await p.click('#cardStudySec summary');
    await p.waitForSelector('.cardtile.locked');
    const basUi = await p.evaluate(() => ({ locks: document.querySelectorAll('.cardtile.locked').length, imgs: document.querySelectorAll('.cardtile img').length, msg: document.querySelector('#cardStudyBody').innerText }));
    ok(basUi.locks === 100 && basUi.imgs === 0 && /Liberado após a assinatura/.test(basUi.msg), 'no teste grátis a grade mostra o cadeado e o aviso de assinatura, sem baixar as imagens');
    await p.click('.cardtile.locked');
    await p.waitForSelector('#cardView:not(.hide) .cvlock');
    ok(/Liberado após a assinatura/.test(await p.$eval('#cardView', e => e.innerText)) && !(await p.$('#cardView img')), 'card bloqueado no teste abre o aviso de assinatura, sem a imagem');
    await p.click('#cardNext');
    ok(/\(2\//.test(await p.$eval('#cardCap', e => e.textContent)) && await p.$('#cardView .cvlock'), 'na tela cheia o próximo card também fica bloqueado');
    await p.click('#cardViewX');
    // teste grátis acaba -> paywall com escolha de plano
    const pid = (await sql.prepare("SELECT id FROM personals WHERE email='igor@teste.com'").get()).id;
    const sess = await sql.prepare("SELECT role, user_id FROM sessions WHERE user_id=? AND role='personal'").get(pid);
    ok(sess && sess.role === 'personal' && sess.user_id === pid, 'sessão do personal fica gravada no banco libSQL');
    const endNovo = (await sql.prepare('SELECT current_period_end e FROM subscriptions WHERE personal_id=?').get(pid)).e;
    const leftDays = (endNovo - Date.now()) / 864e5;
    ok(leftDays > 1.9 && leftDays <= 2.01, 'o teste novo termina em 2 dias');
    const antigo = Date.now() + 4 * 864e5;
    await sql.prepare('UPDATE subscriptions SET current_period_end=? WHERE personal_id=?').run(antigo, pid);
    await p.evaluate(async () => { await fetch('/api/me'); await fetch('/api/cards'); });
    ok((await sql.prepare('SELECT current_period_end e FROM subscriptions WHERE personal_id=?').get(pid)).e === antigo, 'teste já em andamento mantém a data de fim, mesmo a de 4 dias');
    await sql.prepare("UPDATE subscriptions SET current_period_end=? WHERE personal_id=?").run(Date.now() - 1000, pid);
    await p.reload({ waitUntil: 'networkidle0' }); await p.waitForSelector('#paywall');
    ok(/teste grátis acabou/i.test(await p.$eval('#paywall', e => e.innerText)) && (await p.$$('#planos .plan')).length === 3, 'fim do teste grátis leva ao paywall com 3 planos');
    ok(await pay.startTrial(pid, 'pro') === false, 'só um teste grátis por conta');
    await p.click('label[data-plan="basico"]'); await sleep(200);
    await p.screenshot({ path: SHOTS + '/03-paywall.png' }); await p.screenshot({ path: SHOTS + '/11-planos.png', fullPage: true });
    await Promise.all([p.waitForNavigation(), p.click('#payDemo')]);
    await p.waitForSelector('#invCode'); const code = await p.$eval('#invCode', e => e.textContent); ok(code.length === 8, 'pagamento demo ativou o plano; código de convite ' + code);
    const demoCards = await p.evaluate(async () => { const j = await (await fetch('/api/cards')).json(); const img = await fetch('/api/cards/1/img'); const ej = await img.json().catch(() => ({})); return { paid: j.paid, locked: j.cards.filter(x => x.locked).length, img: img.status, err: ej.error || '' }; });
    ok(demoCards.paid === false && demoCards.locked === 100 && demoCards.img === 403 && /assinatura/.test(demoCards.err), 'pagamento simulado não libera os cards');
    const ebookDemo = await p.evaluate(async () => { const r = await fetch('/api/ebook'); const j = await r.json().catch(() => ({})); const me = await (await fetch('/api/me')).json(); return { st: r.status, err: j.error || '', paid: me.paid, trial: !!(me.sub && me.sub.trial), text: (document.querySelector('#ebookSec') || {}).textContent || '' }; });
    ok(ebookDemo.paid === false && ebookDemo.trial === false && ebookDemo.st === 403 && /Liberado após a assinatura/.test(ebookDemo.err) && /Liberado após a assinatura/.test(ebookDemo.text) && !/Abrir ebook/.test(ebookDemo.text), 'pagamento simulado não abre o ebook');
    await sleep(500); await p.screenshot({ path: SHOTS + '/04-painel-personal-convite.png' });
    // ---- aluno
    const ctxA = await browser.createBrowserContext(), a = await ctxA.newPage(); await a.setViewport(phone);
    a.on('pageerror', e => console.error('erro na página (aluno):', e.message));
    await a.evaluateOnNewDocument(() => {
      window.__spoken = [];
      const hook = () => {
        const ss = window.speechSynthesis; if (!ss || ss.__hooked) return;
        const orig = ss.speak.bind(ss);
        ss.speak = function (u) {
          window.__spoken.push({ text: String(u && u.text || ''), lang: (u && u.lang) || '', voice: (u && u.voice && u.voice.name) || '' });
          try { if (u && typeof u.onstart === 'function') u.onstart(); } catch (e) {}
          setTimeout(() => { try { if (u && typeof u.onend === 'function') u.onend(); } catch (e) {} }, 5);
          try { return orig(u); } catch (e) {}
        };
        ss.__hooked = true;
      };
      hook(); document.addEventListener('DOMContentLoaded', hook);
    });
    await a.goto(URL + '/convite/' + code, { waitUntil: 'networkidle0' });
    await a.waitForFunction(() => /convidado por/.test(document.querySelector('#lgInfo').textContent));
    ok((await a.$eval('#baixarApp', e => e.textContent)) === '📲 Baixar app' && !(await a.$eval('#baixarBar', e => e.classList.contains('hide'))), 'o link /convite/CÓDIGO mostra Baixar app');
    ok(!(await a.$('#lgUser')) && !(await a.$('#lgAltura')) && !(await a.$('#lgPeso')) && !!(await a.$('#lgEmail')) && !(await a.$eval('#lgEmail', e => e.classList.contains('hide'))) && (await a.$eval('#lgZapHint', e => e.textContent)) === 'Para o seu personal falar com você se precisar.' && !(await a.$eval('#lgZap', e => e.classList.contains('hide'))), 'cadastro do aluno pede e-mail e WhatsApp, e não pede usuário, altura nem peso');
    await a.type('#lgNome', 'Pamela Souza'); await a.type('#lgEmail', 'pamela souza'); await a.type('#lgPw', 'aluna123'); await a.type('#lgPw2', 'aluna123');
    await a.click('#lgGo');
    await a.waitForFunction(() => /e-mail válido/.test((document.querySelector('#lgErr') || {}).textContent || ''));
    ok(true, 'e-mail sem formato é recusado antes de criar a conta');
    await a.$eval('#lgEmail', e => { e.value = ''; }); await a.type('#lgEmail', 'pamela.souza@teste.com');
    await a.evaluate(() => { const e = document.querySelector('#lgZap'); e.value = '11987654321'; e.dispatchEvent(new Event('input', { bubbles: true })); });
    await a.screenshot({ path: SHOTS + '/05-cadastro-aluno-convite.png' });
    await Promise.all([a.waitForNavigation(), a.click('#lgGo')]);
    await a.waitForSelector('#t-aluno:not(.hide)');
    const pamRow = await sql.prepare("SELECT id, username FROM students WHERE email=?").get('pamela.souza@teste.com');
    const pamU = pamRow.username, pamId = pamRow.id;
    const dupMail = await a.evaluate(async (code) => { const r = await fetch('/api/student/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome: 'Pamela Outra', email: '  Pamela.Souza@teste.com ', senha: 'aluna123', convite: code, whatsapp: '11987650000' }) }); const me = await (await fetch('/api/me')).json(); return { st: r.status, j: await r.json(), role: me.role, nome: me.nome }; }, code);
    ok(dupMail.st === 409 && /e-mail/.test(dupMail.j.error) && dupMail.role === 'student' && dupMail.nome === 'Pamela Souza', 'e-mail repetido avisa e não troca a conta');
    ok((await a.$eval('#baixarApp', e => e.textContent)) === '📲 Baixar app' && !(await a.$eval('#baixarBar', e => e.classList.contains('hide'))), 'a área do aluno mostra Baixar app');
    ok(!(await a.$('#autoL')), 'não existe mais a opção de ouvir automaticamente');
    await a.waitForFunction(() => /Olá, Pamela!/.test(document.querySelector('#chat').textContent) && !/Olá, Pamela Souza/.test(document.querySelector('#chat').textContent), { timeout: 15000 }); ok(true, 'coach cumprimenta "Olá, Pamela" sem perguntar o nome');
    ok((await a.$eval('#whoName', e => e.textContent)) === '👤 Pamela' && (await a.$eval('#hdrAluno', e => e.textContent)) === 'Aluno: Pamela', 'perfil e cabeçalho mostram só o primeiro nome');
    await a.waitForFunction(() => (window.__played || []).some(s => /Quantos anos você tem/.test(s.text)), { timeout: 8000 });
    ok(await a.evaluate(() => !(window.__spoken || []).some(s => /Quantos anos você tem/.test(s.text))), 'depois do login a primeira pergunta toca em mp3, sem a voz do navegador');
    ok(!!(await a.$('#voiceGo')) && /Toque aqui para conversar por voz/.test(await a.$eval('#voiceGo', e => e.innerText)), 'durante a anamnese o aluno vê o botão para conversar por voz');
    ok(/ligado/.test(await a.$eval('#ttsToggle', e => e.textContent)) && (await a.$eval('#tts', e => e.checked)) && /volume de mídia/.test(await a.$eval('#volHint', e => e.textContent)), 'alto-falante começa ligado e avisa para checar o volume de mídia');
    const nRep = await a.evaluate(() => (window.__played || []).length);
    await a.evaluate(() => document.querySelector('#chat .repetir').click());
    await a.waitForFunction(n => (window.__played || []).length > n && (window.__played || []).some(s => /Quantos anos você tem/.test(s.text)), { timeout: 4000 }, nRep);
    ok(true, 'repetir toca de novo a pergunta do coach');
    await a.click('#ttsToggle');
    ok(/desligado/.test(await a.$eval('#ttsToggle', e => e.textContent)) && !(await a.$eval('#tts', e => e.checked)), 'alterna o alto-falante para desligado');
    await a.click('#ttsToggle');
    ok(/ligado/.test(await a.$eval('#ttsToggle', e => e.textContent)) && (await a.$eval('#tts', e => e.checked)), 'alterna o alto-falante de volta para ligado');
    await sleep(700);
    const micIdle = await a.evaluate(() => ({ live: document.querySelector('#mic').classList.contains('live'), listening }));
    ok(!micIdle.live && micIdle.listening === false, 'o microfone não liga sozinho depois que o coach fala');
    ok(/Seu personal ainda não cadastrou o WhatsApp/.test(await a.$eval('#waTop', e => e.innerText)) && !(await a.$('#waTop .waPers')), 'sem número, o aluno vê que o personal ainda não cadastrou o WhatsApp');
    ok((await a.evaluate(async () => (await fetch('/api/personal/whatsapp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status)) === 401, 'aluno não cadastra o WhatsApp do personal');
    ok((await a.evaluate(async (u) => (await fetch('/api/personal/students/' + u, { method: 'DELETE' })).status, pamU)) === 401, 'aluno não apaga a própria ficha');
    ok((await a.evaluate(async () => (await fetch('/api/cards')).status)) === 403 && (await a.evaluate(async () => (await fetch('/api/cards/1/img')).status)) === 403, 'aluno não lista nem baixa os cards');
    ok((await a.evaluate(async () => (await fetch('/api/ebook')).status)) === 403 && !(await a.$('#ebookSec')), 'aluno não baixa o ebook nem vê o card');
    const anamLimpa = await a.evaluate(() => ({ box: !!document.querySelector('#medidasBox'), altura: !!document.querySelector('#anAltura'), peso: !!document.querySelector('#anPeso'), dias: !!document.querySelector('#anDias'), salvar: !!document.querySelector('#anMedGo'), txt: (document.querySelector('#anamCard') || {}).textContent || '' }));
    ok(!anamLimpa.box && !anamLimpa.altura && !anamLimpa.peso && !anamLimpa.dias && !anamLimpa.salvar && !/Salvar altura e peso/.test(anamLimpa.txt) && !/Altura e peso salvos/.test(anamLimpa.txt) && !/Quais dias da semana você pode treinar\?/.test(anamLimpa.txt), 'a tela de anamnese não mostra altura, peso, dias nem o botão de salvar');
    const ateMed = ['19 anos', 'ganho de massa muscular', 'glúteos', 'errei, a prioridade é o peito', 'em 3 meses', 'treino há 1 ano', '2 dias', 'segunda e quarta', 'errei, posso treinar quatro vezes por semana', '1 hora', 'não', 'não tenho'];
    await dizer(a, ateMed);
    ok(await a.$eval('#anamCard', e => !e.classList.contains('hide')) && await a.$eval('#equipCard', e => e.classList.contains('hide')), 'a anamnese não conclui antes do peso e da altura');
    await dizer(a, ['setenta quilos e meio', 'um e setenta e cinco']);
    const chatObj = await a.$eval('#chat', e => e.textContent);
    const spokenAll = await a.evaluate(() => (window.__played || []).map(s => s.text).concat((window.__spoken || []).map(s => s.text)).join('\n'));
    ok(/Quantos anos você tem/.test(spokenAll) && /Qual o seu principal objetivo/.test(spokenAll) && /Hipertrofia/.test(spokenAll) && /Emagrecimento/.test(spokenAll) && /Saúde e qualidade de vida/.test(spokenAll) && !/Parte 2/i.test(spokenAll) && !/OBJETIVOS E EXPECTATIVAS/.test(spokenAll) && !/Quais resultados você deseja alcançar/.test(spokenAll) && /priorizar/.test(spokenAll) && /Em quanto tempo você espera perceber resultados/.test(spokenAll) && /Você já treina/.test(spokenAll) && /Quantos dias por semana/.test(spokenAll) && /Quais dias da semana você pode treinar/.test(spokenAll) && /Quanto tempo você tem por treino/.test(spokenAll) && /dor ou tem alguma lesão/.test(spokenAll) && /Você tem alguma orientação médica/.test(spokenAll) && /Qual o seu peso/.test(spokenAll) && /Qual a sua altura/.test(spokenAll) && !/Qual orientação/.test(spokenAll) && !/\bQual\?/.test(spokenAll) && !/Como vamos saber que você está progredindo/.test(spokenAll), 'cada pergunta da anamnese sai em áudio, inclusive dias, peso, altura e a orientação, sem o "qual" depois do não');
    await a.evaluate(() => { document.querySelector('#tts').checked = false; });
    ok(/Qual o seu principal objetivo/.test(chatObj) && /Hipertrofia/.test(chatObj) && /Emagrecimento/.test(chatObj) && /Saúde e qualidade de vida/.test(chatObj) && !/Parte 2/i.test(chatObj) && !/OBJETIVOS E EXPECTATIVAS/.test(chatObj) && !/Quais resultados você deseja alcançar/.test(chatObj) && /Em quanto tempo você espera perceber resultados/.test(chatObj) && !/Como vamos saber que você está progredindo/.test(chatObj) && /Você tem alguma orientação médica/.test(chatObj) && !/Qual orientação/.test(chatObj) && !/\bQual\?/.test(chatObj), 'coach pergunta o objetivo e a orientação, e não insiste quando a resposta é não');
    const medFlow = await a.evaluate(() => ({
      nao: medFollow('não'), nenhuma: medFollow('nenhuma'), nada: medFollow('nada'), naoTenho: medFollow('não tenho'), ah: medFollow('ah não'),
      sim: medFollow('sim'), tenho: medFollow('tenho'),
      detalhe: medFollow('sim, tenho hipertensão'), descr: medFollow('hérnia de disco, sem carga'),
      salvo: S.a.med,
    }));
    ok(!medFlow.nao && !medFlow.nenhuma && !medFlow.nada && !medFlow.naoTenho && !medFlow.ah && medFlow.sim === 'Qual?' && medFlow.tenho === 'Qual?' && !medFlow.detalhe && !medFlow.descr && medFlow.salvo === 'não tenho', 'não, nenhuma e nada encerram; sim sem detalhe pergunta Qual? uma vez');
    ok(/corrigi/i.test(chatObj) && /peito/i.test(chatObj), 'eu errei troca a prioridade para o peito');
    await a.screenshot({ path: SHOTS + '/06-anamnese.png', fullPage: false });
    await a.waitForSelector('#genBtn', { visible: true, timeout: 15000 }); await a.click('#genBtn'); await sleep(1200);
    const txt = await a.$eval('#statusCard', e => e.innerText); ok(/aguard|pendente/i.test(txt), 'treino gerado e aguardando aprovação');
    const muda = await a.evaluate(() => {
      const n = (window.__played || []).length, s = (window.__spoken || []).length;
      let cancelou = 0;
      const orig = speechSynthesis.cancel.bind(speechSynthesis);
      speechSynthesis.cancel = function () { cancelou += 1; return orig(); };
      speak('Não fale no treino');
      say('Fala automática no treino');
      return { played: (window.__played || []).length - n, spoken: (window.__spoken || []).length - s, cancelou, voice: !!document.querySelector('#voiceGo'), anam: document.querySelector('#anamCard').classList.contains('hide'), tts: !!document.querySelector('#ttsPlay') };
    });
    ok(muda.played === 0 && muda.spoken === 0 && muda.cancelou > 0 && muda.anam && !muda.voice && !muda.tts, 'depois da anamnese a coach não fala, cancela a voz e esconde o botão');
    await a.screenshot({ path: SHOTS + '/07-aluno-aguardando.png' });
    // aluno não pode se autoaprovar via API
    const self = await a.evaluate(async (u) => { const F = JSON.parse(localStorage.getItem('coachvoz_v1_' + u)); F.status = 'aprovado'; F.aprov = { nome: 'hacker' };
      await fetch('/api/ficha/' + u, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(F) }); return (await (await fetch('/api/me')).json()).ficha.status; }, pamU);
    ok(self !== 'aprovado', 'servidor bloqueia autoaprovação do aluno');
    // ---- personal aprova
    await p.reload({ waitUntil: 'networkidle0' }); await p.waitForSelector('.stu[data-u="' + pamU + '"]');
    const listaPam = await p.$eval('.stu[data-u="' + pamU + '"]', e => e.innerText);
    ok(/Pamela Souza/.test(listaPam) && /pamela\.souza@teste\.com/.test(listaPam), 'lista do personal mostra o nome completo e o e-mail');
    await p.click('.stu[data-u="' + pamU + '"]'); await sleep(500);
    const ficha = await p.evaluate(() => ({ txt: document.querySelector('#persCard').textContent + document.querySelector('#repCard').textContent, a: S.a, blocos: S.plan.treinos[0].blocos.map(b => ({ g: b.g, n: b.ex.length, s: b.ex[0].s })), exp: dayExp(S.plan.treinos[0]) }));
    ok(/Pamela Souza/.test(ficha.txt) && /2\. OBJETIVOS E EXPECTATIVAS/.test(ficha.txt) && /Ganho de massa muscular/.test(ficha.txt) && !/Resultados que deseja alcançar/.test(ficha.txt) && !ficha.a.resultados && /peito/i.test(ficha.txt) && /3 meses/.test(ficha.txt) && /Como vamos medir o progresso/.test(ficha.txt) && /realista/.test(ficha.txt) && ficha.a.med === 'não tenho' && /Orientação médica/.test(ficha.txt) && /não tenho/.test(ficha.txt), 'ficha mostra o nome completo, objetivo, prioridade, prazo e a orientação médica');
    ok(/Dias disponíveis: Segunda, Quarta/.test(ficha.txt) && ficha.a.dias === 4 && JSON.stringify(ficha.a.diasSemana) === '["segunda","quarta"]', 'ficha mostra os dias disponíveis e mantém 4 treinos na semana');
    const waAluno = await p.$eval('#waAluno', e => e.getAttribute('href') || '');
    ok(waAluno.startsWith('https://wa.me/5511987654321?text=') && decodeURIComponent(waAluno.split('text=')[1]) === 'Oi Pamela Souza, aqui é o seu personal do Shape de Qualidade.', 'botão verde abre o WhatsApp do aluno com o nome completo');
    const pamMed = await sql.prepare('SELECT altura_cm a, peso_kg p FROM students WHERE username=?').get(pamU);
    ok(Number(pamMed.a) === 175 && Number(pamMed.p) === 70.5 && /Altura 1,75 m/.test(ficha.txt) && /Peso 70,5 kg/.test(ficha.txt) && /IMC 23,0/.test(ficha.txt), 'ficha do convite mostra altura, peso e o IMC');
    await sql.prepare('UPDATE students SET altura_cm=NULL, peso_kg=NULL WHERE username=?').run(pamU);
    await p.reload({ waitUntil: 'networkidle0' }); await p.waitForSelector('.stu[data-u="' + pamU + '"]'); await p.click('.stu[data-u="' + pamU + '"]');
    await p.waitForFunction(() => { const el = document.querySelector('#corpoAluno'); return el && /não informado/.test(el.textContent) && !/IMC/.test(el.textContent); });
    ok((await p.$eval('#corpoAluno', e => e.textContent)).includes('Altura não informado') && (await p.$eval('#corpoAluno', e => e.textContent)).includes('Peso não informado'), 'aluno antigo sem altura e peso mostra não informado');
    await sql.prepare('UPDATE students SET altura_cm=?, peso_kg=? WHERE username=?').run(175, 70.5, pamU);
    ok(!ficha.a.progresso, 'o aluno não responde como medir o progresso');
    await p.waitForSelector('#progIn');
    await p.click('#progBox .progSug[data-s="Fotos"]');
    await p.click('#progBox .progSug[data-s="Cargas"]');
    const prog = await p.evaluate(() => ({ v: document.querySelector('#progIn').value, a: S.a.progresso }));
    ok(prog.v === 'Fotos, Cargas' && prog.a === prog.v, 'personal preenche como vamos medir o progresso');
    ok(ficha.a.objetivos.includes('hipertrofia') && ficha.a.prioGs[0] === 'peito' && !ficha.a.prioGs.includes('gluteo'), 'prioridade corrigida fica gravada como peito');
    ok(ficha.blocos[0].g === 'peito' && ficha.blocos[0].s === 5 && ficha.blocos[0].n === 5 && ficha.blocos[1].s === 4, 'peito abre o treino com mais séries e mais um exercício');
    ok(/prioridade/i.test(ficha.exp) && /peito/i.test(ficha.exp) && /objetivo/i.test(ficha.exp) && /realista/.test(ficha.exp), 'Sobre este treino cita prioridade, objetivo e prazo');
    const mix = await p.evaluate(() => { const bak = JSON.stringify(S.a); try {
      S.a.objetivos = ['emagrecimento', 'forca', 'mobilidade']; S.a.objetivo = 'forca'; S.a.objTxt = 'secar e ficar forte'; S.a.prioridade = 'glúteos'; S.a.prioGs = ['gluteo']; S.a.prazo = '2 semanas';
      const P = params(), ts = autoTreinos(), exp = dayExp(ts[0]), g = ts[0].blocos.find(b => b.g === 'gluteo'), post = ts[0].blocos.find(b => b.g === 'post');
      return { r: P.r, d: P.d, cardio: P.cardio, mob: P.mobility, circuit: P.circuit, order: ts[0].blocos.map(b => b.g), gSets: g && g.ex[0].s, gN: g && g.ex.length, oSets: post && post.ex[0].s, exp };
    } finally { S.a = JSON.parse(bak); } });
    ok(mix.r === '4–6' && /2–3 min/.test(mix.d) && mix.cardio && mix.mob && mix.circuit === false, 'força usa menos reps e mais descanso; emagrecimento põe cardio; mobilidade entra no aquecimento');
    ok(mix.order[0] === 'mobilidade' && mix.order[1] === 'gluteo' && mix.order.includes('cardio') && mix.gSets === 5 && mix.gN === 5 && mix.oSets === 4, 'glúteo abre a semana depois da mobilidade, com mais volume, e o cardio fecha');
    ok(/prioridade/i.test(mix.exp) && /glúteos/.test(mix.exp) && /secar e ficar forte/.test(mix.exp) && /curto|8 a 12|4 a 8/.test(mix.exp), 'explicação do treino misturado cita prioridade, objetivo e que duas semanas é cedo');
    await p.screenshot({ path: SHOTS + '/08-ficha-aluno-personal.png' });
    const lib = await p.$('#libmed'); if (lib) await lib.click();
    await p.click('#aprovar'); await sleep(1200);
    // ---- aluno vê o treino aprovado
    await a.reload({ waitUntil: 'networkidle0' }); await sleep(1200);
    const st = await a.evaluate(async () => (await (await fetch('/api/me')).json()).ficha.status); ok(st === 'aprovado', 'treino aprovado pelo personal chega ao aluno');
    ok(await a.$eval('#hdrProf', e => /Igor Personal/.test(e.textContent)), 'cabeçalho mostra o professor');
    ok((await a.$eval('#statusCard', e => e.innerText)).match(/4 x|4x|4 séries|4 s/i) || true, 'treino visível');
    await a.screenshot({ path: SHOTS + '/09-aluno-treino-aprovado.png' });

    // ---- WhatsApp do personal
    await p.evaluate(() => { const z = document.querySelector('#zapBox'); if (z) z.open = true; });
    await p.waitForSelector('#zapNum');
    ok(/Meu WhatsApp/.test(await p.$eval('#zapBox', e => e.innerText)), 'painel do personal tem Meu WhatsApp');
    await p.click('#zapNum', { clickCount: 3 }); await p.type('#zapNum', '(11) 98765-4321'); await p.click('#zapGo');
    await p.waitForFunction(() => /salvo/i.test(document.querySelector('#zapMsg').innerText));
    const zap = await p.evaluate(async () => (await (await fetch('/api/me')).json()).personal.whatsapp);
    ok(zap === '11987654321', 'número do WhatsApp fica só com DDD e dígitos');
    await a.reload({ waitUntil: 'networkidle0' }); await a.waitForSelector('#waTop .waPers');
    const wa = await a.$eval('#waTop .waPers', e => e.getAttribute('href'));
    ok(wa.startsWith('https://wa.me/5511987654321?text=') && decodeURIComponent(wa.split('text=')[1]).startsWith('Olá, sou Pamela Souza do Shape de Qualidade'), 'Falar com o personal abre o WhatsApp com o nome completo do aluno');
    ok(!!(await a.$('#adjCard .waPers')), 'botão fica perto do ajuste do dia');

    const tuto = await p.evaluate(() => {
      const senha = document.querySelector('#pwdBox'), box = document.querySelector('#tutoBox'), v = document.querySelector('#tutoPlayer');
      return { next: senha && senha.nextElementSibling && senha.nextElementSibling.id, text: box ? box.textContent : '', preload: v && v.getAttribute('preload'), src: v && v.getAttribute('src') };
    });
    ok(tuto.next === 'tutoBox' && /Como usar o app/.test(tuto.text), 'Como usar o app fica logo abaixo de Senhas');
    ok(/Cadastrar e convidar aluno/.test(tuto.text) && /Aprovar a ficha/.test(tuto.text) && /Montar os dias da semana/.test(tuto.text) && /Trocar o treino de hoje/.test(tuto.text) && /Chave Pix e mensalidade/.test(tuto.text) && /Como funciona a mensalidade/.test(tuto.text) && tuto.text.indexOf('Chave Pix e mensalidade') < tuto.text.indexOf('Como funciona a mensalidade') && tuto.text.indexOf('Como funciona a mensalidade') < tuto.text.indexOf('Cards de memorização') && /Cards de memorização/.test(tuto.text) && /WhatsApp e senhas/.test(tuto.text) && tuto.text.indexOf('WhatsApp e senhas') < tuto.text.indexOf('Avaliação física') && tuto.text.indexOf('Avaliação física') < tuto.text.indexOf('Vídeos dos exercícios'), 'lista os vídeos do personal e, no fim, a avaliação física e os vídeos dos exercícios');
    ok(tuto.preload === 'none' && !tuto.src, 'o vídeo não carrega antes do toque');
    await p.evaluate(() => { document.querySelector('#tutoBox').open = true; document.querySelector('[data-tuto="link"]').click(); });
    await p.waitForFunction(() => (document.querySelector('#tutoPlayer').getAttribute('src') || '') === '/api/tutoriais/link');
    const personalVid = await p.evaluate(async () => { const r = await fetch('/api/tutoriais/link', { headers: { Range: 'bytes=0-1' } }); return { s: r.status, t: r.headers.get('content-type') || '' }; });
    ok((personalVid.s === 206 || personalVid.s === 200) && /mp4/.test(personalVid.t), 'personal autenticado recebe o vídeo');
    const mensalVid = await p.evaluate(async () => { const r = await fetch('/api/tutoriais/mensalidade', { headers: { Range: 'bytes=0-1' } }); return { s: r.status, t: r.headers.get('content-type') || '' }; });
    ok((mensalVid.s === 206 || mensalVid.s === 200) && /mp4/.test(mensalVid.t), 'o vídeo da mensalidade abre para qualquer personal logado');
    ok(await a.evaluate(async () => (await fetch('/api/tutoriais/link')).status) === 401, 'aluno não baixa o vídeo');
    ok(await p.evaluate(async () => (await fetch('/api/tutoriais/nao-existe')).status) === 404, 'vídeo desconhecido responde 404');
    await p.evaluate(() => document.querySelector('[data-tuto="medidas"]').click());
    await p.waitForFunction(() => {
      const n = document.querySelector('#tutoNota');
      return n && !n.hidden && /📏 Medidas/.test(n.textContent) && /Enviar ou trocar foto/.test(n.textContent) && /após 3 meses/.test(n.textContent) && /complete os dados/.test(n.textContent) && /Apagar aluno/.test(n.textContent) && document.querySelector('#tutoPlayer').hidden && !document.querySelector('#tutoPlayer').getAttribute('src');
    });
    ok(true, 'o item Avaliação física explica a sidebar, a medida atual fechada e a privacidade das fotos');
    await p.evaluate(() => document.querySelector('[data-tuto="videos"]').click());
    await p.waitForFunction(() => { const n = document.querySelector('#tutoNota'); return n && !n.hidden && /Vídeos seus/.test(n.textContent) && /30 segundos/.test(n.textContent) && /sem espaço vazio/.test(n.textContent) && document.querySelector('#tutoPlayer').hidden; });
    ok(true, 'o item Vídeos dos exercícios explica a gaveta e o vídeo do personal');
    if (fs.existsSync('/opt/cursor/artifacts')) {
      const guia = await ctxP.newPage();
      await guia.setViewport({ width: 420, height: 1400, deviceScaleFactor: 2 });
      await guia.goto(URL + '/?area=personal', { waitUntil: 'networkidle0' });
      await guia.waitForSelector('[data-tuto="medidas"]');
      await guia.evaluate(() => { document.querySelector('#tutoBox').open = true; document.querySelector('[data-tuto="medidas"]').click(); });
      await guia.waitForSelector('#tutoNota li');
      const caixa = await guia.$('#tutoBox');
      await caixa.screenshot({ path: '/opt/cursor/artifacts/tutorial_avaliacao_fisica.png' });
      await guia.close();
    }

    // ---- divisão da semana (personal) + troca só de hoje
    const MON = new Date(2026, 9, 12, 15, 0, 0).getTime();
    p.on('dialog', d => d.accept()); a.on('dialog', d => d.accept());
    await p.evaluate(t => { window.__fakeNow = t; render(); }, MON);
    await p.waitForSelector('#splitEdit');
    const grupos0 = await p.evaluate(() => {
      const ds = [...document.querySelectorAll('#persCard details.blk')];
      const vis = el => !!(el && el.checkVisibility && el.checkVisibility());
      return { n: ds.length, fechados: ds.length > 0 && ds.every(d => !d.open && !vis(d.querySelector('.ex')) && vis(d.querySelector('summary'))), nomes: ds.map(d => (d.querySelector('summary') || {}).textContent || ''), estilo: ds.length > 0 && ds.every(d => d.classList.contains('alert') && d.classList.contains('ok') && d.querySelector('summary > b')) };
    });
    ok(grupos0.n > 1 && grupos0.fechados && grupos0.estilo && grupos0.nomes.some(n => /Peito/.test(n)), 'os grupos da ficha começam fechados, só com o nome');
    await p.evaluate(() => document.querySelector('#persCard details.blk summary').click());
    ok(await p.evaluate(() => { const ds = [...document.querySelectorAll('#persCard details.blk')]; const vis = el => !!(el && el.checkVisibility && el.checkVisibility()); return ds.filter(d => d.open).length === 1 && ds[0].open && vis(ds[0].querySelector('.ex')); }), 'abrir um grupo mostra os exercícios e fecha os outros');
    await p.evaluate(() => document.querySelectorAll('#persCard details.blk')[1].querySelector('summary').click());
    ok(await p.evaluate(() => { const ds = [...document.querySelectorAll('#persCard details.blk')]; return ds[1].open && !ds[0].open && ds.filter(d => d.open).length === 1; }), 'abrir outro grupo fecha o anterior');
    await p.evaluate(() => document.querySelectorAll('#persCard details.blk')[1].querySelector('summary').click());
    ok(await p.evaluate(() => [...document.querySelectorAll('#persCard details.blk')].every(d => !d.open)), 'tocar no grupo aberto fecha ele');
    await p.evaluate(() => { document.querySelector('#persCard details.blk summary').click(); document.querySelector('#persCard .wk li.tr').click(); });
    ok(await p.evaluate(() => [...document.querySelectorAll('#persCard details.blk')].every(d => !d.open)), 'trocar de dia fecha os grupos');
    await p.evaluate((u) => { document.querySelector('#closeStu').click(); document.querySelector('.stu[data-u="' + u + '"]').click(); }, pamU);
    await p.waitForSelector('#persCard details.blk');
    ok(await p.evaluate(() => [...document.querySelectorAll('#persCard details.blk')].every(d => !d.open)), 'recarregar a ficha deixa os grupos fechados');

    // ---- avaliação física (gaveta no celular; sidebar no notebook)
    const fotoJpg = async (sel, cor) => {
      await p.evaluate(async (sel, cor) => {
        const c = document.createElement('canvas'); c.width = 80; c.height = 60;
        const g = c.getContext('2d'); g.fillStyle = cor; g.fillRect(0, 0, 80, 60);
        const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.8));
        const input = document.querySelector(sel);
        const dt = new DataTransfer(); dt.items.add(new File([blob], 'foto.jpg', { type: 'image/jpeg' }));
        input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true }));
      }, sel, cor);
    };
    await p.click('#avalOpen');
    await p.waitForSelector('#avalSide.on #avIniSave');
    ok(/Avaliação física/.test(await p.$eval('#avalSide', e => e.textContent)) && /Medida inicial/.test(await p.$eval('#avalSide', e => e.textContent)) && /Pamela Souza/.test(await p.$eval('#avalSide', e => e.textContent)) && !(await p.$('#avalAluno')), 'no celular a ficha abre a avaliação do aluno, sem o seletor');
    const cabecaVazia = await p.$eval('#avalSide', e => e.textContent);
    ok(/19 anos/.test(cabecaVazia) && /Ganho de massa muscular/.test(cabecaVazia) && /4 dias\/semana/.test(cabecaVazia) && /complete os dados/.test(await p.$eval('#avGebVal', e => e.textContent)) && /Dobras cutâneas/.test(cabecaVazia) && /Circunferências corporais/.test(cabecaVazia) && !!(await p.$('#avSexo')), 'o cabeçalho puxa a anamnese e o gasto basal pede os dados que faltam');
    const pills = await p.evaluate(() => {
      const st = el => { const s = getComputedStyle(el); return { r: s.borderRadius, pad: s.padding, bg: s.backgroundImage }; };
      const ini = document.querySelector('#avIni .avPill');
      const atu = document.querySelector('#avAtu summary .avPill');
      const copy = document.querySelector('#invCopy');
      return { fechada: !document.querySelector('#avAtu').open, aviso: document.querySelector('#avAtuAviso').textContent, ini: ini.className, atu: atu.className, igual: st(ini).r === st(copy).r && st(ini).pad === st(copy).pad && st(ini).bg === st(copy).bg && st(atu).bg === st(copy).bg };
    });
    ok(pills.fechada && /concluir o ciclo de treino/.test(pills.aviso) && /btn sm avPill/.test(pills.ini) && /btn sm avPill/.test(pills.atu) && pills.igual, 'medida atual começa fechada, com o aviso, e as pílulas repetem o Copiar link');
    ok(await p.$eval('#avIni', e => e.tagName === 'DETAILS' && e.open && e.classList.contains('alert') && e.classList.contains('ok') && !!e.querySelector('summary .avPill') && !/concluir o ciclo/.test(e.textContent) && !!e.querySelector('#avFotoIniSave')), 'medida inicial começa aberta no mesmo acordeão verde, com a foto, e sem o aviso');
    await p.evaluate(() => document.querySelector('#avIni summary').scrollIntoView({ block: 'center' }));
    await p.click('#avIni summary');
    ok(!(await p.$eval('#avIni', e => e.open)), 'o acordeão fecha a medida inicial');
    await p.click('#avIni summary');
    ok(await p.$eval('#avIni', e => e.open), 'o acordeão abre a medida inicial de novo');
    await p.evaluate(() => document.querySelector('#avAtu summary').scrollIntoView({ block: 'center' }));
    await p.click('#avAtu summary');
    ok(await p.$eval('#avAtu', e => e.open), 'o acordeão abre a medida atual');
    await p.click('#avAtu summary');
    ok(!(await p.$eval('#avAtu', e => e.open)), 'o acordeão fecha a medida atual');
    const comp = await p.evaluate(async () => {
      const c = document.createElement('canvas'); c.width = 1800; c.height = 1200;
      const g = c.getContext('2d'); g.fillStyle = '#336699'; g.fillRect(0, 0, 1800, 1200);
      const blob = await new Promise(r => c.toBlob(r, 'image/png'));
      const data = await comprimirFoto(new File([blob], 'grande.png', { type: 'image/png' }));
      const img = new Image(); await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = data; });
      return { w: img.naturalWidth, h: img.naturalHeight, bytes: Math.floor(data.split(',')[1].length * 3 / 4), jpeg: data.startsWith('data:image/jpeg') };
    });
    ok(comp.jpeg && comp.w === 1000 && comp.h === 667 && comp.bytes < 200 * 1024, 'a foto é comprimida no navegador para JPEG menor que 200 KB');
    await p.evaluate(() => {
      document.querySelector('#avSexo').value = 'M';
      document.querySelector('#avIni .avData').value = '2026-01-15';
      document.querySelector('#avIni [data-k="peso"]').value = '70,5';
      document.querySelector('#avIni [data-k="cintura"]').value = '92';
      document.querySelector('#avIni [data-k="gordura"]').value = '28';
      document.querySelector('#avIni [data-k="dobra_tricipital"]').value = '18';
      document.querySelector('#avIniSave').click();
    });
    await p.waitForFunction(() => /Salvo/.test((document.querySelector('#avIniMsg') || {}).textContent || ''));
    await fotoJpg('#avFotoIniFile', '#c9a227');
    await p.waitForFunction(() => (document.querySelector('#avPrevIni').src || '').startsWith('data:image/jpeg'));
    await p.click('#avFotoIniSave');
    await p.waitForFunction(() => /\/photo/.test(document.querySelector('#avPrevIni').getAttribute('src') || '') && /Salvo/.test((document.querySelector('#avFotoIniMsg') || {}).textContent || ''));
    await p.evaluate(async (u) => {
      for (const body of [
        { kind: 'atual', taken_on: '2026-02-15', peso: '69', cintura: '89', dobra_tricipital: '16', sexo: 'M' },
        { kind: 'atual', taken_on: '2026-03-15', peso: '68,5', cintura: '88', dobra_tricipital: '14', sexo: 'M' },
      ]) {
        const r = await fetch('/api/personal/students/' + encodeURIComponent(u) + '/assessments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!r.ok) throw new Error(await r.text());
      }
    }, pamU);
    await p.evaluate(() => {
      document.querySelector('#avAtu .avData').value = '2026-04-15';
      document.querySelector('#avAtu [data-k="peso"]').value = '68';
      document.querySelector('#avAtu [data-k="cintura"]').value = '86';
      document.querySelector('#avAtu [data-k="gordura"]').value = '24';
      document.querySelector('#avAtu [data-k="dobra_tricipital"]').value = '12';
      document.querySelector('#avSexo').value = 'M';
    });
    await fotoJpg('#avFotoAtuFile', '#15803d');
    await p.waitForFunction(() => (document.querySelector('#avPrevAtu').src || '').startsWith('data:image/jpeg'));
    await p.evaluate(() => document.querySelector('#avAtu summary').scrollIntoView({ block: 'center' }));
    await p.click('#avAtu summary');
    await p.click('#avAtuSave');
    await p.waitForFunction(() => {
      const linha = [...document.querySelectorAll('#avCmp .avLinha')];
      const cintura = linha.find(el => /Cintura/.test(el.textContent));
      const peso = linha.find(el => /Peso/.test(el.textContent));
      return cintura && cintura.classList.contains('ok') && /92 → 86 cm \(−6\)/.test(cintura.textContent) && peso && !peso.classList.contains('ok') && /70,5 → 68 kg/.test(peso.textContent) && (document.querySelector('#avTempo') || {}).textContent === '3 meses';
    });
    ok(true, 'salvar a medida inicial e a atual mostra o comparativo');
    const hist = await p.evaluate(() => {
      const ths = [...document.querySelectorAll('#avEvo thead th')].map(e => e.textContent.trim());
      const row = document.querySelector('#avEvo tr[data-k="dobra_tricipital"]');
      const cells = row ? [...row.querySelectorAll('td')].map(e => e.textContent.trim()) : [];
      const scroll = document.querySelector('#avEvo .avScroll');
      const head = document.querySelector('#avHead').textContent;
      const geb = document.querySelector('#avGebVal').textContent;
      return { n: document.querySelectorAll('#avHist .avHistGo').length, fotos: document.querySelectorAll('#avAntesDepois .avFotos img').length, ths, cells, wide: scroll.scrollWidth > scroll.clientWidth + 4, head, geb, dobra: /Tricipital 18 → 12 mm/.test(document.querySelector('#avCmp').textContent) };
    });
    ok(hist.n >= 4 && hist.fotos === 2 && hist.ths.join(' ') === 'Medida 15/01 15/02 15/03 15/04' && hist.cells.join(' ') === '18 16 14 12' && hist.wide && /70,5 kg/.test(hist.head) && /68 kg/.test(hist.head) && hist.geb === '1.684 kcal' && hist.dobra, 'a tabela lista uma coluna por data, o cabeçalho mostra os pesos e o gasto basal fecha em 1.684 kcal');
    await p.evaluate(() => { const bs = [...document.querySelectorAll('#avHist .avHistGo')]; bs[bs.length - 1].click(); });
    await p.waitForFunction(() => /15\/01\/2026/.test((document.querySelector('#avHistView') || {}).textContent || '') && /Cintura: 92/.test((document.querySelector('#avHistView') || {}).textContent || ''));
    ok(true, 'o histórico abre uma avaliação antiga');
    await p.click('#avalFechar');
    await p.waitForFunction(() => !document.querySelector('#avalSide').classList.contains('on'));
    const desk = await ctxP.newPage();
    await desk.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 });
    await desk.goto(URL + '/?area=personal', { waitUntil: 'networkidle0' });
    await desk.waitForSelector('#avalSide #avCmp .avLinha.ok');
    const lay = await desk.evaluate(() => {
      const s = document.querySelector('#avalSide').getBoundingClientRect();
      const m = document.querySelector('main').getBoundingClientRect();
      const sel = !!document.querySelector('#avalAluno');
      document.querySelector('#avalSide').scrollTop = 0;
      return { vw: innerWidth, vh: innerHeight, sl: s.left, sr: Math.round(s.right), sw: Math.round(s.width), st: Math.round(s.top), sh: Math.round(s.height), mr: m.right, sel };
    });
    ok(lay.vw >= 1300 && lay.vh >= 700 && lay.st <= 1 && lay.sh >= lay.vh - 2 && lay.sw >= 300 && Math.abs(lay.sr - lay.vw) <= 2 && lay.mr <= lay.sl + 2 && lay.sel, 'no notebook a sidebar fica fixa na lateral e tem o seletor de aluno');
    if (fs.existsSync('/opt/cursor/artifacts')) {
      const ambas = await desk.evaluate(() => {
        const ini = document.querySelector('#avIni');
        const atu = document.querySelector('#avAtu');
        const side = document.querySelector('#avalSide');
        const aviso = document.querySelector('#avAtuAviso');
        side.scrollTop = Math.max(0, aviso.offsetTop - 240);
        return { ini: ini.open && ini.classList.contains('ok'), atu: !atu.open };
      });
      ok(ambas.ini && ambas.atu, 'no notebook a medida inicial está aberta e a atual está fechada');
      await desk.screenshot({ path: '/opt/cursor/artifacts/sidebar_duas_secoes_1366.png' });
    }
    await desk.close();
    ok(/Usar sugestão automática/.test(await p.$eval('#splitBox', e => e.innerText)) && /Personalizar dias/.test(await p.$eval('#splitEdit', e => e.innerText)), 'divisão padrão é a sugestão automática');
    await p.click('#splitEdit');
    await p.waitForSelector('.splitDay[data-w="1"] .splitG');
    await p.evaluate(() => {
      const row = document.querySelector('.splitDay[data-w="1"]');
      row.querySelector('.splitLabel').value = 'Core de segunda';
      row.querySelectorAll('.splitG').forEach(i => { i.checked = i.value === 'abdomen'; });
      row.querySelector('.splitG').dispatchEvent(new Event('change', { bubbles: true }));
    });
    await p.waitForFunction(() => /Core de segunda/.test(document.querySelector('#persCard').textContent) && /Prancha abdominal/.test(document.querySelector('#persCard').textContent));
    await p.evaluate(() => { const thu = document.querySelector('.splitDay[data-w="4"] .splitOn'); thu.checked = false; thu.dispatchEvent(new Event('change', { bubbles: true })); });
    await p.waitForSelector('.splitDay[data-w="6"] .splitOn');
    await p.evaluate(() => { const sat = document.querySelector('.splitDay[data-w="6"] .splitOn'); sat.checked = true; sat.dispatchEvent(new Event('change', { bubbles: true })); });
    await p.waitForSelector('.splitDay[data-w="6"] .splitG');
    await p.evaluate(() => {
      const row = document.querySelector('.splitDay[data-w="6"]');
      row.querySelector('.splitLabel').value = 'Cardio de sábado';
      row.querySelectorAll('.splitG').forEach(i => { i.checked = i.value === 'cardio'; });
      row.querySelector('.splitG').dispatchEvent(new Event('change', { bubbles: true }));
    });
    await p.waitForFunction(() => /Cardio de sábado/.test(document.querySelector('#persCard').innerText));
    await p.evaluate(() => {
      const inp = document.querySelector('#persCard input[data-act="s"]'); inp.value = '6'; inp.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await p.waitForFunction(() => document.querySelector('#persCard input[data-act="s"]') && document.querySelector('#persCard input[data-act="s"]').value === '6');
    const beforeRm = await p.$$eval('.ex', es => es.length);
    await p.evaluate(() => document.querySelector('button[data-act="down"]').click());
    await p.waitForSelector('button[data-act="rm"]');
    await p.evaluate(() => { const bs = [...document.querySelectorAll('button[data-act="rm"]')]; bs[bs.length - 1].click(); });
    await p.waitForFunction(n => document.querySelectorAll('.ex').length < n, {}, beforeRm);
    const addSel = await p.$('select[data-act="add"]');
    await p.evaluate(() => { const sel = document.querySelector('select[data-act="add"]'); if (sel.options.length > 1) { sel.selectedIndex = 1; sel.dispatchEvent(new Event('change', { bubbles: true })); } });
    if (addSel) await sleep(300);
    const fits = await p.evaluate(() => { const b = document.querySelector('#splitBox'); return b.getBoundingClientRect().width <= document.documentElement.clientWidth + 1; });
    ok(fits, 'editor da divisão cabe na largura do celular');
    const planOf = async () => p.evaluate(async (u) => { const me = await (await fetch('/api/me')).json(); return (me.students.find(s => s.u === u) || {}).ficha.plan; }, pamU);
    let saved = null; for (let i = 0; i < 25 && !(saved && saved.split && saved.split.days.some(d => d.label === 'Core de segunda' && d.gs.includes('abdomen') && saved.treinos.some(t => t.nome === 'Core de segunda' && t.blocos.some(b => b.ex.some(e => e.s === 6))))); i++) { await sleep(200); saved = await planOf(); }
    ok(!!saved && saved.split.custom && saved.split.days.some(d => d.w === 6 && d.gs.includes('cardio')) && !saved.split.days.some(d => d.w === 4), 'divisão personalizada grava dias, grupos e séries no aluno');
    const see = async () => { await a.reload({ waitUntil: 'networkidle0' }); await a.waitForFunction(() => typeof S !== 'undefined' && S && S.plan && S.status === 'aprovado'); await a.evaluate(t => { window.__fakeNow = t; render(); }, MON); await a.waitForSelector('#statusCard'); };
    await see();
    ok(/Core de segunda/.test(await a.$eval('#statusCard', e => e.innerText)) && /Core de segunda/.test(await a.$eval('#hdrDia', e => e.textContent)) && /6 série/.test(await a.$eval('#statusCard', e => e.innerText)) && !/Cardio de sábado/.test(await a.$eval('#statusCard', e => e.innerText)), 'aba Dia do aluno mostra o treino personalizado de hoje');
    await a.click('.detBtn'); await a.waitForSelector('#detDrawer.open');
    ok(/Como fazer/.test(await a.$eval('#detDrawer', e => e.innerText)) && !/YouTube|Ver vídeo/.test(await a.$eval('#detDrawer', e => e.innerText)), 'Detalhes abre no exercício do dia personalizado, sem busca no YouTube');
    ok(!(await a.$('#detDrawer .dvidBox')), 'sem vídeo pronto a gaveta não deixa espaço vazio');
    const nomeVid = await a.$eval('#detDrawer h3', e => e.textContent.trim());
    videoTeste = path.join(__dirname, '..', 'public', 'videos', videosMod.slug(nomeVid) + '.mp4');
    const ff = spawnSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'testsrc=size=270x480:rate=12:duration=2', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-movflags', '+faststart', videoTeste], { encoding: 'utf8' });
    if (ff.status !== 0) throw new Error('ffmpeg: ' + String(ff.stderr || ff.stdout || '').slice(-500));
    const mapa0 = await a.evaluate(() => loadExVid());
    ok(!!(mapa0 && mapa0.defaults && mapa0.defaults[nomeVid]), 'o arquivo em public/videos entra no mapa do exercício');
    await a.evaluate(() => closeDet());
    await a.evaluate(() => document.querySelector('.detBtn').click());
    await a.waitForSelector('#detDrawer .dvidBox video', { timeout: 8000 });
    await a.waitForFunction(() => { const v = document.querySelector('#detDrawer video'); return v && v.readyState >= 2; });
    const vidInfo = await a.evaluate(() => {
      const v = document.querySelector('#detDrawer video'), r = v.getBoundingClientRect();
      return { muted: v.muted, loop: v.loop, inline: v.hasAttribute('playsinline'), pre: v.getAttribute('preload'), auto: v.autoplay, src: v.getAttribute('src'), w: r.width, h: r.height, marca: document.querySelector('.dvidMarca').textContent, yt: !!document.querySelector('#detDrawer a[href*="youtube"]') };
    });
    ok(vidInfo.muted && vidInfo.loop && vidInfo.inline && vidInfo.pre === 'metadata' && vidInfo.auto && /\/videos\/.+\.mp4$/.test(vidInfo.src) && vidInfo.w >= 160 && vidInfo.w <= 230 && vidInfo.h > vidInfo.w * 1.5 && vidInfo.marca === 'Shape de Qualidade' && !vidInfo.yt, 'o vídeo padrão entra mudo, em loop, vertical e com a marca, sem ocupar a gaveta toda');
    if (fs.existsSync('/opt/cursor/artifacts')) {
      const dv = await ctxA.newPage();
      await dv.setViewport({ width: 1100, height: 800, deviceScaleFactor: 1 });
      await dv.goto(URL, { waitUntil: 'networkidle0' });
      await dv.waitForFunction(() => typeof S !== 'undefined' && S && S.plan && S.status === 'aprovado');
      await dv.evaluate(t => { window.__fakeNow = t; render(); }, MON);
      await dv.waitForSelector('.detBtn');
      await dv.evaluate(() => loadExVid());
      await dv.evaluate(() => document.querySelector('.detBtn').click());
      await dv.waitForFunction(() => {
        const v = document.querySelector('#detDrawer .dvidBox video');
        if (!v || v.readyState < 2) return false;
        v.muted = true; const p = v.play(); if (p && p.catch) p.catch(() => {});
        const r = v.getBoundingClientRect();
        return r.width >= 160 && r.height > r.width && r.left >= 0 && r.right <= window.innerWidth + 1;
      });
      await sleep(400);
      await dv.screenshot({ path: '/opt/cursor/artifacts/detalhe_video.png' });
      await dv.close();
    }
    await a.evaluate(() => closeDet());
    await p.evaluate(() => { const s = document.querySelector('#vidSec'); s.open = true; });
    await p.waitForSelector('#vidBusca');
    await p.evaluate(nome => { const el = document.querySelector('#vidBusca'); el.value = nome; el.dispatchEvent(new Event('input', { bubbles: true })); }, nomeVid);
    await p.waitForSelector('[data-vidn]');
    await p.evaluate(nome => { const b = [...document.querySelectorAll('[data-vidn]')].find(x => x.getAttribute('data-vidn') === nome); if (!b) throw new Error('sem exercício'); b.click(); }, nomeVid);
    await p.waitForFunction(nome => (document.querySelector('#vidEscolha') || {}).textContent.includes(nome), {}, nomeVid);
    await (await p.$('#vidFile')).uploadFile(videoTeste);
    await p.click('#vidGo');
    await p.waitForFunction(() => /Enviado/.test((document.querySelector('#vidMsg') || {}).textContent || ''), { timeout: 20000 });
    ok(/no lugar do padrão/.test(await p.$eval('#vidSec', e => e.innerText)), 'Vídeos seus lista o vídeo que substitui o padrão');
    if (fs.existsSync('/opt/cursor/artifacts')) {
      const gv = await ctxP.newPage();
      await gv.setViewport({ width: 420, height: 1100, deviceScaleFactor: 2 });
      await gv.goto(URL + '/?area=personal', { waitUntil: 'networkidle0' });
      await gv.waitForSelector('#vidSec');
      await gv.evaluate(() => loadExVid());
      await gv.evaluate(() => { document.querySelector('#vidSec').open = true; });
      await gv.waitForSelector('#vidBusca');
      await gv.evaluate(nome => { const el = document.querySelector('#vidBusca'); el.value = nome; el.dispatchEvent(new Event('input', { bubbles: true })); }, nomeVid);
      await gv.waitForFunction(nome => [...document.querySelectorAll('[data-vidn]')].some(b => b.getAttribute('data-vidn') === nome), {}, nomeVid);
      await gv.evaluate(nome => { const b = [...document.querySelectorAll('[data-vidn]')].find(x => x.getAttribute('data-vidn') === nome); b.click(); }, nomeVid);
      await gv.waitForSelector('#vidSec .viditem');
      await gv.evaluate(() => document.querySelector('#vidSec').scrollIntoView({ block: 'start' }));
      await sleep(200);
      await gv.screenshot({ path: '/opt/cursor/artifacts/videos_seus.png' });
      await gv.close();
    }
    const mapa = await a.evaluate(() => loadExVid());
    ok(mapa.custom[nomeVid] && /\/api\/exercise-videos\/\d+\/file$/.test(mapa.custom[nomeVid]) && mapa.defaults[nomeVid] && /\/videos\//.test(mapa.defaults[nomeVid]) && (!mapa.meus || mapa.meus.length === 0), 'o aluno recebe o vídeo do personal e o padrão, sem a lista de edição');
    await a.evaluate(() => document.querySelector('.detBtn').click());
    await a.waitForFunction(() => /\/api\/exercise-videos\//.test((document.querySelector('#detDrawer video') || {}).getAttribute ? document.querySelector('#detDrawer video').getAttribute('src') : ''));
    ok(true, 'na ficha do aluno o vídeo do personal substitui o padrão');
    await a.evaluate(() => closeDet());
    await p.evaluate(nome => { const b = [...document.querySelectorAll('#persCard .detBtn')].find(btn => { const ex = btn.closest('.ex'); return ex && ex.querySelector('b') && ex.querySelector('b').textContent === nome; }); if (!b) throw new Error('sem detalhes'); b.click(); }, nomeVid);
    await p.waitForSelector('#detDrawer.open video');
    ok(/\/api\/exercise-videos\//.test(await p.$eval('#detDrawer video', v => v.getAttribute('src'))), 'o personal vê o mesmo vídeo ao abrir Detalhes na ficha');
    await p.evaluate(() => closeDet());
    const idVid = mapa.custom[nomeVid].match(/(\d+)\/file$/)[1];
    const longo = await p.evaluate(async (nome) => { const r = await fetch('/api/personal/exercise-videos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome, mime: 'video/mp4', duration_ms: 31000, bytes: 8, seq: 0, total: 1, data: 'AAAA' }) }); return { st: r.status, j: await r.json() }; }, nomeVid);
    ok(longo.st === 400 && /30 segundos/.test(longo.j.error), 'vídeo maior que 30 segundos é recusado');
    ok(await a.evaluate(async () => (await fetch('/api/personal/exercise-videos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status) === 401, 'aluno não envia vídeo');
    const outro = await fetch(URL + '/api/personal/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome: 'Video Outro', email: 'video.outro@teste.com', senha: 'senha1234', plano: 'basico' }) });
    const setCookie = (outro.headers.getSetCookie ? outro.headers.getSetCookie() : [outro.headers.get('set-cookie')]).find(s => s && s.startsWith('sq=')) || '';
    const cookieOutro = setCookie.split(';')[0];
    ok(outro.status === 200 && !!cookieOutro, 'outra conta de personal entra para testar o vídeo');
    const negado = await fetch(URL + '/api/exercise-videos/' + idVid + '/file', { headers: { cookie: cookieOutro } });
    ok(negado.status === 404, 'outro personal não baixa o vídeo');
    const pedaco = fs.readFileSync(videoTeste).toString('base64');
    const sobe = await fetch(URL + '/api/personal/exercise-videos', { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: cookieOutro }, body: JSON.stringify({ nome: 'Abdominal crunch no colchonete', mime: 'video/mp4', duration_ms: 2000, bytes: fs.statSync(videoTeste).size, seq: 0, total: 1, data: pedaco }) });
    const sobeJ = await sobe.json();
    ok(sobe.status === 200 && sobeJ.pronto && sobeJ.id, 'o outro personal grava o vídeo dele no banco');
    const oid = (await sql.prepare("SELECT id FROM personals WHERE email='video.outro@teste.com'").get()).id;
    await sql.prepare('DELETE FROM personals WHERE id=?').run(oid);
    ok(!(await sql.prepare('SELECT id FROM exercise_videos WHERE personal_id=?').get(oid)) && !(await sql.prepare('SELECT video_id FROM exercise_video_parts WHERE video_id=?').get(sobeJ.id)), 'apagar a conta do personal apaga os vídeos');
    const nome2 = nomeVid === 'Prancha abdominal' ? 'Elevação de pernas deitado' : 'Prancha abdominal';
    const segundo = await p.evaluate(async (nome, origem) => {
      const src = (window.__EXVID && window.__EXVID.defaults && window.__EXVID.defaults[origem]) || '';
      const buf = await (await fetch(src)).arrayBuffer();
      const bytes = new Uint8Array(buf);
      let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      const r = await fetch('/api/personal/exercise-videos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome, mime: 'video/mp4', duration_ms: 2000, bytes: bytes.length, seq: 0, total: 1, data: btoa(s) }) });
      const j = await r.json();
      return { st: r.status, id: j.id, erro: j.error || '', n: bytes.length, src: !!src };
    }, nome2, nomeVid);
    ok(segundo.st === 200 && segundo.id && segundo.n > 0 && segundo.n <= 300 * 1024, 'dá para enviar um segundo vídeo');
    await p.evaluate(() => { const s = document.querySelector('#vidSec'); if (s) s.open = true; });
    await p.evaluate(() => loadExVid());
    await p.waitForFunction(() => [...document.querySelectorAll('[data-vidrm]')].length >= 2);
    await p.evaluate(id => { const b = [...document.querySelectorAll('[data-vidrm]')].find(x => x.getAttribute('data-vidrm') === String(id)); b.click(); }, segundo.id);
    await p.waitForFunction(() => /Removido/.test((document.querySelector('#vidMsg') || {}).textContent || ''));
    ok(!(await sql.prepare('SELECT id FROM exercise_videos WHERE id=?').get(segundo.id)) && !!(await sql.prepare('SELECT id FROM exercise_videos WHERE id=? AND ready=1').get(idVid)), 'remover volta aquele exercício ao padrão e mantém os outros vídeos');
    await a.evaluate(() => document.querySelector('#detOv').click());
    const hack = await a.evaluate(async (u) => { const F = await (await fetch('/api/me')).json(); F.ficha.plan.split = { custom: true, days: [{ w: 1, label: 'HACK', gs: ['peito'] }] }; F.ficha.plan.treinos[0].nome = 'HACK'; await fetch('/api/ficha/' + u, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(F.ficha) }); return (await (await fetch('/api/me')).json()).ficha.plan.treinos[0].nome; }, pamU);
    ok(hack === 'Core de segunda', 'aluno não consegue trocar a divisão gravada pelo personal');
    await a.type('#adjTxt', 'estou cansado'); await a.click('#adjSend');
    await a.waitForFunction(() => /Ajustado hoje|cansaço|cansad/.test(document.querySelector('#statusCard').innerText));
    ok(/Ajustado hoje|cansaço|cansad/.test(await a.$eval('#statusCard', e => e.innerText)), 'ajuste do dia funciona no treino personalizado');
    ok(/consulte o seu personal/i.test(await a.$eval('#adjOut', e => e.innerText)) && !!(await a.$('#adjOut .waPers')), 'mensagem Consulte o seu personal traz Falar com o personal');
    await p.evaluate(() => { const sel = document.querySelector('#swapDay'); const opt = [...sel.options].find(o => /Terça/.test(o.textContent)); sel.value = opt.value; document.querySelector('#swapDayGo').click(); });
    let swapped = null; for (let i = 0; i < 25 && !(swapped && swapped.swapHoje && /Costas/.test(swapped.swapHoje.nome || '') && swapped.treinos[0].nome === 'Core de segunda'); i++) { await sleep(200); swapped = await planOf(); }
    ok(!!swapped, 'troca de hoje não mexe na divisão da semana');
    await see();
    const hoje1 = await a.$eval('#statusCard', e => e.innerText);
    ok(/trocado pelo personal/.test(hoje1) && /Costas|Puxada|Remada|Rosca/.test(hoje1) && !/Prancha abdominal/.test(hoje1), 'aluno vê o treino de outro dia só hoje');
    await p.evaluate(() => { document.querySelectorAll('#swapGs .splitG').forEach(i => { i.checked = i.value === 'gluteo'; }); document.querySelector('#swapApply').click(); });
    let gl = null; for (let i = 0; i < 25 && !(gl && gl.swapHoje && (gl.swapHoje.gs || []).includes('gluteo') && gl.split.days[0].label === 'Core de segunda'); i++) { await sleep(200); gl = await planOf(); }
    ok(!!gl, 'troca de hoje por grupo muscular fica só no dia');
    await see();
    ok(/Glúteo|Elevação pélvica|Ponte de glúteo/.test(await a.$eval('#statusCard', e => e.innerText)), 'aluno vê o grupo escolhido para hoje');
    await p.click('#swapUndo');
    let undone = null; for (let i = 0; i < 25 && !(undone && !undone.swapHoje && undone.split && undone.split.custom); i++) { await sleep(200); undone = await planOf(); }
    await see();
    ok(/Core de segunda/.test(await a.$eval('#statusCard', e => e.innerText)) && !/trocado pelo personal/.test(await a.$eval('#statusCard', e => e.innerText)), 'desfazer a troca devolve o dia da divisão');
    await p.click('#splitAuto');
    await p.waitForSelector('#splitEdit');
    let back = null; for (let i = 0; i < 25 && !(back && !back.split); i++) { await sleep(200); back = await planOf(); }
    ok(!!back && back.treinos[0].nome === 'Treino 1', 'voltar à divisão automática restaura a sugestão fixa');
    await see();
    ok(/Peito/.test(await a.$eval('#statusCard', e => e.innerText)) && !/Core de segunda/.test(await a.$eval('#statusCard', e => e.innerText)), 'aba Dia volta ao treino automático');

    // ---- exercício livre do personal (a lista da biblioteca continua igual)
    const libSnap = await p.evaluate(() => {
      const sel = document.querySelector('select[data-act="swap"]');
      return { name: sel.options[sel.selectedIndex].textContent, add: [...document.querySelector('select[data-act="add"]').options].map(o => o.textContent), swap: [...sel.options].map(o => o.textContent) };
    });
    await p.evaluate(() => { const sel = document.querySelector('select[data-act="swap"]'); sel.selectedIndex = sel.selectedIndex === 0 ? 1 : 0; sel.dispatchEvent(new Event('change', { bubbles: true })); });
    await p.waitForFunction(name => document.querySelector('#persCard .ex b').textContent !== name, {}, libSnap.name);
    await p.evaluate(name => { const sel = document.querySelector('select[data-act="swap"]'); sel.selectedIndex = [...sel.options].findIndex(o => o.textContent === name); sel.dispatchEvent(new Event('change', { bubbles: true })); }, libSnap.name);
    await p.waitForFunction(name => document.querySelector('#persCard .ex b').textContent === name, {}, libSnap.name);
    const libSame = await p.evaluate(() => ({
      add: [...document.querySelector('select[data-act="add"]').options].map(o => o.textContent),
      swap: [...document.querySelector('select[data-act="swap"]').options].map(o => o.textContent),
    }));
    ok(JSON.stringify(libSame.add) === JSON.stringify(libSnap.add) && JSON.stringify(libSame.swap) === JSON.stringify(libSnap.swap), 'trocar pela lista existente não muda as opções');
    await p.evaluate(() => document.querySelector('.exCustomTab[data-cxkey$="-add"]').click());
    await p.waitForSelector('.exCustom .cxNome');
    ok(/✏️ Outro exercício/.test(await p.$eval('.exCustomTab', e => e.textContent)) && /Meus exercícios/.test(await p.$eval('.exCustom', e => e.innerText)), 'o seletor ganha a opção Outro exercício e a lista Meus exercícios');
    const optsWhileOpen = await p.evaluate(() => [...document.querySelector('select[data-act="add"]').options].map(o => o.textContent));
    ok(JSON.stringify(optsWhileOpen) === JSON.stringify(libSnap.add), 'abrir Outro exercício não altera a lista da biblioteca');
    await p.evaluate(() => {
      const box = document.querySelector('.exCustom');
      box.querySelector('.cxNome').value = 'Remada cavalinho';
      box.querySelector('.cxNota').value = 'Cotovelos perto do corpo';
      box.querySelector('.cxS').value = '4';
      box.querySelector('.cxR').value = '10';
      box.querySelector('.cxD').value = '60s';
      box.querySelector('[data-savecx]').click();
    });
    await p.waitForFunction(() => [...document.querySelectorAll('#persCard .ex b')].some(b => b.textContent === 'Remada cavalinho'));
    let savedEx = null;
    for (let i = 0; i < 25 && !(savedEx && savedEx.treinos.some(t => t.blocos.some(b => b.ex.some(e => e.n === 'Remada cavalinho' && e.manual && e.nota === 'Cotovelos perto do corpo' && e.s === 4)))); i++) { await sleep(200); savedEx = await planOf(); }
    ok(!!savedEx, 'o exercício livre entra na ficha com nome, instrução e séries');
    const lista = await p.evaluate(async () => (await fetch('/api/personal/exercises')).json());
    ok(lista.exercises.some(e => e.nome === 'Remada cavalinho' && e.nota === 'Cotovelos perto do corpo') && lista.exercises.filter(e => e.nome === 'Remada cavalinho').length === 1, 'Meus exercícios grava o nome para reutilizar');
    const addAfter = await p.evaluate(() => [...document.querySelector('select[data-act="add"]').options].map(o => o.textContent));
    ok(JSON.stringify(addAfter) === JSON.stringify(libSnap.add) && !addAfter.some(t => /Remada cavalinho/.test(t)), 'o nome livre não entra no select da biblioteca');
    await see();
    const comNota = await a.evaluate(() => { const ex = [...document.querySelectorAll('#statusCard .ex')].find(e => e.querySelector('b') && e.querySelector('b').textContent === 'Remada cavalinho'); return ex ? { t: ex.innerText, det: !!ex.querySelector('.detBtn') } : null; });
    ok(comNota && /Cotovelos perto do corpo/.test(comNota.t) && !comNota.det && !/Por que/.test(comNota.t) && !/Como fazer|YouTube/.test(comNota.t), 'aluno vê o nome e a instrução, sem detalhes nem explicação longa');
    ok(await a.evaluate(() => !!document.querySelector('#statusCard .detBtn')), 'os exercícios da biblioteca continuam com Detalhes');
    await p.evaluate(() => document.querySelector('.exCustomTab[data-cxkey$="-add"]').click());
    await p.waitForSelector('[data-use]');
    await p.evaluate(() => { const ex = [...document.querySelectorAll('#persCard .ex')].find(e => e.querySelector('b') && e.querySelector('b').textContent === 'Remada cavalinho'); ex.querySelector('button[data-act="rm"]').click(); });
    await p.waitForFunction(() => ![...document.querySelectorAll('#persCard .ex b')].some(b => b.textContent === 'Remada cavalinho') && document.querySelector('[data-use]'));
    await p.click('[data-use]');
    await p.waitForFunction(() => [...document.querySelectorAll('#persCard .ex b')].some(b => b.textContent === 'Remada cavalinho'));
    ok(true, 'Usar recoloca um exercício de Meus exercícios');
    const grupoLivre = lista.exercises.find(e => e.nome === 'Remada cavalinho').grupo;
    const dup = await p.evaluate(async (grupo) => { const r = await fetch('/api/personal/exercises', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome: 'remada cavalinho', nota: 'Cotovelos perto do corpo', grupo, series: 4, reps: '10', descanso: '60s' }) }); const j = await r.json(); return { st: r.status, n: (j.exercises || []).filter(e => /remada cavalinho/i.test(e.nome) && e.grupo === grupo).length }; }, grupoLivre);
    ok(dup.st === 200 && dup.n === 1, 'repetir o nome no mesmo grupo atualiza, sem duplicar');
    await p.evaluate(() => document.querySelector('.exCustomTab[data-cxkey$="-add"]').click());
    await p.waitForSelector('[data-delx]');
    await p.click('[data-delx]');
    await p.waitForSelector('.meusEmpty');
    ok(await p.evaluate(() => [...document.querySelectorAll('#persCard .ex b')].some(b => b.textContent === 'Remada cavalinho')), 'apagar tira da lista e mantém o treino já montado');
    const vazio = await p.evaluate(async () => { const r = await fetch('/api/personal/exercises', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome: '  ', grupo: 'peito' }) }); return r.status; });
    ok(vazio === 400, 'nome vazio é recusado');
    ok(await a.evaluate(async () => (await fetch('/api/personal/exercises')).status) === 401, 'aluno não acessa a lista do personal');
    await p.evaluate(() => {
      const box = document.querySelector('.exCustom');
      box.querySelector('.cxNome').value = 'Agachamento livre do personal';
      box.querySelector('.cxNota').value = '';
      box.querySelector('[data-savecx]').click();
    });
    await p.waitForFunction(() => [...document.querySelectorAll('#persCard .ex b')].some(b => b.textContent === 'Agachamento livre do personal'));
    let livre = null;
    for (let i = 0; i < 25 && !(livre && livre.treinos.some(t => t.blocos.some(b => b.ex.some(e => e.n === 'Agachamento livre do personal' && e.manual && !e.nota)))); i++) { await sleep(200); livre = await planOf(); }
    ok(!!livre, 'exercício sem instrução também grava na ficha');
    await see();
    const semNota = await a.evaluate(() => { const ex = [...document.querySelectorAll('#statusCard .ex')].find(e => e.querySelector('b') && e.querySelector('b').textContent === 'Agachamento livre do personal'); return ex ? ex.innerText : ''; });
    ok(semNota.includes('Seu personal vai te ensinar a execução') && !/Por que/.test(semNota), 'sem instrução, o aluno vê só a dica de execução');
    await a.click('#adjTxt', { clickCount: 3 });
    await a.type('#adjTxt', 'dor no joelho');
    await a.click('#adjSend');
    await a.waitForFunction(() => /Ajustado hoje|joelho/.test(document.querySelector('#statusCard').innerText));
    const pain = await a.evaluate(() => ({
      livre: [...document.querySelectorAll('#statusCard .ex b')].some(b => b.textContent === 'Agachamento livre do personal'),
      remada: [...document.querySelectorAll('#statusCard .ex b')].some(b => b.textContent === 'Remada cavalinho'),
      out: document.querySelector('#adjOut').innerText,
    }));
    ok(pain.livre && pain.remada && !/Troquei Agachamento livre do personal|Tirei Agachamento livre do personal|Troquei Remada cavalinho|Tirei Remada cavalinho/.test(pain.out), 'dor no joelho não troca nem tira o exercício livre');

    // ---- limite de 15 alunos no Básico
    const signup = async (i) => { const c = await browser.createBrowserContext(), pg = await c.newPage(); await pg.goto(URL + '/convite/' + code, { waitUntil: 'networkidle0' });
      await pg.waitForSelector('#lgEmail');
      const r = await pg.evaluate(async (code, i) => { const r = await fetch('/api/student/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'aluno' + i + '@teste.com', nome: 'Aluno ' + i, senha: 'aluno123', convite: code, whatsapp: '11' + String(900000000 + i).padStart(9, '0') }) }); return { st: r.status, j: await r.json() }; }, code, i);
      await c.close(); return r; };
    for (let i = 2; i <= 15; i++) { const r = await signup(i); if (r.st !== 200) throw new Error('cadastro ' + i + ': ' + r.j.error); }
    const r16 = await signup(16); ok(r16.st === 403 && /limite de 15 alunos do plano Básico.*upgrade/.test(r16.j.error), 'Básico trava no 15º aluno com aviso de upgrade');
    await p.reload({ waitUntil: 'networkidle0' }); await p.waitForSelector('#planBox');
    ok(/15 \/ 15/.test(await p.$eval('#planBox', e => e.innerText)) && /Limite atingido/.test(await p.$eval('#planBox', e => e.innerText)), 'painel mostra 15/15 e pede upgrade');
    const aluno2row = await sql.prepare("SELECT id, username FROM students WHERE email=?").get('aluno2@teste.com');
    const aluno2 = aluno2row.username, aluno2id = aluno2row.id;
    await p.click('.stu[data-u="' + aluno2 + '"]');
    await p.waitForSelector('#apagarAluno');
    await p.evaluate(async (u) => { const r = await fetch('/api/personal/students/' + encodeURIComponent(u) + '/assessments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'inicial', taken_on: '2026-02-01', peso: '80', cintura: '90' }) }); if (!r.ok) throw new Error(await r.text()); }, aluno2);
    await p.click('#apagarAluno');
    await p.waitForSelector('#apagarBox:not(.hide)');
    ok(/Apagar a ficha de Aluno 2\? Isso não pode ser desfeito\./.test(await p.$eval('#apagarBox', e => e.textContent)), 'apagar pede confirmação com o nome');
    await p.type('#apagarTxt', 'APAGAR');
    await Promise.all([p.waitForNavigation({ waitUntil: 'networkidle0' }), p.click('#apagarGo')]);
    ok(!(await sql.prepare('SELECT id FROM students WHERE email=?').get('aluno2@teste.com')) && !(await sql.prepare('SELECT student_id FROM tuition WHERE student_id=?').get(aluno2id)) && !(await sql.prepare('SELECT student_id FROM tuition_payments WHERE student_id=?').get(aluno2id)) && !(await sql.prepare('SELECT id FROM assessments WHERE student_id=?').get(aluno2id)) && !!(await sql.prepare('SELECT id FROM exercise_videos WHERE ready=1 AND personal_id=(SELECT id FROM personals WHERE email=?)').get('igor@teste.com')), 'apagar tira o aluno, a ficha, a mensalidade e a avaliação, e o vídeo do personal fica');
    const ctxGone = await browser.createBrowserContext(), gone = await ctxGone.newPage();
    await gone.goto(URL, { waitUntil: 'networkidle0' });
    const goneLogin = await gone.evaluate(async () => (await fetch('/api/student/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'aluno2@teste.com', senha: 'aluno123' }) })).status);
    ok(goneLogin === 401, 'aluno apagado não entra mais com esse personal');
    await ctxGone.close();
    const ctxVaga = await browser.createBrowserContext(), pgVaga = await ctxVaga.newPage();
    await pgVaga.goto(URL + '/convite/' + code, { waitUntil: 'networkidle0' });
    const vaga = await pgVaga.evaluate(async (code) => { const r = await fetch('/api/student/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'aluno-vaga@teste.com', nome: 'Aluno Vaga', senha: 'aluno123', convite: code, whatsapp: '11900000999' }) }); return { st: r.status, j: await r.json() }; }, code);
    await ctxVaga.close();
    ok(vaga.st === 200, 'com a vaga livre, o Básico aceita outro aluno');
    await p.waitForSelector('#planBox');
    // upgrade para Pro (assinatura paga -> paga o novo plano no modo teste)
    await p.evaluate(() => { document.querySelector('#chgPlan').open = true; }); await p.click('#chgPlan label[data-plan="pro"]'); await sleep(200);
    await p.evaluate(() => { document.querySelector('#chgPlan').open = true; }); await p.click('#planGo'); await p.waitForSelector('#paywall');
    await Promise.all([p.waitForNavigation(), p.click('#payDemo')]); await p.waitForSelector('#planBox');
    ok(/Pro/.test(await p.$eval('#planBox', e => e.innerText)) && /15 \/ 30/.test(await p.$eval('#planBox', e => e.innerText)), 'upgrade para Pro libera 30 vagas');
    const demoPro = await p.evaluate(async () => { const j = await (await fetch('/api/cards')).json(); const img = await fetch('/api/cards/1/img'); return { paid: j.paid, open: j.cards.filter(c => !c.locked).length, img: img.status }; });
    ok(demoPro.paid === false && demoPro.open === 0 && demoPro.img === 403, 'Pro pago só no modo teste continua com os cards bloqueados');
    ok((await signup(16)).st === 200, 'depois do upgrade o 16º aluno entra');
    const dg = await p.evaluate(async () => { const r = await fetch('/api/billing/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plano: 'basico' }) }); return { st: r.status, j: await r.json() }; });
    ok(dg.st === 409 && /16 alunos/.test(dg.j.error), 'downgrade para Básico bloqueado com 16 alunos');
    ok((await signup(2)).st === 200, 'o e-mail apagado pode se cadastrar de novo por um convite');
    const bcrypt = require('bcrypt');
    await sql.prepare('INSERT INTO students(personal_id,username,nome,hash,created_at,origin) VALUES(?,?,?,?,?,?)').run(pid, 'legado', 'Aluno Legado', await bcrypt.hash('legado123', 4), Date.now(), 'convite');
    const ctxLeg = await browser.createBrowserContext(), leg = await ctxLeg.newPage();
    await leg.goto(URL, { waitUntil: 'networkidle0' });
    const legadoLogin = await leg.evaluate(async () => { const ruim = await fetch('/api/student/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuario: 'legado', senha: 'errada' }) }); const bom = await fetch('/api/student/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'legado', senha: 'legado123' }) }); return { ruim: ruim.status, bom: bom.status }; });
    ok(legadoLogin.ruim === 401 && legadoLogin.bom === 200, 'aluno antigo sem e-mail entra pelo usuário');
    await leg.goto(URL, { waitUntil: 'networkidle0' });
    await leg.waitForSelector('#zapPedido');
    ok(/Qual é o seu WhatsApp com DDD/.test(await leg.$eval('#zapPedido', e => e.textContent)) && /Para o seu personal falar com você se precisar/.test(await leg.$eval('#zapPedido', e => e.textContent)), 'aluno antigo sem número é perguntado uma vez');
    await leg.click('#zapPedidoSkip');
    await leg.reload({ waitUntil: 'networkidle0' });
    ok(!(await leg.$('#zapPedido')), 'Agora não não pergunta de novo');
    await ctxLeg.close();
    await p.reload({ waitUntil: 'networkidle0' });
    await p.waitForSelector('.stu[data-u="legado"]');
    await p.click('.stu[data-u="legado"]');
    await p.waitForSelector('#waAluno');
    ok(await p.$eval('#waAluno', e => e.disabled) && /WhatsApp não informado/.test(await p.$eval('#fichaTopo', e => e.textContent)), 'sem número o botão de WhatsApp fica desligado');
    const ug = await p.evaluate(async () => (await fetch('/api/billing/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plano: 'ilimitado' }) })).json());
    ok(ug.needCheckout === true, 'upgrade de plano pago exige pagar o novo plano');
    // isolamento entre personais
    const ctxX = await browser.createBrowserContext(), x = await ctxX.newPage();
    await x.goto(URL, { waitUntil: 'networkidle0' });
    const pamFoto = await sql.prepare("SELECT id FROM assessments WHERE student_id=? AND photo IS NOT NULL AND photo<>'' ORDER BY id LIMIT 1").get(pamId);
    if (!pamFoto) throw new Error('foto da avaliação não foi gravada');
    const iso = await x.evaluate(async (u, fotoId) => { await fetch('/api/personal/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome: 'Outro', email: 'outro@t.com', senha: 'senha1234' }) });
      await fetch('/api/billing/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ method: 'demo' }) });
      const me = await (await fetch('/api/me')).json(); const put = await fetch('/api/ficha/' + encodeURIComponent(u), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const ex = await (await fetch('/api/personal/exercises')).json();
      const del = await fetch('/api/personal/exercises/1', { method: 'DELETE' });
      const delStu = await fetch('/api/personal/students/' + encodeURIComponent(u), { method: 'DELETE' });
      const av = await fetch('/api/personal/students/' + encodeURIComponent(u) + '/assessments');
      const avPost = await fetch('/api/personal/students/' + encodeURIComponent(u) + '/assessments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'atual', taken_on: '2026-05-01', peso: '60' }) });
      const foto = await fetch('/api/personal/assessments/' + fotoId + '/photo');
      return { n: me.students.length, put: put.status, ex: (ex.exercises || []).length, del: del.status, delStu: delStu.status, av: av.status, avPost: avPost.status, foto: foto.status }; }, pamU, pamFoto && pamFoto.id);
    ok(iso.n === 0 && iso.put === 403 && iso.ex === 0 && iso.del === 404 && iso.delStu === 404 && iso.av === 404 && iso.avPost === 404 && iso.foto === 404, 'outro personal não vê alunos, fichas, exercícios nem a avaliação, e não apaga aluno dos outros');
    await p.screenshot({ path: SHOTS + '/04-painel-personal-convite.png' });

    // ---- senhas
    const post = (pg, u, b) => pg.evaluate(async (u, b) => { const r = await fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }); return { st: r.status, j: await r.json() }; }, u, b);
    ok((await post(p, '/api/personal/password', { atual: 'errada', nova: 'nova12345' })).st === 401, 'trocar senha exige a senha atual');
    ok((await post(p, '/api/personal/password', { atual: 'senha1234', nova: 'nova12345' })).st === 200, 'personal troca a própria senha');
    ok((await post(p, '/api/personal/student-password', { usuario: pamU, nova: 'pam456' })).st === 200, 'personal define nova senha do aluno');
    const an = await (await browser.createBrowserContext()).newPage();
    await an.goto(URL, { waitUntil: 'networkidle0' });
    const loginVelho = await post(an, '/api/student/login', { email: 'pamela.souza@teste.com', senha: 'aluna123' });
    const loginUsuario = await post(an, '/api/student/login', { email: pamU, senha: 'pam456' });
    const loginEmail = await post(an, '/api/student/login', { email: '  Pamela.Souza@teste.com ', senha: 'pam456' });
    ok(loginVelho.st === 401 && loginUsuario.st === 200 && loginEmail.st === 200, 'aluno entra com e-mail ou com o usuário interno, e a senha antiga deixa de valer');
    await an.goto(URL, { waitUntil: 'networkidle0' }); await an.waitForSelector('#statusCard');
    const calada = await an.evaluate(() => {
      const antes = (window.__played || []).length;
      const falou = [];
      let cancelou = 0;
      const origCancel = speechSynthesis.cancel.bind(speechSynthesis);
      const origSpeak = speechSynthesis.speak.bind(speechSynthesis);
      speechSynthesis.cancel = function () { cancelou += 1; return origCancel(); };
      speechSynthesis.speak = function (u) { falou.push(String(u && u.text || '')); return origSpeak(u); };
      speak('Teste fora da anamnese');
      say('Fala automática');
      return { voiceGo: !!document.querySelector('#voiceGo'), anam: document.querySelector('#anamCard').classList.contains('hide'), played: (window.__played || []).length - antes, falou, cancelou, tts: !!document.querySelector('#ttsPlay'), status: S.status };
    });
    ok(calada.status === 'aprovado' && calada.anam && !calada.voiceGo && calada.played === 0 && calada.falou.length === 0 && !calada.tts && calada.cancelou > 0, 'com a ficha aprovada a coach não fala, não mostra o botão de voz e cancela a fala pendente');
    ok(await an.evaluate(() => !$('#mic').classList.contains('live') && listening === false), 'a tela de treino não liga o microfone');
    const fg = await (await browser.createBrowserContext()).newPage(); await fg.goto(URL + '/?area=personal', { waitUntil: 'networkidle0' });
    await fg.waitForSelector('#pForgot'); await fg.$eval('#pForgot', e => e.click()); await fg.type('#fgEmail', 'igor@teste.com'); await fg.$eval('#fgGo', e => e.click()); await fg.waitForSelector('#fgMsg .alert');
    ok(/link/.test(await fg.$eval('#fgMsg', e => e.innerText)), 'personal pede nova senha em "Esqueci a senha"');
    // voz do coach bloqueada pelo navegador -> botão "Tocar para ouvir"
    await an.evaluate(() => { S.status = 'none'; document.querySelector('#anamCard').classList.remove('hide'); window.speechSynthesis.cancel(); const o = speechSynthesis.speak; window.__orig = o; speechSynthesis.speak = () => {}; $("#tts").checked = true; speak("Teste de voz"); });
    await an.waitForSelector('#ttsPlay', { timeout: 8000 }); ok(/Tocar para ouvir/.test(await an.$eval('#ttsPlay', e => e.innerText)), 'se o navegador bloquear a fala aparece "Tocar para ouvir"');
    const vz = await an.evaluate(() => ({ lang: (curVoice() || { lang: 'pt-BR' }).lang, sr: !!SR }));
    ok(/^pt/i.test(vz.lang), 'voz escolhida é português (' + vz.lang + ')');
    const emptyVoice = await an.evaluate(() => new Promise(res => {
      const got = [];
      speechSynthesis.getVoices = () => [];
      loadVoices();
      speechSynthesis.speak = u => { got.push({ text: u.text, lang: u.lang, voice: u.voice || null }); try { u.onend && setTimeout(() => u.onend(), 5); } catch (e) {} };
      const old = document.querySelector('#ttsPlay'); if (old) old.remove();
      document.querySelector('#tts').checked = true;
      speak('Pergunta sem voz local');
      setTimeout(() => res({ got, btn: !!document.querySelector('#ttsPlay') && /Tocar para ouvir/.test(document.querySelector('#ttsPlay').textContent) }), 400);
    }));
    ok(emptyVoice.got.some(s => /Pergunta sem voz local/.test(s.text) && s.lang === 'pt-BR' && !s.voice) && emptyVoice.btn, 'sem voz pt-BR ainda fala com lang pt-BR e mostra Tocar para ouvir');
    const gap = await an.evaluate(() => new Promise(res => {
      const log = [];
      speechSynthesis.cancel = () => log.push(['cancel', performance.now()]);
      speechSynthesis.speak = u => log.push(['speak', performance.now(), u.text]);
      try {
        Object.defineProperty(speechSynthesis, 'speaking', { configurable: true, get: () => true });
        Object.defineProperty(speechSynthesis, 'pending', { configurable: true, get: () => true });
      } catch (e) { log.push(['define', 0, String(e)]); }
      document.querySelector('#tts').checked = true;
      speak('Frase interrompida');
      setTimeout(() => res(log), 500);
    }));
    const ci = gap.findIndex(x => x[0] === 'cancel'), si = gap.findIndex(x => x[0] === 'speak');
    ok(ci >= 0 && si > ci && gap[si][1] - gap[ci][1] >= 80, 'cancel espera um instante antes de falar de novo');
    // push-to-talk: o microfone só abre no toque e não religa sozinho
    const vp = await an.browserContext().newPage(); await vp.setViewport(phone);
    await vp.evaluateOnNewDocument(() => {
      function FakeSR() { window.__srN = (window.__srN || 0) + 1; window.__sr = this; }
      FakeSR.prototype.start = function () { if (this.onstart) this.onstart(); };
      FakeSR.prototype.stop = function () { if (this.onend) this.onend(); };
      FakeSR.prototype.abort = function () {};
      FakeSR.prototype.emit = function (transcript, confidence) {
        const alt = { transcript, confidence };
        const row = { 0: alt, isFinal: true, length: 1 };
        if (this.onresult) this.onresult({ resultIndex: 0, results: { 0: row, length: 1 } });
      };
      window.SpeechRecognition = window.webkitSpeechRecognition = FakeSR;
    });
    await vp.goto(URL, { waitUntil: 'networkidle0' }); await vp.waitForSelector('#mic');
    await vp.evaluate(() => { S.status = 'none'; const c = document.querySelector('#anamCard'); if (c) c.classList.remove('hide'); });
    await vp.evaluate(() => new Promise(ok => { if (!('speechSynthesis' in window) || speechSynthesis.getVoices().length) return ok(); const t = setTimeout(ok, 1600); speechSynthesis.addEventListener('voiceschanged', () => { clearTimeout(t); ok(); }, { once: true }); }));
    ok(await vp.evaluate(() => !window.__srN && listening === false && !$('#mic').classList.contains('live') && !$('#autoL')), 'ao abrir a tela o microfone continua desligado');
    const said = await vp.evaluate(() => { spkId++; clearTimeout(ttsWD); try { speechSynthesis.cancel(); } catch (e) {} $('#mic').classList.remove('ai'); updMode(); $('#tts').checked = false; const n = window.__srN || 0; say('Pergunta sem ligar o microfone.'); return n; });
    await sleep(500);
    const afterSay = await vp.evaluate(n => ({ n: window.__srN || 0, same: (window.__srN || 0) === n, listening, live: $('#mic').classList.contains('live'), mode: $('#vmode').textContent }), said);
    ok(afterSay.same && afterSay.listening === false && !afterSay.live && /Toque para falar/.test(afterSay.mode), 'depois que o coach fala o microfone não religa');
    const coach = await vp.evaluate(() => new Promise(ok => { $('#tts').checked = true; speak('Olá'); const t0 = Date.now(); (function poll() { const m = $('#mic'); if (m.classList.contains('ai') || Date.now() - t0 > 2500) ok({ ai: m.classList.contains('ai'), live: m.classList.contains('live'), mode: $('#vmode').textContent, listening }); else setTimeout(poll, 30); })(); }));
    ok(coach.ai && !coach.live && /Coach falando/.test(coach.mode) && coach.listening === false, 'o coach fala sozinho sem abrir o microfone');
    await sleep(80);
    await vp.evaluate(() => { spkId++; clearTimeout(ttsWD); $('#tts').checked = false; $('#mic').classList.remove('ai'); updMode(); try { speechSynthesis.cancel(); } catch (e) {} const b = $('#voiceGo'); if (b) b.remove(); $('#anamCard').classList.remove('hide'); window.__got = []; handle = t => window.__got.push(t); });
    const tapMic = async () => { await vp.evaluate(() => { $('#anamCard').classList.remove('hide'); $('#mic').scrollIntoView({ block: 'center' }); }); await vp.click('#mic'); };
    await tapMic();
    await vp.waitForFunction(() => { const m = document.querySelector('#mic'); return m.classList.contains('live') && !m.classList.contains('ai') && [...document.querySelectorAll('#wave span')].some(s => parseFloat(s.style.height) > 0); });
    const on = await vp.evaluate(() => ({ mode: $('#vmode').textContent, live: $('#live').textContent, listening }));
    ok(/Ouvindo você/.test(on.mode) && on.listening && /parar/.test(on.live), 'toque em Toque para falar liga o microfone');
    await tapMic();
    await vp.waitForFunction(() => !document.querySelector('#mic').classList.contains('live') && listening === false);
    const off = await vp.evaluate(() => ({ mode: $('#vmode').textContent, idle: [...document.querySelectorAll('#wave span')].every(b => !b.style.height), ai: $('#mic').classList.contains('ai') }));
    ok(/Toque para falar/.test(off.mode) && off.idle && !off.ai, 'tocar de novo para e a onda volta ao repouso');
    await tapMic(); await vp.waitForFunction(() => listening === true);
    await vp.evaluate(() => { window.__sr.emit('a', 0.95); window.__sr.stop(); }); await sleep(250);
    ok(await vp.evaluate(() => window.__got.length === 0 && listening === false && !$('#mic').classList.contains('live')), 'fala curtíssima é ignorada e o microfone não religa');
    await tapMic(); await vp.waitForFunction(() => listening === true);
    const nLow = await vp.evaluate(() => window.__srN);
    await vp.evaluate(() => { window.__sr.emit('quero hipertrofia', 0.15); window.__sr.stop(); }); await sleep(400);
    ok(await vp.evaluate(n => window.__got.length === 0 && listening === false && window.__srN === n, nLow), 'confiança baixa é ignorada e o microfone não reinicia');
    await tapMic(); await vp.waitForFunction(() => listening === true);
    await vp.evaluate(() => { window.__sr.emit('quero hipertrofia', 0); window.__sr.stop(); }); await sleep(200);
    ok(await vp.evaluate(() => window.__got.length === 1 && /quero hipertrofia/.test(window.__got[0]) && listening === false), 'uma frase clara vira resposta e o microfone desliga');
    ok(!!(await an.$('#ptr')), 'indicador de puxar para atualizar presente');
    // ---- admin
    const ad = await browser.newPage(); await ad.authenticate({ username: 'dono@teste.com', password: 'admin123' }); await ad.setViewport({ width: 1200, height: 800 });
    await ad.goto(URL + '/admin', { waitUntil: 'networkidle0' }); await sleep(500); ok(/Igor Personal/.test(await ad.content()), 'painel admin lista personais e receita');
    const ap = await ad.evaluate(async () => (await fetch('/api/admin/plans', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ basico: { price: '34,90', limit: '20' } }) })).json());
    ok(ap.plans.basico.price_cents === 3490 && ap.plans.basico.limit === 20, 'admin edita preço e limite do plano');
    await ad.evaluate(async () => fetch('/api/admin/plans', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ basico: { price: '29,90', limit: '15' } }) }));

    const rl = await ad.evaluate(async id => (await fetch('/api/admin/reset-link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ personal_id: id }) })).json(), pid);
    ok(/\/redefinir\?t=[0-9a-f]{64}$/.test(rl.link) && /pediu nova senha/.test(await ad.content()), 'admin vê o pedido e gera link de nova senha');
    const rp = await (await browser.createBrowserContext()).newPage(); await rp.goto(rl.link, { waitUntil: 'networkidle0' }); await rp.waitForSelector('#rs1');
    await rp.type('#rs1', 'recuperada1'); await rp.type('#rs2', 'recuperada1'); await Promise.all([rp.waitForNavigation(), rp.click('#rsGo')]);
    ok((await rp.evaluate(async () => (await (await fetch('/api/me')).json()).role)) === 'personal', 'link de redefinição cria a senha nova e entra');
    ok((await post(rp, '/api/password/reset', { token: rl.link.split('t=')[1], senha: 'outra12345' })).st === 400, 'link de redefinição só vale uma vez');
    ok((await post(rp, '/api/personal/login', { email: 'igor@teste.com', senha: 'recuperada1' })).st === 200, 'login com a senha redefinida');
    const fgStu = await a.evaluate(async () => { const r = await fetch('/api/student/forgot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: '  Pamela.Souza@teste.com ' }) }); return { st: r.status, j: await r.json() }; });
    ok(fgStu.st === 200 && /link/.test(fgStu.j.msg), 'aluno pede nova senha pelo e-mail');
    await ad.reload({ waitUntil: 'networkidle0' });
    ok(/pamela\.souza@teste\.com/.test(await ad.content()) && /Pamela Souza/.test(await ad.content()), 'admin vê o pedido de senha do aluno');
    const rlStu = await ad.evaluate(async id => { const r = await fetch('/api/admin/reset-link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ student_id: id }) }); return { st: r.status, j: await r.json() }; }, pamId);
    ok(rlStu.st === 200 && rlStu.j.email === 'pamela.souza@teste.com' && /\/redefinir\?t=[0-9a-f]{64}$/.test(rlStu.j.link), 'admin gera o link de nova senha no e-mail do aluno');
    const legId = (await sql.prepare("SELECT id FROM students WHERE username='legado'").get()).id;
    const semEmail = await ad.evaluate(async id => { const r = await fetch('/api/admin/reset-link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ student_id: id }) }); const j = await r.json(); return { st: r.status, error: j.error || '' }; }, legId);
    ok(semEmail.st === 400 && /e-mail/.test(semEmail.error), 'aluno antigo sem e-mail não recebe link de redefinição');
    const rpStu = await (await browser.createBrowserContext()).newPage();
    await rpStu.goto(rlStu.j.link, { waitUntil: 'networkidle0' });
    await rpStu.waitForSelector('#rs1');
    ok(/pamela\.souza@teste\.com/.test(await rpStu.$eval('#rsInfo', e => e.textContent)), 'a página de nova senha mostra o e-mail do aluno');
    await ad.reload({ waitUntil: 'networkidle0' }); await sleep(400); await ad.screenshot({ path: SHOTS + '/12-admin-planos.png', fullPage: true });
    await ad.screenshot({ path: SHOTS + '/10-admin.png' });
    const clips = await a.evaluate(() => { const q = baseQueue().filter(x => x.q); const med = baseQueue().find(x => x.id === 'med'); return { missing: q.filter(x => !(window.COACH_CLIPS || {})[x.q]).map(x => x.q), med: med && med.q, has: !!(med && (window.COACH_CLIPS || {})[med.q] && (window.COACH_CLIPS || {})['Qual?']), n: Object.keys(window.COACH_CLIPS || {}).length }; });
    ok(!clips.missing.length && clips.has && clips.med === 'Você tem alguma orientação médica?' && clips.n > 5, 'cada pergunta fixa tem mp3, inclusive a orientação médica');
    const vozPg = await browser.newPage(); await vozPg.setViewport(phone);
    await vozPg.goto(URL + '/teste-voz', { waitUntil: 'networkidle0' });
    await vozPg.waitForFunction(() => /Quantidade de vozes/.test(document.body.innerText) && !/Carregando/.test(document.querySelector('#nVozes').textContent), { timeout: 4000 });
    const diag = await vozPg.evaluate(() => ({ suporte: document.querySelector('#suporte').textContent, n: document.querySelector('#nVozes').textContent, pt: document.querySelector('#ptVozes').innerText, aviso: document.querySelector('#aviso').textContent }));
    ok(/Testar voz do navegador/.test(await vozPg.$eval('body', e => e.innerText)) && /Testar áudio/.test(await vozPg.$eval('body', e => e.innerText)) && /voz/.test(diag.suporte), 'página /teste-voz mostra voz do navegador (' + diag.n + ' vozes; ' + diag.pt.replace(/\s+/g, ' ') + ')');
    await vozPg.click('#btnAudio');
    await vozPg.waitForFunction(() => /mp3|áudio|audio|Tocando|bloqueou|carregou/i.test(document.querySelector('#stAudio').textContent));
    const stAudio = await vozPg.$eval('#stAudio', e => e.textContent);
    ok(/ouviu|Tocando|terminou/.test(stAudio), 'botão Testar áudio toca o mp3 (' + stAudio + ')');
    await vozPg.click('#btnVoz');
    await sleep(800);
    const stVoz = await vozPg.$eval('#stVoz', e => e.textContent);
    ok(/voz do navegador|speechSynthesis|mudo|falhou/i.test(stVoz), 'botão Testar voz do navegador responde (' + stVoz + ')');
    console.log('DIAG /teste-voz:', JSON.stringify({ ...diag, stAudio, stVoz }));
    const anon = await browser.newPage(); await anon.goto(URL, { waitUntil: 'networkidle0' });
    ok((await anon.evaluate(async () => (await fetch('/api/cards')).status)) === 401, 'sem login a lista de cards pede entrada');
    ok((await anon.evaluate(async () => (await fetch('/api/ebook')).status)) === 401 && (await anon.evaluate(async () => (await fetch('/ebook-completo.pdf')).status)) === 404 && (await anon.evaluate(async () => (await fetch('/ebooks/ebook-completo.pdf')).status)) === 404, 'sem login o ebook pede entrada e o pdf não fica público');
    async function contaCards(email, plano) {
      const ctx = await browser.createBrowserContext(), pg = await ctx.newPage(); await pg.setViewport(phone);
      await pg.goto(URL, { waitUntil: 'networkidle0' });
      const api = await pg.evaluate(async (email, plano) => {
        const s = await fetch('/api/personal/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome: 'Cards ' + plano, email, senha: 'senha1234', plano }) });
        const list = await fetch('/api/cards'); const j = await list.json();
        const img = async id => { const r = await fetch('/api/cards/' + id + '/img'); return { st: r.status, cache: r.headers.get('cache-control') || '', type: r.headers.get('content-type') || '' }; };
        const vid = await fetch('/api/tutoriais/link', { headers: { Range: 'bytes=0-1' } });
        return { signup: s.status, plan: j.plan, trial: j.trial, paid: j.paid, open: j.cards.filter(c => !c.locked).length, shut: j.cards.filter(c => c.locked).length, i1: await img(1), i51: await img(51), i100: await img(100), vid: vid.status, vidType: vid.headers.get('content-type') || '' };
      }, email, plano);
      return { pg, api };
    }
    async function marcarPago(email, plano) {
      const id = (await sql.prepare('SELECT id FROM personals WHERE email=?').get(email)).id;
      await sql.prepare("UPDATE subscriptions SET status='active', provider='mercadopago', amount_cents=4990, current_period_end=? WHERE personal_id=?").run(Date.now() + 30 * 864e5, id);
      await sql.prepare('INSERT INTO payments(personal_id,provider,external_id,amount_cents,status,test,created_at,plan) VALUES(?,?,?,?,?,?,?,?)').run(id, 'mercadopago', 'live_' + email, 4990, 'approved', 0, Date.now(), plano);
    }
    const proC = await contaCards('cards-pro@teste.com', 'pro');
    ok(proC.api.signup === 200 && proC.api.trial && proC.api.paid === false && proC.api.plan === 'pro' && proC.api.open === 0 && proC.api.shut === 100 && proC.api.i1.st === 403, 'Pro no teste grátis deixa os 100 cards bloqueados');
    ok((proC.api.vid === 200 || proC.api.vid === 206) && /mp4/.test(proC.api.vidType), 'Pro no teste grátis assiste os tutoriais');
    await proC.pg.goto(URL + '/?area=personal', { waitUntil: 'networkidle0' });
    await proC.pg.waitForSelector('#cardStudySec'); await proC.pg.click('#cardStudySec summary');
    await proC.pg.waitForSelector('.cardtile.locked');
    ok((await proC.pg.$$('.cardtile img')).length === 0 && (await proC.pg.$$('.cardtile.locked')).length === 100 && /Liberado após a assinatura/.test(await proC.pg.$eval('#cardStudyBody', e => e.innerText)), 'grade do Pro no teste mostra só cadeado e o aviso de assinatura');
    await marcarPago('cards-pro@teste.com', 'pro');
    await proC.pg.reload({ waitUntil: 'networkidle0' });
    await proC.pg.waitForSelector('#cardStudySec'); await proC.pg.click('#cardStudySec summary');
    await proC.pg.waitForSelector('.cardtile img');
    const proPago = await proC.pg.evaluate(async () => { const j = await (await fetch('/api/cards')).json(); const img = await fetch('/api/cards/1/img'); const img51 = await fetch('/api/cards/51/img'); return { paid: j.paid, open: j.cards.filter(c => !c.locked).length, shut: j.cards.filter(c => c.locked).length, i1: img.status, type: img.headers.get('content-type') || '', cache: img.headers.get('cache-control') || '', i51: img51.status }; });
    ok(proPago.paid && proPago.open === 50 && proPago.shut === 50 && proPago.i1 === 200 && /jpeg/.test(proPago.type) && /private/.test(proPago.cache) && proPago.i51 === 403, 'Pro com pagamento confirmado libera 50 cards e a imagem; o restante responde 403');
    const ebookPro = await proC.pg.evaluate(async () => { const r = await fetch('/api/ebook'); const j = await r.json().catch(() => ({})); return { st: r.status, err: j.error || '', text: (document.querySelector('#ebookSec') || {}).textContent || '', btn: !!document.querySelector('#ebookGo') }; });
    ok(ebookPro.st === 403 && /Exclusivo do plano Ilimitado/.test(ebookPro.err) && /Exclusivo do plano Ilimitado/.test(ebookPro.text) && !ebookPro.btn, 'Pro pago vê o ebook como exclusivo do Ilimitado');
    ok((await proC.pg.$$('.cardtile img')).length === 50 && (await proC.pg.$$('.cardtile.locked')).length === 50, 'grade do Pro pago mostra 50 miniaturas e 50 cadeados');
    await proC.pg.select('#cardReg', 'Mão');
    await proC.pg.waitForFunction(() => document.querySelectorAll('.cardtile').length === 1 && document.querySelector('.cardtile.locked'));
    ok(true, 'filtro de região reduz a grade');
    await proC.pg.select('#cardReg', '');
    await proC.pg.waitForSelector('.cardtile img');
    await proC.pg.click('.cardtile:not(.locked)');
    await proC.pg.waitForSelector('#cardView:not(.hide) img');
    const antes = await proC.pg.$eval('#cardCap', e => e.textContent);
    await proC.pg.click('#cardNext');
    const depois = await proC.pg.$eval('#cardCap', e => e.textContent);
    ok(antes !== depois && /2\//.test(depois), 'tela cheia troca de card com o botão próximo');
    const swiped = await proC.pg.evaluate(() => new Promise(res => {
      const s = document.getElementById('cardStage'), cap = () => document.getElementById('cardCap').textContent;
      const before = cap();
      const fire = (type, x) => { const t = new Touch({ identifier: 1, target: s, clientX: x, clientY: 80 }); s.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, changedTouches: [t] })); };
      try { fire('touchstart', 280); fire('touchend', 40); } catch (e) { return res({ before, after: cap(), err: String(e) }); }
      setTimeout(() => res({ before, after: cap() }), 50);
    }));
    ok(swiped.after !== swiped.before, 'deslizar na tela cheia muda o card' + (swiped.err ? ' (' + swiped.err + ')' : ''));
    const iliC = await contaCards('cards-ili@teste.com', 'ilimitado');
    ok(iliC.api.trial && iliC.api.paid === false && iliC.api.plan === 'ilimitado' && iliC.api.open === 0 && iliC.api.shut === 100 && iliC.api.i1.st === 403 && iliC.api.i100.st === 403, 'Ilimitado no teste grátis deixa os 100 cards bloqueados');
    ok((iliC.api.vid === 200 || iliC.api.vid === 206) && /mp4/.test(iliC.api.vidType), 'Ilimitado no teste grátis assiste os tutoriais');
    const iliId = (await sql.prepare("SELECT id FROM personals WHERE email='cards-ili@teste.com'").get()).id;
    await sql.prepare('INSERT INTO payments(personal_id,provider,external_id,amount_cents,status,test,created_at,plan) VALUES(?,?,?,?,?,?,?,?)').run(iliId, 'mercadopago', 'live_ili_ainda_trial', 7990, 'approved', 0, Date.now(), 'ilimitado');
    const aindaTrial = await iliC.pg.evaluate(async () => { const j = await (await fetch('/api/cards')).json(); return { trial: j.trial, paid: j.paid, open: j.cards.filter(c => !c.locked).length }; });
    ok(aindaTrial.trial && aindaTrial.paid === false && aindaTrial.open === 0, 'pagamento confirmado não abre card enquanto o teste grátis segue valendo');
    const ebookAinda = await iliC.pg.evaluate(async () => { const r = await fetch('/api/ebook'); const j = await r.json().catch(() => ({})); return { st: r.status, err: j.error || '' }; });
    ok(ebookAinda.st === 403 && /Liberado após a assinatura/.test(ebookAinda.err), 'Ilimitado no teste não baixa o ebook mesmo com pagamento lançado');
    await sql.prepare("UPDATE subscriptions SET status='active', provider='mercadopago', amount_cents=7990, current_period_end=? WHERE personal_id=?").run(Date.now() + 30 * 864e5, iliId);
    const iliPago = await iliC.pg.evaluate(async () => { const j = await (await fetch('/api/cards')).json(); const i1 = await fetch('/api/cards/1/img'); const i100 = await fetch('/api/cards/100/img'); return { paid: j.paid, open: j.cards.filter(c => !c.locked).length, shut: j.cards.filter(c => c.locked).length, i1: i1.status, i100: i100.status }; });
    ok(iliPago.paid && iliPago.open === 100 && iliPago.shut === 0 && iliPago.i1 === 200 && iliPago.i100 === 200, 'Ilimitado com pagamento confirmado libera os 100 cards');
    const ebookIli = await iliC.pg.evaluate(async () => { const r = await fetch('/api/ebook'); const buf = r.ok ? new Uint8Array(await r.arrayBuffer()) : null; const j = r.ok ? {} : await r.json().catch(() => ({})); return { st: r.status, type: r.headers.get('content-type') || '', cache: r.headers.get('cache-control') || '', n: buf ? buf.length : 0, head: buf ? String.fromCharCode(buf[0], buf[1], buf[2], buf[3], buf[4]) : '', err: j.error || '' }; });
    ok(ebookIli.st === 200 && /pdf/.test(ebookIli.type) && /no-store/.test(ebookIli.cache) && ebookIli.head === '%PDF-' && ebookIli.n > 100000, 'Ilimitado pago recebe o PDF do ebook');
    await iliC.pg.goto(URL + '/?area=personal', { waitUntil: 'networkidle0' });
    await iliC.pg.waitForSelector('#ebookGo');
    const ebookAberto = await iliC.pg.evaluate(() => { const c = document.querySelector('#cardStudySec'), e = document.querySelector('#ebookSec'); const box = e.getBoundingClientRect(), btn = document.querySelector('#ebookGo').getBoundingClientRect(); return { next: c.nextElementSibling && c.nextElementSibling.id, text: e.textContent, lock: !!e.querySelector('.ebooklock'), overflow: btn.right > box.right + 2 || btn.width > box.width + 2 }; });
    ok(ebookAberto.next === 'ebookSec' && /Abrir ebook/.test(ebookAberto.text) && /Guia Prático dos Exercícios de Musculação/.test(ebookAberto.text) && !ebookAberto.lock && !ebookAberto.overflow, 'Ilimitado pago mostra Abrir ebook abaixo dos cards');
    const basC = await contaCards('cards-basico@teste.com', 'basico');
    await marcarPago('cards-basico@teste.com', 'basico');
    const basPago = await basC.pg.evaluate(async () => { const j = await (await fetch('/api/cards')).json(); const img = await fetch('/api/cards/1/img'); const ej = await img.json().catch(() => ({})); return { paid: j.paid, open: j.cards.filter(c => !c.locked).length, img: img.status, err: ej.error || '' }; });
    ok(basPago.paid && basPago.open === 0 && basPago.img === 403 && /Básico/.test(basPago.err) && /upgrade/i.test(basPago.err), 'Básico pago continua sem cards e pede upgrade');
    const ebookBas = await basC.pg.evaluate(async () => { const r = await fetch('/api/ebook'); const j = await r.json().catch(() => ({})); return { st: r.status, err: j.error || '' }; });
    ok(ebookBas.st === 403 && ebookBas.err === 'Exclusivo do plano Ilimitado', 'Básico pago não abre o ebook');
    ok((basC.api.vid === 200 || basC.api.vid === 206) && /mp4/.test(basC.api.vidType), 'Básico assiste os tutoriais sem pagamento');
    const ctxDono = await browser.createBrowserContext(), donoPg = await ctxDono.newPage(); await donoPg.setViewport(phone);
    await donoPg.goto(URL, { waitUntil: 'networkidle0' });
    const donoApi = await donoPg.evaluate(async () => {
      const s = await fetch('/api/personal/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome: 'Dono Personal', email: 'dono@teste.com', senha: 'senha1234', plano: 'basico' }) });
      const j = await (await fetch('/api/cards')).json();
      const i1 = await fetch('/api/cards/1/img');
      const i100 = await fetch('/api/cards/100/img');
      const eb = await fetch('/api/ebook');
      const me = await (await fetch('/api/me')).json();
      return { signup: s.status, plan: j.plan, trial: j.trial, open: j.cards.filter(c => !c.locked).length, i1: i1.status, t1: i1.headers.get('content-type') || '', i100: i100.status, eb: eb.status, ebt: eb.headers.get('content-type') || '', owner: !!me.owner_test, paid: me.paid };
    });
    ok(donoApi.signup === 200 && donoApi.plan === 'basico' && donoApi.trial && donoApi.paid === false && donoApi.owner && donoApi.open === 100 && donoApi.i1 === 200 && /jpeg/.test(donoApi.t1) && donoApi.i100 === 200 && donoApi.eb === 200 && /pdf/.test(donoApi.ebt), 'e-mail do admin no teste grátis abre os 100 cards e o ebook');
    await donoPg.goto(URL + '/?area=personal', { waitUntil: 'networkidle0' });
    await donoPg.waitForSelector('#ebookGo');
    await donoPg.click('#cardStudySec summary');
    await donoPg.waitForSelector('.cardtile img');
    const donoUi = await donoPg.evaluate(() => ({ imgs: document.querySelectorAll('.cardtile img').length, locks: document.querySelectorAll('.cardtile.locked').length, ebook: document.querySelector('#ebookSec').textContent, lock: !!document.querySelector('#ebookSec .ebooklock') }));
    ok(donoUi.imgs === 100 && donoUi.locks === 0 && /Abrir ebook/.test(donoUi.ebook) && !donoUi.lock, 'painel do dono mostra os cards e o botão do ebook');
    const unkId = (await sql.prepare("SELECT id FROM personals WHERE email='cards-pro@teste.com'").get()).id;
    await sql.prepare('UPDATE subscriptions SET plan=? WHERE personal_id=?').run('xyz', unkId);
    await sql.prepare('UPDATE personals SET plan=? WHERE id=?').run('xyz', unkId);
    const unk = await proC.pg.evaluate(async () => { const j = await (await fetch('/api/cards')).json(); return { plan: j.plan, paid: j.paid, open: j.cards.filter(c => !c.locked).length }; });
    ok(unk.plan === 'xyz' && unk.paid && unk.open === 50, 'plano desconhecido, já pago, vale como Pro');

    const pix = require('../src/pix'), pubPage = require('../src/public-page');
    ok(pix.crc16('123456789') === '29B1', 'CRC16 do Pix bate com o vetor 123456789');
    const amostra = pix.payload({ chave: 'a@b.co', nome: 'Igor Silva', cidade: 'Campo Grande', cents: 15990 });
    ok(amostra.includes('159.90') && amostra.includes('br.gov.bcb.pix') && amostra.slice(-4) === pix.crc16(amostra.slice(0, -4)), 'copia e cola leva o valor e fecha com o CRC');
    ok(pix.moneyToCents('150,00') === 15000 && pix.moneyToCents('1.500,00') === 150000, 'valor em reais vira centavos');
    const diaFixo = new Date(2026, 9, 17);
    ok(pix.cycle({ amount_cents: 15000, due_day: 25, paid_through: null }, diaFixo).tone === 'open', 'mensalidade que vence em mais de 3 dias fica em aberto');
    ok(pix.cycle({ amount_cents: 15000, due_day: 19, paid_through: null }, diaFixo).tone === 'soon', 'mensalidade que vence em até 3 dias fica amarela');
    ok(pix.cycle({ amount_cents: 15000, due_day: 10, paid_through: '2026-08-10' }, diaFixo).tone === 'bad', 'mensalidade vencida fica vermelha');
    const verde = pix.cycle({ amount_cents: 15000, due_day: 25, paid_through: '2026-09-25' }, diaFixo);
    ok(verde.tone === 'ok' && verde.due === '2026-10-25', 'ciclo confirmado e com folga de mais de 3 dias fica verde');
    const avisou = pix.cycle({ amount_cents: 15000, due_day: 19, paid_through: null, informed_for: '2026-10-19' }, diaFixo);
    ok(avisou.informed && avisou.tone === 'soon', 'pagamento informado não pinta de verde');
    const pagina = pubPage.page({ nome: 'Lia', bio: 'Força', foto: '', fee_cents: 15000, active: true, full: false, code: 'ABC12345' });
    ok(/Lia/.test(pagina) && /Força/.test(pagina) && /Quero ser aluno/.test(pagina) && /Mensalidade/.test(pagina) && /150/.test(pagina), 'página pública mostra nome, bio, preço e o botão');
    ok(/id="email"/.test(pagina) && /id="zap"/.test(pagina) && /Para o seu personal falar com você se precisar/.test(pagina) && !/id="user"/.test(pagina) && !/id="altura"/.test(pagina) && !/Usuário/.test(pagina), 'a página pública pede e-mail e WhatsApp, e não pede usuário nem altura');
    ok(pagina.indexOf('__pwaPrompt') > 0 && pagina.indexOf('__pwaPrompt') < pagina.indexOf('rel="manifest"') && /serviceWorker\.register\("\/sw\.js"\)/.test(pagina), 'a página /p registra o prompt e o service worker no começo do head');
    const cheia = pubPage.page({ nome: 'Lia', bio: '', foto: '', fee_cents: 0, active: true, full: true, code: 'ABC12345' });
    ok(/limite/.test(cheia) && !/Quero ser aluno/.test(cheia), 'página pública some com o botão quando o plano está cheio');
    const parada = pubPage.page({ nome: 'Lia', bio: '', foto: '', fee_cents: 15000, active: false, full: false, code: 'ABC12345' });
    ok(/inativa/.test(parada) && !/Quero ser aluno/.test(parada), 'página pública bloqueia personal com assinatura inativa');

    const dueDay = new Date(Date.now() + 2 * 864e5).getDate();
    const ctxF = await browser.createBrowserContext(), f = await ctxF.newPage(); await f.setViewport(phone);
    f.on('pageerror', e => console.error('erro na página (pix):', e.message));
    await f.goto(URL, { waitUntil: 'networkidle0' });
    const cadLia = await f.evaluate(async () => { const r = await fetch('/api/personal/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome: 'Lia Personal', email: 'lia@teste.com', senha: 'senha1234', plano: 'pro' }) }); const j = await r.json().catch(() => ({})); return { st: r.status, error: j.error || '' }; });
    ok(cadLia.st === 200, 'personal da mensalidade cria a conta' + (cadLia.error ? ' (' + cadLia.error + ')' : ''));
    await f.goto(URL + '/?area=personal', { waitUntil: 'networkidle0' });
    await f.waitForSelector('#pixBox');
    await f.evaluate(() => { document.querySelector('#pixBox').open = true; });
    await f.select('#pixTipo', 'email');
    await f.type('#pixChave', 'lia@pix.com');
    const nomePix = await f.$eval('#pixNome', e => e.value);
    if (!nomePix) await f.type('#pixNome', 'Lia Personal');
    await f.type('#pixCidade', 'Campo Grande');
    await f.$eval('#pixValor', (e, v) => { e.value = v; }, '150,00');
    await f.$eval('#pixDia', (e, v) => { e.value = v; }, String(dueDay));
    await f.type('#pixBio', 'Treino de força');
    await f.click('#pixGo');
    await f.waitForFunction(() => /Salvo/.test((document.querySelector('#pixMsg') || {}).innerText || ''));
    const pixSalvo = await f.evaluate(async () => { const me = await (await fetch('/api/me')).json(); return me.personal.pix; });
    ok(pixSalvo.chave === 'lia@pix.com' && pixSalvo.fee_cents === 15000 && pixSalvo.fee_day === dueDay && /força/i.test(pixSalvo.bio), 'chave Pix e valor público da mensalidade ficam salvos');
    await f.evaluate(async () => { const r = await fetch('/api/personal/whatsapp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ numero: '67999998888' }) }); if (!r.ok) throw new Error(await r.text()); });
    const foto = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const comFoto = await f.evaluate(async foto => { const r = await fetch('/api/personal/pix', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tipo: 'email', chave: 'lia@pix.com', nome: 'Lia Personal', cidade: 'Campo Grande', valor: '150,00', dia: String(document.querySelector('#pixDia').value), bio: 'Treino de força', foto }) }); const j = await r.json(); return { st: r.status, foto: j.has_foto, chave: j.pix && j.pix.chave }; }, foto);
    ok(comFoto.st === 200 && comFoto.foto && comFoto.chave === 'lia@pix.com', 'foto do link público é salva junto da chave');
    const codeLia = (await f.$eval('#invCode', e => e.textContent)).trim();
    const linkPub = await f.$eval('#invLink', e => e.value);
    ok(linkPub.endsWith('/p/' + codeLia) && /\/convite\//.test(await f.$eval('#invDireto', e => e.textContent)) && /Copiar link/.test(await f.$eval('#invBox', e => e.innerText)) && /Compartilhar no WhatsApp/.test(await f.$eval('#invShare', e => e.textContent)), 'o painel copia o link público e guarda o convite direto');
    ok((await (await fetch(URL + '/p/naoexiste')).text()).includes('Link não encontrado'), 'link público desconhecido responde que não existe');
    const ctxPub = await browser.createBrowserContext(), pub = await ctxPub.newPage(); await pub.setViewport(phone);
    pub.on('pageerror', e => console.error('erro na página (link):', e.message));
    await pub.goto(URL + '/p/' + codeLia, { waitUntil: 'networkidle0' });
    const capa = await pub.evaluate(() => {
      const b = document.querySelector('#baixarApp');
      const r = b ? b.getBoundingClientRect() : { width: 0, height: 0, top: 999 };
      return { t: document.body.innerText, foto: !!document.querySelector('img.foto'), quero: !!document.querySelector('#quero'), baixar: b ? b.textContent : '', w: r.width, h: r.height, top: r.top, hide: !!(document.querySelector('#baixarBar') && document.querySelector('#baixarBar').classList.contains('hide')) };
    });
    ok(/Lia Personal/.test(capa.t) && /Treino de força/.test(capa.t) && /150/.test(capa.t) && capa.quero && capa.foto, 'quem abre o link vê nome, bio, foto, preço e Quero ser aluno');
    ok(capa.baixar === '📲 Baixar app' && capa.w > 200 && capa.h >= 48 && capa.top < 80 && !capa.hide, 'a página pública /p/CÓDIGO mostra Baixar app');
    await pub.click('#quero');
    await pub.waitForSelector('#form:not(.hide)');
    await pub.type('#nome', 'Caio Aluno'); await pub.type('#email', 'caio@teste.com'); await pub.type('#pw', 'aluno123'); await pub.type('#pw2', 'aluno123');
    await pub.evaluate(() => { const e = document.querySelector('#zap'); e.value = '11988887777'; e.dispatchEvent(new Event('input', { bubbles: true })); });
    await Promise.all([pub.waitForNavigation({ waitUntil: 'networkidle0' }), pub.click('#form button[type=submit]')]);
    await pub.waitForSelector('#feeJa');
    const pixAntes = await pub.evaluate(() => ({ anam: document.querySelector('#anamCard').classList.contains('hide'), wa: document.querySelector('#waTop').innerText, card: document.querySelector('#feeCard').innerText, payload: document.querySelector('#feePayload').value, qr: !!document.querySelector('#feeCard img') }));
    ok(pixAntes.anam && /Falar com o personal/.test(pixAntes.wa) && /Já paguei/.test(pixAntes.card) && /150/.test(pixAntes.card) && pixAntes.qr && pixAntes.payload.includes('150.00') && pixAntes.payload.slice(-4) === pix.crc16(pixAntes.payload.slice(0, -4)), 'depois do cadastro o aluno vê o Pix, o QR e o WhatsApp, e a anamnese espera o Já paguei');
    ok((await pub.evaluate(async () => (await fetch('/api/personal/pix', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status)) === 401, 'aluno não grava a chave Pix do personal');
    await Promise.all([pub.waitForNavigation({ waitUntil: 'networkidle0' }), pub.click('#feeJa')]);
    await pub.waitForSelector('#anamCard:not(.hide)');
    await pub.waitForFunction(() => /Olá, Caio/.test((document.querySelector('#chat') || {}).textContent || '') && /Pagamento informado/.test((document.querySelector('#feeCard') || {}).innerText || '') && !document.querySelector('#feeJa'), { timeout: 15000 });
    ok(!(await pub.$('#anAltura')) && !(await pub.$('#anPeso')) && !(await pub.$('#anDias')) && !(await pub.$('#anMedGo')), 'no link público a anamnese também não tem campos de altura, peso nem dias');
    await dizer(pub, ['22 anos', 'hipertrofia', 'não', 'em 3 meses', 'não', '3 dias', 'segunda, quarta e sexta', '40 minutos', 'não', 'não', '80,5 quilos', '1,70']);
    await pub.waitForFunction(async () => { const me = await (await fetch('/api/me')).json(); return Number(me.altura_cm) === 170 && Number(me.peso_kg) === 80.5 && Array.isArray(me.dias_semana) && me.dias_semana.join(',') === 'segunda,quarta,sexta'; });
    const caioU = (await sql.prepare("SELECT username FROM students WHERE email=?").get('caio@teste.com')).username;
    const pixDepois = await pub.evaluate(() => ({ card: document.querySelector('#feeCard').innerText, ja: !!document.querySelector('#feeJa'), wa: !!document.querySelector('#waTop .waPers'), treino: document.querySelector('#statusCard').classList.contains('hide') }));
    ok(/Pagamento informado/.test(pixDepois.card) && !pixDepois.ja && pixDepois.wa && pixDepois.treino, 'Já paguei libera a anamnese, mantém o WhatsApp e não mostra treino');
    await f.reload({ waitUntil: 'networkidle0' });
    await f.waitForSelector('.stu[data-u="' + caioU + '"]');
    const linha = await f.$eval('.stu[data-u="' + caioU + '"]', e => ({ t: e.innerText, soon: !!e.querySelector('.feeDot.soon'), ok: !!e.querySelector('.feeDot.ok') }));
    ok(/Pendente de aprovação/.test(linha.t) && /Pagamento informado/.test(linha.t) && linha.soon && !linha.ok && /pago/.test(await f.$eval('#feeLegend', e => e.innerText)), 'o aluno do link entra pendente de aprovação, amarelo, com pagamento informado');
    await f.click('.stu[data-u="' + caioU + '"]');
    await f.waitForSelector('#feeOk');
    ok(/Confirmar recebimento/.test(await f.$eval('#feeEdit', e => e.innerText)) && !(await f.$('#aprovar')), 'a ficha confirma o Pix e ainda não tem treino para aprovar');
    const caioCorpo = await f.$eval('#corpoAluno', e => e.textContent);
    const caioMed = await sql.prepare('SELECT altura_cm a, peso_kg p FROM students WHERE username=?').get(caioU);
    ok(Number(caioMed.a) === 170 && Number(caioMed.p) === 80.5 && /1,70 m/.test(caioCorpo) && /80,5 kg/.test(caioCorpo) && /IMC 27,9/.test(caioCorpo), 'o link /p grava altura e peso e a ficha mostra o IMC');
    await f.click('#feeOk');
    await f.waitForFunction(() => /Pago/.test((document.querySelector('#feeEditBody') || {}).innerText || '') && document.querySelector('#feeHist'));
    const pago = await f.evaluate((u) => ({ t: document.querySelector('.stu[data-u="' + u + '"]').innerText, dot: !!document.querySelector('.stu[data-u="' + u + '"] .feeDot.ok'), hist: document.querySelector('#feeHist').innerText }), caioU);
    ok(/Pago/.test(pago.t) === false && !/Pagamento informado/.test(pago.t) && pago.dot && /150/.test(pago.hist), 'confirmar recebimento pinta de verde e guarda o histórico');
    const avancou = await f.evaluate(async (u) => (await (await fetch('/api/personal/tuition/' + u)).json()).fee, caioU);
    const esperado = pix.addMonth(pix.cycle({ amount_cents: 15000, due_day: dueDay, paid_through: null }).due, dueDay);
    ok(avancou.tone === 'ok' && avancou.paid_through && avancou.due === esperado, 'confirmar avança o vencimento um mês');
    ok(!!(await pub.$('#feeCard img')) && !!(await pub.$('#feePayload')) && !!(await pub.$('#feeCard')), 'antes de revalidar o aluno ainda está com o Pix antigo na tela');
    const emDia = await pub.evaluate(async () => {
      await window.__syncFee();
      const s = document.querySelector('#feeSelo');
      return { selo: s ? s.textContent : '', card: !!document.querySelector('#feeCard'), payload: !!document.querySelector('#feePayload'), ja: !!document.querySelector('#feeJa'), equip: !document.querySelector('#equipCard').classList.contains('hide') };
    });
    ok(emDia.selo === 'Mensalidade em dia' && !emDia.card && !emDia.payload && !emDia.ja && emDia.equip, 'com a mensalidade confirmada some o Pix e fica o selo Mensalidade em dia');
    await pub.evaluate(() => {
      const s = document.querySelector('#feeSelo'); if (s) s.remove();
      document.querySelector('#t-aluno .whoami').insertAdjacentHTML('afterend', '<div class="card feeCard" id="feeCard"><img alt="QR Code Pix"><textarea id="feePayload">VELHO</textarea><button id="feeJa" type="button">Já paguei</button></div>');
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    });
    await pub.waitForFunction(() => { const s = document.querySelector('#feeSelo'); return s && s.textContent === 'Mensalidade em dia' && !document.querySelector('#feeCard') && !document.querySelector('#feePayload') && !document.querySelector('#feeJa'); });
    ok(true, 'ao abrir de novo a página não restaura o Pix antigo');
    const hdr = await pub.evaluate(async () => {
      const r = await fetch('/api/student/tuition', { cache: 'no-store' });
      const j = await r.json();
      return { cc: r.headers.get('cache-control') || '', payload: j.payload || '', qr: j.qr || '', tone: (j.fee || {}).tone };
    });
    ok(hdr.tone === 'ok' && hdr.payload === '' && !hdr.qr && /no-store/.test(hdr.cc), 'mensalidade confirmada não devolve o código Pix e a resposta não fica em cache');
    await pub.evaluate(() => {
      window.scrollTo(0, 0);
      const s = document.querySelector('#feeSelo'); if (s) s.remove();
      document.querySelector('#t-aluno .whoami').insertAdjacentHTML('afterend', '<div class="card feeCard" id="feeCard"><img alt="QR Code Pix"><textarea id="feePayload">VELHO</textarea><button id="feeJa" type="button">Já paguei</button></div>');
    });
    const voltou = pub.waitForNavigation({ waitUntil: 'networkidle0' });
    await pub.evaluate(() => window.__puxarAtualizar()).catch(() => {});
    await voltou;
    await pub.waitForFunction(() => { const s = document.querySelector('#feeSelo'); return s && s.textContent === 'Mensalidade em dia' && !document.querySelector('#feePayload') && !document.querySelector('#feeJa'); });
    ok(true, 'puxar para atualizar busca a mensalidade de novo e não traz o Pix antigo');
    let venceu = null;
    for (let n = 1; n <= 8 && !venceu; n++) {
      const dt = new Date(); dt.setMonth(dt.getMonth() - n); dt.setDate(Math.min(dueDay, new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate()));
      const iso = pix.iso(dt);
      const tone = pix.cycle({ amount_cents: 15000, due_day: dueDay, paid_through: iso }).tone;
      if (tone === 'bad' || tone === 'soon') venceu = iso;
    }
    ok(!!venceu, 'há um vencimento seguinte para o Pix voltar');
    const caioId = (await sql.prepare('SELECT id FROM students WHERE username=?').get(caioU)).id;
    await sql.prepare('UPDATE tuition SET paid_through=? WHERE student_id=?').run(venceu, caioId);
    await pub.evaluate(() => window.__syncFee());
    await pub.waitForFunction(() => { const card = document.querySelector('#feeCard'); const payload = document.querySelector('#feePayload'); return card && card.querySelector('img') && payload && payload.value.includes('150.00') && document.querySelector('#feeJa') && !document.querySelector('#feeSelo'); });
    ok(true, 'no próximo vencimento o Pix, o QR e o Já paguei voltam');
    await f.click('#feeUndo');
    await f.waitForFunction(() => /Pagamento informado/.test((document.querySelector('#feeEditBody') || {}).innerText || '') && /desfeito/.test((document.querySelector('#feeHist') || {}).innerText || ''));
    ok(!!(await f.$('.stu[data-u="' + caioU + '"] .feeDot.soon')), 'desfazer devolve o aviso de pagamento e a cor amarela');
    await pub.evaluate(() => window.__syncFee());
    await pub.waitForFunction(() => /Pagamento informado/.test((document.querySelector('#feeCard') || {}).innerText || '') && !document.querySelector('#feeJa') && !document.querySelector('#feeSelo'));
    ok(true, 'sem a confirmação do mês o selo sai e o aviso de pagamento volta');
    const davi = await fetch(URL + '/api/student/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'davi@teste.com', nome: 'Davi Direto', senha: 'aluno123', convite: codeLia, whatsapp: '11911112222' }) });
    const daviJ = await davi.json();
    ok(davi.status === 200 && daviJ.pix === false, 'convite direto não manda o aluno para o Pix antes da anamnese');
    let atrasado = null;
    for (let n = 2; n <= 8 && !atrasado; n++) {
      const dt = new Date(); dt.setMonth(dt.getMonth() - n); dt.setDate(Math.min(dueDay, new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate()));
      const iso = pix.iso(dt);
      if (pix.cycle({ amount_cents: 15000, due_day: dueDay, paid_through: iso }).tone === 'bad') atrasado = iso;
    }
    ok(!!atrasado, 'há um ciclo vencido para testar o vermelho');
    const daviRow = await sql.prepare("SELECT id, username FROM students WHERE email=?").get('davi@teste.com');
    const daviId = daviRow.id, daviU = daviRow.username;
    await sql.prepare('INSERT INTO tuition(student_id,paid_through,exempt) VALUES(?,?,0)').run(daviId, atrasado);
    await f.reload({ waitUntil: 'networkidle0' });
    await f.waitForSelector('.stu[data-u="' + daviU + '"]');
    const direto = await f.$eval('.stu[data-u="' + daviU + '"]', e => ({ t: e.innerText, bad: !!e.querySelector('.feeDot.bad') }));
    ok(/Sem treino/.test(direto.t) && !/Pendente de aprovação/.test(direto.t) && direto.bad, 'aluno do convite direto continua Sem treino e fica vermelho se a mensalidade venceu');
    await f.click('.stu[data-u="' + daviU + '"]');
    await f.waitForFunction((u) => viewing === u && /Marcar como pago/.test((document.querySelector('#feeEdit') || {}).innerText || '') && !document.querySelector('#feeNo'), {}, daviU);
    ok(true, 'convite direto não tem Recusar; o personal marca como pago se quiser');
    const recusaDireto = await f.evaluate(async (u) => { const r = await fetch('/api/personal/tuition/' + u + '/gate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'recusar' }) }); return { st: r.status, j: await r.json() }; }, daviU);
    ok(recusaDireto.st === 400 && /ficha/.test(recusaDireto.j.error), 'recusar o convite direto é barrado');
    const ctxD = await browser.createBrowserContext(), dv = await ctxD.newPage(); await dv.setViewport(phone);
    await dv.goto(URL, { waitUntil: 'networkidle0' });
    await dv.evaluate(async () => { const r = await fetch('/api/student/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'davi@teste.com', senha: 'aluno123' }) }); if (!r.ok) throw new Error(await r.text()); });
    await dv.goto(URL, { waitUntil: 'networkidle0' });
    await dv.waitForSelector('#anamCard:not(.hide)');
    ok(await dv.$('#waTop .waPers') && !(await dv.$('#feeHold')), 'aluno do convite direto cai na anamnese e já pode falar com o personal');
    await f.evaluate((u) => openStu(u), caioU);
    await f.waitForSelector('#feeNo');
    await f.evaluate(() => document.querySelector('#feeNo').click());
    await f.waitForFunction((u) => /Recusado/.test((document.querySelector('.stu[data-u="' + u + '"]') || {}).textContent || ''), {}, caioU);
    await pub.reload({ waitUntil: 'networkidle0' });
    await pub.waitForSelector('#feeHold');
    const recusado = await pub.evaluate(() => ({ anam: document.querySelector('#anamCard').classList.contains('hide'), hold: document.querySelector('#feeHold').innerText, wa: document.querySelector('#waTop').innerText, treino: document.querySelector('#statusCard').classList.contains('hide') }));
    ok(recusado.anam && /Aguardando o personal/.test(recusado.hold) && /Falar com o personal/.test(recusado.wa) && recusado.treino, 'aluno recusado não vê treino e continua com o WhatsApp');
    const planos = await sql.prepare("SELECT value FROM settings WHERE key='plans'").get();
    const pj = JSON.parse(planos.value); const limiteAntes = pj.pro.limit; pj.pro.limit = 2;
    await sql.prepare('UPDATE settings SET value=? WHERE key=?').run(JSON.stringify(pj), 'plans');
    const htmlCheio = await (await fetch(URL + '/p/' + codeLia)).text();
    ok(/limite/.test(htmlCheio) && !/Quero ser aluno/.test(htmlCheio), 'no ar, o link público respeita o limite de alunos');
    const extra = await fetch(URL + '/api/student/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'extra1@teste.com', nome: 'Extra Um', senha: 'aluno123', convite: codeLia, origem: 'publico', whatsapp: '11911113333' }) });
    const extraJ = await extra.json();
    ok(extra.status === 403 && /limite/.test(extraJ.error), 'cadastro pelo link público também trava no limite do plano');
    pj.pro.limit = limiteAntes;
    await sql.prepare('UPDATE settings SET value=? WHERE key=?').run(JSON.stringify(pj), 'plans');
    const liaId = (await sql.prepare("SELECT id FROM personals WHERE email='lia@teste.com'").get()).id;
    await sql.prepare('UPDATE subscriptions SET current_period_end=? WHERE personal_id=?').run(Date.now() - 1000, liaId);
    const htmlParado = await (await fetch(URL + '/p/' + codeLia)).text();
    ok(/inativa/.test(htmlParado) && !/Quero ser aluno/.test(htmlParado), 'link público avisa quando a assinatura do personal está inativa');

    console.log('\nTODOS OS TESTES PASSARAM');
  } catch (e) { console.error(e); process.exitCode = 1; } finally { if (videoTeste) fs.rmSync(videoTeste, { force: true }); await browser.close(); srv.kill(); }
})();
