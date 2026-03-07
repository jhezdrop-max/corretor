import { APP_CONFIG } from "../config.js";

const DB_KEY = "orbita-trade-db";
const ADMIN_DEFAULT_PASSWORD = "7392841";

function randomId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  if (globalThis.crypto && typeof globalThis.crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
}

function seed() {
  const demoUserId = randomId();
  const adminUserId = randomId();
  const initialNow = Date.now();
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
        createdAt: initialNow,
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
        createdAt: initialNow,
      },
    ],
    wallets: {
      [demoUserId]: {
        available: 1000,
        currency: APP_CONFIG.currency,
      },
      [adminUserId]: {
        available: 0,
        currency: APP_CONFIG.currency,
      },
    },
    trades: {
      [demoUserId]: [],
      [adminUserId]: [],
    },
    pixCharges: {
      [demoUserId]: [],
      [adminUserId]: [],
    },
    withdrawalRequests: [],
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
        createdAt: initialNow,
      },
    ],
    market: {
      price: 1.1843,
      variation: 0.16,
      updatedAt: initialNow,
    },
  };
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

function normalizeDb(db) {
  db.withdrawalRequests = Array.isArray(db.withdrawalRequests) ? db.withdrawalRequests : [];
  db.transactions = Array.isArray(db.transactions) ? db.transactions : [];
  db.users = Array.isArray(db.users) ? db.users : [];
  db.wallets = db.wallets || {};
  db.trades = db.trades || {};
  db.pixCharges = db.pixCharges || {};

  db.users = db.users.map((user) => ({
    ...user,
    cpf: user.cpf || "",
    pixKey: user.pixKey || "",
    address: user.address || "",
    isAdmin: Boolean(user.isAdmin),
    isActive: user.isActive !== false,
  }));

  db.users = db.users.map((user) => {
    if (String(user.email || "").toLowerCase() === "admin@byetrader.com" && user.password === "admin123") {
      return { ...user, password: ADMIN_DEFAULT_PASSWORD };
    }
    return user;
  });

  db.withdrawalRequests = db.withdrawalRequests.map((request) => {
    const migrated = { ...request };
    if (migrated.status === "APPROVED") {
      migrated.status = "PAID";
    }
    return migrated;
  });

  migrateLegacyBrandUsers(db);
  ensureDefaultUsers(db);

  return db;
}

function migrateLegacyBrandUsers(db) {
  const byEmail = (email) => db.users.find((u) => String(u.email || "").toLowerCase() === email);
  const legacyDemo = byEmail("demo@orbita.trade");
  const legacyAdmin = byEmail("admin@orbita.trade");
  const hasNewDemo = Boolean(byEmail("demo@byetrader.com"));
  const hasNewAdmin = Boolean(byEmail("admin@byetrader.com"));

  if (legacyDemo && !hasNewDemo) {
    legacyDemo.email = "demo@byetrader.com";
    if (String(legacyDemo.pixKey || "").toLowerCase() === "demo@orbita.trade") {
      legacyDemo.pixKey = "demo@byetrader.com";
    }
  }

  if (legacyAdmin && !hasNewAdmin) {
    legacyAdmin.email = "admin@byetrader.com";
    if (String(legacyAdmin.pixKey || "").toLowerCase() === "admin@orbita.trade") {
      legacyAdmin.pixKey = "admin@byetrader.com";
    }
  }
}

