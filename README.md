# Bye Trader Front (Demo)

Front-end SPA em HTML/CSS/JS puro para fluxo de corretora de opções binárias simulada:

- Cadastro e login
- Dashboard inicial
- Depósito via Pix (mock)
- Operações de trade com resultado por preço real de entrada/saída (ticker ao vivo com fallback)
- Conta do cliente com dados de saque (nome, e-mail, CPF, chave Pix, endereço residencial)
- Solicitação de saque com validação administrativa
- Painel admin com visão de saldo global e aprovação de saques

## Estrutura

- `index.html`
- `assets/bye-trade-logo.png`
- `styles/*.css`
- `js/app.js`, `js/router.js`, `js/store.js`, `js/config.js`
- `js/api/*.adapter.js`
- `js/mocks/mock-db.js`
- `js/views/*.view.js`
- `js/components/*.js`

## Como rodar

Suba o servidor seguro (frontend + API proxy Pix):

```bash
cd /Users/jhemersonrimar/Documents/Playground
npm start
```

Depois abra `http://localhost:5500`.

Conta demo padrão:

- E-mail: `demo@byetrader.com`
- Senha: `123456`

Conta admin demo:

- E-mail: `admin@byetrader.com`
- Senha: `admin123`

Campos obrigatórios no cadastro do cliente:

- Nome completo
- E-mail
- CPF
- Chave Pix
- Endereço residencial
- Senha

## Configuração local (sem versionar segredo)

Existe suporte a configuração local:

1. Copie `js/config.local.example.js` para `js/config.local.js`.
2. Ajuste `API_MODE`, `PIX_MODE` e `ENDPOINTS` localmente.
3. `js/config.local.js` está no `.gitignore` para não subir dados sensíveis.

Obs: o navegador sempre expõe tudo que está no frontend. Não use token real de provedor Pix no client.

## Modo de integração API

Arquivo: `js/config.js`

- `API_MODE`: `"mock"` (padrão) ou `"real"`
- `PIX_MODE`: `"mock"` (padrão) ou `"proxy"`
- `ENDPOINTS`: URLs base para auth, wallet, trades, pix, awards e admin

### Contratos de adapters

- `auth.adapter.js`
  - `register({ name, email, cpf, pixKey, address, password })`
  - `login({ email, password })`
  - `logout()`

- `wallet.adapter.js`
  - `getBalance()`
  - `applyDeposit({ amount, txid })`

- `pix.adapter.js`
  - `createPixCharge({ amount })`
  - `getPixChargeStatus({ txid })`

- `trade.adapter.js`
  - `createTrade({ symbol, amount, direction, expirySeconds, openPrice })`
  - `resolveTrade({ tradeId, currentPrice })`
  - `listTrades()`

- `market.adapter.js`
  - `getLiveTicker({ symbolCode, providerSymbol })`

- `profile.adapter.js`
  - `getProfile()`
  - `saveProfile({ name, email, cpf, pixKey, address })`
  - `requestWithdrawal({ amount })`
  - `listMyWithdrawals()`
  - `listClientTransactions()`

- `admin.adapter.js`
  - `getPlatformStats()`
  - `listWithdrawRequests()`
  - `approveWithdrawRequest({ requestId })` (move para PROCESSING)
  - `payWithdrawRequest({ requestId })` (fecha como PAID)
  - `rejectWithdrawRequest({ requestId, reason })` (fecha como REJECTED + estorno)
  - `listAllClientTransactions()`
  - `getAwardsConfigAdmin()`
  - `updateAwardsConfigAdmin({ awards })`

Para integrar API real:

1. Para Pix seguro, use `PIX_MODE: "proxy"` (recomendado).
2. Ajuste `ENDPOINTS.pix` para o backend (`/api/pix` no servidor local já está pronto).
3. Configure `.env` no backend com credenciais do provedor.
4. Para auth/wallet/trades reais, aí sim altere `API_MODE` para `"real"`.

## Feed de mercado (trade)

- O front tenta usar ticker ao vivo público (Binance) para preço de entrada/saída.
- Se o provedor externo falhar, cai automaticamente no fallback mock.
- Resultado da operação é calculado por preço real de entrada/saída no vencimento.

## Backend Pix seguro

Arquivos:

- `server/index.js`
- `.env.example`

Crie um `.env` baseado no exemplo:

```bash
cp .env.example .env
```

Variáveis principais:

- `PIX_PROVIDER_BASE_URL`
- `PIX_CREATE_PATH`
- `PIX_STATUS_PATH_TEMPLATE`
- `PIX_AUTH_SCHEME`
- `PIX_API_TOKEN`
- `PIX_TIMEOUT_MS`

O token Pix fica apenas no servidor e nunca no navegador.

### Configuração via painel admin (runtime)

Existe um bloco no `Painel Admin` para configurar API Pix:

- URL base
- Path de criação
- Path de status
- Auth scheme
- Offer hash
- Product hash
- Product title
- Token Pix (campo oculto)

