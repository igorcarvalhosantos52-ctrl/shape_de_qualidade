// Módulo de pagamentos plugável: demo | mercadopago | stripe
const crypto = require('crypto');
const db = require('./db');
const DAY = 864e5;
const envC = (k, d) => process.env[k] ? Math.round(parseFloat(process.env[k]) * 100) : d;
const envL = (k, d) => process.env[k] !== undefined ? (+process.env[k] || null) : d;
const DEFAULT_PLANS = () => ({
  basico: { nome: 'Básico', price_cents: envC('PLAN_BASICO_PRICE', 2990), limit: envL('PLAN_BASICO_LIMIT', 15) },
  pro: { nome: 'Pro', price_cents: envC('PLAN_PRO_PRICE', 4990), limit: envL('PLAN_PRO_LIMIT', 30) },
  ilimitado: { nome: 'Ilimitado', price_cents: envC('PLAN_ILIMITADO_PRICE', 7990), limit: envL('PLAN_ILIMITADO_LIMIT', null) },
});
const TRIAL_DAYS = +(process.env.TRIAL_DAYS || 4);
async function plans() {
  const s = await db.prepare("SELECT value FROM settings WHERE key='plans'").get(), d = DEFAULT_PLANS();
  if (s) { const o = JSON.parse(s.value); for (const k in d) Object.assign(d[k], o[k] || {}); }
  return d;
}
async function setPlans(o) {
  const cur = await plans();
  for (const k in cur) if (o[k]) { const c = Math.round(parseFloat(String(o[k].price).replace(',', '.')) * 100), l = o[k].limit === '' || o[k].limit === null ? null : parseInt(o[k].limit);
    if (!(c >= 100) || (l !== null && !(l >= 1))) throw new Error('Preço ou limite inválido em ' + cur[k].nome); cur[k].price_cents = c; cur[k].limit = l; }
  await db.prepare("INSERT INTO settings VALUES('plans',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(cur)); return cur;
}
const planOf = async k => { const P = await plans(); if (!P[k]) throw new Error('Plano inválido'); return P[k]; };
const priceCents = async k => (await planOf(k || 'pro')).price_cents;
async function startTrial(personalId, plan) {
  const p = await db.prepare('SELECT trial_used FROM personals WHERE id=?').get(personalId);
  if (!p || p.trial_used) return false;
  await db.prepare('UPDATE personals SET trial_used=1, plan=? WHERE id=?').run(plan, personalId);
  await db.prepare('INSERT INTO subscriptions(personal_id,provider,external_id,status,amount_cents,current_period_end,created_at,updated_at,plan) VALUES(?,?,?,?,?,?,?,?,?)')
    .run(personalId, 'trial', null, 'trialing', 0, Date.now() + TRIAL_DAYS * DAY, Date.now(), Date.now(), plan);
  return true;
}
const providers = () => ({
  mercadopago: !!process.env.MP_ACCESS_TOKEN,
  stripe: !!process.env.STRIPE_SECRET_KEY,
  demo: !process.env.MP_ACCESS_TOKEN && !process.env.STRIPE_SECRET_KEY || process.env.ALLOW_DEMO === '1',
});
const now = () => Date.now();
async function activate(personalId, provider, externalId, amount, test, periodEnd, plan) {
  plan = plan || 'pro'; await db.prepare('UPDATE personals SET plan=? WHERE id=?').run(plan, personalId);
  const sub = await db.prepare('SELECT * FROM subscriptions WHERE personal_id=? ORDER BY id DESC LIMIT 1').get(personalId);
  const base = sub && sub.status !== 'trialing' && sub.current_period_end > now() ? sub.current_period_end : now();
  const end = periodEnd || base + 30 * DAY;
  if (sub) await db.prepare('UPDATE subscriptions SET provider=?,external_id=COALESCE(?,external_id),status=?,amount_cents=?,current_period_end=?,updated_at=?,plan=? WHERE id=?')
    .run(provider, externalId, 'active', amount, end, now(), plan, sub.id);
  else await db.prepare('INSERT INTO subscriptions(personal_id,provider,external_id,status,amount_cents,current_period_end,created_at,updated_at,plan) VALUES(?,?,?,?,?,?,?,?,?)')
    .run(personalId, provider, externalId, 'active', amount, end, now(), now(), plan);
}
async function recordPayment(personalId, provider, extId, amount, status, test, plan) {
  try { await db.prepare('INSERT INTO payments(personal_id,provider,external_id,amount_cents,status,test,created_at,plan) VALUES(?,?,?,?,?,?,?,?)')
    .run(personalId, provider, extId, amount, status, test ? 1 : 0, now(), plan || 'pro'); return true; }
  catch (e) { if (/UNIQUE/.test(e.message)) return false; throw e; }
}
async function subscriptionOf(personalId) {
  const s = await db.prepare('SELECT * FROM subscriptions WHERE personal_id=? ORDER BY id DESC LIMIT 1').get(personalId);
  const p = await db.prepare('SELECT plan,trial_used FROM personals WHERE id=?').get(personalId) || {};
  const all = await plans(), plan = (s && s.plan) || p.plan || 'pro', P = all[plan] || all.pro;
  const base = { plan, plan_nome: P.nome, limit: P.limit, trial_used: !!p.trial_used };
  if (!s) return { active: false, status: 'none', ...base };
  const active = ['active', 'cancelled', 'trialing'].includes(s.status) && s.current_period_end > now();
  return { active, status: active ? s.status : (s.status === 'trialing' ? 'trial_expired' : 'expired'), trial: s.status === 'trialing', provider: s.provider, external_id: s.external_id, current_period_end: s.current_period_end, amount_cents: s.amount_cents, ...base };
}
const baseUrl = req => process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;

async function mp(pathname, opts = {}) {
  const r = await fetch('https://api.mercadopago.com' + pathname, { ...opts, headers: { Authorization: 'Bearer ' + process.env.MP_ACCESS_TOKEN, 'Content-Type': 'application/json', 'X-Idempotency-Key': crypto.randomUUID(), ...(opts.headers || {}) } });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error('Mercado Pago: ' + (j.message || r.status)); return j;
}
async function stripe(pathname, params) {
  const r = await fetch('https://api.stripe.com/v1' + pathname, { method: params ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + process.env.STRIPE_SECRET_KEY, 'Content-Type': 'application/x-www-form-urlencoded' }, body: params ? new URLSearchParams(params) : undefined });
  const j = await r.json(); if (!r.ok) throw new Error('Stripe: ' + (j.error && j.error.message)); return j;
}

