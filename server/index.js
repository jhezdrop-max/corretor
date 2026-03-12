import { createServer } from "node:http";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
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
const PIX_PROVIDER_BASE_URL =
  process.env.PIX_PROVIDER_BASE_URL || "https://api.tribopay.com.br/api/public/v1/";
const PIX_CREATE_PATH = process.env.PIX_CREATE_PATH || "transactions";
const PIX_STATUS_PATH_TEMPLATE = process.env.PIX_STATUS_PATH_TEMPLATE || "transactions/{txid}";
const PIX_PROVIDER = String(process.env.PIX_PROVIDER || "tribopay").toLowerCase();
const PIX_API_TOKEN = process.env.PIX_API_TOKEN || "";
const PIX_AUTH_SCHEME = process.env.PIX_AUTH_SCHEME || "Bearer";
const PIX_SEND_AUTH_HEADER = String(process.env.PIX_SEND_AUTH_HEADER || "0") === "1";
const CARD_PROVIDER_BASE_URL = process.env.CARD_PROVIDER_BASE_URL || "https://api.pagar.me/core/v5/";
const CARD_CREATE_PATH = process.env.CARD_CREATE_PATH || "orders";
const CARD_STATUS_PATH_TEMPLATE = process.env.CARD_STATUS_PATH_TEMPLATE || "orders/{txid}";
const CARD_PROVIDER = String(process.env.CARD_PROVIDER || "pagarme").toLowerCase();
const CARD_API_TOKEN = process.env.CARD_API_TOKEN || PIX_API_TOKEN;
const CARD_AUTH_SCHEME = process.env.CARD_AUTH_SCHEME || "Basic";
const DISABLE_PAGARME_PIX = String(process.env.DISABLE_PAGARME_PIX || "1") !== "0";
const PIX_TIMEOUT_MS = Number(process.env.PIX_TIMEOUT_MS || 12000);
const ADMIN_PANEL_SECRET = process.env.ADMIN_PANEL_SECRET || "";
const APP_CURRENCY = process.env.APP_CURRENCY || "BRL";
const PAYOUT_RATE = Number(process.env.TRADE_PAYOUT_RATE || 0.8);
const MIN_DEPOSIT_AMOUNT = Number(process.env.MIN_DEPOSIT_AMOUNT || 30);
const MIN_WITHDRAW_AMOUNT = Number(process.env.MIN_WITHDRAW_AMOUNT || 80);
const WITHDRAW_FEE_RATE = Number(process.env.WITHDRAW_FEE_RATE || 0.089);
const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS || 12 * 60 * 60 * 1000);
const ADMIN_DEFAULT_PASSWORD = String(process.env.ADMIN_DEFAULT_PASSWORD || "7392841");
const DEMO_DEFAULT_PASSWORD = String(process.env.DEMO_DEFAULT_PASSWORD || "123456");
const API_ALLOWED_ORIGINS = String(process.env.API_ALLOWED_ORIGINS || "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
const DB_FILE_PATH = process.env.DB_FILE_PATH || path.resolve(ROOT_DIR, "data", "byetrader-db.json");
const DB_AUTOSAVE_INTERVAL_MS = Number(process.env.DB_AUTOSAVE_INTERVAL_MS || 2000);

const runtimePixConfig = {
  provider: "",
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

const DEFAULT_AWARDS = [
  {
    id: "award-10000",
    goal: 10000,
    title: "Premiação 1",
    description: "R$ 10.000,00 em saques sobre ganhos em operações.",
    rewards: ["Reconhecimento de nível inicial"],
    imageUrl: "",
    imageAlt: "Premiação de R$ 10.000",
  },
  {
    id: "award-100000",
    goal: 100000,
    title: "Premiação 2",
    description: "R$ 100.000,00 em saques sobre ganhos em operações.",
    rewards: ["1 iPhone 17 Pro Max", "1 caneca personalizada"],
    imageUrl: "",
    imageAlt: "Premiação de R$ 100.000",
  },
  {
    id: "award-500000",
    goal: 500000,
    title: "Premiação 3",
    description: "R$ 500.000,00 em saques sobre ganhos em operações.",
    rewards: ["1 iPhone 17 Pro Max", "1 MacBook M2"],
    imageUrl: "",
    imageAlt: "Premiação de R$ 500.000",
  },
  {
    id: "award-1000000",
    goal: 1000000,
    title: "Premiação 4",
    description: "R$ 1.000.000,00 em saques sobre ganhos em operações.",
    rewards: ["1 iPhone 17 Pro Max", "1 MacBook M2", "Viagem para o Chile (2 pessoas, tudo pago)"],
    imageUrl: "",
    imageAlt: "Premiação de R$ 1.000.000",
  },
];

const BANNER_SLOTS = [
  "dashboard_after_awards",
  "awards_before_progress",
  "deposit_after_generate",
  "trade_before_history",
  "bonus_bottom",
];

const DEFAULT_CONTENT_CONFIG = {
  banners: {
    dashboard_after_awards: { enabled: false, title: "", text: "", imageUrl: "", linkUrl: "" },
    awards_before_progress: { enabled: false, title: "", text: "", imageUrl: "", linkUrl: "" },
    deposit_after_generate: { enabled: false, title: "", text: "", imageUrl: "", linkUrl: "" },
    trade_before_history: { enabled: false, title: "", text: "", imageUrl: "", linkUrl: "" },
    bonus_bottom: { enabled: false, title: "", text: "", imageUrl: "", linkUrl: "" },
  },
  bonusCpa: {
    pageTitle: "Bônus e CPA",
    pageText:
      "Programa de afiliados com CPA fixo no 1º depósito e comissão percentual nos próximos depósitos do indicado.",
    cpaValue: 20,
    recurringRatePct: 20,
  },
};

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
        password: ADMIN_DEFAULT_PASSWORD,
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
    settings: {
      awards: DEFAULT_AWARDS.map((item) => ({ ...item })),
      pixConfig: {},
      content: JSON.parse(JSON.stringify(DEFAULT_CONTENT_CONFIG)),
    },
    supportTickets: [],
    affiliateApplications: [],
    affiliates: {},
  };
}

function normalizeAwardsConfig(value) {
  const source = Array.isArray(value) && value.length ? value : DEFAULT_AWARDS;
  return source
    .map((item, index) => {
      const fallback = DEFAULT_AWARDS[index] || DEFAULT_AWARDS[DEFAULT_AWARDS.length - 1];
      const rewards = Array.isArray(item.rewards)
        ? item.rewards.map((entry) => String(entry || "").trim()).filter(Boolean)
        : fallback.rewards;

      return {
        id: String(item.id || fallback.id || `award-${index + 1}`),
        goal: Number(item.goal || fallback.goal || 0),
        title: String(item.title || fallback.title || `Premiação ${index + 1}`),
        description: String(item.description || fallback.description || ""),
        rewards,
        imageUrl: String(item.imageUrl || ""),
        imageAlt: String(item.imageAlt || item.title || fallback.title || "Premiação"),
      };
    })
    .filter((item) => Number.isFinite(item.goal) && item.goal > 0);
}

function normalizeContentConfig(value) {
  const source = value && typeof value === "object" ? value : {};
  const sourceBanners = source.banners && typeof source.banners === "object" ? source.banners : {};
  const banners = {};

  for (const slot of BANNER_SLOTS) {
    const item = sourceBanners[slot] && typeof sourceBanners[slot] === "object" ? sourceBanners[slot] : {};
    banners[slot] = {
      enabled: Boolean(item.enabled),
      title: String(item.title || ""),
      text: String(item.text || ""),
      imageUrl: String(item.imageUrl || ""),
      linkUrl: String(item.linkUrl || ""),
    };
  }

  const bonusRaw = source.bonusCpa && typeof source.bonusCpa === "object" ? source.bonusCpa : {};
  const cpaValueRaw = Number(bonusRaw.cpaValue);
  const recurringRateRaw = Number(bonusRaw.recurringRatePct);

  return {
    banners,
    bonusCpa: {
      pageTitle: String(bonusRaw.pageTitle || DEFAULT_CONTENT_CONFIG.bonusCpa.pageTitle),
      pageText: String(bonusRaw.pageText || DEFAULT_CONTENT_CONFIG.bonusCpa.pageText),
      cpaValue:
        Number.isFinite(cpaValueRaw) && cpaValueRaw >= 0
          ? formatMoney(cpaValueRaw)
          : DEFAULT_CONTENT_CONFIG.bonusCpa.cpaValue,
      recurringRatePct:
        Number.isFinite(recurringRateRaw) && recurringRateRaw >= 0
          ? formatMoney(recurringRateRaw)
          : DEFAULT_CONTENT_CONFIG.bonusCpa.recurringRatePct,
    },
  };
}

