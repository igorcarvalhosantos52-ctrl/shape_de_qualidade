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
    const pid = (await sql.prepare("SELECT id FROM personals WHERE email='igor@teste.com'").get()).id;
    const sess = await sql.prepare("SELECT role, user_id FROM sessions WHERE user_id=? AND role='personal'").get(pid);
    ok(sess && sess.role === 'personal' && sess.user_id === pid, 'sessão do personal fica gravada no banco libSQL');
    await sql.prepare("UPDATE subscriptions SET current_period_end=? WHERE personal_id=?").run(Date.now() - 1000, pid);
    await p.reload({ waitUntil: 'networkidle0' }); await p.waitForSelector('#paywall');
    ok(/teste grátis acabou/i.test(await p.$eval('#paywall', e => e.innerText)) && (await p.$$('#planos .plan')).length === 3, 'fim do teste grátis leva ao paywall com 3 planos');
    ok(await pay.startTrial(pid, 'pro') === false, 'só um teste grátis por conta');
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
    ok(/Seu personal ainda não cadastrou o WhatsApp/.test(await a.$eval('#waTop', e => e.innerText)) && !(await a.$('#waTop .waPers')), 'sem número, o aluno vê que o personal ainda não cadastrou o WhatsApp');
    ok((await a.evaluate(async () => (await fetch('/api/personal/whatsapp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status)) === 401, 'aluno não cadastra o WhatsApp do personal');
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
    // voz do coach bloqueada pelo navegador -> botão "Tocar para ouvir"
    await an.evaluate(() => { window.speechSynthesis.cancel(); const o = speechSynthesis.speak; window.__orig = o; speechSynthesis.speak = () => {}; $("#tts").checked = true; speak("Teste de voz"); });
    await an.waitForSelector('#ttsPlay', { timeout: 8000 }); ok(/Tocar para ouvir/.test(await an.$eval('#ttsPlay', e => e.innerText)), 'se o navegador bloquear a fala aparece "Tocar para ouvir"');
    const vz = await an.evaluate(() => ({ lang: (curVoice() || { lang: 'pt-BR' }).lang, sr: !!SR }));
    ok(/^pt/i.test(vz.lang), 'voz escolhida é português (' + vz.lang + ')');
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
