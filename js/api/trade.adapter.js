import { API_MODE, APP_CONFIG, ENDPOINTS } from "../config.js";
import { createTrade as createTradeMock, listTrades as listTradesMock, resolveTrade as resolveTradeMock } from "../mocks/mock-db.js";
import { requireSession } from "../store.js";

export async function createTrade({ symbol, amount, direction, expirySeconds, openPrice }) {
  const session = requireSession();

  if (API_MODE === "real") {
    const response = await fetch(`${ENDPOINTS.trades}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.token}`,
      },
      body: JSON.stringify({ symbol, amount, direction, expirySeconds, openPrice }),
    });

    if (!response.ok) {
      throw new Error("Falha ao criar operação.");
    }

    return response.json();
  }

  return createTradeMock(session.user.id, {
    symbol,
    amount: Number(amount),
    direction,
    expirySeconds: Number(expirySeconds),
    openPrice: Number(openPrice),
  });
}

export async function resolveTrade({ tradeId, currentPrice }) {
  const session = requireSession();

  if (API_MODE === "real") {
    const response = await fetch(`${ENDPOINTS.trades}/${encodeURIComponent(tradeId)}/resolve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.token}`,
      },
      body: JSON.stringify({ currentPrice }),
    });

    if (!response.ok) {
      throw new Error("Falha ao resolver operação.");
    }

    return response.json();
  }

  return resolveTradeMock(session.user.id, tradeId, APP_CONFIG.payoutRate, Number(currentPrice));
}

export async function listTrades() {
  const session = requireSession();

  if (API_MODE === "real") {
    const response = await fetch(`${ENDPOINTS.trades}`, {
      headers: {
        Authorization: `Bearer ${session.token}`,
      },
    });

    if (!response.ok) {
      throw new Error("Falha ao listar operações.");
    }

    return response.json();
  }

  return listTradesMock(session.user.id);
}