function normalizeDb(input) {
  const seeded = seedDb();
  const merged = {
    ...seeded,
    ...(input && typeof input === "object" ? input : {}),
  };

  merged.users = Array.isArray(merged.users) ? merged.users : seeded.users;
  merged.wallets = merged.wallets && typeof merged.wallets === "object" ? merged.wallets : seeded.wallets;
  merged.trades = merged.trades && typeof merged.trades === "object" ? merged.trades : seeded.trades;
  merged.pixCharges =
    merged.pixCharges && typeof merged.pixCharges === "object" ? merged.pixCharges : seeded.pixCharges;
  merged.withdrawals = Array.isArray(merged.withdrawals) ? merged.withdrawals : [];
  merged.transactions = Array.isArray(merged.transactions) ? merged.transactions : [];
  merged.settings = merged.settings && typeof merged.settings === "object" ? merged.settings : {};
  merged.settings.awards = normalizeAwardsConfig(merged.settings.awards);
  merged.settings.pixConfig =
    merged.settings.pixConfig && typeof merged.settings.pixConfig === "object"
      ? merged.settings.pixConfig
      : {};
  merged.settings.content = normalizeContentConfig(merged.settings.content);
  merged.supportTickets = Array.isArray(merged.supportTickets) ? merged.supportTickets : [];
  merged.affiliateApplications = Array.isArray(merged.affiliateApplications)
    ? merged.affiliateApplications
    : [];
  merged.affiliates = merged.affiliates && typeof merged.affiliates === "object" ? merged.affiliates : {};
  merged.withdrawals = merged.withdrawals.map((item) => {
    const amount = formatMoney(Number(item.amount || 0));
    const feeAmount = formatMoney(Number(item.feeAmount || 0));
    const totalDebit = formatMoney(Number(item.totalDebit || amount + feeAmount));
    return {
      ...item,
      amount,
      feeAmount,
      totalDebit,
    };
  });

  const byEmail = (email) =>
    merged.users.find((item) => normalizeEmail(item.email) === normalizeEmail(email));
  const startedAt = now();

  if (!byEmail("demo@byetrader.com")) {
    const demoUserId = randomId();
    merged.users.push({
      id: demoUserId,
      name: "Cliente Demo",
      email: "demo@byetrader.com",
      password: "123456",
      cpf: "12345678909",
      pixKey: "demo@byetrader.com",
      address: "Rua Exemplo, 100 - Centro, São Paulo/SP",
      isAdmin: false,
      isActive: true,
      referredByAffiliateId: "",
      firstDepositAt: 0,
      createdAt: startedAt,
    });
  }

  if (!byEmail("admin@byetrader.com")) {
    const adminUserId = randomId();
    merged.users.push({
      id: adminUserId,
      name: "Administrador",
      email: "admin@byetrader.com",
      password: ADMIN_DEFAULT_PASSWORD,
      cpf: "00000000000",
      pixKey: "admin@byetrader.com",
      address: "Sede Administrativa",
      isAdmin: true,
      isActive: true,
      referredByAffiliateId: "",
      firstDepositAt: 0,
      createdAt: startedAt,
    });
  }

  for (const user of merged.users) {
    user.referredByAffiliateId = String(user.referredByAffiliateId || "");
    user.firstDepositAt = Number(user.firstDepositAt || 0);
    if (!merged.wallets[user.id]) {
      merged.wallets[user.id] = { available: user.isAdmin ? 0 : 1000, currency: APP_CURRENCY };
    }
    if (!merged.trades[user.id]) merged.trades[user.id] = [];
    if (!merged.pixCharges[user.id]) merged.pixCharges[user.id] = [];
    if (!merged.affiliates[user.id]) {
      merged.affiliates[user.id] = {
        userId: user.id,
        status: "NONE",
        whatsapp: "",
        referralCode: "",
        totalCpa: 0,
        referredDepositors: 0,
        depositorsCredited: [],
        approvedAt: 0,
        rejectedAt: 0,
      };
    } else {
      const affiliate = merged.affiliates[user.id];
      affiliate.userId = user.id;
      affiliate.status = String(affiliate.status || "NONE");
      affiliate.whatsapp = String(affiliate.whatsapp || "");
      affiliate.referralCode = String(affiliate.referralCode || "");
      affiliate.totalCpa = formatMoney(Number(affiliate.totalCpa || 0));
      affiliate.referredDepositors = Number(affiliate.referredDepositors || 0);
      affiliate.depositorsCredited = Array.isArray(affiliate.depositorsCredited)
        ? affiliate.depositorsCredited.map((entry) => String(entry))
        : [];
      affiliate.approvedAt = Number(affiliate.approvedAt || 0);
      affiliate.rejectedAt = Number(affiliate.rejectedAt || 0);
    }
  }

  return merged;
}

async function readDbFromDisk() {
  try {
    if (!existsSync(DB_FILE_PATH)) return seedDb();
    const raw = await readFile(DB_FILE_PATH, "utf-8");
    if (!raw.trim()) return seedDb();
    return normalizeDb(JSON.parse(raw));
  } catch {
    return seedDb();
  }
}

let db = await readDbFromDisk();
let dbDirty = false;
let dbSaving = false;

if (!existsSync(DB_FILE_PATH)) {
  dbDirty = true;
}

const adminUser = db.users.find((item) => normalizeEmail(item.email) === "admin@byetrader.com");
if (adminUser && ADMIN_DEFAULT_PASSWORD && adminUser.password !== ADMIN_DEFAULT_PASSWORD) {
  adminUser.password = ADMIN_DEFAULT_PASSWORD;
  dbDirty = true;
}
const demoUser = db.users.find((item) => normalizeEmail(item.email) === "demo@byetrader.com");
if (demoUser && DEMO_DEFAULT_PASSWORD && demoUser.password !== DEMO_DEFAULT_PASSWORD) {
  demoUser.password = DEMO_DEFAULT_PASSWORD;
  dbDirty = true;
}

function markDbDirty() {
  dbDirty = true;
}

async function saveDbIfDirty() {
  if (!dbDirty || dbSaving) return;
  dbSaving = true;

  try {
    const folder = path.dirname(DB_FILE_PATH);
    await mkdir(folder, { recursive: true });
    await writeFile(DB_FILE_PATH, JSON.stringify(db, null, 2), "utf-8");
    dbDirty = false;
  } catch (error) {
    console.error("Erro ao salvar banco local:", error?.message || error);
  } finally {
    dbSaving = false;
  }
}

function findUserById(userId) {
  return db.users.find((item) => item.id === userId) || null;
}

function findUserByEmail(email) {
  const normalized = normalizeEmail(email);
  return db.users.find((item) => normalizeEmail(item.email) === normalized) || null;
}

function ensureWallet(userId) {
  if (!db.wallets[userId]) {
    db.wallets[userId] = { available: 0, currency: APP_CURRENCY };
    markDbDirty();
  }
  if (!db.trades[userId]) {
    db.trades[userId] = [];
    markDbDirty();
  }
  if (!db.pixCharges[userId]) {
    db.pixCharges[userId] = [];
    markDbDirty();
  }
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
  markDbDirty();
}

function listUserTransactions(userId) {
  return db.transactions.filter((item) => item.userId === userId);
}

function findOwnerByTxid(txid) {
  const directOwner = pixChargeOwners.get(txid);
  if (directOwner) return directOwner;

  for (const [userId, charges] of Object.entries(db.pixCharges || {})) {
    if ((charges || []).some((item) => item.txid === txid)) {
      return userId;
    }
  }
  return "";
}

function findChargeByTxid(txid) {
  for (const charges of Object.values(db.pixCharges || {})) {
    const found = (charges || []).find((item) => item.txid === txid);
    if (found) return found;
  }
  return null;
}

