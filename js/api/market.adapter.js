import { getMarketSnapshot } from "../mocks/mock-db.js";

const BINANCE_BASE_URL = "https://api.binance.com";
const BRAPI_BASE_URL = "https://brapi.dev/api/quote";

function normalizeTicker({ symbolCode, providerSymbol, price, variation, source }) {
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error("Preço inválido do provedor de mercado.");
  }

  return {
    symbolCode,
    providerSymbol,
    price: Number(price),
    variation: Number(variation || 0),
    source,
    timestamp: Date.now(),
  };
}

async function getBinanceTicker({ symbolCode, providerSymbol }) {
  const url = `${BINANCE_BASE_URL}/api/v3/ticker/price?symbol=${encodeURIComponent(providerSymbol)}`;
  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Falha no provedor Binance");
  }

  const data = await response.json();
  return normalizeTicker({
    symbolCode,
    providerSymbol,
    price: Number(data?.price),
    variation: 0,
    source: "binance",
  });
}

async function getBrapiTicker({ symbolCode, providerSymbol }) {
  const url = `${BRAPI_BASE_URL}/${encodeURIComponent(providerSymbol)}?range=1d&interval=1d&fundamental=false`;
  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Falha no provedor BRAPI");
  }

  const data = await response.json();
  const result = Array.isArray(data?.results) ? data.results[0] : null;
  const price = Number(result?.regularMarketPrice);
  const variation = Number(result?.regularMarketChangePercent || 0);

  return normalizeTicker({
    symbolCode,
    providerSymbol,
    price,
    variation,
    source: "brapi",
  });
}

function getMockTicker({ symbolCode, providerSymbol }) {
  const mock = getMarketSnapshot();
  return {
    symbolCode,
    providerSymbol,
    price: Number(mock.price),
    variation: Number(mock.variation),
    source: "mock",
    timestamp: Date.now(),
  };
}

export async function getLiveTicker({ symbolCode, providerSymbol, provider = "binance" }) {
  try {
    if (provider === "brapi") {
      return await getBrapiTicker({ symbolCode, providerSymbol });
    }
    return await getBinanceTicker({ symbolCode, providerSymbol });
  } catch {
    return getMockTicker({ symbolCode, providerSymbol });
  }
}