function ensureDefaultUsers(db) {
  const now = Date.now();
  const hasDemo = db.users.some((u) => String(u.email || "").toLowerCase() === "demo@byetrader.com");
  const hasAdmin = db.users.some((u) => String(u.email || "").toLowerCase() === "admin@byetrader.com");

  if (!hasDemo) {
    const userId = randomId();
    db.users.push({
      id: userId,
      name: "Cliente Demo",
      email: "demo@byetrader.com",
      password: "123456",
      cpf: "12345678909",
      pixKey: "demo@byetrader.com",
      address: "Rua Exemplo, 100 - Centro, São Paulo/SP",
      isAdmin: false,
      isActive: true,
      createdAt: now,
    });
    db.wallets[userId] = db.wallets[userId] || { available: 1000, currency: APP_CONFIG.currency };
    db.trades[userId] = db.trades[userId] || [];
    db.pixCharges[userId] = db.pixCharges[userId] || [];
  }

  if (!hasAdmin) {
    const userId = randomId();
    db.users.push({
      id: userId,
      name: "Administrador",
      email: "admin@byetrader.com",
      password: ADMIN_DEFAULT_PASSWORD,
      cpf: "00000000000",
      pixKey: "admin@byetrader.com",
      address: "Sede Administrativa",
      isAdmin: true,
      isActive: true,
      createdAt: now,
    });
    db.wallets[userId] = db.wallets[userId] || { available: 0, currency: APP_CONFIG.currency };
    db.trades[userId] = db.trades[userId] || [];
    db.pixCharges[userId] = db.pixCharges[userId] || [];
  }
}

function recordTransaction(db, userId, payload) {
  const user = db.users.find((item) => item.id === userId);
  if (!user || user.isAdmin) return;

  const transaction = {
    transactionId: randomId(),
    userId: user.id,
    userName: user.name,
    userEmail: user.email,
    category: payload.category,
    eventType: payload.eventType,
    status: payload.status || "CONFIRMED",
    amount: Number(payload.amount || 0),
    balanceAfter: Number(payload.balanceAfter || 0),
    referenceId: payload.referenceId || "",
    description: payload.description || "",
    createdAt: payload.createdAt || Date.now(),
  };

  db.transactions.unshift(transaction);
}

function readDb() {
  const raw = localStorage.getItem(DB_KEY);
  if (!raw) {
    const initial = seed();
    localStorage.setItem(DB_KEY, JSON.stringify(initial));
    return initial;
  }

  try {
    const normalized = normalizeDb(JSON.parse(raw));
    localStorage.setItem(DB_KEY, JSON.stringify(normalized));
    return normalized;
  } catch {
    const initial = seed();
    localStorage.setItem(DB_KEY, JSON.stringify(initial));
    return initial;
  }
}

function writeDb(db) {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
}

export function registerUser({ name, email, password, cpf, pixKey, address }) {
  const db = readDb();
  const exists = db.users.some((u) => u.email.toLowerCase() === email.toLowerCase());
  if (exists) {
    throw new Error("E-mail já cadastrado.");
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
    createdAt: Date.now(),
  };

  db.users.push(user);
  db.wallets[userId] = { available: 0, currency: APP_CONFIG.currency };
  db.trades[userId] = [];
  db.pixCharges[userId] = [];
  writeDb(db);
  return publicUser(user);
}

export function loginUser({ email, password }) {
  const db = readDb();
  const user = db.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (!user || user.password !== password) {
    throw new Error("Credenciais inválidas.");
  }
  if (user.isActive === false) {
    throw new Error("Conta desativada. Fale com o suporte.");
  }

  return publicUser(user);
}

export function getUserProfile(userId) {
  const db = readDb();
  const user = db.users.find((item) => item.id === userId);
  if (!user) {
    throw new Error("Usuário não encontrado.");
  }
  return publicUser(user);
}

export function updateUserProfile(userId, payload) {
  const db = readDb();
  const user = db.users.find((item) => item.id === userId);
  if (!user) {
    throw new Error("Usuário não encontrado.");
  }

  const nextEmail = String(payload.email || "").trim().toLowerCase();
  const emailExists =
    nextEmail &&
    db.users.some((item) => item.id !== userId && item.email.toLowerCase() === nextEmail);
  if (emailExists) {
    throw new Error("E-mail já está em uso por outra conta.");
  }

  user.name = String(payload.name || "").trim();
  user.email = nextEmail;
  user.cpf = String(payload.cpf || "").replace(/\D/g, "");
  user.pixKey = String(payload.pixKey || "").trim();
  user.address = String(payload.address || "").trim();

  writeDb(db);
  return publicUser(user);
}

export function getWallet(userId) {
  const db = readDb();
  const wallet = db.wallets[userId];
  if (!wallet) {
    throw new Error("Carteira não encontrada.");
  }
  return { ...wallet };
}

