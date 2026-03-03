import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

function loadDotEnv() {
  const envPath = path.resolve(ROOT_DIR, ".env");
  if (!existsSync(envPath)) return;

  const raw = readFileSync(envPath, "utf-8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

loadDotEnv();

const PORT = Number(process.env.PORT || 5500);
const PIX_PROVIDER_BASE_URL = process.env.PIX_PROVIDER_BASE_URL || "";
const PIX_CREATE_PATH = process.env.PIX_CREATE_PATH || "/charges";
const PIX_STATUS_PATH_TEMPLATE = process.env.PIX_STATUS_PATH_TEMPLATE || "/charges/{txid}";
const PIX_API_TOKEN = process.env.PIX_API_TOKEN || "";
const PIX_AUTH_SCHEME = process.env.PIX_AUTH_SCHEME || "Bearer";
const PIX_TIMEOUT_MS = Number(process.env.PIX_TIMEOUT_MS || 12000);
const ADMIN_PANEL_SECRET = process.env.ADMIN_PANEL_SECRET || "";
const APP_CURRENCY = process.env.APP_CURRENCY || "BRL";
const PAYOUT_RATE = Number(process.env.TRADE_PAYOUT_RATE || 0.8);
const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS || 12 * 60 * 60 * 1000);
const API_ALLOWED_ORIGINS = String(process.env.API_ALLOWED_ORIGINS || "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

const runtimePixConfig = {
  baseUrl: "",
  createPath: "",
  statusPathTemplate: "",
  apiToken: "",
  authScheme: "",
  offerHash: "",
  productHash: "",
  productTitle: "",
  productCover: "",
  productSalePage: "",
};

const runtimeChargeStatus = new Map();
const pixChargeOwners = new Map();
const authSessions = new Map();

function randomId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
}

function now() {
  return Date.now();
}

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function formatMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    cpf: user.cpf || "",
    pixKey: user.pixKey || "",
    address: user.address || "",
    isAdmin: Boolean(user.isAdmin),
    isActive: user.isActive !== false,
  };
}

function seedDb() {
  const demoUserId = randomId();
  const adminUserId = randomId();
  const startedAt = now();

  return {
    users: [
      {
        id: demoUserId,
        name: "Cliente Demo",
        email: "demo@byetrader.com",
        password: "123456",
        cpf: "12345678909",
        pixKey: "demo@byetrader.com",
        address: "Rua Exemplo, 100 - Centro, São Paulo/SP",
        isAdmin: false,
        isActive: true,
        createdAt: startedAt,
      },
      {
        id: adminUserId,
        name: "Administrador",
        email: "admin@byetrader.com",
        password: "admin123",
        cpf: "00000000000",
        pixKey: "admin@byetrader.com",
        address: "Sede Administrativa",
        isAdmin: true,
        isActive: true,
        createdAt: startedAt,
      },
    ],
    wallets: {
      [demoUserId]: { available: 1000, currency: APP_CURRENCY },
      [adminUserId]: { available: 0, currency: APP_CURRENCY },
    },
    trades: {
      [demoUserId]: [],
      [adminUserId]: [],
    },
    pixCharges: {
      [demoUserId]: [],
      [adminUserId]: [],
    },
    withdrawals: [],
    transactions: [
      {
        transactionId: randomId(),
        userId: demoUserId,
        userName: "Cliente Demo",
        userEmail: "demo@byetrader.com",
        category: "deposit",
        eventType: "DEPOSIT_CREDITED",
        status: "CONFIRMED",
        amount: 1000,
        balanceAfter: 1000,
        referenceId: "SEED-INIT",
        description: "Saldo inicial de demonstração",
        createdAt: startedAt,
      },
    ],
  };
}

const db = seedDb();

function findUserById(userId) {
  return db.users.find((item) => item.id === userId) || null;
}

function findUserByEmail(email) {
  const normalized = normalizeEmail(email);
  return db.users.find((item) => normalizeEmail(item.email) === normalized) || null;
}

function ensureWallet(userId) {
  if (!db.wallets[userId]) db.wallets[userId] = { available: 0, currency: APP_CURRENCY };
  if (!db.trades[userId]) db.trades[userId] = [];
  if (!db.pixCharges[userId]) db.pixCharges[userId] = [];
  return db.wallets[userId];
}

function recordTransaction(userId, payload) {
  const user = findUserById(userId);
  if (!user || user.isAdmin) return;

  db.transactions.unshift({
    transactionId: randomId(),
    userId: user.id,
    userName: user.name,
    userEmail: user.email,
    category: payload.category,
    eventType: payload.eventType,
    status: payload.status || "CONFIRMED",
    amount: formatMoney(payload.amount || 0),
    balanceAfter: formatMoney(payload.balanceAfter || 0),
    referenceId: payload.referenceId || "",
    description: payload.description || "",
    createdAt: payload.createdAt || now(),
  });
}

function listUserTransactions(userId) {
  return db.transactions.filter((item) => item.userId === userId);
}

function createAuthToken(userId) {
  const token = `srv-${randomId()}`;
  authSessions.set(token, {
    userId,
    expiresAt: now() + SESSION_TTL_MS,
  });
  return token;
}

function deleteSession(token) {
  authSessions.delete(token);
}

function readBearerToken(req) {
  const header = String(req.headers.authorization || "");
  if (!header.startsWith("Bearer ")) return "";
  return header.slice("Bearer ".length).trim();
}

function getUserFromToken(token) {
  if (!token) return null;
  const session = authSessions.get(token);
  if (!session) return null;
  if (session.expiresAt <= now()) {
    authSessions.delete(token);
    return null;
  }

  const user = findUserById(session.userId);
  if (!user) {
    authSessions.delete(token);
    return null;
  }
  return user;
}

function getUserFromClientSessionHeader(req) {
  const clientSession = String(req.headers["x-client-session"] || "").trim();
  return getUserFromToken(clientSession);
}

function requireAuth(req, res, { adminOnly = false } = {}) {
  const token = readBearerToken(req);
  const user = getUserFromToken(token);
  if (!user) {
    sendJson(res, 401, { error: "Sessão inválida ou expirada." });
    return null;
  }
  if (user.isActive === false) {
    sendJson(res, 403, { error: "Conta desativada." });
    return null;
  }
  if (adminOnly && !user.isAdmin) {
    sendJson(res, 403, { error: "Acesso restrito ao administrador." });
    return null;
  }
  return { token, user };
}

function canAccessAdminConfig(req) {
  const user = getUserFromClientSessionHeader(req);
  if (!user || !user.isAdmin) return false;
  if (!ADMIN_PANEL_SECRET) return true;
  const sentSecret = String(req.headers["x-admin-secret"] || "");
  return sentSecret && sentSecret === ADMIN_PANEL_SECRET;
}