Essa configuração agora é salva no backend (arquivo local do servidor) e permanece após restart.
Para ambiente Railway, configure volume persistente e `DB_FILE_PATH` (ex.: `/data/byetrader-db.json`) para não perder dados em novo deploy.

Se você definir `ADMIN_PANEL_SECRET` no `.env`, o painel exige esse segredo para salvar/ler status da configuração Pix.

### TriboPay (referência prática)

No painel admin use:

- URL base: `https://api.tribopay.com.br/api/public/v1/`
- Path criar: `transactions`
- Path status: `transactions/{txid}`
- Auth scheme: `Bearer` (não usado na TriboPay, mas mantenha preenchido)
- Offer hash: valor da sua oferta
- Product hash: valor do produto
- Product title: texto do item do carrinho
- Token Pix: seu `api_token` da TriboPay

Webhook para notificações automáticas:

- `POST /api/pix/webhook`

## Segurança aplicada no frontend

- CSP via `meta` no `index.html` (bloqueio de origem externa indevida e frame embedding).
- Proteção contra clickjacking (`frame-ancestors 'none'` + `X-Frame-Options DENY`).
- Política de referrer restrita.
- Rate-limit de tentativas de login no client (lock temporário após múltiplas falhas).
- Remoção de interpolação direta de nome de usuário no header (uso de `textContent`).

## Segurança aplicada no servidor

- Proxy Pix com token em variável de ambiente (`.env`), sem segredo no front.
- Validação de origem para chamadas API.
- Rate limit por IP em rotas API.
- Limite de payload para evitar abuso.
- Validação de valor da cobrança e formato de `txid`.
- Headers de segurança em respostas HTTP.
- Sem dependências externas para reduzir superfície de ataque inicial.
- Endpoint de observabilidade: `GET /api/metrics`.
- CORS com allowlist por variável `API_ALLOWED_ORIGINS` (para frontend em outro domínio).

## Segurança obrigatória para Pix real

Token/chave de API Pix deve ficar **somente no backend**.

Fluxo recomendado:

1. Front chama seu backend (`POST /api/pix/charges`, `GET /api/pix/charges/:txid`).
2. Backend usa variável de ambiente (`PIX_API_TOKEN`) para falar com o provedor.
3. Front recebe apenas dados da cobrança (txid/qr/status), nunca o segredo.

## Deploy híbrido (Hostinger + Railway/Render)

Use este modelo quando sua Hostinger não oferece Node.js persistente:

- Frontend estático: Hostinger (`byeptrader.com`)
- Backend Node (`server/index.js`): Railway ou Render

### 1) Subir backend no Railway/Render

Projeto backend: este mesmo repositório (ou apenas pasta com `server/index.js` + front estático, se preferir).

Comando de start:

```bash
node server/index.js
```

Variáveis obrigatórias no backend:

```env
PORT=5500
API_ALLOWED_ORIGINS=https://byeptrader.com,https://www.byeptrader.com

PIX_PROVIDER_BASE_URL=https://api.tribopay.com.br/api/public/v1/
PIX_CREATE_PATH=transactions
PIX_STATUS_PATH_TEMPLATE=transactions/{txid}
PIX_AUTH_SCHEME=Bearer
PIX_API_TOKEN=SEU_TOKEN
PIX_OFFER_HASH=sq9iw
PIX_PRODUCT_HASH=SEU_PRODUCT_HASH
PIX_PRODUCT_TITLE=Deposito Bye Trader
PIX_PRODUCT_SALE_PAGE=https://byeptrader.com
DB_FILE_PATH=/data/byetrader-db.json
```

Depois do deploy, você terá uma URL como:

- `https://seu-backend.up.railway.app`
ou
- `https://seu-backend.onrender.com`

### 2) Publicar frontend na Hostinger

Suba os arquivos front (HTML/CSS/JS/assets) normalmente na Hostinger.

Crie/edite `js/config.local.js` no frontend hospedado:

```js
window.__APP_LOCAL_CONFIG__ = {
  API_MODE: "real",
  PIX_MODE: "proxy",
  ENDPOINTS: {
    auth: "https://SEU-BACKEND/api/auth",
    wallet: "https://SEU-BACKEND/api/wallet",
    trades: "https://SEU-BACKEND/api/trades",
    pix: "https://SEU-BACKEND/api/pix",
  },
};
```

### 3) Configurar webhook na TriboPay

- `https://SEU-BACKEND/api/pix/webhook`

Exemplo:

- `https://seu-backend.up.railway.app/api/pix/webhook`

### 4) Teste final

1. Acesse `https://byeptrader.com`
2. Gere depósito Pix de R$10
3. Confirme pagamento (`Já paguei`)
4. Verifique crédito no saldo
5. Valide no admin transações/saques

## Observações

- Esta aplicação é de **simulação** (sem dinheiro real).
- Sessão e dados ficam em `localStorage`.
- Checklist de qualidade: `QA_CHECKLIST.md`.
