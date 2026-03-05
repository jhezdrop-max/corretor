const localConfig = window.__APP_LOCAL_CONFIG__ || {};

export const API_MODE = localConfig.API_MODE || "mock";
export const PIX_MODE = localConfig.PIX_MODE || "mock";

const defaultEndpoints = {
  auth: "/api/auth",
  wallet: "/api/wallet",
  trades: "/api/trades",
  pix: "/api/pix",
  awards: "/api/awards",
  admin: "/api/admin",
  content: "/api/content",
  support: "/api/support",
  affiliates: "/api/affiliates",
};

export const ENDPOINTS = {
  ...defaultEndpoints,
  ...(localConfig.ENDPOINTS || {}),
};

export const APP_CONFIG = {
  currency: "BRL",
  payoutRate: 0.8,
  candleIntervals: [
    { key: "1m", label: "1m", ms: 1 * 60 * 1000 },
    { key: "5m", label: "5m", ms: 5 * 60 * 1000 },
    { key: "15m", label: "15m", ms: 15 * 60 * 1000 },
    { key: "1h", label: "1h", ms: 60 * 60 * 1000 },
  ],
  defaultCandleInterval: "15m",
  symbols: [
    {
      label: "BTC/USD (Cripto)",
      code: "BTCUSD",
      marketType: "crypto",
      provider: "binance",
      providerSymbol: "BTCUSDT",
      precision: 2,
    },
    {
      label: "ETH/USD (Cripto)",
      code: "ETHUSD",
      marketType: "crypto",
      provider: "binance",
      providerSymbol: "ETHUSDT",
      precision: 2,
    },
    {
      label: "SOL/USD (Cripto)",
      code: "SOLUSD",
      marketType: "crypto",
      provider: "binance",
      providerSymbol: "SOLUSDT",
      precision: 3,
    },
    {
      label: "BNB/USD (Cripto)",
      code: "BNBUSD",
      marketType: "crypto",
      provider: "binance",
      providerSymbol: "BNBUSDT",
      precision: 2,
    },
    {
      label: "PETR4 (Ação B3)",
      code: "PETR4",
      marketType: "stock",
      provider: "brapi",
      providerSymbol: "PETR4",
      precision: 2,
    },
    {
      label: "VALE3 (Ação B3)",
      code: "VALE3",
      marketType: "stock",
      provider: "brapi",
      providerSymbol: "VALE3",
      precision: 2,
    },
    {
      label: "ITUB4 (Ação B3)",
      code: "ITUB4",
      marketType: "stock",
      provider: "brapi",
      providerSymbol: "ITUB4",
      precision: 2,
    },
  ],
  expiries: [5, 10, 30],
};