// Cria checkout e devolve URL para redirecionar o personal
async function checkout(req, personal, method, plan) {
  plan = plan || 'pro'; const PL = await planOf(plan), amount = PL.price_cents, ref = 'p' + personal.id + ':' + plan, back = baseUrl(req) + '/?pago=1', P = providers();
  if (method === 'demo') {
    if (!P.demo) throw new Error('Modo demo desativado');
    const id = 'demo_' + crypto.randomBytes(6).toString('hex');
    await recordPayment(personal.id, 'demo', id, amount, 'approved', true, plan); await activate(personal.id, 'demo', id, amount, true, null, plan);
    return { url: back, demo: true };
  }
  if (method === 'mp_card') { // assinatura recorrente (cartão) – API /preapproval
    const j = await mp('/preapproval', { method: 'POST', body: JSON.stringify({ reason: 'Shape de Qualidade – plano ' + PL.nome, external_reference: ref, payer_email: personal.email, back_url: back,
      auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: amount / 100, currency_id: 'BRL' }, status: 'pending' }) });
    return { url: j.init_point };
  }
  if (method === 'mp_pix') { // Checkout Pro (Pix, boleto, cartão) – 1 mês por pagamento
    const j = await mp('/checkout/preferences', { method: 'POST', body: JSON.stringify({ items: [{ title: 'Shape de Qualidade – plano ' + PL.nome + ' (1 mês)', quantity: 1, unit_price: amount / 100, currency_id: 'BRL' }],
      external_reference: ref, payer: { email: personal.email }, back_urls: { success: back, pending: back, failure: baseUrl(req) + '/' }, auto_return: 'approved',
      notification_url: baseUrl(req) + '/api/webhooks/mercadopago' }) });
    return { url: j.init_point };
  }
  if (method === 'stripe') {
    const j = await stripe('/checkout/sessions', { mode: 'subscription', success_url: back, cancel_url: baseUrl(req) + '/', customer_email: personal.email, client_reference_id: String(personal.id),
      'line_items[0][quantity]': 1, 'line_items[0][price_data][currency]': 'brl', 'line_items[0][price_data][unit_amount]': amount,
      'line_items[0][price_data][recurring][interval]': 'month', 'line_items[0][price_data][product_data][name]': 'Shape de Qualidade – plano ' + PL.nome,
      'subscription_data[metadata][personal_id]': personal.id, 'subscription_data[metadata][plan]': plan });
    return { url: j.url };
  }
  throw new Error('Forma de pagamento indisponível');
}