const LIMIT_WINDOW_MS = 60_000;
const LIMIT_MAX_REQUESTS = 80;
const rateWindow = new Map();
const apiMetrics = {
  startedAt: now(),
  totalRequests: 0,
  errors4xx: 0,
  errors5xx: 0,
  byRoute: {},
};

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".json": "application/json; charset=utf-8",
};

function setSecurityHeaders(res, isApi = false) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");

  if (isApi) {
    res.setHeader("Cache-Control", "no-store");
  } else {
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; connect-src 'self' https://api.binance.com https://brapi.dev; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
    );
  }
}

function getIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket.remoteAddress || "unknown";
}

function isRateLimited(req) {
  const ip = getIp(req);
  const currentTime = now();
  const record = rateWindow.get(ip) || { count: 0, windowStart: currentTime };

  if (currentTime - record.windowStart > LIMIT_WINDOW_MS) {
    record.count = 0;
    record.windowStart = currentTime;
  }

  record.count += 1;
  rateWindow.set(ip, record);
  return record.count > LIMIT_MAX_REQUESTS;
}

function sendJson(res, statusCode, payload) {
  if (statusCode >= 400 && statusCode < 500) apiMetrics.errors4xx += 1;
  if (statusCode >= 500) apiMetrics.errors5xx += 1;
  setSecurityHeaders(res, true);
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req) {
  const chunks = [];
  let total = 0;

  for await (const chunk of req) {
    total += chunk.length;
    if (total > 64 * 1024) throw new Error("Payload too large");
    chunks.push(chunk);
  }

  if (!chunks.length) return {};
  const raw = Buffer.concat(chunks).toString("utf-8");
  return JSON.parse(raw);
}

function ensureSameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;

  try {
    const originUrl = new URL(origin);
    const host = req.headers.host;
    if (originUrl.host === host) return true;
    if (API_ALLOWED_ORIGINS.includes("*")) return true;
    return API_ALLOWED_ORIGINS.includes(origin);
  } catch {
    return false;
  }
}

function applyApiCorsHeaders(req, res) {
  const origin = String(req.headers.origin || "");
  if (!origin) return;
  if (!ensureSameOrigin(req)) return;

  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Client-Session, X-Admin-Secret",
  );
}

function safeTxid(txid) {
  return /^[a-zA-Z0-9._-]{4,128}$/.test(txid);
}

function mapPixStatus(value) {
  const raw = String(value || "").toLowerCase();
  if (["paid", "approved", "success"].includes(raw)) return "PAID";
  if (["expired", "canceled", "cancelled", "failed"].includes(raw)) return "EXPIRED";
  return "PENDING";
}

function getPixConfig() {
  return {
    baseUrl: runtimePixConfig.baseUrl || PIX_PROVIDER_BASE_URL,
    createPath: runtimePixConfig.createPath || PIX_CREATE_PATH,
    statusPathTemplate: runtimePixConfig.statusPathTemplate || PIX_STATUS_PATH_TEMPLATE,
    apiToken: runtimePixConfig.apiToken || PIX_API_TOKEN,
    authScheme: runtimePixConfig.authScheme || PIX_AUTH_SCHEME,
    offerHash: runtimePixConfig.offerHash || process.env.PIX_OFFER_HASH || "",
    productHash: runtimePixConfig.productHash || process.env.PIX_PRODUCT_HASH || "",
    productTitle: runtimePixConfig.productTitle || process.env.PIX_PRODUCT_TITLE || "Deposito Bye Trader",
    productCover: runtimePixConfig.productCover || process.env.PIX_PRODUCT_COVER || "",
    productSalePage: runtimePixConfig.productSalePage || process.env.PIX_PRODUCT_SALE_PAGE || "",
  };
}

function isTriboPayConfig(cfg) {
  return String(cfg.baseUrl || "").includes("tribopay.com.br");
}

function unwrapProviderData(providerData) {
  if (!providerData || typeof providerData !== "object") return {};
  if (providerData.response && typeof providerData.response === "object") return providerData.response;
  if (providerData.data && typeof providerData.data === "object") return providerData.data;
  if (providerData.transaction && typeof providerData.transaction === "object") return providerData.transaction;
  return providerData;
}

function pickString(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
}

function normalizeCreateResponse(providerData, requestedAmount, cfg) {
  const source = unwrapProviderData(providerData);
  const sourcePix = unwrapProviderData(source.pix || {});
  const sourcePayment = unwrapProviderData(source.payment || {});
  const sourceCheckout = unwrapProviderData(source.checkout || {});
  const sourceLinks = unwrapProviderData(source.links || {});
  const tribo = isTriboPayConfig(cfg);
  const txid = pickString(
    source.txid,
    source.id,
    source.chargeId,
    source.code,
    source.transaction_id,
    sourcePayment.id,
    sourceCheckout.id,
  );
  const triboHash = pickString(source.transaction_hash, source.hash, source.id, source.reference);
  const resolvedTxid = tribo ? triboHash : txid;

  const copyPaste = pickString(
    source.copyPaste,
    source.pixCopiaECola,
    source.emv,
    source.pix_code,
    source.brcode,
    source.copiaecola,
    source.pix_copy_paste,
    source.pix_payload,
    source.copy_paste,
    source.pix_emv,
    source.pix?.copyPaste,
    source.pix?.code,
    source.pix?.copy_paste,
    source.pix?.brcode,
    sourcePix.copyPaste,
    sourcePix.code,
    sourcePix.copy_paste,
    sourcePix.brcode,
    sourcePix.emv,
    sourcePayment.pix_code,
    sourcePayment.copy_paste,
  );

  const qrCodeBase64 = pickString(
    source.qrCodeBase64,
    source.qrCodeImage,
    source.qrcode,
    source.qr_code,
    source.qr_code_base64,
    source.pix_qr_code,
    source.pix_qrcode_base64,
    source.pix?.qrcode,
    source.pix?.qr_code_base64,
    source.pix?.qr_code,
    source.pix_qrcode,
    sourcePix.qrcode,
    sourcePix.qr_code,
    sourcePix.qr_code_base64,
    sourcePix.qrCodeBase64,
    sourcePayment.qr_code,
    sourcePayment.qr_code_base64,
  );

  const paymentUrl = pickString(
    source.payment_url,
    source.checkout_url,
    source.checkoutUrl,
    source.payment_link,
    source.transaction_url,
    source.redirect_url,
    source.link,
    source.url,
    source.ticket_url,
    source.pix?.url,
    sourcePix.url,
    sourcePayment.url,
    sourcePayment.payment_url,
    sourceCheckout.url,
    sourceCheckout.checkout_url,
    sourceLinks.checkout,
    sourceLinks.payment,
  );

  const status = tribo ? mapPixStatus(source.status) : source.status || "PENDING";
  const expiresAt =
    source.expiresAt ||
    source.expirationDate ||
    source.expires_at ||
    source.pix?.expires_at ||
    (source.expire_at ? new Date(source.expire_at).getTime() : now() + 10 * 60 * 1000);

  if (!resolvedTxid) throw new Error("Resposta do provedor Pix sem txid");

  const normalized = {
    txid: String(resolvedTxid),
    amount: Number(requestedAmount),
    status,
    copyPaste,
    qrCodeBase64,
    paymentUrl,
    createdAt: now(),
    expiresAt: typeof expiresAt === "number" ? expiresAt : new Date(expiresAt).getTime(),
  };

  runtimeChargeStatus.set(normalized.txid, normalized);
  return normalized;
}