function ensureDbCharge(ownerId, txid, amountHint = 0) {
  if (!db.pixCharges[ownerId]) db.pixCharges[ownerId] = [];
  let charge = db.pixCharges[ownerId].find((item) => item.txid === txid);
  if (!charge) {
    const runtime = runtimeChargeStatus.get(txid) || {};
    charge = {
      txid,
      amount: Number(runtime.amount || amountHint || 0),
      status: String(runtime.status || "PENDING"),
      paymentMethod: String(runtime.paymentMethod || "pix"),
      createdAt: Number(runtime.createdAt || now()),
      expiresAt: Number(runtime.expiresAt || now() + 10 * 60 * 1000),
      copyPaste: runtime.copyPaste || "",
      qrCodeBase64: runtime.qrCodeBase64 || "",
      credited: false,
    };
    db.pixCharges[ownerId].unshift(charge);
    markDbDirty();
  }
  return charge;
}

function creditPaidChargeByTxid(txid, amountHint = 0) {
  const ownerId = findOwnerByTxid(txid);
  if (!ownerId) return false;

  const wallet = ensureWallet(ownerId);
  const charge = ensureDbCharge(ownerId, txid, amountHint);
  charge.status = "PAID";

  if (charge.credited) return true;

  const amount = Number(charge.amount || amountHint || 0);
  if (!Number.isFinite(amount) || amount <= 0) return false;

  wallet.available = formatMoney(Number(wallet.available || 0) + amount);
  charge.credited = true;
  charge.amount = amount;
  markDbDirty();
  maybeApplyAffiliateReward(ownerId, amount);

  recordTransaction(ownerId, {
    category: "deposit",
    eventType: "DEPOSIT_CREDITED",
    status: "CONFIRMED",
    amount,
    balanceAfter: wallet.available,
    referenceId: txid,
    description: "Depósito Pix confirmado (auto via status/webhook)",
    createdAt: now(),
  });
  return true;
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
      "default-src 'self'; script-src 'self'; connect-src 'self' https://api.binance.com https://brapi.dev; img-src 'self' data: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
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
  const normalized = raw.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (
    [
      "paid",
      "approved",
      "success",
      "succeeded",
      "captured",
      "charge_paid",
      "order_paid",
      "payment_paid",
      "pix_paid",
    ].includes(normalized)
  ) {
    return "PAID";
  }
  if (
    [
      "expired",
      "canceled",
      "cancelled",
      "failed",
      "refused",
      "refunded",
      "chargeback",
      "voided",
      "payment_failed",
      "pix_expired",
    ].includes(normalized)
  ) {
    return "EXPIRED";
  }
  return "PENDING";
}

function buildPixAuthHeader(cfg) {
  const scheme = String(cfg?.authScheme || "Bearer").trim();
  const tokenRaw = String(cfg?.apiToken || "").trim();
  if (!tokenRaw) return "";

  const token = tokenRaw.replace(/^(Bearer|Basic)\s+/i, "").trim();
  if (!token) return "";

  const provider = detectPixProvider(cfg);
  const lowerScheme = scheme.toLowerCase();

  // Pagar.me usa Basic com a API key (secret) como usuário.
  // Se o painel ficar em Bearer por engano, convertemos automaticamente quando a chave parecer sk_xxx/pk_xxx.
  if (provider === "pagarme" && lowerScheme !== "basic" && /^(sk|pk)_[a-z0-9]/i.test(token)) {
    return `Basic ${Buffer.from(`${token}:`).toString("base64")}`;
  }

  if (lowerScheme !== "basic") {
    return `${scheme} ${token}`;
  }

  // Se já vier base64, usa direto; se vier chave textual, codifica.
  const looksBase64 = /^[A-Za-z0-9+/=]+$/.test(token) && token.length > 20;
  if (looksBase64) return `Basic ${token}`;
  return `Basic ${Buffer.from(`${token}:`).toString("base64")}`;
}

function getPixConfig() {
  const savedPixConfig = db?.settings?.pixConfig || {};
  const cfg = {
    provider: runtimePixConfig.provider || savedPixConfig.provider || PIX_PROVIDER || "auto",
    baseUrl: runtimePixConfig.baseUrl || savedPixConfig.baseUrl || PIX_PROVIDER_BASE_URL,
    createPath: runtimePixConfig.createPath || savedPixConfig.createPath || PIX_CREATE_PATH,
    statusPathTemplate:
      runtimePixConfig.statusPathTemplate ||
      savedPixConfig.statusPathTemplate ||
      PIX_STATUS_PATH_TEMPLATE,
    apiToken: runtimePixConfig.apiToken || savedPixConfig.apiToken || PIX_API_TOKEN,
    authScheme: runtimePixConfig.authScheme || savedPixConfig.authScheme || PIX_AUTH_SCHEME,
    offerHash: runtimePixConfig.offerHash || savedPixConfig.offerHash || process.env.PIX_OFFER_HASH || "",
    productHash:
      runtimePixConfig.productHash || savedPixConfig.productHash || process.env.PIX_PRODUCT_HASH || "",
    productTitle:
      runtimePixConfig.productTitle ||
      savedPixConfig.productTitle ||
      process.env.PIX_PRODUCT_TITLE ||
      "Deposito Bye Trader",
    productCover: runtimePixConfig.productCover || savedPixConfig.productCover || process.env.PIX_PRODUCT_COVER || "",
    productSalePage:
      runtimePixConfig.productSalePage ||
      savedPixConfig.productSalePage ||
      process.env.PIX_PRODUCT_SALE_PAGE ||
      "",
  };
  return cfg;
}

function getCardConfig() {
  return {
    provider: CARD_PROVIDER || "pagarme",
    baseUrl: CARD_PROVIDER_BASE_URL,
    createPath: CARD_CREATE_PATH,
    statusPathTemplate: CARD_STATUS_PATH_TEMPLATE,
    apiToken: CARD_API_TOKEN,
    authScheme: CARD_AUTH_SCHEME,
    offerHash: "",
    productHash: "",
    productTitle: "Deposito Bye Trader",
    productCover: "",
    productSalePage: "",
  };
}

function getPaymentConfig(paymentMethod = "pix") {
  if (String(paymentMethod || "").toLowerCase() === "credit_card") {
    return getCardConfig();
  }
  return getPixConfig();
}

function detectPixProvider(cfg) {
  const baseUrl = String(cfg?.baseUrl || "").toLowerCase();
  if (baseUrl.includes("tribopay.com.br")) return "tribopay";
  if (baseUrl.includes("pagar.me")) return "pagarme";

  const explicit = String(cfg?.provider || "").toLowerCase().trim();
  if (["tribopay", "pagarme", "generic"].includes(explicit)) return explicit;
  return "generic";
}

function isTriboPayConfig(cfg) {
  return detectPixProvider(cfg) === "tribopay";
}

function isPagarMeConfig(cfg) {
  return detectPixProvider(cfg) === "pagarme";
}

