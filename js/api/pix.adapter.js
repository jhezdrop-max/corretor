import { API_MODE, ENDPOINTS, PIX_MODE } from "../config.js";
import { createPixCharge as createPixChargeMock, getPixChargeStatus as getPixChargeStatusMock } from "../mocks/mock-db.js";
import { requireSession } from "../store.js";

export async function createPixCharge({ amount, paymentMethod = "pix", card = null }) {
  const session = requireSession();
  const customer = {
    name: session.user?.name || "Cliente Bye Trader",
    email: session.user?.email || "cliente@byetrader.com",
    phone_number: "11999999999",
    document: String(session.user?.cpf || "").replace(/\D/g, "") || "00000000000",
  };

  if (PIX_MODE === "proxy" || API_MODE === "real") {
    const response = await fetch(`${ENDPOINTS.pix}/charges`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Client-Session": session.token,
      },
      body: JSON.stringify({ amount, customer, paymentMethod, card }),
    });

    if (!response.ok) {
      let payload = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
      throw new Error(payload?.error || "Falha ao criar cobrança de depósito.");
    }

    return response.json();
  }

  return createPixChargeMock(session.user.id, Number(amount));
}

export async function getPixChargeStatus({ txid }) {
  const session = requireSession();

  if (PIX_MODE === "proxy" || API_MODE === "real") {
    const response = await fetch(`${ENDPOINTS.pix}/charges/${encodeURIComponent(txid)}`, {
      headers: {
        "X-Client-Session": session.token,
      },
    });

    if (!response.ok) {
      let payload = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
      throw new Error(payload?.error || "Falha ao consultar status Pix.");
    }

    return response.json();
  }

  return getPixChargeStatusMock(session.user.id, txid);
}
