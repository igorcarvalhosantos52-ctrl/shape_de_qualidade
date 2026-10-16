# Shape de Qualidade – versão de verdade (SaaS para personais)

App de coach virtual com **anamnese por voz** (pt-BR), treino em rotação de 4 dias, 4 séries / 60 s
(cansaço: 3 séries / 90 s), ajustes do dia, painel "Detalhes" dos exercícios, login de aluno e de personal,
lista de alunos com busca/aprovação e revisão do treino. É a versão de teste aprovada, agora com servidor.

**Como funciona a venda:** cada **personal** cria a conta e **assina o plano mensal**. Depois do pagamento ele
recebe um **link/código de convite** e manda para os alunos. Cada personal só vê os próprios alunos. Começa com **4 dias grátis**. Se a assinatura
vencer, o personal vê a tela de pagamento e os alunos dele ficam com o acesso pausado.

## Rodar no computador
```bash
npm install
npm start            # abre em http://localhost:3000
npm test             # teste automático completo (precisa do Google Chrome)
```
Sem chaves de pagamento o app roda em **MODO TESTE**: aparece o botão "Simular pagamento (teste)", sem cobrança real.
Painel do dono: `http://localhost:3000/admin` (defina `ADMIN_EMAIL` e `ADMIN_PASSWORD`, ex.:
`ADMIN_EMAIL=eu@x.com ADMIN_PASSWORD=123 npm start`). Lá você vê personais, assinaturas, receita e muda o preço.

## Planos e teste grátis
| Plano | Alunos | Preço |
|---|---|---|
| Básico | até 15 | R$ 29,90/mês |
| Pro | até 30 | R$ 49,90/mês |
| Ilimitado | sem limite | R$ 79,90/mês |

- Todo personal novo ganha **4 dias grátis** no plano que escolher no cadastro, sem cartão e **uma vez por conta**. Quando o teste acaba, ele vê a tela de escolha de plano.
- **Limite de alunos:** quando o personal chega no limite, o convite avisa o aluno e o cadastro é recusado com a mensagem
  "O seu personal atingiu o limite de 15 alunos do plano Básico. Peça para ele fazer upgrade…". O painel do personal mostra "15 / 15 – Limite atingido".
- **Mudar de plano** (painel do personal → "Mudar de plano"):
  - durante o teste grátis: troca na hora;
  - **upgrade** com assinatura paga: o personal paga o novo plano (o período pago é somado ao atual; não há cálculo proporcional);
  - **downgrade:** bloqueado se ele tiver mais alunos que o limite do plano menor; se puder, muda na hora e o novo valor vale na próxima renovação (atualiza a assinatura no Mercado Pago/Stripe).
- Preços e limites podem ser mudados no **/admin** (vale para as próximas cobranças) ou pelas variáveis `PLAN_BASICO_PRICE`, `PLAN_PRO_LIMIT`… (veja `.env.example`). O /admin mostra o plano de cada personal e a receita por plano.

## Mercado Pago (Pix, boleto e cartão)
1. Crie a conta em mercadopago.com.br e abra **Suas integrações** → crie uma aplicação.
2. Copie o **Access Token de produção** para `MP_ACCESS_TOKEN` (use o de teste para testar).
3. Em **Webhooks**, cadastre `https://SEU-DOMINIO/api/webhooks/mercadopago` com os eventos *Pagamentos* e
   *Planos e assinaturas*; copie a "assinatura secreta" para `MP_WEBHOOK_SECRET`.
4. Defina `BASE_URL` com o endereço público do app.

O personal terá dois botões: **Pix/boleto/cartão (1 mês)** – Checkout Pro, renova pagando de novo – e
**assinatura automática no cartão** (API de assinaturas `preapproval`; o Mercado Pago não faz assinatura automática via Pix).
O acesso só é liberado quando o webhook confirma o pagamento consultando a API do Mercado Pago.

### Stripe (opcional)
`STRIPE_SECRET_KEY` + webhook `https://SEU-DOMINIO/api/webhooks/stripe` (eventos `invoice.paid` e
`customer.subscription.deleted`) com `STRIPE_WEBHOOK_SECRET`.

## Publicar na internet
**Render (plano grátis):** defina `TURSO_DATABASE_URL` e `TURSO_AUTH_TOKEN` no serviço. O app grava no Turso e só responde depois que a escrita é confirmada; login e sessão ficam na tabela `sessions`. Sem essas variáveis, usa SQLite local (`DB_PATH`) — é o modo do computador.
**Railway:** *New Project → Deploy from GitHub*. Com Turso, não precisa de volume. Sem Turso, adicione um **Volume** em `/data` e `DB_PATH=/data/shape.db`.
Precisa de HTTPS (Render/Railway já dão) – o microfone e a instalação como app só funcionam em HTTPS.

## Instalar no celular (PWA)
Abra o endereço no Chrome do Android → menu ⋮ → **Instalar app / Adicionar à tela inicial**. No iPhone: Safari →
Compartilhar → **Adicionar à Tela de Início**. O ícone é o homem da logo.

## Play Store (depois)
Dá para publicar o mesmo PWA na Play Store como **TWA** (Trusted Web Activity) com o PWABuilder (pwabuilder.com)
ou Bubblewrap: precisa da conta de desenvolvedor Google (US$ 25 uma vez) e do arquivo `/.well-known/assetlinks.json`.
Atenção: vender assinatura *dentro* de app da Play Store pode exigir o faturamento do Google; cobrar o personal pelo site é o caminho mais simples.

## Estrutura
- `server.js` – API (login com bcrypt, sessões em cookie httpOnly, fichas, convites, admin)
- `src/db.js` – Turso (libSQL) se `TURSO_DATABASE_URL` existir; senão SQLite (better-sqlite3) · `src/payments.js` – módulo de pagamento (demo / Mercado Pago / Stripe)
- `public/` – app (index.html, app.js = lógica aprovada, glue.js = integração com o servidor, shim.js, sw.js, manifest)
- `test/e2e.js` – teste: cadastro com teste grátis → fim do teste → paywall de planos → pagamento demo → convite → anamnese → aprovação → limite de 15 → upgrade/downgrade → admin; telas em `screens/`

## Limitações conhecidas
- Recuperação de senha por e-mail ainda não existe (precisa de um serviço de e-mail).
- A anamnese entende palavras-chave (não usa IA) e não substitui avaliação médica.
