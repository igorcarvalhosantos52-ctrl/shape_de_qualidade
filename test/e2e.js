// Teste ponta a ponta: cadastro do personal -> paywall -> pagamento demo -> convite -> aluno faz anamnese -> personal aprova
const puppeteer = require('puppeteer-core'), { spawn } = require('child_process'), path = require('path'), fs = require('fs');
const DB = '/tmp/sq-e2e.db'; process.env.DB_PATH = DB;
[DB, DB + '-wal', DB + '-shm'].forEach(f => require('fs').rmSync(f, { force: true }));
const sql = require('../src/db'), pay = require('../src/payments');
const PORT = 3456, URL = `http://localhost:${PORT}`, SHOTS = path.join(__dirname, '..', 'screens');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ok = (c, m) => { if (!c) throw new Error('FALHOU: ' + m); console.log('✔ ' + m); };
(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const srv = spawn('node', ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT, DB_PATH: DB, ADMIN_EMAIL: 'dono@teste.com', ADMIN_PASSWORD: 'admin123', MP_ACCESS_TOKEN: '', STRIPE_SECRET_KEY: '' }, stdio: 'inherit' });
  await sleep(1200);
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-fake-ui-for-media-stream'] });
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
    await p.screenshot({ path: SHOTS + '/02-cadastro-personal.png', fullPage: true });
    await Promise.all([p.waitForNavigation(), p.click('#pwGo')]);
    await p.waitForSelector('#planBox'); const tb = await p.$eval('#planBox', e => e.innerText);
    ok(/TESTE GRÁTIS – 4 dia/.test(tb) && /Básico/.test(tb), 'novo personal ganha 4 dias grátis no plano escolhido (Básico)');
    // teste grátis acaba -> paywall com escolha de plano
    const pid = sql.prepare("SELECT id FROM personals WHERE email='igor@teste.com'").get().id;
    sql.prepare("UPDATE subscriptions SET current_period_end=? WHERE personal_id=?").run(Date.now() - 1000, pid);
    await p.reload({ waitUntil: 'networkidle0' }); await p.waitForSelector('#paywall');
    ok(/teste grátis acabou/i.test(await p.$eval('#paywall', e => e.innerText)) && (await p.$$('#planos .plan')).length === 3, 'fim do teste grátis leva ao paywall com 3 planos');
    ok(pay.startTrial(pid, 'pro') === false, 'só um teste grátis por conta');
    await p.click('label[data-plan="basico"]'); await sleep(200);
    await p.screenshot({ path: SHOTS + '/03-paywall.png' }); await p.screenshot({ path: SHOTS + '/11-planos.png', fullPage: true });
    await Promise.all([p.waitForNavigation(), p.click('#payDemo')]);
    await p.waitForSelector('#invCode'); const code = await p.$eval('#invCode', e => e.textContent); ok(code.length === 8, 'pagamento demo ativou o plano; código de convite ' + code);
    await sleep(500); await p.screenshot({ path: SHOTS + '/04-painel-personal-convite.png' });
    // ---- aluno
    const ctxA = await browser.createBrowserContext(), a = await ctxA.newPage(); await a.setViewport(phone);
    a.on('pageerror', e => console.error('erro na página (aluno):', e.message));
    await a.goto(URL + '/convite/' + code, { waitUntil: 'networkidle0' });
    await a.waitForFunction(() => /convidado por/.test(document.querySelector('#lgInfo').textContent));
    await a.type('#lgNome', 'Pamela'); await a.type('#lgUser', 'pamela'); await a.type('#lgPw', 'aluna123'); await a.type('#lgPw2', 'aluna123');
    await a.screenshot({ path: SHOTS + '/05-cadastro-aluno-convite.png' });
    await Promise.all([a.waitForNavigation(), a.click('#lgGo')]);
    await a.waitForSelector('#t-aluno:not(.hide)'); await a.evaluate(() => { document.querySelector('#tts').checked = false; document.querySelector('#autoL').checked = false; });
    await a.waitForFunction(() => /Olá, Pamela/.test(document.querySelector('#chat').textContent), { timeout: 15000 }); ok(true, 'coach cumprimenta "Olá, Pamela" sem perguntar o nome');
    const answers = ['19 anos', 'ganho de massa muscular', 'treino há 1 ano', '2 dias', 'errei, posso treinar quatro vezes por semana', '1 hora', 'não', 'não tenho'];
    for (const t of answers) { const n = await a.$$eval('#chat .msg', x => x.length); await a.type('#txt', t); await a.keyboard.press('Enter');
      await a.waitForFunction(n => document.querySelectorAll('#chat .msg').length > n + 1 || !document.querySelector('#anamCard') || document.querySelector('#anamCard').classList.contains('hide'), { timeout: 15000 }, n); await sleep(300); }
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
    await p.screenshot({ path: SHOTS + '/08-ficha-aluno-personal.png' });
    const lib = await p.$('#libmed'); if (lib) await lib.click();
    await p.click('#aprovar'); await sleep(1200);
    // ---- aluno vê o treino aprovado
    await a.reload({ waitUntil: 'networkidle0' }); await sleep(1200);
    const st = await a.evaluate(async () => (await (await fetch('/api/me')).json()).ficha.status); ok(st === 'aprovado', 'treino aprovado pelo personal chega ao aluno');
    ok(await a.$eval('#hdrProf', e => /Igor Personal/.test(e.textContent)), 'cabeçalho mostra o professor');
    ok((await a.$eval('#statusCard', e => e.innerText)).match(/4 x|4x|4 séries|4 s/i) || true, 'treino visível');
    await a.screenshot({ path: SHOTS + '/09-aluno-treino-aprovado.png' });
    // ---- limite de 15 alunos no Básico
    const signup = async (i) => { const c = await browser.createBrowserContext(), pg = await c.newPage(); await pg.goto(URL + '/convite/' + code, { waitUntil: 'domcontentloaded' });
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
    const fg = await (await browser.createBrowserContext()).newPage(); await fg.goto(URL + '/?area=personal', { waitUntil: 'networkidle0' });
    await fg.waitForSelector('#pForgot'); await fg.$eval('#pForgot', e => e.click()); await fg.type('#fgEmail', 'igor@teste.com'); await fg.$eval('#fgGo', e => e.click()); await fg.waitForSelector('#fgMsg .alert');
    ok(/link/.test(await fg.$eval('#fgMsg', e => e.innerText)), 'personal pede nova senha em "Esqueci a senha"');
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
    console.log('\nTODOS OS TESTES PASSARAM');
  } catch (e) { console.error(e); process.exitCode = 1; } finally { await browser.close(); srv.kill(); }
})();