function normalizeStatusResponse(providerData, txid) {
  const source = unwrapProviderData(providerData);
  return {
    txid,
    status: mapPixStatus(source.status || source.pixStatus || source.payment_status || "PENDING"),
  };
}

function readProviderErrorMessage(details) {
  const source = unwrapProviderData(details);
  return pickString(
    source.message,
    source.error,
    source.detail,
    source.reason,
    source.errors?.[0]?.message,
    source.errors?.[0],
    typeof details === "string" ? details : "",
  );
}

async function callPixProvider(pathname, method, body) {
  const cfg = getPixConfig();
  if (!cfg.baseUrl || !cfg.apiToken) {
    throw new Error("Configuração Pix incompleta no servidor");
  }

  const url = new URL(pathname, cfg.baseUrl);
  if (isTriboPayConfig(cfg) && cfg.apiToken) {
    url.searchParams.set("api_token", cfg.apiToken);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PIX_TIMEOUT_MS);

  try {
    const headers = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    if (!isTriboPayConfig(cfg)) {
      headers.Authorization = `${cfg.authScheme} ${cfg.apiToken}`;
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const text = await response.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }

    if (!response.ok) {
      const err = new Error("Erro no provedor Pix");
      err.statusCode = response.status;
      err.details = data;
      throw err;
    }

    return data;
  } finally {
    clearTimeout(timeout);
  }
}

function buildAdminStats() {
  const clientUsers = db.users.filter((item) => !item.isAdmin);
  const totalClientBalance = clientUsers.reduce((acc, user) => acc + Number(db.wallets[user.id]?.available || 0), 0);

  const pendingRequests = db.withdrawals.filter((item) => item.status === "PENDING" || item.status === "PROCESSING");
  const paidRequests = db.withdrawals.filter((item) => item.status === "PAID");

  const openTradesExposure = clientUsers.reduce((acc, user) => {
    const openTrades = (db.trades[user.id] || []).filter((item) => item.status === "OPEN");
    return acc + openTrades.reduce((sum, trade) => sum + Number(trade.amount || 0), 0);
  }, 0);

  const totalDeposited = Object.values(db.pixCharges).reduce(
    (acc, charges) =>
      acc +
      (charges || []).reduce((sum, charge) => {
        if (charge.credited) return sum + Number(charge.amount || 0);
        return sum;
      }, 0),
    0,
  );

  const clientsActive = clientUsers.filter((item) => item.isActive !== false).length;
  const clientsBlocked = clientUsers.length - clientsActive;

  const totalPaidWithdrawals = formatMoney(
    paidRequests.reduce((acc, item) => acc + Number(item.amount || 0), 0),
  );

  const totalLiability = formatMoney(
    totalClientBalance +
      openTradesExposure +
      pendingRequests.reduce((acc, item) => acc + Number(item.amount || 0), 0),
  );

  const brokerageBalance = formatMoney(totalDeposited - totalPaidWithdrawals - totalLiability);

  return {
    totalClientBalance: formatMoney(totalClientBalance),
    pendingWithdrawalsCount: pendingRequests.length,
    pendingWithdrawalsAmount: formatMoney(pendingRequests.reduce((acc, item) => acc + Number(item.amount || 0), 0)),
    approvedWithdrawalsAmount: totalPaidWithdrawals,
    totalDeposited: formatMoney(totalDeposited),
    usersCount: clientUsers.length,
    clientsActive,
    clientsBlocked,
    openTradesExposure: formatMoney(openTradesExposure),
    totalLiability,
    brokerageBalance,
    brokerageStatus: brokerageBalance >= 0 ? "POSITIVE" : "NEGATIVE",
  };
}

function listClientAccountsData() {
  const withdrawalsByUser = new Map();
  db.withdrawals.forEach((item) => {
    if (item.status !== "PAID") return;
    withdrawalsByUser.set(item.userId, Number(withdrawalsByUser.get(item.userId) || 0) + Number(item.amount || 0));
  });

  const depositsByUser = new Map();
  Object.entries(db.pixCharges).forEach(([userId, charges]) => {
    const total = (charges || []).reduce((sum, charge) => {
      if (charge.credited) return sum + Number(charge.amount || 0);
      return sum;
    }, 0);
    depositsByUser.set(userId, total);
  });

  return db.users
    .filter((item) => !item.isAdmin)
    .map((user) => ({
      userId: user.id,
      name: user.name,
      email: user.email,
      cpf: user.cpf || "",
      pixKey: user.pixKey || "",
      address: user.address || "",
      isActive: user.isActive !== false,
      availableBalance: formatMoney(db.wallets[user.id]?.available || 0),
      totalDeposited: formatMoney(depositsByUser.get(user.id) || 0),
      totalWithdrawn: formatMoney(withdrawalsByUser.get(user.id) || 0),
      createdAt: user.createdAt || now(),
    }));
}

function validateUserProfileData({ name, email, cpf, pixKey, address }) {
  if (!String(name || "").trim()) return "Nome é obrigatório.";
  if (!String(email || "").includes("@")) return "E-mail inválido.";
  const normalizedCpf = onlyDigits(cpf);
  if (normalizedCpf.length !== 11) return "CPF inválido. Informe 11 dígitos.";
  if (!String(pixKey || "").trim()) return "Chave Pix é obrigatória.";
  if (String(address || "").trim().length < 8) return "Endereço residencial inválido.";
  return "";
}