function buildPixCreatePayload(cfg, amount, customer, clientUser, paymentMethod = "pix", card = {}) {
  const cents = Math.round(amount * 100);
  const method = String(paymentMethod || "pix").toLowerCase() === "credit_card" ? "credit_card" : "pix";

  if (isTriboPayConfig(cfg)) {
    return {
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

  if (isPagarMeConfig(cfg)) {
    const cardNumber = onlyDigits(card.number || card.card_number || "");
    const expMonth = String(card.expMonth || card.exp_month || "").replace(/\D/g, "").slice(0, 2);
    const expYearRaw = String(card.expYear || card.exp_year || "").replace(/\D/g, "");
    const expYear = expYearRaw.length === 2 ? `20${expYearRaw}` : expYearRaw.slice(0, 4);
    const cvv = String(card.cvv || card.cvv_code || "").replace(/\D/g, "").slice(0, 4);
    const holderName = String(card.holderName || card.holder_name || customer.name || clientUser.name || "Cliente").trim();

    const paymentPayload =
      method === "credit_card"
        ? {
            payment_method: "credit_card",
            credit_card: {
              installments: 1,
              statement_descriptor: "BYETRADER",
              card: {
                number: cardNumber,
                holder_name: holderName,
                exp_month: expMonth,
                exp_year: expYear,
                cvv,
                billing_address: {
                  line_1: String(clientUser.address || "Endereco nao informado"),
                  zip_code: "01001000",
                  city: "Sao Paulo",
                  state: "SP",
                  country: "BR",
                },
              },
            },
          }
        : {
            payment_method: "pix",
            pix: {
              expires_in: 600,
            },
          };

    return {
      code: `BYE-${Date.now()}`,
      customer: {
        name: String(customer.name || clientUser.name || "Cliente Bye Trader"),
        email: String(customer.email || clientUser.email || "cliente@byetrader.com"),
        type: "individual",
        document: onlyDigits(customer.document || clientUser.cpf || "00000000000"),
        document_type: "CPF",
        phones: {
          mobile_phone: {
            country_code: "55",
            area_code: String(onlyDigits(customer.phone_number || "11999999999")).slice(0, 2) || "11",
            number: String(onlyDigits(customer.phone_number || "11999999999")).slice(2) || "999999999",
          },
        },
      },
      items: [
        {
          amount: cents,
          description: cfg.productTitle || "Deposito Bye Trader",
          quantity: 1,
          code: cfg.productHash || "deposito",
        },
      ],
      payments: [
        paymentPayload,
      ],
    };
  }

  return { amount };
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

function parseProviderTimestamp(value) {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value > 1e12) return value;
    if (value > 1e9) return value * 1000;
    return 0;
  }

  const asNumber = Number(value);
  if (Number.isFinite(asNumber) && asNumber > 0) {
    if (asNumber > 1e12) return asNumber;
    if (asNumber > 1e9) return asNumber * 1000;
  }

  const parsed = new Date(String(value)).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function walkObjectStrings(input, visitor, visited = new Set()) {
  if (!input || typeof input !== "object") return;
  if (visited.has(input)) return;
  visited.add(input);

  if (Array.isArray(input)) {
    for (const item of input) walkObjectStrings(item, visitor, visited);
    return;
  }

  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "string") visitor(key, value);
    else if (value && typeof value === "object") walkObjectStrings(value, visitor, visited);
  }
}

function findPixCodeDeep(input) {
  let found = "";
  walkObjectStrings(input, (key, value) => {
    if (found) return;
    const normalizedKey = String(key || "").toLowerCase();
    const trimmed = String(value || "").trim();
    if (!trimmed) return;

    const looksLikePixEmv = trimmed.startsWith("000201") && trimmed.length > 40;
    const pixNamedField =
      normalizedKey.includes("pix_code") ||
      normalizedKey.includes("copy_paste") ||
      normalizedKey.includes("copia") ||
      normalizedKey.includes("brcode") ||
      normalizedKey.includes("emv");

    if (looksLikePixEmv || (pixNamedField && trimmed.length > 20)) {
      found = trimmed;
    }
  });
  return found;
}

function findQrCodeDeep(input) {
  let found = "";
  walkObjectStrings(input, (key, value) => {
    if (found) return;
    const normalizedKey = String(key || "").toLowerCase();
    const trimmed = String(value || "").trim();
    if (!trimmed) return;

    const isDataImage = trimmed.startsWith("data:image/");
    const isImageUrl = /^https?:\/\//i.test(trimmed);
    const isQrNamedField =
      normalizedKey.includes("qrcode") ||
      normalizedKey.includes("qr_code") ||
      normalizedKey.includes("qrimage") ||
      normalizedKey.includes("qr_code_url");

    if (isDataImage || (isQrNamedField && (trimmed.length > 80 || isImageUrl))) {
      found = trimmed;
    }
  });
  return found;
}

function findPaymentUrlDeep(input) {
  let found = "";
  walkObjectStrings(input, (key, value) => {
    if (found) return;
    const normalizedKey = String(key || "").toLowerCase();
    const trimmed = String(value || "").trim();
    if (!trimmed) return;
    if (!/^https?:\/\//i.test(trimmed)) return;

    const likelyCheckoutUrl =
      normalizedKey.includes("checkout") ||
      normalizedKey.includes("payment") ||
      normalizedKey.includes("ticket") ||
      normalizedKey.includes("redirect") ||
      normalizedKey.includes("url");

    if (likelyCheckoutUrl) {
      found = trimmed;
    }
  });
  return found;
}

function normalizeCreateResponse(providerData, requestedAmount, cfg) {
  const source = unwrapProviderData(providerData);
  const sourcePix = unwrapProviderData(source.pix || {});
  const sourcePayment = unwrapProviderData(source.payment || {});
  const sourceCharge = Array.isArray(source.charges) && source.charges.length ? unwrapProviderData(source.charges[0]) : {};
  const sourceLastTx = unwrapProviderData(sourceCharge.last_transaction || {});
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
    sourceCharge.id,
    sourceLastTx.id,
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
    source.pix?.copy_and_paste,
    source.pix?.pix_code,
    source.qr_code,
    source.pixCode,
    source.codigo_pix,
    source.copy_and_paste,
    source.pix?.brcode,
    sourcePix.copyPaste,
    sourcePix.code,
    sourcePix.copy_paste,
    sourcePix.copy_and_paste,
    sourcePix.pix_code,
    sourcePix.brcode,
    sourcePix.emv,
    sourcePayment.pix_code,
    sourcePayment.qr_code,
    sourcePayment.copy_paste,
    findPixCodeDeep(source),
  );

  const qrCodeBase64 = pickString(
    source.qrCodeBase64,
    source.qrCodeImage,
    source.qrcode,
    source.qr_code,
    source.qr_code_base64,
    source.qr_code_url,
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
    sourcePayment.qr_code_url,
    findQrCodeDeep(source),
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
    findPaymentUrlDeep(source),
  );
  const fallbackOfferHash = pickString(
    source.offer_hash,
    source.offerHash,
    source.offer?.hash,
    cfg.offerHash,
  );

  const status = mapPixStatus(source.status || source.pixStatus || source.payment_status || "PENDING");
  const paymentMethod = pickString(
    source.payment_method,
    sourcePayment.payment_method,
    sourceCharge.payment_method,
    sourceLastTx.payment_method,
    source.pix ? "pix" : "",
    source.credit_card ? "credit_card" : "",
    "pix",
  );
  const expiresAtRaw =
    source.expiresAt ||
    source.expirationDate ||
    source.expires_at ||
    source.pix?.expires_at ||
    source.expire_at ||
    0;
  const parsedExpiresAt = parseProviderTimestamp(expiresAtRaw);
  const safeExpiresAt = parsedExpiresAt > now() ? parsedExpiresAt : now() + 10 * 60 * 1000;

  if (!resolvedTxid) throw new Error("Resposta do provedor Pix sem txid");

  const normalized = {
    txid: String(resolvedTxid),
    amount: Number(requestedAmount),
    status,
    paymentMethod,
    copyPaste,
    qrCodeBase64,
    paymentUrl:
      paymentUrl ||
      (tribo
        ? `https://go.tribopay.com.br/${encodeURIComponent(
            String(fallbackOfferHash || resolvedTxid),
          )}`
        : ""),
    createdAt: now(),
    expiresAt: safeExpiresAt,
  };

  runtimeChargeStatus.set(normalized.txid, normalized);
  return normalized;
}

function normalizeStatusResponse(providerData, txid) {
  const source = unwrapProviderData(providerData);
  const sourceCharge = Array.isArray(source.charges) && source.charges.length ? source.charges[0] : {};
  const sourceLastTx = sourceCharge?.last_transaction || {};
  const rawStatus = pickString(
    source.status,
    source.pixStatus,
    source.payment_status,
    sourceCharge.status,
    sourceLastTx.status,
  );
  return {
    txid,
    status: mapPixStatus(rawStatus || "PENDING"),
  };
}

