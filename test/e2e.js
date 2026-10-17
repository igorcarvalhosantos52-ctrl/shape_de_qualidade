// Teste ponta a ponta: cadastro do personal -> paywall -> pagamento demo -> convite -> aluno faz anamnese -> personal aprova
const puppeteer = require('puppeteer-core'), { spawn, spawnSync } = require('child_process'), path = require('path'), fs = require('fs');
const LIB = '/tmp/sq-e2e-libsql.db', SQLITE = '/tmp/sq-e2e-sqlite.db';
for (const f of [LIB, LIB + '-wal', LIB + '-shm', SQLITE, SQLITE + '-wal', SQLITE + '-shm']) fs.rmSync(f, { force: true });
process.env.TURSO_DATABASE_URL = 'file:' + LIB;
delete process.env.TURSO_AUTH_TOKEN;
const sql = require('../src/db'), pay = require('../src/payments');
const PORT = 3456, URL = `http://localhost:${PORT}`, SHOTS = path.join(__dirname, '..', 'screens');
const sleep = ms => new Promise(r => setTimeout(r, ms));
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
  const srv = spawn('node', ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT, TURSO_DATABASE_URL: 'file:' + LIB, TURSO_AUTH_TOKEN: '', ADMIN_EMAIL: 'dono@teste.com', ADMIN_PASSWORD: 'admin123', MP_ACCESS_TOKEN: '', STRIPE_SECRET_KEY: '' }, stdio: 'inherit' });
  await sleep(1200);
    const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const phone = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
  try {
    // ---- personal
    const ctxP = await browser.createBrowserContext(), p = await ctxP.newPage(); await p.setViewport(phone);
    p.on('pageerror', e => console.error('erro na página (personal):', e.message));
    await p.goto(URL, { waitUntil: 'networkidle0' });
    await p.screenshot({ path: SHOTS + '/01-login-aluno.png' });
    await p.click('#goPers'); await p.waitForSelector('#pSwap'); await p.click('#pSwap');
    await p.type('#pNomeAcc', 'Igor Personal'); await p.type('#pEmail', 'igor@teste.com'); await p.type('#pCrefAcc', '012345-G/MS');
    await p.type('#pw1', 'senha1234'); await p.type('#pw2', 'senha1234'); await p.click('label[data-plan="basico"]');
    ok(/2 dias grátis/.test(await p.$eval('body', e => e.innerText)), 'o cadastro avisa que o teste grátis dura 2 dias');
    await p.screenshot({ path: SHOTS + '/02-cadastro-personal.png', fullPage: true });
    await Promise.all([p.waitForNavigation(), p.click('#pwGo')]);
    await p.waitForSelector('#planBox'); const tb = await p.$eval('#planBox', e => e.innerText);
    ok(/TESTE GRÁTIS – 2 dia/.test(tb) && /Básico/.test(tb), 'novo personal ganha 2 dias grátis no plano escolhido (Básico)');
    const trialCards = await p.evaluate(async () => { const r = await fetch('/api/cards'); const j = await r.json(); const img = await fetch('/api/cards/1/img'); const ej = await img.json().catch(() => ({})); const c = j.cards && j.cards[0]; return { st: r.status, plan: j.plan, trial: j.trial, paid: j.paid, n: j.cards.length, locked: j.cards.filter(x => x.locked).length, okf: !!(c && c.titulo && c.regiao && c.plano && 'locked' in c), img: img.status, err: ej.error || '' }; });
    ok(trialCards.st === 200 && trialCards.trial && trialCards.paid === false && trialCards.plan === 'basico' && trialCards.n === 100 && trialCards.locked === 100 && trialCards.okf && trialCards.img === 403 && /assinatura/.test(trialCards.err), 'no teste grátis todos os cards ficam bloqueados até a assinatura');
    await p.waitForSelector('#cardStudySec');
    const abaixoTrial = await p.evaluate(() => { const a = document.querySelector('#stuDet').getBoundingClientRect(), b = document.querySelector('#cardStudySec').getBoundingClientRect(); return b.top > a.top && /Cards de memorização para estudo/.test(document.querySelector('#cardStudySec').innerText); });
    ok(abaixoTrial, 'seção de cards fica abaixo da lista de alunos');
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
    await a.type('#lgNome', 'Pamela'); await a.type('#lgUser', 'pamela'); await a.type('#lgPw', 'aluna123'); await a.type('#lgPw2', 'aluna123');
    await a.screenshot({ path: SHOTS + '/05-cadastro-aluno-convite.png' });
    await Promise.all([a.waitForNavigation(), a.click('#lgGo')]);
    await a.waitForSelector('#t-aluno:not(.hide)');
    ok(!(await a.$('#autoL')), 'não existe mais a opção de ouvir automaticamente');
    await a.waitForFunction(() => /Olá, Pamela/.test(document.querySelector('#chat').textContent), { timeout: 15000 }); ok(true, 'coach cumprimenta "Olá, Pamela" sem perguntar o nome');
    await a.waitForFunction(() => (window.__played || []).some(s => /Quantos anos você tem/.test(s.text)), { timeout: 8000 });
    ok(await a.evaluate(() => !(window.__spoken || []).some(s => /Quantos anos você tem/.test(s.text))), 'depois do login a primeira pergunta toca em mp3, sem a voz do navegador');
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
    ok((await a.evaluate(async () => (await fetch('/api/cards')).status)) === 403 && (await a.evaluate(async () => (await fetch('/api/cards/1/img')).status)) === 403, 'aluno não lista nem baixa os cards');
    const answers = ['19 anos', 'ganho de massa muscular', 'glúteos', 'errei, a prioridade é o peito', 'em 3 meses', 'treino há 1 ano', '2 dias', 'errei, posso treinar quatro vezes por semana', '1 hora', 'não', 'não tenho'];
    for (const t of answers) { const n = await a.$$eval('#chat .msg', x => x.length); await a.type('#txt', t); await a.keyboard.press('Enter');
      await a.waitForFunction(n => document.querySelectorAll('#chat .msg').length > n + 1 || !document.querySelector('#anamCard') || document.querySelector('#anamCard').classList.contains('hide'), { timeout: 15000 }, n); await sleep(300); }
    const chatObj = await a.$eval('#chat', e => e.textContent);
    const spokenAll = await a.evaluate(() => (window.__played || []).map(s => s.text).concat((window.__spoken || []).map(s => s.text)).join('\n'));
    ok(/Quantos anos você tem/.test(spokenAll) && /Qual o seu principal objetivo/.test(spokenAll) && /Hipertrofia/.test(spokenAll) && /Emagrecimento/.test(spokenAll) && /Saúde e qualidade de vida/.test(spokenAll) && !/Parte 2/i.test(spokenAll) && !/OBJETIVOS E EXPECTATIVAS/.test(spokenAll) && !/Quais resultados você deseja alcançar/.test(spokenAll) && /priorizar/.test(spokenAll) && /Em quanto tempo você espera perceber resultados/.test(spokenAll) && /Você já treina/.test(spokenAll) && /Quantos dias por semana/.test(spokenAll) && /Quanto tempo você tem por treino/.test(spokenAll) && /dor ou tem alguma lesão/.test(spokenAll) && /Você tem alguma orientação médica/.test(spokenAll) && !/Qual orientação/.test(spokenAll) && !/\bQual\?/.test(spokenAll) && !/Como vamos saber que você está progredindo/.test(spokenAll), 'cada pergunta da anamnese sai em áudio, inclusive a orientação, sem o "qual" depois do não');
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
    await a.screenshot({ path: SHOTS + '/07-aluno-aguardando.png' });
    // aluno não pode se autoaprovar via API
    const self = await a.evaluate(async () => { const F = JSON.parse(localStorage.getItem('coachvoz_v1_pamela')); F.status = 'aprovado'; F.aprov = { nome: 'hacker' };
      await fetch('/api/ficha/pamela', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(F) }); return (await (await fetch('/api/me')).json()).ficha.status; });
    ok(self !== 'aprovado', 'servidor bloqueia autoaprovação do aluno');
    // ---- personal aprova
    await p.reload({ waitUntil: 'networkidle0' }); await p.waitForSelector('.stu'); await p.click('.stu[data-u="pamela"]'); await sleep(500);
    const ficha = await p.evaluate(() => ({ txt: document.querySelector('#persCard').textContent + document.querySelector('#repCard').textContent, a: S.a, blocos: S.plan.treinos[0].blocos.map(b => ({ g: b.g, n: b.ex.length, s: b.ex[0].s })), exp: dayExp(S.plan.treinos[0]) }));
    ok(/2\. OBJETIVOS E EXPECTATIVAS/.test(ficha.txt) && /Ganho de massa muscular/.test(ficha.txt) && !/Resultados que deseja alcançar/.test(ficha.txt) && !ficha.a.resultados && /peito/i.test(ficha.txt) && /3 meses/.test(ficha.txt) && /Como vamos medir o progresso/.test(ficha.txt) && /realista/.test(ficha.txt) && ficha.a.med === 'não tenho' && /Orientação médica/.test(ficha.txt) && /não tenho/.test(ficha.txt), 'ficha mostra objetivo, prioridade, prazo e a orientação médica');
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
    ok(wa.startsWith('https://wa.me/5511987654321?text=') && decodeURIComponent(wa.split('text=')[1]).startsWith('Olá, sou Pamela do Shape de Qualidade'), 'Falar com o personal abre o WhatsApp com o nome do aluno');
    ok(!!(await a.$('#adjCard .waPers')), 'botão fica perto do ajuste do dia');

    // ---- divisão da semana (personal) + troca só de hoje
    const MON = new Date(2026, 9, 12, 15, 0, 0).getTime();
    p.on('dialog', d => d.accept()); a.on('dialog', d => d.accept());
    await p.evaluate(t => { window.__fakeNow = t; render(); }, MON);
    await p.waitForSelector('#splitEdit');
    ok(/Usar sugestão automática/.test(await p.$eval('#splitBox', e => e.innerText)) && /Personalizar dias/.test(await p.$eval('#splitEdit', e => e.innerText)), 'divisão padrão é a sugestão automática');
    await p.click('#splitEdit');
    await p.waitForSelector('.splitDay[data-w="1"] .splitG');
    await p.evaluate(() => {
      const row = document.querySelector('.splitDay[data-w="1"]');
      row.querySelector('.splitLabel').value = 'Core de segunda';
      row.querySelectorAll('.splitG').forEach(i => { i.checked = i.value === 'abdomen'; });
      row.querySelector('.splitG').dispatchEvent(new Event('change', { bubbles: true }));
    });
    await p.waitForFunction(() => /Core de segunda/.test(document.querySelector('#persCard').innerText) && /Prancha abdominal/.test(document.querySelector('#persCard').innerText));
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
    const planOf = async () => p.evaluate(async () => { const me = await (await fetch('/api/me')).json(); return (me.students.find(s => s.u === 'pamela') || {}).ficha.plan; });
    let saved = null; for (let i = 0; i < 25 && !(saved && saved.split && saved.split.days.some(d => d.label === 'Core de segunda' && d.gs.includes('abdomen') && saved.treinos.some(t => t.nome === 'Core de segunda' && t.blocos.some(b => b.ex.some(e => e.s === 6))))); i++) { await sleep(200); saved = await planOf(); }
    ok(!!saved && saved.split.custom && saved.split.days.some(d => d.w === 6 && d.gs.includes('cardio')) && !saved.split.days.some(d => d.w === 4), 'divisão personalizada grava dias, grupos e séries no aluno');
    const see = async () => { await a.reload({ waitUntil: 'networkidle0' }); await a.waitForFunction(() => typeof S !== 'undefined' && S && S.plan && S.status === 'aprovado'); await a.evaluate(t => { window.__fakeNow = t; render(); }, MON); await a.waitForSelector('#statusCard'); };
    await see();
    ok(/Core de segunda/.test(await a.$eval('#statusCard', e => e.innerText)) && /Core de segunda/.test(await a.$eval('#hdrDia', e => e.textContent)) && /6 série/.test(await a.$eval('#statusCard', e => e.innerText)) && !/Cardio de sábado/.test(await a.$eval('#statusCard', e => e.innerText)), 'aba Dia do aluno mostra o treino personalizado de hoje');
    await a.click('.detBtn'); await a.waitForSelector('#detDrawer.open');
    ok(/Como fazer/.test(await a.$eval('#detDrawer', e => e.innerText)), 'Detalhes abre no exercício do dia personalizado');
    await a.evaluate(() => document.querySelector('#detOv').click());
    const hack = await a.evaluate(async () => { const F = await (await fetch('/api/me')).json(); F.ficha.plan.split = { custom: true, days: [{ w: 1, label: 'HACK', gs: ['peito'] }] }; F.ficha.plan.treinos[0].nome = 'HACK'; await fetch('/api/ficha/pamela', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(F.ficha) }); return (await (await fetch('/api/me')).json()).ficha.plan.treinos[0].nome; });
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

    // ---- limite de 15 alunos no Básico
    const signup = async (i) => { const c = await browser.createBrowserContext(), pg = await c.newPage(); await pg.goto(URL + '/convite/' + code, { waitUntil: 'networkidle0' });
      await pg.waitForSelector('#lgUser');
      const r = await pg.evaluate(async (code, i) => { const r = await fetch('/api/student/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuario: 'aluno' + i, nome: 'Aluno ' + i, senha: 'aluno123', convite: code }) }); return { st: r.status, j: await r.json() }; }, code, i);
      await c.close(); return r; };
    for (let i = 2; i <= 15; i++) { const r = await signup(i); if (r.st !== 200) throw new Error('cadastro ' + i + ': ' + r.j.error); }
    const r16 = await signup(16); ok(r16.st === 403 && /limite de 15 alunos do plano Básico.*upgrade/.test(r16.j.error), 'Básico trava no 15º aluno com aviso de upgrade');
    await p.reload({ waitUntil: 'networkidle0' }); await p.waitForSelector('#planBox');
    ok(/15 \/ 15/.test(await p.$eval('#planBox', e => e.innerText)) && /Limite atingido/.test(await p.$eval('#planBox', e => e.innerText)), 'painel mostra 15/15 e pede upgrade');
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
    const ug = await p.evaluate(async () => (await fetch('/api/billing/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plano: 'ilimitado' }) })).json());
    ok(ug.needCheckout === true, 'upgrade de plano pago exige pagar o novo plano');
    // isolamento entre personais
    const ctxX = await browser.createBrowserContext(), x = await ctxX.newPage();
    await x.goto(URL, { waitUntil: 'networkidle0' });
    const iso = await x.evaluate(async () => { await fetch('/api/personal/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome: 'Outro', email: 'outro@t.com', senha: 'senha1234' }) });
      await fetch('/api/billing/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ method: 'demo' }) });
      const me = await (await fetch('/api/me')).json(); const put = await fetch('/api/ficha/pamela', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      return { n: me.students.length, put: put.status }; });
    ok(iso.n === 0 && iso.put === 403, 'outro personal não vê nem altera alunos alheios');
    await p.screenshot({ path: SHOTS + '/04-painel-personal-convite.png' });

    // ---- senhas
    const post = (pg, u, b) => pg.evaluate(async (u, b) => { const r = await fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }); return { st: r.status, j: await r.json() }; }, u, b);
    ok((await post(p, '/api/personal/password', { atual: 'errada', nova: 'nova12345' })).st === 401, 'trocar senha exige a senha atual');
    ok((await post(p, '/api/personal/password', { atual: 'senha1234', nova: 'nova12345' })).st === 200, 'personal troca a própria senha');
    ok((await post(p, '/api/personal/student-password', { usuario: 'pamela', nova: 'pam456' })).st === 200, 'personal define nova senha do aluno');
    const an = await (await browser.createBrowserContext()).newPage();
    await an.goto(URL, { waitUntil: 'networkidle0' });
    ok((await post(an, '/api/student/login', { usuario: 'pamela', senha: 'aluna123' })).st === 401 && (await post(an, '/api/student/login', { usuario: 'pamela', senha: 'pam456' })).st === 200, 'aluno entra com a senha nova (a antiga deixa de valer)');
    await an.goto(URL, { waitUntil: 'networkidle0' }); await an.waitForSelector('#voiceGo');
    ok(/Toque aqui para conversar por voz/.test(await an.$eval('#voiceGo', e => e.innerText)), 'aluno vê o botão para iniciar a conversa por voz');
    await an.$eval('#voiceGo', e => e.click()); await sleep(300); ok(!(await an.$('#voiceGo')), 'toque inicia a voz (botão some)');
    ok(await an.evaluate(() => !$('#mic').classList.contains('live') && listening === false), 'destravar a voz do coach não liga o microfone');
    const fg = await (await browser.createBrowserContext()).newPage(); await fg.goto(URL + '/?area=personal', { waitUntil: 'networkidle0' });
    await fg.waitForSelector('#pForgot'); await fg.$eval('#pForgot', e => e.click()); await fg.type('#fgEmail', 'igor@teste.com'); await fg.$eval('#fgGo', e => e.click()); await fg.waitForSelector('#fgMsg .alert');
    ok(/link/.test(await fg.$eval('#fgMsg', e => e.innerText)), 'personal pede nova senha em "Esqueci a senha"');
    // voz do coach bloqueada pelo navegador -> botão "Tocar para ouvir"
    await an.evaluate(() => { window.speechSynthesis.cancel(); const o = speechSynthesis.speak; window.__orig = o; speechSynthesis.speak = () => {}; $("#tts").checked = true; speak("Teste de voz"); });
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
    async function contaCards(email, plano) {
      const ctx = await browser.createBrowserContext(), pg = await ctx.newPage(); await pg.setViewport(phone);
      await pg.goto(URL, { waitUntil: 'networkidle0' });
      const api = await pg.evaluate(async (email, plano) => {
        const s = await fetch('/api/personal/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome: 'Cards ' + plano, email, senha: 'senha1234', plano }) });
        const list = await fetch('/api/cards'); const j = await list.json();
        const img = async id => { const r = await fetch('/api/cards/' + id + '/img'); return { st: r.status, cache: r.headers.get('cache-control') || '', type: r.headers.get('content-type') || '' }; };
        return { signup: s.status, plan: j.plan, trial: j.trial, paid: j.paid, open: j.cards.filter(c => !c.locked).length, shut: j.cards.filter(c => c.locked).length, i1: await img(1), i51: await img(51), i100: await img(100) };
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
    const iliId = (await sql.prepare("SELECT id FROM personals WHERE email='cards-ili@teste.com'").get()).id;
    await sql.prepare('INSERT INTO payments(personal_id,provider,external_id,amount_cents,status,test,created_at,plan) VALUES(?,?,?,?,?,?,?,?)').run(iliId, 'mercadopago', 'live_ili_ainda_trial', 7990, 'approved', 0, Date.now(), 'ilimitado');
    const aindaTrial = await iliC.pg.evaluate(async () => { const j = await (await fetch('/api/cards')).json(); return { trial: j.trial, paid: j.paid, open: j.cards.filter(c => !c.locked).length }; });
    ok(aindaTrial.trial && aindaTrial.paid === false && aindaTrial.open === 0, 'pagamento confirmado não abre card enquanto o teste grátis segue valendo');
    await sql.prepare("UPDATE subscriptions SET status='active', provider='mercadopago', amount_cents=7990, current_period_end=? WHERE personal_id=?").run(Date.now() + 30 * 864e5, iliId);
    const iliPago = await iliC.pg.evaluate(async () => { const j = await (await fetch('/api/cards')).json(); const i1 = await fetch('/api/cards/1/img'); const i100 = await fetch('/api/cards/100/img'); return { paid: j.paid, open: j.cards.filter(c => !c.locked).length, shut: j.cards.filter(c => c.locked).length, i1: i1.status, i100: i100.status }; });
    ok(iliPago.paid && iliPago.open === 100 && iliPago.shut === 0 && iliPago.i1 === 200 && iliPago.i100 === 200, 'Ilimitado com pagamento confirmado libera os 100 cards');
    const basC = await contaCards('cards-basico@teste.com', 'basico');
    await marcarPago('cards-basico@teste.com', 'basico');
    const basPago = await basC.pg.evaluate(async () => { const j = await (await fetch('/api/cards')).json(); const img = await fetch('/api/cards/1/img'); const ej = await img.json().catch(() => ({})); return { paid: j.paid, open: j.cards.filter(c => !c.locked).length, img: img.status, err: ej.error || '' }; });
    ok(basPago.paid && basPago.open === 0 && basPago.img === 403 && /Básico/.test(basPago.err) && /upgrade/i.test(basPago.err), 'Básico pago continua sem cards e pede upgrade');
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
    const capa = await pub.evaluate(() => ({ t: document.body.innerText, foto: !!document.querySelector('img.foto'), quero: !!document.querySelector('#quero') }));
    ok(/Lia Personal/.test(capa.t) && /Treino de força/.test(capa.t) && /150/.test(capa.t) && capa.quero && capa.foto, 'quem abre o link vê nome, bio, foto, preço e Quero ser aluno');
    await pub.click('#quero');
    await pub.waitForSelector('#form:not(.hide)');
    await pub.type('#nome', 'Caio Aluno'); await pub.type('#user', 'caio'); await pub.type('#pw', 'aluno123'); await pub.type('#pw2', 'aluno123');
    await Promise.all([pub.waitForNavigation({ waitUntil: 'networkidle0' }), pub.click('#form button[type=submit]')]);
    await pub.waitForSelector('#feeJa');
    const pixAntes = await pub.evaluate(() => ({ anam: document.querySelector('#anamCard').classList.contains('hide'), wa: document.querySelector('#waTop').innerText, card: document.querySelector('#feeCard').innerText, payload: document.querySelector('#feePayload').value, qr: !!document.querySelector('#feeCard img') }));
    ok(pixAntes.anam && /Falar com o personal/.test(pixAntes.wa) && /Já paguei/.test(pixAntes.card) && /150/.test(pixAntes.card) && pixAntes.qr && pixAntes.payload.includes('150.00') && pixAntes.payload.slice(-4) === pix.crc16(pixAntes.payload.slice(0, -4)), 'depois do cadastro o aluno vê o Pix, o QR e o WhatsApp, e a anamnese espera o Já paguei');
    ok((await pub.evaluate(async () => (await fetch('/api/personal/pix', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status)) === 401, 'aluno não grava a chave Pix do personal');
    await Promise.all([pub.waitForNavigation({ waitUntil: 'networkidle0' }), pub.click('#feeJa')]);
    await pub.waitForSelector('#anamCard:not(.hide)');
    await pub.waitForFunction(() => /Olá, Caio/.test((document.querySelector('#chat') || {}).textContent || '') && /Pagamento informado/.test((document.querySelector('#feeCard') || {}).innerText || '') && !document.querySelector('#feeJa'), { timeout: 15000 });
    const pixDepois = await pub.evaluate(() => ({ card: document.querySelector('#feeCard').innerText, ja: !!document.querySelector('#feeJa'), wa: !!document.querySelector('#waTop .waPers'), treino: document.querySelector('#statusCard').classList.contains('hide') }));
    ok(/Pagamento informado/.test(pixDepois.card) && !pixDepois.ja && pixDepois.wa && pixDepois.treino, 'Já paguei libera a anamnese, mantém o WhatsApp e não mostra treino');
    await f.reload({ waitUntil: 'networkidle0' });
    await f.waitForSelector('.stu[data-u="caio"]');
    const linha = await f.$eval('.stu[data-u="caio"]', e => ({ t: e.innerText, soon: !!e.querySelector('.feeDot.soon'), ok: !!e.querySelector('.feeDot.ok') }));
    ok(/Pendente de aprovação/.test(linha.t) && /Pagamento informado/.test(linha.t) && linha.soon && !linha.ok && /pago/.test(await f.$eval('#feeLegend', e => e.innerText)), 'o aluno do link entra pendente de aprovação, amarelo, com pagamento informado');
    await f.click('.stu[data-u="caio"]');
    await f.waitForSelector('#feeOk');
    ok(/Confirmar recebimento/.test(await f.$eval('#feeEdit', e => e.innerText)) && !(await f.$('#aprovar')), 'a ficha confirma o Pix e ainda não tem treino para aprovar');
    await f.click('#feeOk');
    await f.waitForFunction(() => /Pago/.test((document.querySelector('#feeEditBody') || {}).innerText || '') && document.querySelector('#feeHist'));
    const pago = await f.evaluate(() => ({ t: document.querySelector('.stu[data-u="caio"]').innerText, dot: !!document.querySelector('.stu[data-u="caio"] .feeDot.ok'), hist: document.querySelector('#feeHist').innerText }));
    ok(/Pago/.test(pago.t) === false && !/Pagamento informado/.test(pago.t) && pago.dot && /150/.test(pago.hist), 'confirmar recebimento pinta de verde e guarda o histórico');
    const avancou = await f.evaluate(async () => (await (await fetch('/api/personal/tuition/caio')).json()).fee);
    const esperado = pix.addMonth(pix.cycle({ amount_cents: 15000, due_day: dueDay, paid_through: null }).due, dueDay);
    ok(avancou.tone === 'ok' && avancou.paid_through && avancou.due === esperado, 'confirmar avança o vencimento um mês');
    await f.click('#feeUndo');
    await f.waitForFunction(() => /Pagamento informado/.test((document.querySelector('#feeEditBody') || {}).innerText || '') && /desfeito/.test((document.querySelector('#feeHist') || {}).innerText || ''));
    ok(!!(await f.$('.stu[data-u="caio"] .feeDot.soon')), 'desfazer devolve o aviso de pagamento e a cor amarela');
    const davi = await fetch(URL + '/api/student/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuario: 'davi', nome: 'Davi Direto', senha: 'aluno123', convite: codeLia }) });
    const daviJ = await davi.json();
    ok(davi.status === 200 && daviJ.pix === false, 'convite direto não manda o aluno para o Pix antes da anamnese');
    let atrasado = null;
    for (let n = 2; n <= 8 && !atrasado; n++) {
      const dt = new Date(); dt.setMonth(dt.getMonth() - n); dt.setDate(Math.min(dueDay, new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate()));
      const iso = pix.iso(dt);
      if (pix.cycle({ amount_cents: 15000, due_day: dueDay, paid_through: iso }).tone === 'bad') atrasado = iso;
    }
    ok(!!atrasado, 'há um ciclo vencido para testar o vermelho');
    const daviId = (await sql.prepare("SELECT id FROM students WHERE username='davi'").get()).id;
    await sql.prepare('INSERT INTO tuition(student_id,paid_through,exempt) VALUES(?,?,0)').run(daviId, atrasado);
    await f.reload({ waitUntil: 'networkidle0' });
    await f.waitForSelector('.stu[data-u="davi"]');
    const direto = await f.$eval('.stu[data-u="davi"]', e => ({ t: e.innerText, bad: !!e.querySelector('.feeDot.bad') }));
    ok(/Sem treino/.test(direto.t) && !/Pendente de aprovação/.test(direto.t) && direto.bad, 'aluno do convite direto continua Sem treino e fica vermelho se a mensalidade venceu');
    await f.click('.stu[data-u="davi"]');
    await f.waitForSelector('#feeEditBody');
    await f.waitForFunction(() => !/Carregando/.test((document.querySelector('#feeEditBody') || {}).innerText || ''));
    ok(!(await f.$('#feeNo')) && /Marcar como pago/.test(await f.$eval('#feeEdit', e => e.innerText)), 'convite direto não tem Recusar; o personal marca como pago se quiser');
    const recusaDireto = await f.evaluate(async () => { const r = await fetch('/api/personal/tuition/davi/gate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'recusar' }) }); return { st: r.status, j: await r.json() }; });
    ok(recusaDireto.st === 400 && /ficha/.test(recusaDireto.j.error), 'recusar o convite direto é barrado');
    const ctxD = await browser.createBrowserContext(), dv = await ctxD.newPage(); await dv.setViewport(phone);
    await dv.goto(URL, { waitUntil: 'networkidle0' });
    await dv.evaluate(async () => { const r = await fetch('/api/student/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuario: 'davi', senha: 'aluno123' }) }); if (!r.ok) throw new Error(await r.text()); });
    await dv.goto(URL, { waitUntil: 'networkidle0' });
    await dv.waitForSelector('#anamCard:not(.hide)');
    ok(await dv.$('#waTop .waPers') && !(await dv.$('#feeHold')), 'aluno do convite direto cai na anamnese e já pode falar com o personal');
    await f.evaluate(() => openStu('caio'));
    await f.waitForSelector('#feeNo');
    await f.evaluate(() => document.querySelector('#feeNo').click());
    await f.waitForFunction(() => /Recusado/.test((document.querySelector('.stu[data-u="caio"]') || {}).textContent || ''));
    await pub.reload({ waitUntil: 'networkidle0' });
    await pub.waitForSelector('#feeHold');
    const recusado = await pub.evaluate(() => ({ anam: document.querySelector('#anamCard').classList.contains('hide'), hold: document.querySelector('#feeHold').innerText, wa: document.querySelector('#waTop').innerText, treino: document.querySelector('#statusCard').classList.contains('hide') }));
    ok(recusado.anam && /Aguardando o personal/.test(recusado.hold) && /Falar com o personal/.test(recusado.wa) && recusado.treino, 'aluno recusado não vê treino e continua com o WhatsApp');
    const planos = await sql.prepare("SELECT value FROM settings WHERE key='plans'").get();
    const pj = JSON.parse(planos.value); const limiteAntes = pj.pro.limit; pj.pro.limit = 2;
    await sql.prepare('UPDATE settings SET value=? WHERE key=?').run(JSON.stringify(pj), 'plans');
    const htmlCheio = await (await fetch(URL + '/p/' + codeLia)).text();
    ok(/limite/.test(htmlCheio) && !/Quero ser aluno/.test(htmlCheio), 'no ar, o link público respeita o limite de alunos');
    const extra = await fetch(URL + '/api/student/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuario: 'extra1', nome: 'Extra Um', senha: 'aluno123', convite: codeLia, origem: 'publico' }) });
    const extraJ = await extra.json();
    ok(extra.status === 403 && /limite/.test(extraJ.error), 'cadastro pelo link público também trava no limite do plano');
    pj.pro.limit = limiteAntes;
    await sql.prepare('UPDATE settings SET value=? WHERE key=?').run(JSON.stringify(pj), 'plans');
    const liaId = (await sql.prepare("SELECT id FROM personals WHERE email='lia@teste.com'").get()).id;
    await sql.prepare('UPDATE subscriptions SET current_period_end=? WHERE personal_id=?').run(Date.now() - 1000, liaId);
    const htmlParado = await (await fetch(URL + '/p/' + codeLia)).text();
    ok(/inativa/.test(htmlParado) && !/Quero ser aluno/.test(htmlParado), 'link público avisa quando a assinatura do personal está inativa');

    console.log('\nTODOS OS TESTES PASSARAM');
  } catch (e) { console.error(e); process.exitCode = 1; } finally { await browser.close(); srv.kill(); }
})();