async function handleApi(req, res, pathname) {
  applyApiCorsHeaders(req, res);
  apiMetrics.totalRequests += 1;
  apiMetrics.byRoute[pathname] = (apiMetrics.byRoute[pathname] || 0) + 1;

  if (isRateLimited(req)) {
    sendJson(res, 429, { error: "Muitas requisições. Tente novamente em instantes." });
    return;
  }

  if (!ensureSameOrigin(req)) {
    sendJson(res, 403, { error: "Origem inválida." });
    return;
  }

  if (pathname === "/api/health") {
    sendJson(res, 200, { ok: true, timestamp: now() });
    return;
  }

  if (pathname === "/api/metrics") {
    sendJson(res, 200, {
      ...apiMetrics,
      uptimeSeconds: Math.floor((now() - apiMetrics.startedAt) / 1000),
    });
    return;
  }

  if (pathname === "/api/auth/register" && req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      const name = String(body.name || "").trim();
      const email = normalizeEmail(body.email);
      const password = String(body.password || "").trim();
      const cpf = onlyDigits(body.cpf);
      const pixKey = String(body.pixKey || "").trim();
      const address = String(body.address || "").trim();

      const validationError = validateUserProfileData({ name, email, cpf, pixKey, address });
      if (validationError) {
        sendJson(res, 400, { error: validationError });
        return;
      }
      if (password.length < 6) {
        sendJson(res, 400, { error: "A senha deve ter pelo menos 6 caracteres." });
        return;
      }
      if (findUserByEmail(email)) {
        sendJson(res, 409, { error: "E-mail já cadastrado." });
        return;
      }

      const userId = randomId();
      const user = {
        id: userId,
        name,
        email,
        password,
        cpf,
        pixKey,
        address,
        isAdmin: false,
        isActive: true,
        createdAt: now(),
      };
      db.users.push(user);
      ensureWallet(userId);

      const token = createAuthToken(user.id);
      sendJson(res, 201, { user: publicUser(user), token });
    } catch {
      sendJson(res, 400, { error: "Payload inválido no cadastro." });
    }
    return;
  }

  if (pathname === "/api/auth/login" && req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      const email = normalizeEmail(body.email);
      const password = String(body.password || "");
      const user = findUserByEmail(email);

      if (!user || user.password !== password) {
        sendJson(res, 401, { error: "Credenciais inválidas." });
        return;
      }
      if (user.isActive === false) {
        sendJson(res, 403, { error: "Conta desativada. Fale com o suporte." });
        return;
      }

      const token = createAuthToken(user.id);
      sendJson(res, 200, { user: publicUser(user), token });
    } catch {
      sendJson(res, 400, { error: "Payload inválido no login." });
    }
    return;
  }

  if (pathname === "/api/auth/logout" && req.method === "POST") {
    const token = readBearerToken(req);
    if (token) deleteSession(token);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (pathname === "/api/auth/profile" && req.method === "GET") {
    const auth = requireAuth(req, res);
    if (!auth) return;
    sendJson(res, 200, publicUser(auth.user));
    return;
  }

  if (pathname === "/api/auth/profile" && req.method === "PUT") {
    const auth = requireAuth(req, res);
    if (!auth) return;

    try {
      const body = await readJsonBody(req);
      const name = String(body.name || "").trim();
      const email = normalizeEmail(body.email);
      const cpf = onlyDigits(body.cpf);
      const pixKey = String(body.pixKey || "").trim();
      const address = String(body.address || "").trim();

      const validationError = validateUserProfileData({ name, email, cpf, pixKey, address });
      if (validationError) {
        sendJson(res, 400, { error: validationError });
        return;
      }

      const duplicate = db.users.some(
        (item) => item.id !== auth.user.id && normalizeEmail(item.email) === email,
      );
      if (duplicate) {
        sendJson(res, 409, { error: "E-mail já está em uso por outra conta." });
        return;
      }

      auth.user.name = name;
      auth.user.email = email;
      auth.user.cpf = cpf;
      auth.user.pixKey = pixKey;
      auth.user.address = address;

      sendJson(res, 200, publicUser(auth.user));
    } catch {
      sendJson(res, 400, { error: "Payload inválido para perfil." });
    }
    return;
  }

  if (pathname === "/api/wallet/balance" && req.method === "GET") {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const wallet = ensureWallet(auth.user.id);
    sendJson(res, 200, { ...wallet, available: formatMoney(wallet.available) });
    return;
  }

  if (pathname === "/api/wallet/deposit" && req.method === "POST") {
    const auth = requireAuth(req, res);
    if (!auth) return;

    try {
      const body = await readJsonBody(req);
      const txid = String(body.txid || "").trim();
      if (!safeTxid(txid)) {
        sendJson(res, 400, { error: "TXID inválido." });
        return;
      }

      const ownerId = pixChargeOwners.get(txid);
      if (ownerId && ownerId !== auth.user.id) {
        sendJson(res, 403, { error: "Cobrança Pix pertence a outro usuário." });
        return;
      }

      const charge = runtimeChargeStatus.get(txid);
      if (!charge) {
        sendJson(res, 404, { error: "Cobrança Pix não encontrada." });
        return;
      }

      if (charge.status !== "PAID") {
        sendJson(res, 409, { error: "Pagamento ainda não confirmado." });
        return;
      }

      const wallet = ensureWallet(auth.user.id);
      const userCharges = db.pixCharges[auth.user.id] || [];
      let existingCharge = userCharges.find((item) => item.txid === txid);

      if (!existingCharge) {
        existingCharge = {
          txid,
          amount: Number(charge.amount || body.amount || 0),
          status: "PAID",
          createdAt: Number(charge.createdAt || now()),
          expiresAt: Number(charge.expiresAt || now()),
          copyPaste: charge.copyPaste || "",
          qrCodeBase64: charge.qrCodeBase64 || "",
          credited: false,
        };
        userCharges.unshift(existingCharge);
        db.pixCharges[auth.user.id] = userCharges;
      }

      if (!existingCharge.credited) {
        const amount = Number(existingCharge.amount || charge.amount || 0);
        wallet.available = formatMoney(Number(wallet.available || 0) + amount);
        existingCharge.credited = true;
        existingCharge.status = "PAID";

        recordTransaction(auth.user.id, {
          category: "deposit",
          eventType: "DEPOSIT_CREDITED",
          status: "CONFIRMED",
          amount,
          balanceAfter: wallet.available,
          referenceId: txid,
          description: "Depósito Pix confirmado",
          createdAt: now(),
        });
      }

      sendJson(res, 200, { available: formatMoney(wallet.available), currency: APP_CURRENCY });
    } catch {
      sendJson(res, 400, { error: "Payload inválido para depósito." });
    }
    return;
  }

  if (pathname === "/api/wallet/withdrawals" && req.method === "GET") {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const rows = db.withdrawals.filter((item) => item.userId === auth.user.id);
    sendJson(res, 200, rows);
    return;
  }

  if (pathname === "/api/wallet/withdrawals" && req.method === "POST") {
    const auth = requireAuth(req, res);
    if (!auth) return;

    try {
      const body = await readJsonBody(req);
      const amount = Number(body.amount);
      const wallet = ensureWallet(auth.user.id);

      if (!auth.user.cpf || !auth.user.pixKey || !auth.user.address || !auth.user.name || !auth.user.email) {
        sendJson(res, 400, {
          error: "Complete seus dados (nome, e-mail, CPF, chave Pix e endereço) antes de sacar.",
        });
        return;
      }

      if (!Number.isFinite(amount) || amount <= 0) {
        sendJson(res, 400, { error: "Valor de saque inválido." });
        return;
      }
      if (amount > wallet.available) {
        sendJson(res, 400, { error: "Saldo insuficiente para solicitar saque." });
        return;
      }

      wallet.available = formatMoney(wallet.available - amount);
      const request = {
        requestId: randomId(),
        userId: auth.user.id,
        userName: auth.user.name,
        userEmail: auth.user.email,
        cpf: auth.user.cpf,
        pixKey: auth.user.pixKey,
        address: auth.user.address,
        amount: formatMoney(amount),
        status: "PENDING",
        requestedAt: now(),
        processingAt: null,
        processedBy: null,
        approvedAt: null,
        approvedBy: null,
        rejectedAt: null,
        rejectedBy: null,
        rejectReason: "",
      };

      db.withdrawals.unshift(request);
      recordTransaction(auth.user.id, {
        category: "withdraw",
        eventType: "WITHDRAW_REQUESTED",
        status: "PENDING",
        amount: -amount,
        balanceAfter: wallet.available,
        referenceId: request.requestId,
        description: "Solicitação de saque criada",
        createdAt: request.requestedAt,
      });

      sendJson(res, 201, request);
    } catch {
      sendJson(res, 400, { error: "Payload inválido para saque." });
    }
    return;
  }

  if (pathname === "/api/wallet/transactions" && req.method === "GET") {
    const auth = requireAuth(req, res);
    if (!auth) return;
    sendJson(res, 200, listUserTransactions(auth.user.id));
    return;
  }

  if (pathname === "/api/trades" && req.method === "GET") {
    const auth = requireAuth(req, res);
    if (!auth) return;
    sendJson(res, 200, [...(db.trades[auth.user.id] || [])]);
    return;
  }

  if (pathname === "/api/trades" && req.method === "POST") {
    const auth = requireAuth(req, res);
    if (!auth) return;

    try {
      const body = await readJsonBody(req);
      const symbol = String(body.symbol || "").trim();
      const direction = String(body.direction || "").trim().toUpperCase();
      const expirySeconds = Number(body.expirySeconds);
      const amount = Number(body.amount);
      const openPrice = Number(body.openPrice);

      if (!symbol || !["CALL", "PUT"].includes(direction)) {
        sendJson(res, 400, { error: "Parâmetros de operação inválidos." });
        return;
      }
      if (!Number.isFinite(expirySeconds) || expirySeconds <= 0) {
        sendJson(res, 400, { error: "Expiração inválida." });
        return;
      }
      if (!Number.isFinite(amount) || amount <= 0) {
        sendJson(res, 400, { error: "Valor inválido para operação." });
        return;
      }

      const wallet = ensureWallet(auth.user.id);
      if (amount > wallet.available) {
        sendJson(res, 400, { error: "Saldo insuficiente para abrir operação." });
        return;
      }

      wallet.available = formatMoney(wallet.available - amount);
      const trade = {
        tradeId: randomId(),
        symbol,
        amount: formatMoney(amount),
        direction,
        expirySeconds,
        status: "OPEN",
        openPrice: Number.isFinite(openPrice) && openPrice > 0 ? openPrice : 0,
        closePrice: null,
        openedAt: now(),
        resolveAt: now() + expirySeconds * 1000,
        payoutAmount: 0,
        closedAt: null,
      };

      if (!db.trades[auth.user.id]) db.trades[auth.user.id] = [];
      db.trades[auth.user.id].unshift(trade);

      recordTransaction(auth.user.id, {
        category: "trade",
        eventType: "TRADE_OPENED",
        status: "OPEN",
        amount: -amount,
        balanceAfter: wallet.available,
        referenceId: trade.tradeId,
        description: `${trade.direction} ${trade.symbol} (${trade.expirySeconds}s)`,
        createdAt: trade.openedAt,
      });

      sendJson(res, 201, trade);
    } catch {
      sendJson(res, 400, { error: "Payload inválido para operação." });
    }
    return;
  }

  if (/^\/api\/trades\/[^/]+\/resolve$/.test(pathname) && req.method === "POST") {
    const auth = requireAuth(req, res);
    if (!auth) return;

    const tradeId = decodeURIComponent(pathname.split("/")[3] || "");
    const trade = (db.trades[auth.user.id] || []).find((item) => item.tradeId === tradeId);

    if (!trade) {
      sendJson(res, 404, { error: "Operação não encontrada." });
      return;
    }

    if (trade.status !== "OPEN") {
      sendJson(res, 200, trade);
      return;
    }

    if (now() < Number(trade.resolveAt || 0)) {
      sendJson(res, 200, trade);
      return;
    }

    try {
      const body = await readJsonBody(req);
      const candidatePrice = Number(body.currentPrice);
      const closePrice = Number.isFinite(candidatePrice) && candidatePrice > 0
        ? Number(candidatePrice.toFixed(8))
        : Number(trade.openPrice || 0);

      trade.closePrice = closePrice;
      const isWin = trade.direction === "CALL" ? closePrice >= trade.openPrice : closePrice <= trade.openPrice;
      trade.status = isWin ? "WIN" : "LOSS";
      trade.closedAt = now();

      const wallet = ensureWallet(auth.user.id);
      if (isWin) {
        trade.payoutAmount = formatMoney(trade.amount + trade.amount * PAYOUT_RATE);
        wallet.available = formatMoney(wallet.available + trade.payoutAmount);
        recordTransaction(auth.user.id, {
          category: "trade",
          eventType: "TRADE_WIN",
          status: "CONFIRMED",
          amount: trade.payoutAmount,
          balanceAfter: wallet.available,
          referenceId: trade.tradeId,
          description: `Trade WIN ${trade.symbol} (${trade.openPrice} -> ${trade.closePrice})`,
          createdAt: trade.closedAt,
        });
      } else {
        trade.payoutAmount = 0;
        recordTransaction(auth.user.id, {
          category: "trade",
          eventType: "TRADE_LOSS",
          status: "CONFIRMED",
          amount: 0,
          balanceAfter: wallet.available,
          referenceId: trade.tradeId,
          description: `Trade LOSS ${trade.symbol} (${trade.openPrice} -> ${trade.closePrice})`,
          createdAt: trade.closedAt,
        });
      }

      sendJson(res, 200, trade);
    } catch {
      sendJson(res, 400, { error: "Payload inválido para resolução de trade." });
    }
    return;
  }

  if (pathname === "/api/wallet/admin/stats" && req.method === "GET") {
    const auth = requireAuth(req, res, { adminOnly: true });
    if (!auth) return;
    sendJson(res, 200, buildAdminStats());
    return;
  }

  if (pathname === "/api/wallet/admin/withdrawals" && req.method === "GET") {
    const auth = requireAuth(req, res, { adminOnly: true });
    if (!auth) return;
    sendJson(res, 200, [...db.withdrawals]);
    return;
  }

  if (/^\/api\/wallet\/admin\/withdrawals\/[^/]+\/processing$/.test(pathname) && req.method === "POST") {
    const auth = requireAuth(req, res, { adminOnly: true });
    if (!auth) return;

    const requestId = decodeURIComponent(pathname.split("/")[5] || "");
    const request = db.withdrawals.find((item) => item.requestId === requestId);
    if (!request) {
      sendJson(res, 404, { error: "Solicitação de saque não encontrada." });
      return;
    }
    if (request.status === "PAID" || request.status === "REJECTED") {
      sendJson(res, 200, request);
      return;
    }

    request.status = "PROCESSING";
    request.processingAt = now();
    request.processedBy = auth.user.id;

    recordTransaction(request.userId, {
      category: "withdraw",
      eventType: "WITHDRAW_PROCESSING",
      status: "PENDING",
      amount: 0,
      balanceAfter: formatMoney(db.wallets[request.userId]?.available || 0),
      referenceId: request.requestId,
      description: "Saque em processamento pelo administrador",
      createdAt: request.processingAt,
    });

    sendJson(res, 200, request);
    return;
  }

  if (/^\/api\/wallet\/admin\/withdrawals\/[^/]+\/pay$/.test(pathname) && req.method === "POST") {
    const auth = requireAuth(req, res, { adminOnly: true });
    if (!auth) return;

    const requestId = decodeURIComponent(pathname.split("/")[5] || "");
    const request = db.withdrawals.find((item) => item.requestId === requestId);
    if (!request) {
      sendJson(res, 404, { error: "Solicitação de saque não encontrada." });
      return;
    }
    if (request.status === "PAID") {
      sendJson(res, 200, request);
      return;
    }
    if (request.status === "REJECTED") {
      sendJson(res, 400, { error: "Saque já rejeitado." });
      return;
    }

    request.status = "PAID";
    request.approvedAt = now();
    request.approvedBy = auth.user.id;

    recordTransaction(request.userId, {
      category: "withdraw",
      eventType: "WITHDRAW_PAID",
      status: "CONFIRMED",
      amount: 0,
      balanceAfter: formatMoney(db.wallets[request.userId]?.available || 0),
      referenceId: request.requestId,
      description: "Saque pago manualmente pelo administrador",
      createdAt: request.approvedAt,
    });

    sendJson(res, 200, request);
    return;
  }

  if (/^\/api\/wallet\/admin\/withdrawals\/[^/]+\/reject$/.test(pathname) && req.method === "POST") {
    const auth = requireAuth(req, res, { adminOnly: true });
    if (!auth) return;

    const requestId = decodeURIComponent(pathname.split("/")[5] || "");
    const request = db.withdrawals.find((item) => item.requestId === requestId);
    if (!request) {
      sendJson(res, 404, { error: "Solicitação de saque não encontrada." });
      return;
    }

    if (request.status === "PAID") {
      sendJson(res, 400, { error: "Saque já pago, não pode ser rejeitado." });
      return;
    }

    if (request.status === "REJECTED") {
      sendJson(res, 200, request);
      return;
    }

    try {
      const body = await readJsonBody(req);
      const reason = String(body.reason || "").trim() || "Rejeitado pelo administrador";
      const wallet = ensureWallet(request.userId);

      wallet.available = formatMoney(wallet.available + Number(request.amount || 0));
      request.status = "REJECTED";
      request.rejectedAt = now();
      request.rejectedBy = auth.user.id;
      request.rejectReason = reason;

      recordTransaction(request.userId, {
        category: "withdraw",
        eventType: "WITHDRAW_REJECTED_REFUND",
        status: "CONFIRMED",
        amount: Number(request.amount || 0),
        balanceAfter: wallet.available,
        referenceId: request.requestId,
        description: `Saque rejeitado e valor estornado. Motivo: ${reason}`,
        createdAt: request.rejectedAt,
      });

      sendJson(res, 200, request);
    } catch {
      sendJson(res, 400, { error: "Payload inválido para rejeição de saque." });
    }
    return;
  }

  if (pathname === "/api/wallet/admin/transactions" && req.method === "GET") {
    const auth = requireAuth(req, res, { adminOnly: true });
    if (!auth) return;
    sendJson(res, 200, [...db.transactions]);
    return;
  }

  if (pathname === "/api/wallet/admin/clients" && req.method === "GET") {
    const auth = requireAuth(req, res, { adminOnly: true });
    if (!auth) return;
    sendJson(res, 200, listClientAccountsData());
    return;
  }

  if (/^\/api\/wallet\/admin\/clients\/[^/]+$/.test(pathname) && req.method === "PATCH") {
    const auth = requireAuth(req, res, { adminOnly: true });
    if (!auth) return;

    const userId = decodeURIComponent(pathname.split("/").pop() || "");
    const user = db.users.find((item) => item.id === userId && !item.isAdmin);
    if (!user) {
      sendJson(res, 404, { error: "Cliente não encontrado." });
      return;
    }

    try {
      const body = await readJsonBody(req);
      const name = String(body.name ?? user.name).trim();
      const email = normalizeEmail(body.email ?? user.email);
      const cpf = onlyDigits(body.cpf ?? user.cpf);
      const pixKey = String(body.pixKey ?? user.pixKey).trim();
      const address = String(body.address ?? user.address).trim();
      const isActive = body.isActive === undefined ? user.isActive !== false : Boolean(body.isActive);
      const balanceAdjustment = Number(body.balanceAdjustment || 0);

      if (!name || !email) {
        sendJson(res, 400, { error: "Nome e e-mail são obrigatórios." });
        return;
      }

      const duplicateEmail = db.users.some(
        (item) => item.id !== user.id && normalizeEmail(item.email) === email,
      );
      if (duplicateEmail) {
        sendJson(res, 409, { error: "E-mail já está em uso por outra conta." });
        return;
      }

      user.name = name;
      user.email = email;
      user.cpf = cpf;
      user.pixKey = pixKey;
      user.address = address;
      user.isActive = isActive;

      const wallet = ensureWallet(user.id);
      if (Number.isFinite(balanceAdjustment) && Math.abs(balanceAdjustment) > 0.000001) {
        const nextBalance = formatMoney(wallet.available + balanceAdjustment);
        if (nextBalance < 0) {
          sendJson(res, 400, { error: "Ajuste inválido: saldo do cliente ficaria negativo." });
          return;
        }

        wallet.available = nextBalance;
        recordTransaction(user.id, {
          category: "admin",
          eventType: "ADMIN_BALANCE_ADJUSTMENT",
          status: "CONFIRMED",
          amount: formatMoney(balanceAdjustment),
          balanceAfter: wallet.available,
          referenceId: `ADMIN-${auth.user.id.slice(0, 6)}`,
          description: `Ajuste manual de saldo por administrador (${balanceAdjustment >= 0 ? "+" : ""}${formatMoney(balanceAdjustment).toFixed(2)})`,
          createdAt: now(),
        });
      }

      sendJson(res, 200, {
        userId: user.id,
        name: user.name,
        email: user.email,
        cpf: user.cpf || "",
        pixKey: user.pixKey || "",
        address: user.address || "",
        isActive: user.isActive !== false,
        availableBalance: formatMoney(wallet.available),
        createdAt: user.createdAt || now(),
      });
    } catch {
      sendJson(res, 400, { error: "Payload inválido para atualização de cliente." });
    }
    return;
  }

  if (pathname === "/api/admin/pix-config/status" && req.method === "GET") {
    if (!canAccessAdminConfig(req)) {
      sendJson(res, 401, { error: "Acesso negado ao painel de configuração Pix." });
      return;
    }

    const cfg = getPixConfig();
    sendJson(res, 200, {
      configured: Boolean(cfg.baseUrl && cfg.apiToken),
      source: runtimePixConfig.apiToken ? "runtime" : "env",
      baseUrl: cfg.baseUrl || "",
      createPath: cfg.createPath || "",
      statusPathTemplate: cfg.statusPathTemplate || "",
      authScheme: cfg.authScheme || "Bearer",
      offerHash: cfg.offerHash || "",
      productHash: cfg.productHash || "",
      productTitle: cfg.productTitle || "",
      productCover: cfg.productCover || "",
      productSalePage: cfg.productSalePage || "",
      hasAdminSecret: Boolean(ADMIN_PANEL_SECRET),
    });
    return;
  }

  if (pathname === "/api/admin/pix-config" && req.method === "POST") {
    if (!canAccessAdminConfig(req)) {
      sendJson(res, 401, { error: "Acesso negado ao painel de configuração Pix." });
      return;
    }

    try {
      const body = await readJsonBody(req);
      const baseUrl = String(body.baseUrl || "").trim();
      const createPath = String(body.createPath || "").trim();
      const statusPathTemplate = String(body.statusPathTemplate || "").trim();
      const authScheme = String(body.authScheme || "Bearer").trim();
      const apiToken = String(body.apiToken || "").trim();
      const offerHash = String(body.offerHash || "").trim();
      const productHash = String(body.productHash || "").trim();
      const productTitle = String(body.productTitle || "").trim();
      const productCover = String(body.productCover || "").trim();
      const productSalePage = String(body.productSalePage || "").trim();

      if (!baseUrl || !createPath || !statusPathTemplate || !authScheme || !apiToken) {
        sendJson(res, 400, { error: "Preencha todos os campos de configuração Pix." });
        return;
      }

      const forTribo = String(baseUrl).includes("tribopay.com.br");
      if (forTribo && (!offerHash || !productHash)) {
        sendJson(res, 400, { error: "Para TriboPay, informe offer_hash e product_hash." });
        return;
      }

      try {
        new URL(baseUrl);
      } catch {
        sendJson(res, 400, { error: "URL base do provedor Pix inválida." });
        return;
      }

      runtimePixConfig.baseUrl = baseUrl;
      runtimePixConfig.createPath = createPath;
      runtimePixConfig.statusPathTemplate = statusPathTemplate;
      runtimePixConfig.authScheme = authScheme;
      runtimePixConfig.apiToken = apiToken;
      runtimePixConfig.offerHash = offerHash;
      runtimePixConfig.productHash = productHash;
      runtimePixConfig.productTitle = productTitle;
      runtimePixConfig.productCover = productCover;
      runtimePixConfig.productSalePage = productSalePage;

      sendJson(res, 200, { ok: true, message: "Configuração Pix salva em runtime no servidor." });
    } catch {
      sendJson(res, 400, { error: "Payload inválido para configuração Pix." });
    }
    return;
  }

  if (pathname === "/api/pix/charges" && req.method === "POST") {
    const clientUser = getUserFromClientSessionHeader(req);
    if (!clientUser || clientUser.isActive === false) {
      sendJson(res, 401, { error: "Sessão do cliente inválida." });
      return;
    }

    try {
      const body = await readJsonBody(req);
      const amount = Number(body.amount);

      if (!Number.isFinite(amount) || amount < 1 || amount > 500000) {
        sendJson(res, 400, { error: "Valor inválido para cobrança Pix." });
        return;
      }

      const cfg = getPixConfig();
      let normalized;

      if (!cfg.baseUrl || !cfg.apiToken) {
        const txid = `PIX-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
        normalized = {
          txid,
          amount: formatMoney(amount),
          status: "PENDING",
          copyPaste: `00020126580014BR.GOV.BCB.PIX0136${txid}5204000053039865802BR5924BYE TRADER MOCK6009SAO PAULO62070503***6304ABCD`,
          qrCodeBase64:
            "data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPScxODAnIGhlaWdodD0nMTgwJz48cmVjdCB3aWR0aD0nMTgwJyBoZWlnaHQ9JzE4MCcgZmlsbD0nI2Y2ZjhmYScvPjxyZWN0IHg9JzE2JyB5PScxNicgd2lkdGg9JzQ4JyBoZWlnaHQ9JzQ4JyBmaWxsPScjMDAwJy8+PHJlY3QgeD0nMTE2JyB5PScxNicgd2lkdGg9JzQ4JyBoZWlnaHQ9JzQ4JyBmaWxsPScjMDAwJy8+PHJlY3QgeD0nMTYnIHk9JzExNicgd2lkdGg9JzQ4JyBoZWlnaHQ9JzQ4JyBmaWxsPScjMDAwJy8+PHJlY3QgeD0nODAnIHk9JzgwJyB3aWR0aD0nMTYnIGhlaWdodD0nMTYnIGZpbGw9JyMwMDAnLz48cmVjdCB4PScxMDAnIHk9JzEwMCcgd2lkdGg9JzE2JyBoZWlnaHQ9JzE2JyBmaWxsPScjMDAwJy8+PHRleHQgeD0nOTAnIHk9JzE3MicgZm9udC1mYW1pbHk9J21vbm9zcGFjZScgZm9udC1zaXplPScxMCcgdGV4dC1hbmNob3I9J21pZGRsZScgZmlsbD0nIzExMSc+UElYIE1PQ0s8L3RleHQ+PC9zdmc+",
          createdAt: now(),
          expiresAt: now() + 10 * 60 * 1000,
        };
        runtimeChargeStatus.set(normalized.txid, normalized);
      } else {
      let payload = { amount };
      if (isTriboPayConfig(cfg)) {
        const cents = Math.round(amount * 100);
        const customer = body.customer || {};
        payload = {
          amount: cents,
          offer_hash: cfg.offerHash,
          payment_method: "pix",
          customer: {
            name: String(customer.name || clientUser.name || "Cliente Bye Trader"),
            email: String(customer.email || clientUser.email || "cliente@byetrader.com"),
            phone_number: onlyDigits(customer.phone_number || "11999999999"),
            document: onlyDigits(customer.document || clientUser.cpf || "00000000000"),
          },
          cart: [
            {
              offer_hash: cfg.offerHash,
              product_hash: cfg.productHash,
              title: cfg.productTitle,
              cover: cfg.productCover || undefined,
              sale_page: cfg.productSalePage || undefined,
              price: cents,
              quantity: 1,
              operation_type: 1,
              tangible: false,
            },
            ],
          };
        }

        const providerData = await callPixProvider(cfg.createPath, "POST", payload);
        normalized = normalizeCreateResponse(providerData, amount, cfg);
      }

      pixChargeOwners.set(normalized.txid, clientUser.id);
      if (!db.pixCharges[clientUser.id]) db.pixCharges[clientUser.id] = [];
      db.pixCharges[clientUser.id].unshift({
        txid: normalized.txid,
        amount: Number(normalized.amount || amount),
        status: normalized.status || "PENDING",
        createdAt: normalized.createdAt || now(),
        expiresAt: normalized.expiresAt || now() + 10 * 60 * 1000,
        copyPaste: normalized.copyPaste || "",
        qrCodeBase64: normalized.qrCodeBase64 || "",
        credited: false,
      });

      recordTransaction(clientUser.id, {
        category: "deposit",
        eventType: "DEPOSIT_CREATED",
        status: "PENDING",
        amount: Number(normalized.amount || amount),
        balanceAfter: formatMoney(db.wallets[clientUser.id]?.available || 0),
        referenceId: normalized.txid,
        description: "Cobrança Pix criada",
        createdAt: normalized.createdAt || now(),
      });

      sendJson(res, 201, normalized);
    } catch (error) {
      const status = error.statusCode && Number.isInteger(error.statusCode) ? error.statusCode : 500;
      const providerMessage = readProviderErrorMessage(error.details);
      sendJson(res, status, {
        error: providerMessage || (status >= 500 ? "Falha ao gerar cobrança Pix." : "Erro na solicitação Pix."),
      });
    }
    return;
  }

  if (pathname.startsWith("/api/pix/charges/") && req.method === "GET") {
    const clientUser = getUserFromClientSessionHeader(req);
    if (!clientUser || clientUser.isActive === false) {
      sendJson(res, 401, { error: "Sessão do cliente inválida." });
      return;
    }

    const txid = decodeURIComponent(pathname.split("/").pop() || "");
    if (!safeTxid(txid)) {
      sendJson(res, 400, { error: "TXID inválido." });
      return;
    }

    const ownerId = pixChargeOwners.get(txid);
    if (ownerId && ownerId !== clientUser.id && !clientUser.isAdmin) {
      sendJson(res, 403, { error: "Cobrança Pix pertence a outro usuário." });
      return;
    }

    try {
      const cached = runtimeChargeStatus.get(txid);
      if (cached && (cached.status === "PAID" || cached.status === "EXPIRED")) {
        sendJson(res, 200, { txid, status: cached.status });
        return;
      }

      const cfg = getPixConfig();
      if (!cfg.statusPathTemplate || !cfg.baseUrl || !cfg.apiToken) {
        if (cached?.status !== "PAID" && cached?.createdAt && now() - cached.createdAt > 7000) {
          runtimeChargeStatus.set(txid, { ...cached, status: "PAID" });
        }
        const status = runtimeChargeStatus.get(txid)?.status || cached?.status || "PENDING";
        sendJson(res, 200, { txid, status });
        return;
      }

      const statusPath = cfg.statusPathTemplate.replace("{txid}", encodeURIComponent(txid));
      const providerData = await callPixProvider(statusPath, "GET");
      const normalized = normalizeStatusResponse(providerData, txid);
      runtimeChargeStatus.set(txid, { ...(cached || {}), ...normalized, updatedAt: now() });
      sendJson(res, 200, normalized);
    } catch (error) {
      const status = error.statusCode && Number.isInteger(error.statusCode) ? error.statusCode : 500;
      sendJson(res, status, {
        error: status >= 500 ? "Falha ao consultar status Pix." : "Erro na consulta de status Pix.",
      });
    }
    return;
  }

  if (pathname === "/api/pix/webhook" && req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      const txid = String(body.transaction_hash || body.txid || "").trim();
      if (!txid) {
        sendJson(res, 400, { error: "transaction_hash ausente." });
        return;
      }

      const status = mapPixStatus(body.status);
      const amountCents = Number(body.amount || 0);
      const amount = Number.isFinite(amountCents) ? amountCents / 100 : 0;
      const existing = runtimeChargeStatus.get(txid) || {};
      runtimeChargeStatus.set(txid, {
        ...existing,
        txid,
        status,
        amount: existing.amount || amount,
        paymentMethod: body.payment_method || "pix",
        paidAt: body.paid_at || null,
        updatedAt: now(),
      });

      sendJson(res, 200, { ok: true });
    } catch {
      sendJson(res, 400, { error: "Payload inválido no webhook Pix." });
    }
    return;
  }

  sendJson(res, 404, { error: "Rota não encontrada." });
}

function resolveFilePath(pathname) {
  const safePath = path.normalize(pathname).replace(/^([.][.][/\\])+/, "");
  const rawPath = safePath === "/" ? "/index.html" : safePath;
  const filePath = path.resolve(ROOT_DIR, `.${rawPath}`);
  if (!filePath.startsWith(ROOT_DIR)) return null;
  return filePath;
}

function isSensitivePath(pathname, filePath) {
  const normalizedPath = String(pathname || "");
  const segments = normalizedPath.split("/").filter(Boolean);
  if (segments.some((segment) => segment.startsWith("."))) return true;
  if (segments[0] === "backups") return true;

  const baseName = path.basename(filePath).toLowerCase();
  if (
    baseName === ".env" ||
    baseName.startsWith(".env.") ||
    baseName === ".gitignore" ||
    baseName.startsWith("env-backup-") ||
    baseName.startsWith("backup-byetrader-")
  ) {
    return true;
  }

  if (/(\.pem|\.key|\.p12|\.pfx|\.sql|\.sqlite|\.db|\.tar|\.gz|\.zip)$/i.test(baseName)) {
    return true;
  }

  return false;
}

async function serveStatic(req, res, pathname) {
  const filePath = resolveFilePath(pathname);
  if (!filePath) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  if (isSensitivePath(pathname, filePath)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const info = await stat(filePath);
    if (info.isDirectory()) throw new Error("Not file");

    const ext = path.extname(filePath);
    const type = MIME_TYPES[ext] || "application/octet-stream";
    const content = await readFile(filePath);
    setSecurityHeaders(res, false);
    res.writeHead(200, { "Content-Type": type });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    res.end(content);
  } catch {
    const fallback = path.resolve(ROOT_DIR, "index.html");
    try {
      const html = await readFile(fallback);
      setSecurityHeaders(res, false);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      if (req.method === "HEAD") {
        res.end();
        return;
      }
      res.end(html);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  }
}

const server = createServer(async (req, res) => {
  const method = req.method || "GET";
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname;

  if (method === "OPTIONS" && pathname.startsWith("/api/")) {
    applyApiCorsHeaders(req, res);
    setSecurityHeaders(res, true);
    res.writeHead(204);
    res.end();
    return;
  }

  if (pathname.startsWith("/api/")) {
    await handleApi(req, res, pathname);
    return;
  }

  if (!["GET", "HEAD"].includes(method)) {
    res.writeHead(405);
    res.end("Method not allowed");
    return;
  }

  await serveStatic(req, res, pathname);
});

server.listen(PORT, () => {
  console.log(`Secure app server running on http://localhost:${PORT}`);
});