function extractPixWebhookData(body = {}) {
  const source = unwrapProviderData(body);
  const sourceData = unwrapProviderData(source.data || {});
  const sourceCharge = Array.isArray(sourceData.charges) && sourceData.charges.length ? sourceData.charges[0] : {};
  const sourceLastTx = sourceCharge?.last_transaction || {};

  const txid = pickString(
    source.transaction_hash,
    source.txid,
    source.id,
    source.resource_id,
    sourceData.id,
    sourceData.code,
    sourceCharge.id,
    sourceCharge.code,
    sourceLastTx.id,
  );

  const rawStatus = pickString(
    source.status,
    source.type,
    source.event,
    sourceData.status,
    sourceCharge.status,
    sourceLastTx.status,
  );

  const amountCents = Number(
    source.amount ??
      sourceData.amount ??
      sourceCharge.amount ??
      sourceLastTx.amount ??
      sourceLastTx.paid_amount ??
      0,
  );
  const amount = Number.isFinite(amountCents) ? amountCents / 100 : 0;

  const paidAt = pickString(
    source.paid_at,
    sourceData.closed_at,
    sourceData.updated_at,
    sourceCharge.paid_at,
    sourceCharge.last_transaction?.created_at,
    sourceLastTx.paid_at,
  );

  return {
    txid: String(txid || "").trim(),
    status: mapPixStatus(rawStatus),
    amount,
    paymentMethod: pickString(
      source.payment_method,
      sourceData.payment_method,
      sourceCharge.payment_method,
      sourceLastTx.payment_method,
      "pix",
    ),
    paidAt: paidAt || null,
  };
}

