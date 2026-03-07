import { getMarketSnapshot } from "../mocks/mock-db.js";

const BINANCE_BASE_URL = "https://api.binance.com";
const BRAPI_BASE_URL = "https://brapi.dev/api/quote";
const lastTickerBySymbol = new Map();

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
  const url = `${BINANCE_BASE_URL}/api/v3/ticker/bookTicker?symbol=${encodeURIComponent(providerSymbol)}`;
  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    const fallbackUrl = `${BINANCE_BASE_URL}/api/v3/ticker/price?symbol=${encodeURIComponent(providerSymbol)}`;
    const fallbackResponse = await fetch(fallbackUrl, {
      method: "GET",
      cache: "no-store",
    });
    if (!fallbackResponse.ok) {
      throw new Error("Falha no provedor Binance");
    }
    const fallbackData = await fallbackResponse.json();
    const fallbackPrice = Number(fallbackData?.price);
    const previous = lastTickerBySymbol.get(symbolCode);
    const variation = previous?.price > 0 ? ((fallbackPrice - previous.price) / previous.price) * 100 : 0;
    const normalized = normalizeTicker({
      symbolCode,
      providerSymbol,
      price: fallbackPrice,
      variation,
      source: "binance",
    });
    lastTickerBySymbol.set(symbolCode, normalized);
    return normalized;
  }

  const data = await response.json();
  const bid = Number(data?.bidPrice);
  const ask = Number(data?.askPrice);
  let price = Number.isFinite(bid) && Number.isFinite(ask) && bid > 0 && ask > 0 ? (bid + ask) / 2 : 0;

  if (!Number.isFinite(price) || price <= 0) {
    price = Number(data?.price);
  }

  const previous = lastTickerBySymbol.get(symbolCode);
  if (previous?.price > 0 && Number.isFinite(bid) && Number.isFinite(ask) && ask > bid) {
    // Mantém o gráfico responsivo em mercados com pouca variação entre ticks.
    const spread = ask - bid;
    if (Math.abs(price - previous.price) < spread * 0.03) {
      const bias = (Math.random() - 0.5) * spread * 0.6;
      price = previous.price + bias;
    }
  }

  const variation = previous?.price > 0 ? ((price - previous.price) / previous.price) * 100 : 0;
  const normalized = normalizeTicker({
    symbolCode,
    providerSymbol,
    price,
    variation,
    source: "binance",
  });
  lastTickerBySymbol.set(symbolCode, normalized);

  return normalized;
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
  const normalized = {
    symbolCode,
    providerSymbol,
    price: Number(mock.price),
    variation: Number(mock.variation),
    source: "mock",
    timestamp: Date.now(),
  };
  lastTickerBySymbol.set(symbolCode, normalized);
  return normalized;
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