export function createPixCharge(userId, amount) {
  const db = readDb();
  if (!db.pixCharges[userId]) {
    db.pixCharges[userId] = [];
  }

  const txid = `PIX-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
  const createdAt = Date.now();
  const charge = {
    txid,
    amount,
    status: "PENDING",
    createdAt,
    expiresAt: createdAt + 10 * 60 * 1000,
    copyPaste: `00020126580014BR.GOV.BCB.PIX0136${txid}5204000053039865802BR5924BYE TRADER MOCK6009SAO PAULO62070503***6304ABCD`,
    qrCodeBase64:
      "data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPScxODAnIGhlaWdodD0nMTgwJz48cmVjdCB3aWR0aD0nMTgwJyBoZWlnaHQ9JzE4MCcgZmlsbD0nI2Y2ZjhmYScvPjxyZWN0IHg9JzE2JyB5PScxNicgd2lkdGg9JzQ4JyBoZWlnaHQ9JzQ4JyBmaWxsPScjMDAwJy8+PHJlY3QgeD0nMTE2JyB5PScxNicgd2lkdGg9JzQ4JyBoZWlnaHQ9JzQ4JyBmaWxsPScjMDAwJy8+PHJlY3QgeD0nMTYnIHk9JzExNicgd2lkdGg9JzQ4JyBoZWlnaHQ9JzQ4JyBmaWxsPScjMDAwJy8+PHJlY3QgeD0nODAnIHk9JzgwJyB3aWR0aD0nMTYnIGhlaWdodD0nMTYnIGZpbGw9JyMwMDAnLz48cmVjdCB4PScxMDAnIHk9JzEwMCcgd2lkdGg9JzE2JyBoZWlnaHQ9JzE2JyBmaWxsPScjMDAwJy8+PHRleHQgeD0nOTAnIHk9JzE3MicgZm9udC1mYW1pbHk9J21vbm9zcGFjZScgZm9udC1zaXplPScxMCcgdGV4dC1hbmNob3I9J21pZGRsZScgZmlsbD0nIzExMSc+UElYIE1PQ0s8L3RleHQ+PC9zdmc+",
    credited: false,
  };

  db.pixCharges[userId].unshift(charge);
  recordTransaction(db, userId, {
    category: "deposit",
    eventType: "DEPOSIT_CREATED",
    status: "PENDING",
    amount: Number(amount),
    balanceAfter: Number(db.wallets[userId]?.available || 0),
    referenceId: txid,
    description: "Cobrança Pix criada",
    createdAt,
  });
  writeDb(db);
  return { ...charge };
}

export function getPixChargeStatus(userId, txid) {
  const db = readDb();
  const list = db.pixCharges[userId] || [];
  const charge = list.find((item) => item.txid === txid);
  if (!charge) {
    throw new Error("Cobrança Pix não encontrada.");
  }

  const now = Date.now();
  if (charge.status === "PENDING" && now > charge.expiresAt) {
    charge.status = "EXPIRED";
  }

  if (charge.status === "PENDING" && now - charge.createdAt > 7000) {
    charge.status = "PAID";
  }

  writeDb(db);
  return { txid: charge.txid, status: charge.status };
}

export function applyDeposit(userId, txid) {
  const db = readDb();
  const wallet = db.wallets[userId];
  const charge = (db.pixCharges[userId] || []).find((item) => item.txid === txid);

  if (!wallet || !charge) {
    throw new Error("Não foi possível aplicar depósito.");
  }

  if (charge.status !== "PAID") {
    throw new Error("Pagamento ainda não confirmado.");
  }

  if (!charge.credited) {
    wallet.available += Number(charge.amount);
    charge.credited = true;
    recordTransaction(db, userId, {
      category: "deposit",
      eventType: "DEPOSIT_CREDITED",
      status: "CONFIRMED",
      amount: Number(charge.amount),
      balanceAfter: Number(wallet.available),
      referenceId: charge.txid,
      description: "Depósito Pix confirmado",
      createdAt: Date.now(),
    });
  }

  writeDb(db);
  return { ...wallet };
}

export function createTrade(userId, payload) {
  const db = readDb();
  const wallet = db.wallets[userId];
  const trades = db.trades[userId] || [];

  if (!wallet) {
    throw new Error("Carteira indisponível.");
  }

  if (payload.amount > wallet.available) {
    throw new Error("Saldo insuficiente para abrir operação.");
  }

  wallet.available -= Number(payload.amount);

  const trade = {
    tradeId: randomId(),
    symbol: payload.symbol,
    amount: Number(payload.amount),
    direction: payload.direction,
    expirySeconds: Number(payload.expirySeconds),
    status: "OPEN",
    openPrice: Number(payload.openPrice || db.market.price || 0),
    closePrice: null,
    openedAt: Date.now(),
    resolveAt: Date.now() + Number(payload.expirySeconds) * 1000,
    payoutAmount: 0,
    closedAt: null,
  };

  trades.unshift(trade);
  recordTransaction(db, userId, {
    category: "trade",
    eventType: "TRADE_OPENED",
    status: "OPEN",
    amount: Number(-trade.amount),
    balanceAfter: Number(wallet.available),
    referenceId: trade.tradeId,
    description: `${trade.direction} ${trade.symbol} (${trade.expirySeconds}s)`,
    createdAt: trade.openedAt,
  });
  db.trades[userId] = trades;
  writeDb(db);
  return { ...trade };
}

export function resolveTrade(userId, tradeId, payoutRate, currentPrice) {
  const db = readDb();
  const wallet = db.wallets[userId];
  const trades = db.trades[userId] || [];
  const trade = trades.find((item) => item.tradeId === tradeId);

  if (!wallet || !trade) {
    throw new Error("Operação não encontrada.");
  }

  if (trade.status !== "OPEN") {
    return { ...trade };
  }

  if (Date.now() < trade.resolveAt) {
    return { ...trade };
  }

  const closePriceCandidate = Number(payloadSafePrice(currentPrice, db.market.price));
  trade.closePrice = Number(closePriceCandidate.toFixed(8));
  const isWin = trade.direction === "CALL" ? trade.closePrice >= trade.openPrice : trade.closePrice <= trade.openPrice;
  trade.status = isWin ? "WIN" : "LOSS";
  trade.closedAt = Date.now();

  if (isWin) {
    trade.payoutAmount = Number((trade.amount + trade.amount * payoutRate).toFixed(2));
    wallet.available += trade.payoutAmount;
    recordTransaction(db, userId, {
      category: "trade",
      eventType: "TRADE_WIN",
      status: "CONFIRMED",
      amount: Number(trade.payoutAmount),
      balanceAfter: Number(wallet.available),
      referenceId: trade.tradeId,
      description: `Trade WIN ${trade.symbol} (${trade.openPrice} -> ${trade.closePrice})`,
      createdAt: trade.closedAt,
    });
  } else {
    recordTransaction(db, userId, {
      category: "trade",
      eventType: "TRADE_LOSS",
      status: "CONFIRMED",
      amount: 0,
      balanceAfter: Number(wallet.available),
      referenceId: trade.tradeId,
      description: `Trade LOSS ${trade.symbol} (${trade.openPrice} -> ${trade.closePrice})`,
      createdAt: trade.closedAt,
    });
  }

  writeDb(db);
  return { ...trade };
}

function payloadSafePrice(incoming, fallback) {
  const value = Number(incoming);
  if (Number.isFinite(value) && value > 0) return value;
  return Number(fallback || 0);
}

export function listTrades(userId) {
  const db = readDb();
  return [...(db.trades[userId] || [])];
}

export function createWithdrawalRequest(userId, amount) {
  const db = readDb();
  const user = db.users.find((item) => item.id === userId);
  const wallet = db.wallets[userId];
  if (!user || !wallet) {
    throw new Error("Conta inválida para saque.");
  }

  if (!user.cpf || !user.pixKey || !user.address || !user.name || !user.email) {
    throw new Error("Complete seus dados (nome, e-mail, CPF, chave Pix e endereço) antes de sacar.");
  }

  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("Valor de saque inválido.");
  }

  if (value > wallet.available) {
    throw new Error("Saldo insuficiente para solicitar saque.");
  }

  wallet.available = Number((wallet.available - value).toFixed(2));

  const request = {
    requestId: randomId(),
    userId: user.id,
    userName: user.name,
    userEmail: user.email,
    cpf: user.cpf,
    pixKey: user.pixKey,
    address: user.address,
    amount: value,
    status: "PENDING",
    requestedAt: Date.now(),
    approvedAt: null,
    approvedBy: null,
  };

  db.withdrawalRequests.unshift(request);
  recordTransaction(db, userId, {
    category: "withdraw",
    eventType: "WITHDRAW_REQUESTED",
    status: "PENDING",
    amount: Number(-value),
    balanceAfter: Number(wallet.available),
    referenceId: request.requestId,
    description: "Solicitação de saque criada",
    createdAt: request.requestedAt,
  });
  writeDb(db);
  return { ...request };
}

export function listMyWithdrawalRequests(userId) {
  const db = readDb();
  return db.withdrawalRequests.filter((item) => item.userId === userId);
}

export function listAllWithdrawalRequests(adminUserId) {
  const db = readDb();
  const admin = db.users.find((item) => item.id === adminUserId);
  if (!admin?.isAdmin) {
    throw new Error("Acesso restrito ao administrador.");
  }
  return [...db.withdrawalRequests];
}

export function approveWithdrawalRequest(adminUserId, requestId) {
  const db = readDb();
  const admin = db.users.find((item) => item.id === adminUserId);
  if (!admin?.isAdmin) {
    throw new Error("Acesso restrito ao administrador.");
  }

  const request = db.withdrawalRequests.find((item) => item.requestId === requestId);
  if (!request) {
    throw new Error("Solicitação de saque não encontrada.");
  }

  if (request.status === "PAID" || request.status === "REJECTED") {
    return { ...request };
  }

  request.status = "PROCESSING";
  request.processingAt = Date.now();
  request.processedBy = admin.id;
  recordTransaction(db, request.userId, {
    category: "withdraw",
    eventType: "WITHDRAW_PROCESSING",
    status: "PENDING",
    amount: 0,
    balanceAfter: Number(db.wallets[request.userId]?.available || 0),
    referenceId: request.requestId,
    description: "Saque em processamento pelo administrador",
    createdAt: request.processingAt,
  });
  writeDb(db);
  return { ...request };
}

export function payWithdrawalRequest(adminUserId, requestId) {
  const db = readDb();
  const admin = db.users.find((item) => item.id === adminUserId);
  if (!admin?.isAdmin) {
    throw new Error("Acesso restrito ao administrador.");
  }

  const request = db.withdrawalRequests.find((item) => item.requestId === requestId);
  if (!request) {
    throw new Error("Solicitação de saque não encontrada.");
  }

  if (request.status === "PAID") return { ...request };
  if (request.status === "REJECTED") {
    throw new Error("Saque já rejeitado.");
  }

  request.status = "PAID";
  request.approvedAt = Date.now();
  request.approvedBy = admin.id;
  recordTransaction(db, request.userId, {
    category: "withdraw",
    eventType: "WITHDRAW_PAID",
    status: "CONFIRMED",
    amount: 0,
    balanceAfter: Number(db.wallets[request.userId]?.available || 0),
    referenceId: request.requestId,
    description: "Saque pago manualmente pelo administrador",
    createdAt: request.approvedAt,
  });
  writeDb(db);
  return { ...request };
}

export function rejectWithdrawalRequest(adminUserId, requestId, reason = "") {
  const db = readDb();
  const admin = db.users.find((item) => item.id === adminUserId);
  if (!admin?.isAdmin) {
    throw new Error("Acesso restrito ao administrador.");
  }

  const request = db.withdrawalRequests.find((item) => item.requestId === requestId);
  if (!request) {
    throw new Error("Solicitação de saque não encontrada.");
  }

  if (request.status === "PAID") {
    throw new Error("Saque já pago, não pode ser rejeitado.");
  }
  if (request.status === "REJECTED") return { ...request };

  const wallet = db.wallets[request.userId];
  if (!wallet) {
    throw new Error("Carteira do cliente não encontrada.");
  }

  wallet.available = Number((wallet.available + Number(request.amount)).toFixed(2));
  request.status = "REJECTED";
  request.rejectedAt = Date.now();
  request.rejectedBy = admin.id;
  request.rejectReason = String(reason || "").trim() || "Rejeitado pelo administrador";

  recordTransaction(db, request.userId, {
    category: "withdraw",
    eventType: "WITHDRAW_REJECTED_REFUND",
    status: "CONFIRMED",
    amount: Number(request.amount),
    balanceAfter: Number(wallet.available),
    referenceId: request.requestId,
    description: `Saque rejeitado e valor estornado. Motivo: ${request.rejectReason}`,
    createdAt: request.rejectedAt,
  });

  writeDb(db);
  return { ...request };
}

export function listMyTransactions(userId) {
  const db = readDb();
  return db.transactions.filter((item) => item.userId === userId);
}

export function listAllTransactions(adminUserId) {
  const db = readDb();
  const admin = db.users.find((item) => item.id === adminUserId);
  if (!admin?.isAdmin) {
    throw new Error("Acesso restrito ao administrador.");
  }
  return [...db.transactions];
}

export function getAdminPlatformStats(adminUserId) {
  const db = readDb();
  const admin = db.users.find((item) => item.id === adminUserId);
  if (!admin?.isAdmin) {
    throw new Error("Acesso restrito ao administrador.");
  }

  const clientUsers = db.users.filter((item) => !item.isAdmin);
  const totalClientBalance = clientUsers.reduce((acc, user) => acc + Number(db.wallets[user.id]?.available || 0), 0);
  const pendingRequests = db.withdrawalRequests.filter(
    (item) => item.status === "PENDING" || item.status === "PROCESSING",
  );
  const approvedRequests = db.withdrawalRequests.filter((item) => item.status === "PAID");
  const openTradesExposure = clientUsers.reduce((acc, user) => {
    const openTrades = (db.trades[user.id] || []).filter((item) => item.status === "OPEN");
    return acc + openTrades.reduce((sum, trade) => sum + Number(trade.amount || 0), 0);
  }, 0);
  const totalDeposited = Object.values(db.pixCharges).reduce(
    (acc, charges) =>
      acc +
      charges.reduce((sum, charge) => {
        if (charge.credited) return sum + Number(charge.amount || 0);
        return sum;
      }, 0),
    0,
  );
  const clientsActive = clientUsers.filter((item) => item.isActive !== false).length;
  const clientsBlocked = clientUsers.length - clientsActive;
  const totalPaidWithdrawals = Number(
    approvedRequests.reduce((acc, item) => acc + Number(item.amount || 0), 0).toFixed(2),
  );
  const totalLiability = Number((totalClientBalance + openTradesExposure + pendingRequests
    .reduce((acc, item) => acc + Number(item.amount || 0), 0)).toFixed(2));
  const brokerageBalance = Number((totalDeposited - totalPaidWithdrawals - totalLiability).toFixed(2));

  return {
    totalClientBalance: Number(totalClientBalance.toFixed(2)),
    pendingWithdrawalsCount: pendingRequests.length,
    pendingWithdrawalsAmount: Number(
      pendingRequests.reduce((acc, item) => acc + Number(item.amount), 0).toFixed(2),
    ),
    approvedWithdrawalsAmount: totalPaidWithdrawals,
    totalDeposited: Number(totalDeposited.toFixed(2)),
    usersCount: clientUsers.length,
    clientsActive,
    clientsBlocked,
    openTradesExposure: Number(openTradesExposure.toFixed(2)),
    totalLiability,
    brokerageBalance,
    brokerageStatus: brokerageBalance >= 0 ? "POSITIVE" : "NEGATIVE",
  };
}

export function listClientAccounts(adminUserId) {
  const db = readDb();
  const admin = db.users.find((item) => item.id === adminUserId);
  if (!admin?.isAdmin) {
    throw new Error("Acesso restrito ao administrador.");
  }

  const withdrawalsByUser = new Map();
  db.withdrawalRequests.forEach((item) => {
    const current = withdrawalsByUser.get(item.userId) || 0;
    if (item.status === "PAID") {
      withdrawalsByUser.set(item.userId, current + Number(item.amount || 0));
    }
  });

  const depositsByUser = new Map();
  Object.entries(db.pixCharges || {}).forEach(([userId, charges]) => {
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
      availableBalance: Number(db.wallets[user.id]?.available || 0),
      totalDeposited: Number((depositsByUser.get(user.id) || 0).toFixed(2)),
      totalWithdrawn: Number((withdrawalsByUser.get(user.id) || 0).toFixed(2)),
      createdAt: user.createdAt || Date.now(),
    }));
}

export function updateClientAccount(adminUserId, payload) {
  const db = readDb();
  const admin = db.users.find((item) => item.id === adminUserId);
  if (!admin?.isAdmin) {
    throw new Error("Acesso restrito ao administrador.");
  }

  const userId = String(payload?.userId || "");
  const user = db.users.find((item) => item.id === userId && !item.isAdmin);
  if (!user) {
    throw new Error("Cliente não encontrado.");
  }

  const nextName = String(payload?.name || user.name).trim();
  const nextEmail = String(payload?.email || user.email).trim().toLowerCase();
  const nextCpf = String(payload?.cpf || user.cpf || "").trim();
  const nextPixKey = String(payload?.pixKey || user.pixKey || "").trim();
  const nextAddress = String(payload?.address || user.address || "").trim();
  const nextIsActive = payload?.isActive !== undefined ? Boolean(payload.isActive) : user.isActive !== false;
  const balanceAdjustment = Number(payload?.balanceAdjustment || 0);

  const emailInUse = db.users.some(
    (item) => item.id !== user.id && String(item.email || "").toLowerCase() === nextEmail,
  );
  if (emailInUse) {
    throw new Error("E-mail já está em uso por outra conta.");
  }

  if (!nextName || !nextEmail) {
    throw new Error("Nome e e-mail são obrigatórios.");
  }

  user.name = nextName;
  user.email = nextEmail;
  user.cpf = nextCpf;
  user.pixKey = nextPixKey;
  user.address = nextAddress;
  user.isActive = nextIsActive;

  const wallet = db.wallets[user.id];
  if (!wallet) {
    throw new Error("Carteira do cliente não encontrada.");
  }

  if (Number.isFinite(balanceAdjustment) && Math.abs(balanceAdjustment) > 0.000001) {
    const nextBalance = Number((Number(wallet.available || 0) + balanceAdjustment).toFixed(2));
    if (nextBalance < 0) {
      throw new Error("Ajuste inválido: saldo do cliente ficaria negativo.");
    }
    wallet.available = nextBalance;

    recordTransaction(db, user.id, {
      category: "admin",
      eventType: "ADMIN_BALANCE_ADJUSTMENT",
      status: "CONFIRMED",
      amount: Number(balanceAdjustment.toFixed(2)),
      balanceAfter: Number(wallet.available),
      referenceId: `ADMIN-${admin.id.slice(0, 6)}`,
      description: `Ajuste manual de saldo por administrador (${balanceAdjustment >= 0 ? "+" : ""}${balanceAdjustment.toFixed(2)})`,
      createdAt: Date.now(),
    });
  }

  writeDb(db);
  return {
    userId: user.id,
    name: user.name,
    email: user.email,
    cpf: user.cpf || "",
    pixKey: user.pixKey || "",
    address: user.address || "",
    isActive: user.isActive !== false,
    availableBalance: Number(wallet.available || 0),
    createdAt: user.createdAt || Date.now(),
  };
}

export function getMarketSnapshot() {
  const db = readDb();
  const signal = Math.random() > 0.5 ? 1 : -1;
  const delta = Math.random() * 0.0022 * signal;
  db.market.price = Number((db.market.price + delta).toFixed(5));
  db.market.variation = Number((db.market.variation + delta * 100).toFixed(2));
  db.market.updatedAt = Date.now();
  writeDb(db);
  return { ...db.market };
}