function fillPixPresentationFromProvider(charge, providerData, cfg) {
  if (!charge || !providerData) return charge;
  const source = unwrapProviderData(providerData);
  const sourcePix = unwrapProviderData(source.pix || {});
  const sourcePayment = unwrapProviderData(source.payment || {});
  const sourceCheckout = unwrapProviderData(source.checkout || {});
  const sourceLinks = unwrapProviderData(source.links || {});
  const tribo = isTriboPayConfig(cfg);

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
    source.pix?.copy_and_paste,
    source.pix?.pix_code,
    source.qr_code,
    source.pixCode,
    source.codigo_pix,
    source.copy_and_paste,
    source.pix?.brcode,
    sourcePix.copyPaste,
    sourcePix.code,
    sourcePix.copy_paste,
    sourcePix.copy_and_paste,
    sourcePix.pix_code,
    sourcePix.brcode,
    sourcePix.emv,
    sourcePayment.pix_code,
    sourcePayment.qr_code,
    sourcePayment.copy_paste,
    findPixCodeDeep(source),
  );

  const qrCodeBase64 = pickString(
    source.qrCodeBase64,
    source.qrCodeImage,
    source.qrcode,
    source.qr_code,
    source.qr_code_base64,
    source.qr_code_url,
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
    sourcePayment.qr_code_url,
    findQrCodeDeep(source),
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
    findPaymentUrlDeep(source),
  );

  const fallbackOfferHash = pickString(
    source.offer_hash,
    source.offerHash,
    source.offer?.hash,
    cfg.offerHash,
  );

  if (!charge.copyPaste && copyPaste) charge.copyPaste = copyPaste;
  if (!charge.qrCodeBase64 && qrCodeBase64) charge.qrCodeBase64 = qrCodeBase64;
  if (!charge.paymentUrl) {
    charge.paymentUrl =
      paymentUrl ||
      (tribo
        ? `https://go.tribopay.com.br/${encodeURIComponent(String(fallbackOfferHash || charge.txid))}`
        : "");
  }

  const rawStatus = pickString(source.status, source.pixStatus, source.payment_status);
  if (rawStatus) {
    charge.status = mapPixStatus(rawStatus);
  }
  return charge;
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
  const tokenClean = String(cfg.apiToken || "").replace(/^(Bearer|Basic)\s+/i, "").trim();
  if (isTriboPayConfig(cfg) && tokenClean) {
    url.searchParams.set("api_token", tokenClean);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PIX_TIMEOUT_MS);

  try {
    const headers = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    if (isTriboPayConfig(cfg) && tokenClean && PIX_SEND_AUTH_HEADER) {
      headers.Authorization = `Bearer ${tokenClean}`;
    } else if (!isTriboPayConfig(cfg)) {
      headers.Authorization = buildPixAuthHeader(cfg);
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

function validateUserProfileData(
  { name, email, cpf, pixKey, address },
  { requireCpf = true, requirePixKey = true, requireAddress = true } = {},
) {
  if (!String(name || "").trim()) return "Nome é obrigatório.";
  if (!String(email || "").includes("@")) return "E-mail inválido.";
  if (requireCpf) {
    const normalizedCpf = onlyDigits(cpf);
    if (normalizedCpf.length !== 11) return "CPF inválido. Informe 11 dígitos.";
  }
  if (requirePixKey && !String(pixKey || "").trim()) return "Chave Pix é obrigatória.";
  if (requireAddress && String(address || "").trim().length < 8) return "Endereço residencial inválido.";
  return "";
}

function getAwardsConfig() {
  if (!db.settings) db.settings = {};
  if (!Array.isArray(db.settings.awards) || !db.settings.awards.length) {
    db.settings.awards = normalizeAwardsConfig(DEFAULT_AWARDS);
    markDbDirty();
  }
  return db.settings.awards;
}

function getContentConfig() {
  if (!db.settings) db.settings = {};
  db.settings.content = normalizeContentConfig(db.settings.content);
  return db.settings.content;
}

function publicContentPayload() {
  const content = getContentConfig();
  return {
    banners: content.banners,
    bonusCpa: content.bonusCpa,
  };
}

function getAffiliateRecord(userId) {
  if (!db.affiliates[userId]) {
    db.affiliates[userId] = {
      userId,
      status: "NONE",
      whatsapp: "",
      referralCode: "",
      totalCpa: 0,
      referredDepositors: 0,
      depositorsCredited: [],
      approvedAt: 0,
      rejectedAt: 0,
    };
    markDbDirty();
  }
  return db.affiliates[userId];
}

function randomCode(length = 8) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function generateUniqueReferralCode() {
  for (let i = 0; i < 10; i += 1) {
    const code = randomCode(8);
    const exists = Object.values(db.affiliates || {}).some((item) => item.referralCode === code);
    if (!exists) return code;
  }
  return `${randomCode(6)}${Date.now().toString().slice(-2)}`;
}

function findAffiliateByReferralCode(code) {
  const normalized = String(code || "").trim().toUpperCase();
  if (!normalized) return null;
  const entry = Object.values(db.affiliates || {}).find(
    (item) => String(item.referralCode || "").toUpperCase() === normalized,
  );
  return entry || null;
}

function maybeApplyAffiliateReward(depositorUserId, depositAmount) {
  const depositor = findUserById(depositorUserId);
  if (!depositor || depositor.isAdmin) return;
  const affiliateId = String(depositor.referredByAffiliateId || "");
  const firstDeposit = Number(depositor.firstDepositAt || 0) <= 0;
  const normalizedAmount = formatMoney(Number(depositAmount || 0));
  if (normalizedAmount <= 0) return;

  if (!affiliateId) {
    if (firstDeposit) {
      depositor.firstDepositAt = now();
      markDbDirty();
    }
    return;
  }

  const affiliateUser = findUserById(affiliateId);
  const affiliateRecord = getAffiliateRecord(affiliateId);
  if (!affiliateUser || affiliateRecord.status !== "APPROVED") {
    if (firstDeposit) {
      depositor.firstDepositAt = now();
      markDbDirty();
    }
    return;
  }

  let rewardAmount = 0;
  let eventType = "";
  let description = "";

  if (firstDeposit) {
    rewardAmount = Number(getContentConfig().bonusCpa.cpaValue || 0);
    eventType = "AFFILIATE_CPA_EARNED";
    description = `CPA por 1º depósito do cliente ${depositor.email}`;
    if (!affiliateRecord.depositorsCredited.includes(depositorUserId)) {
      affiliateRecord.referredDepositors = Number(affiliateRecord.referredDepositors || 0) + 1;
      affiliateRecord.depositorsCredited.push(depositorUserId);
    }
    depositor.firstDepositAt = now();
  } else {
    const ratePct = Number(getContentConfig().bonusCpa.recurringRatePct || 0);
    rewardAmount = formatMoney((normalizedAmount * ratePct) / 100);
    eventType = "AFFILIATE_RECURRING_EARNED";
    description = `Comissão ${formatMoney(ratePct).toFixed(2)}% do depósito de ${depositor.email}`;
  }

  if (rewardAmount <= 0) {
    markDbDirty();
    return;
  }

  affiliateRecord.totalCpa = formatMoney(Number(affiliateRecord.totalCpa || 0) + rewardAmount);
  markDbDirty();

  recordTransaction(affiliateUser.id, {
    category: "affiliate",
    eventType,
    status: "CONFIRMED",
    amount: rewardAmount,
    balanceAfter: formatMoney(db.wallets[affiliateUser.id]?.available || 0),
    referenceId: `AFF-${depositorUserId.slice(0, 8)}`,
    description,
    createdAt: now(),
  });
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

  if (pathname === "/api/awards" && req.method === "GET") {
    const auth = requireAuth(req, res);
    if (!auth) return;
    sendJson(res, 200, getAwardsConfig());
    return;
  }

  if (pathname === "/api/admin/awards" && req.method === "GET") {
    const auth = requireAuth(req, res, { adminOnly: true });
    if (!auth) return;
    sendJson(res, 200, getAwardsConfig());
    return;
  }

  if (pathname === "/api/admin/awards" && req.method === "PUT") {
    const auth = requireAuth(req, res, { adminOnly: true });
    if (!auth) return;

    try {
      const body = await readJsonBody(req);
      const awards = normalizeAwardsConfig(Array.isArray(body.awards) ? body.awards : []);
      if (!awards.length) {
        sendJson(res, 400, { error: "Lista de premiações inválida." });
        return;
      }
      db.settings = db.settings || {};
      db.settings.awards = awards;
      markDbDirty();
      sendJson(res, 200, awards);
    } catch {
      sendJson(res, 400, { error: "Payload inválido para premiações." });
    }
    return;
  }

  if (pathname === "/api/content" && req.method === "GET") {
    const auth = requireAuth(req, res);
    if (!auth) return;
    sendJson(res, 200, publicContentPayload());
    return;
  }

  if (pathname === "/api/admin/content" && req.method === "GET") {
    const auth = requireAuth(req, res, { adminOnly: true });
    if (!auth) return;
    sendJson(res, 200, publicContentPayload());
    return;
  }

  if (pathname === "/api/admin/content" && req.method === "PUT") {
    const auth = requireAuth(req, res, { adminOnly: true });
    if (!auth) return;

    try {
      const body = await readJsonBody(req);
      const next = normalizeContentConfig(body || {});
      db.settings = db.settings || {};
      db.settings.content = next;
      markDbDirty();
      sendJson(res, 200, publicContentPayload());
    } catch {
      sendJson(res, 400, { error: "Payload inválido para conteúdo." });
    }
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
      const referralCode = String(body.referralCode || "").trim();

      const validationError = validateUserProfileData(
        { name, email, cpf, pixKey, address },
        { requireCpf: false, requirePixKey: false, requireAddress: false },
      );
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
        referredByAffiliateId: "",
        firstDepositAt: 0,
        createdAt: now(),
      };
      if (referralCode) {
        const affiliate = findAffiliateByReferralCode(referralCode);
        if (affiliate && affiliate.userId && affiliate.userId !== userId) {
          user.referredByAffiliateId = affiliate.userId;
        }
      }
      db.users.push(user);
      ensureWallet(userId);
      getAffiliateRecord(userId);
      markDbDirty();

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
      const name = body.name === undefined ? String(auth.user.name || "").trim() : String(body.name || "").trim();
      const email =
        body.email === undefined ? normalizeEmail(auth.user.email) : normalizeEmail(body.email);
      const cpf = body.cpf === undefined ? onlyDigits(auth.user.cpf) : onlyDigits(body.cpf);
      const pixKey =
        body.pixKey === undefined ? String(auth.user.pixKey || "").trim() : String(body.pixKey || "").trim();
      const address =
        body.address === undefined ? String(auth.user.address || "").trim() : String(body.address || "").trim();

      const validationError = validateUserProfileData(
        { name, email, cpf, pixKey, address },
        { requireCpf: false, requirePixKey: false, requireAddress: false },
      );
      if (validationError) {
        sendJson(res, 400, { error: validationError });
        return;
      }
      if (cpf && cpf.length !== 11) {
        sendJson(res, 400, { error: "CPF inválido. Informe 11 dígitos." });
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
      markDbDirty();

      sendJson(res, 200, publicUser(auth.user));
    } catch {
      sendJson(res, 400, { error: "Payload inválido para perfil." });
    }
    return;
  }

  if (pathname === "/api/support/tickets" && req.method === "GET") {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const rows = db.supportTickets
      .filter((item) => item.userId === auth.user.id)
      .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
    sendJson(res, 200, rows);
    return;
  }

  if (pathname === "/api/support/tickets" && req.method === "POST") {
    const auth = requireAuth(req, res);
    if (!auth) return;
    try {
      const body = await readJsonBody(req);
      const whatsapp = onlyDigits(body.whatsapp);
      const message = String(body.message || "").trim();
      if (!whatsapp || whatsapp.length < 10) {
        sendJson(res, 400, { error: "Informe um WhatsApp válido." });
        return;
      }
      if (message.length < 10) {
        sendJson(res, 400, { error: "Descreva melhor o problema (mínimo 10 caracteres)." });
        return;
      }

      const ticket = {
        ticketId: randomId(),
        userId: auth.user.id,
        userName: auth.user.name,
        userEmail: auth.user.email,
        whatsapp,
        message,
        status: "OPEN",
        createdAt: now(),
      };
      db.supportTickets.unshift(ticket);
      markDbDirty();
      sendJson(res, 201, ticket);
    } catch {
      sendJson(res, 400, { error: "Payload inválido para suporte." });
    }
    return;
  }

  if (pathname === "/api/admin/support/tickets" && req.method === "GET") {
    const auth = requireAuth(req, res, { adminOnly: true });
    if (!auth) return;
    const rows = [...db.supportTickets].sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
    sendJson(res, 200, rows);
    return;
  }

  if (pathname === "/api/affiliates/me" && req.method === "GET") {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const affiliate = getAffiliateRecord(auth.user.id);
    const pending = db.affiliateApplications
      .filter((item) => item.userId === auth.user.id)
      .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))[0] || null;
    sendJson(res, 200, {
      status: affiliate.status,
      whatsapp: affiliate.whatsapp || "",
      referralCode: affiliate.referralCode || "",
      totalCpa: formatMoney(affiliate.totalCpa || 0),
      referredDepositors: Number(affiliate.referredDepositors || 0),
      pendingApplication: pending,
      cpaValue: Number(getContentConfig().bonusCpa.cpaValue || 0),
      recurringRatePct: Number(getContentConfig().bonusCpa.recurringRatePct || 0),
    });
    return;
  }

  if (pathname === "/api/affiliates/apply" && req.method === "POST") {
    const auth = requireAuth(req, res);
    if (!auth) return;
    try {
      const body = await readJsonBody(req);
      const whatsapp = onlyDigits(body.whatsapp);
      if (!whatsapp || whatsapp.length < 10) {
        sendJson(res, 400, { error: "Informe um WhatsApp válido para afiliação." });
        return;
      }

      const affiliate = getAffiliateRecord(auth.user.id);
      if (affiliate.status === "APPROVED") {
        sendJson(res, 400, { error: "Conta já aprovada como afiliado." });
        return;
      }

      const hasPending = db.affiliateApplications.some(
        (item) => item.userId === auth.user.id && item.status === "PENDING",
      );
      if (hasPending) {
        sendJson(res, 400, { error: "Já existe solicitação pendente para essa conta." });
        return;
      }

      const request = {
        requestId: randomId(),
        userId: auth.user.id,
        userName: auth.user.name,
        userEmail: auth.user.email,
        whatsapp,
        status: "PENDING",
        createdAt: now(),
        reviewedAt: 0,
        reviewedBy: "",
        reason: "",
      };
      db.affiliateApplications.unshift(request);
      affiliate.status = "PENDING";
      affiliate.whatsapp = whatsapp;
      markDbDirty();
      sendJson(res, 201, request);
    } catch {
      sendJson(res, 400, { error: "Payload inválido para solicitação de afiliado." });
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

      const ownerId = findOwnerByTxid(txid);
      if (ownerId && ownerId !== auth.user.id) {
        sendJson(res, 403, { error: "Cobrança Pix pertence a outro usuário." });
        return;
      }

      const wallet = ensureWallet(auth.user.id);
      const userCharges = db.pixCharges[auth.user.id] || [];
      let existingCharge = userCharges.find((item) => item.txid === txid);
      let charge = runtimeChargeStatus.get(txid);

      if (!charge) {
        if (existingCharge) {
          charge = { ...existingCharge };
          runtimeChargeStatus.set(txid, charge);
        } else {
          const cfg = getPixConfig();
          if (cfg.statusPathTemplate && cfg.baseUrl && cfg.apiToken) {
            try {
              const statusPath = cfg.statusPathTemplate.replace("{txid}", encodeURIComponent(txid));
              const providerData = await callPixProvider(statusPath, "GET");
              const normalized = normalizeStatusResponse(providerData, txid);
              charge = { txid, amount: Number(body.amount || 0), ...normalized, updatedAt: now() };
              runtimeChargeStatus.set(txid, charge);
            } catch {
              // segue fallback abaixo
            }
          }
        }
      }

      if (!charge) {
        sendJson(res, 404, { error: "Cobrança Pix não encontrada." });
        return;
      }

      if (charge.status !== "PAID") {
        const cfg = getPixConfig();
        if (cfg.statusPathTemplate && cfg.baseUrl && cfg.apiToken) {
          try {
            const statusPath = cfg.statusPathTemplate.replace("{txid}", encodeURIComponent(txid));
            const providerData = await callPixProvider(statusPath, "GET");
            const normalized = normalizeStatusResponse(providerData, txid);
            charge = { ...charge, ...normalized, updatedAt: now() };
            runtimeChargeStatus.set(txid, charge);
          } catch {
            // mantém status atual se consulta falhar
          }
        }
      }

      if (charge.status === "PAID") {
        creditPaidChargeByTxid(txid, Number(charge.amount || body.amount || 0));
      }

      existingCharge = (db.pixCharges[auth.user.id] || []).find((item) => item.txid === txid);
      if (existingCharge?.credited) {
        sendJson(res, 200, { available: formatMoney(wallet.available), currency: APP_CURRENCY });
        return;
      }

      if (charge.status !== "PAID") {
        sendJson(res, 409, { error: "Pagamento ainda não confirmado." });
        return;
      }

      if (!existingCharge) {
        existingCharge = {
          txid,
          amount: Number(charge.amount || body.amount || 0),
          status: "PAID",
          paymentMethod: charge.paymentMethod || "pix",
          createdAt: Number(charge.createdAt || now()),
          expiresAt: Number(charge.expiresAt || now()),
          copyPaste: charge.copyPaste || "",
          qrCodeBase64: charge.qrCodeBase64 || "",
          credited: false,
        };
        userCharges.unshift(existingCharge);
        db.pixCharges[auth.user.id] = userCharges;
        markDbDirty();
      }

      if (!existingCharge.credited) {
        const amount = Number(existingCharge.amount || charge.amount || 0);
        wallet.available = formatMoney(Number(wallet.available || 0) + amount);
        existingCharge.credited = true;
        existingCharge.status = "PAID";
        maybeApplyAffiliateReward(auth.user.id, amount);
        markDbDirty();

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

      if (!Number.isFinite(amount) || amount < MIN_WITHDRAW_AMOUNT) {
        sendJson(res, 400, { error: `Valor de saque inválido. Mínimo: R$ ${formatMoney(MIN_WITHDRAW_AMOUNT).toFixed(2)}.` });
        return;
      }
      const feeAmount = formatMoney(amount * WITHDRAW_FEE_RATE);
      const totalDebit = formatMoney(amount + feeAmount);
      if (totalDebit > wallet.available) {
        sendJson(res, 400, { error: "Saldo insuficiente para solicitar saque." });
        return;
      }

      wallet.available = formatMoney(wallet.available - totalDebit);
      const request = {
        requestId: randomId(),
        userId: auth.user.id,
        userName: auth.user.name,
        userEmail: auth.user.email,
        cpf: auth.user.cpf,
        pixKey: auth.user.pixKey,
        address: auth.user.address,
        amount: formatMoney(amount),
        feeAmount,
        totalDebit,
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
      markDbDirty();
      recordTransaction(auth.user.id, {
        category: "withdraw",
        eventType: "WITHDRAW_REQUESTED",
        status: "PENDING",
        amount: -totalDebit,
        balanceAfter: wallet.available,
        referenceId: request.requestId,
        description: `Solicitação de saque criada (taxa ${formatMoney(WITHDRAW_FEE_RATE * 100).toFixed(2)}%)`,
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
      markDbDirty();

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
      markDbDirty();

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
    markDbDirty();

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
    markDbDirty();

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

      wallet.available = formatMoney(wallet.available + Number(request.totalDebit || request.amount || 0));
      request.status = "REJECTED";
      request.rejectedAt = now();
      request.rejectedBy = auth.user.id;
      request.rejectReason = reason;
      markDbDirty();

      recordTransaction(request.userId, {
        category: "withdraw",
        eventType: "WITHDRAW_REJECTED_REFUND",
        status: "CONFIRMED",
        amount: Number(request.totalDebit || request.amount || 0),
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
      markDbDirty();

      const wallet = ensureWallet(user.id);
      if (Number.isFinite(balanceAdjustment) && Math.abs(balanceAdjustment) > 0.000001) {
        const nextBalance = formatMoney(wallet.available + balanceAdjustment);
        if (nextBalance < 0) {
          sendJson(res, 400, { error: "Ajuste inválido: saldo do cliente ficaria negativo." });
          return;
        }

        wallet.available = nextBalance;
        markDbDirty();
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

  if (pathname === "/api/admin/affiliates/applications" && req.method === "GET") {
    const auth = requireAuth(req, res, { adminOnly: true });
    if (!auth) return;
    const rows = [...db.affiliateApplications].sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
    sendJson(res, 200, rows);
    return;
  }

  if (/^\/api\/admin\/affiliates\/applications\/[^/]+\/approve$/.test(pathname) && req.method === "POST") {
    const auth = requireAuth(req, res, { adminOnly: true });
    if (!auth) return;

    const requestId = decodeURIComponent(pathname.split("/")[5] || "");
    const request = db.affiliateApplications.find((item) => item.requestId === requestId);
    if (!request) {
      sendJson(res, 404, { error: "Solicitação de afiliado não encontrada." });
      return;
    }

    const affiliate = getAffiliateRecord(request.userId);
    affiliate.status = "APPROVED";
    affiliate.whatsapp = request.whatsapp || affiliate.whatsapp || "";
    if (!affiliate.referralCode) {
      affiliate.referralCode = generateUniqueReferralCode();
    }
    affiliate.approvedAt = now();
    affiliate.rejectedAt = 0;

    request.status = "APPROVED";
    request.reviewedAt = now();
    request.reviewedBy = auth.user.id;
    request.reason = "";
    markDbDirty();
    sendJson(res, 200, request);
    return;
  }

  if (/^\/api\/admin\/affiliates\/applications\/[^/]+\/reject$/.test(pathname) && req.method === "POST") {
    const auth = requireAuth(req, res, { adminOnly: true });
    if (!auth) return;

    const requestId = decodeURIComponent(pathname.split("/")[5] || "");
    const request = db.affiliateApplications.find((item) => item.requestId === requestId);
    if (!request) {
      sendJson(res, 404, { error: "Solicitação de afiliado não encontrada." });
      return;
    }

    try {
      const body = await readJsonBody(req);
      const reason = String(body.reason || "").trim() || "Solicitação rejeitada pelo admin.";
      const affiliate = getAffiliateRecord(request.userId);
      affiliate.status = "REJECTED";
      affiliate.rejectedAt = now();

      request.status = "REJECTED";
      request.reviewedAt = now();
      request.reviewedBy = auth.user.id;
      request.reason = reason;
      markDbDirty();
      sendJson(res, 200, request);
    } catch {
      sendJson(res, 400, { error: "Payload inválido para rejeição de afiliado." });
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
      provider: detectPixProvider(cfg),
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
      const provider = String(body.provider || "").trim().toLowerCase();
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

      if (provider && !["tribopay", "pagarme", "generic"].includes(provider)) {
        sendJson(res, 400, { error: "Provedor Pix inválido. Use tribopay, pagarme ou generic." });
        return;
      }

      const forTribo = provider ? provider === "tribopay" : String(baseUrl).includes("tribopay.com.br");
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

      runtimePixConfig.provider = provider;
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
      db.settings = db.settings || {};
      db.settings.pixConfig = {
        provider,
        baseUrl,
        createPath,
        statusPathTemplate,
        authScheme,
        apiToken,
        offerHash,
        productHash,
        productTitle,
        productCover,
        productSalePage,
      };
      markDbDirty();

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
      const paymentMethod = String(body.paymentMethod || "pix").toLowerCase() === "credit_card" ? "credit_card" : "pix";
      const card = body.card && typeof body.card === "object" ? body.card : {};

      if (!Number.isFinite(amount) || amount < MIN_DEPOSIT_AMOUNT || amount > 500000) {
        sendJson(res, 400, { error: `Valor inválido para cobrança Pix. Mínimo: R$ ${formatMoney(MIN_DEPOSIT_AMOUNT).toFixed(2)}.` });
        return;
      }

      if (paymentMethod === "pix") {
        const cpf = onlyDigits(clientUser.cpf || "");
        if (cpf.length !== 11) {
          sendJson(res, 400, {
            error: "Para gerar depósito Pix, complete seu CPF (11 dígitos) em Conta & Saques.",
            code: "CPF_REQUIRED_FOR_PIX",
          });
          return;
        }
      }

      if (paymentMethod === "credit_card") {
        const cardNumber = onlyDigits(card.number || card.card_number || "");
        const expMonth = String(card.expMonth || card.exp_month || "").replace(/\D/g, "");
        const expYear = String(card.expYear || card.exp_year || "").replace(/\D/g, "");
        const cvv = String(card.cvv || card.cvv_code || "").replace(/\D/g, "");
        const holderName = String(card.holderName || card.holder_name || "").trim();

        if (cardNumber.length < 13 || cardNumber.length > 19 || expMonth.length < 1 || expYear.length < 2 || cvv.length < 3 || !holderName) {
          sendJson(res, 400, { error: "Dados de cartão inválidos para pagamento 1x." });
          return;
        }
      }

      const cfg = getPaymentConfig(paymentMethod);
      if (paymentMethod === "pix" && DISABLE_PAGARME_PIX && isPagarMeConfig(cfg)) {
        sendJson(res, 400, {
          error:
            "Pix via Pagar.me está desativado. Configure o provedor Pix como TriboPay no painel admin.",
        });
        return;
      }
      let normalized;

      if (!cfg.baseUrl || !cfg.apiToken) {
        const txid = `PIX-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
        normalized = {
          txid,
          amount: formatMoney(amount),
          status: "PENDING",
          paymentMethod,
          copyPaste: `00020126580014BR.GOV.BCB.PIX0136${txid}5204000053039865802BR5924BYE TRADER MOCK6009SAO PAULO62070503***6304ABCD`,
          qrCodeBase64:
            "data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPScxODAnIGhlaWdodD0nMTgwJz48cmVjdCB3aWR0aD0nMTgwJyBoZWlnaHQ9JzE4MCcgZmlsbD0nI2Y2ZjhmYScvPjxyZWN0IHg9JzE2JyB5PScxNicgd2lkdGg9JzQ4JyBoZWlnaHQ9JzQ4JyBmaWxsPScjMDAwJy8+PHJlY3QgeD0nMTE2JyB5PScxNicgd2lkdGg9JzQ4JyBoZWlnaHQ9JzQ4JyBmaWxsPScjMDAwJy8+PHJlY3QgeD0nMTYnIHk9JzExNicgd2lkdGg9JzQ4JyBoZWlnaHQ9JzQ4JyBmaWxsPScjMDAwJy8+PHJlY3QgeD0nODAnIHk9JzgwJyB3aWR0aD0nMTYnIGhlaWdodD0nMTYnIGZpbGw9JyMwMDAnLz48cmVjdCB4PScxMDAnIHk9JzEwMCcgd2lkdGg9JzE2JyBoZWlnaHQ9JzE2JyBmaWxsPScjMDAwJy8+PHRleHQgeD0nOTAnIHk9JzE3MicgZm9udC1mYW1pbHk9J21vbm9zcGFjZScgZm9udC1zaXplPScxMCcgdGV4dC1hbmNob3I9J21pZGRsZScgZmlsbD0nIzExMSc+UElYIE1PQ0s8L3RleHQ+PC9zdmc+",
          createdAt: now(),
          expiresAt: now() + 10 * 60 * 1000,
        };
        runtimeChargeStatus.set(normalized.txid, normalized);
      } else {
        const customer = body.customer || {};
        const payload = buildPixCreatePayload(cfg, amount, customer, clientUser, paymentMethod, card);

        const providerData = await callPixProvider(cfg.createPath, "POST", payload);
        normalized = normalizeCreateResponse(providerData, amount, cfg);

        if ((!normalized.copyPaste || !normalized.qrCodeBase64) && cfg.statusPathTemplate) {
          try {
            const statusPath = cfg.statusPathTemplate.replace("{txid}", encodeURIComponent(normalized.txid));
            const detailData = await callPixProvider(statusPath, "GET");
            normalized = fillPixPresentationFromProvider(normalized, detailData, cfg);
            runtimeChargeStatus.set(normalized.txid, normalized);
          } catch {
            // fallback silencioso: mantém dados já retornados no create
          }
        }
      }

      pixChargeOwners.set(normalized.txid, clientUser.id);
      if (!db.pixCharges[clientUser.id]) db.pixCharges[clientUser.id] = [];
      db.pixCharges[clientUser.id].unshift({
        txid: normalized.txid,
        amount: Number(normalized.amount || amount),
        status: normalized.status || "PENDING",
        paymentMethod: normalized.paymentMethod || paymentMethod || "pix",
        createdAt: normalized.createdAt || now(),
        expiresAt: normalized.expiresAt || now() + 10 * 60 * 1000,
        copyPaste: normalized.copyPaste || "",
        qrCodeBase64: normalized.qrCodeBase64 || "",
        credited: false,
      });
      markDbDirty();

      recordTransaction(clientUser.id, {
        category: "deposit",
        eventType: "DEPOSIT_CREATED",
        status: "PENDING",
        amount: Number(normalized.amount || amount),
        balanceAfter: formatMoney(db.wallets[clientUser.id]?.available || 0),
        referenceId: normalized.txid,
        description: paymentMethod === "credit_card" ? "Cobrança cartão 1x criada" : "Cobrança Pix criada",
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

      const chargeInDb = findChargeByTxid(txid);
      const method = String(chargeInDb?.paymentMethod || cached?.paymentMethod || "pix").toLowerCase();
      const cfg = getPaymentConfig(method);
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
      if (normalized.status === "PAID") {
        creditPaidChargeByTxid(txid, Number(cached?.amount || 0));
      }
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
      const parsed = extractPixWebhookData(body);
      const txid = parsed.txid;
      if (!txid) {
        sendJson(res, 400, { error: "txid/id ausente no webhook." });
        return;
      }

      const existing = runtimeChargeStatus.get(txid) || {};
      runtimeChargeStatus.set(txid, {
        ...existing,
        txid,
        status: parsed.status,
        amount: existing.amount || parsed.amount,
        paymentMethod: parsed.paymentMethod || "pix",
        paidAt: parsed.paidAt,
        updatedAt: now(),
      });
      if (parsed.status === "PAID") {
        creditPaidChargeByTxid(txid, parsed.amount);
      }
      markDbDirty();

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
  if (segments[0] === "data") return true;

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

const autosaveHandle = setInterval(() => {
  saveDbIfDirty().catch(() => {});
}, DB_AUTOSAVE_INTERVAL_MS);

async function gracefulShutdown(signal) {
  clearInterval(autosaveHandle);
  await saveDbIfDirty();
  server.close(() => {
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 3000).unref();
  if (signal) {
    console.log(`Encerrando com ${signal}...`);
  }
}

process.on("SIGINT", () => {
  gracefulShutdown("SIGINT").catch(() => process.exit(0));
});

process.on("SIGTERM", () => {
  gracefulShutdown("SIGTERM").catch(() => process.exit(0));
});

await saveDbIfDirty();

server.listen(PORT, () => {
  console.log(`Secure app server running on http://localhost:${PORT}`);
});