// Webhook Mercado Pago: confirmamos sempre consultando a API (não confiamos no corpo)
const parseRef = r => { const m = String(r || '').match(/^p(\d+)(?::(\w+))?$/); return m ? { pid: +m[1], plan: m[2] || 'pro' } : { pid: 0 }; };
async function mpWebhook(req) {
  const type = req.body.type || req.query.type || req.query.topic, id = (req.body.data && req.body.data.id) || req.query['data.id'] || req.query.id;
  if (!id) return;
  if (process.env.MP_WEBHOOK_SECRET && req.get('x-signature')) { // validação opcional da assinatura
    const sig = Object.fromEntries(req.get('x-signature').split(',').map(p => p.trim().split('=')));
    const manifest = `id:${id};request-id:${req.get('x-request-id')};ts:${sig.ts};`;
    const h = crypto.createHmac('sha256', process.env.MP_WEBHOOK_SECRET).update(manifest).digest('hex');
    if (h !== sig.v1) throw new Error('assinatura inválida');
  }
  if (type === 'payment') {
    const p = await mp('/v1/payments/' + id);
    const { pid, plan } = parseRef(p.external_reference);
    if (pid && p.status === 'approved' && await recordPayment(pid, 'mercadopago', String(p.id), Math.round(p.transaction_amount * 100), 'approved', !p.live_mode, plan))
      await activate(pid, 'mercadopago', String(p.id), Math.round(p.transaction_amount * 100), false, null, plan);
  } else if (/preapproval/.test(type || '')) {
    const s = await mp('/preapproval/' + id); const { pid, plan } = parseRef(s.external_reference);
    if (!pid) return;
    if (s.status === 'authorized') await activate(pid, 'mercadopago', s.id, Math.round(s.auto_recurring.transaction_amount * 100), false, s.next_payment_date ? Date.parse(s.next_payment_date) + 3 * DAY : null, plan);
    if (s.status === 'cancelled' || s.status === 'paused') await db.prepare("UPDATE subscriptions SET status='cancelled',updated_at=? WHERE personal_id=? AND external_id=?").run(now(), pid, s.id);
  } else if (type === 'subscription_authorized_payment') {
    const p = await mp('/authorized_payments/' + id); const s = await mp('/preapproval/' + p.preapproval_id); const { pid, plan } = parseRef(s.external_reference);
    if (pid && p.payment && p.payment.status === 'approved' && await recordPayment(pid, 'mercadopago', String(p.id), Math.round(p.transaction_amount * 100), 'approved', false, plan))
      await activate(pid, 'mercadopago', s.id, Math.round(p.transaction_amount * 100), false, null, plan);
  }
}
async function stripeWebhook(req) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET; if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET ausente');
  const sig = Object.fromEntries(String(req.get('stripe-signature')).split(',').map(p => p.split('=')));
  const h = crypto.createHmac('sha256', secret).update(sig.t + '.' + req.rawBody).digest('hex');
  if (h !== sig.v1 || Math.abs(Date.now() / 1000 - sig.t) > 300) throw new Error('assinatura inválida');
  const ev = JSON.parse(req.rawBody), o = ev.data.object;
  if (ev.type === 'invoice.paid') {
    const md = (o.subscription_details && o.subscription_details.metadata) || (o.parent && o.parent.subscription_details && o.parent.subscription_details.metadata) || {};
    const pid = +((o.subscription_details && o.subscription_details.metadata && o.subscription_details.metadata.personal_id) || (o.parent && o.parent.subscription_details && o.parent.subscription_details.metadata.personal_id));
    const end = o.lines && o.lines.data[0] && o.lines.data[0].period ? o.lines.data[0].period.end * 1000 : null;
    if (pid && await recordPayment(pid, 'stripe', o.id, o.amount_paid, 'approved', !ev.livemode, md.plan)) await activate(pid, 'stripe', o.subscription, o.amount_paid, false, end, md.plan);
  }
  if (ev.type === 'customer.subscription.deleted') await db.prepare("UPDATE subscriptions SET status='cancelled',updated_at=? WHERE external_id=?").run(now(), o.id);
}
// Troca de plano numa assinatura já paga, sem nova cobrança agora (vale a partir da próxima renovação)
async function changeRecurring(personalId, plan) {
  const sub = await subscriptionOf(personalId), PL = await planOf(plan);
  if (sub.provider === 'mercadopago' && sub.external_id && !/^\d+$/.test(sub.external_id))
    await mp('/preapproval/' + sub.external_id, { method: 'PUT', body: JSON.stringify({ reason: 'Shape de Qualidade – plano ' + PL.nome, external_reference: 'p' + personalId + ':' + plan, auto_recurring: { transaction_amount: PL.price_cents / 100, currency_id: 'BRL' } }) });
  if (sub.provider === 'stripe' && sub.external_id) {
    const st = await stripe('/subscriptions/' + sub.external_id);
    await stripe('/subscriptions/' + sub.external_id, { 'items[0][id]': st.items.data[0].id, 'items[0][price_data][currency]': 'brl', 'items[0][price_data][unit_amount]': PL.price_cents,
      'items[0][price_data][recurring][interval]': 'month', 'items[0][price_data][product]': st.items.data[0].price.product, proration_behavior: 'none', 'metadata[plan]': plan });
  }
  await db.prepare('UPDATE subscriptions SET plan=?,updated_at=? WHERE id=(SELECT id FROM subscriptions WHERE personal_id=? ORDER BY id DESC LIMIT 1)').run(plan, now(), personalId);
  await db.prepare('UPDATE personals SET plan=? WHERE id=?').run(plan, personalId);
}
module.exports = { plans, setPlans, planOf, startTrial, changeRecurring, TRIAL_DAYS, checkout, mpWebhook, stripeWebhook, subscriptionOf, priceCents, providers };
