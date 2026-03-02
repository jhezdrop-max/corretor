import { API_MODE, ENDPOINTS } from "../config.js";
import { applyDeposit as applyDepositMock, getWallet } from "../mocks/mock-db.js";
import { requireSession } from "../store.js";

export async function getBalance() {
  const session = requireSession();

  if (API_MODE === "real") {
    const response = await fetch(`${ENDPOINTS.wallet}/balance`, {
      headers: {
        Authorization: `Bearer ${session.token}`,
      },
    });

    if (!response.ok) {
      throw new Error("Falha ao consultar saldo.");
    }

    return response.json();
  }

  return getWallet(session.user.id);
}

export async function applyDeposit({ amount, txid }) {
  const session = requireSession();

  if (API_MODE === "real") {
    const response = await fetch(`${ENDPOINTS.wallet}/deposit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.token}`,
      },
      body: JSON.stringify({ amount, txid }),
    });

    if (!response.ok) {
      throw new Error("Falha ao aplicar depósito.");
    }

    return response.json();
  }

  return applyDepositMock(session.user.id, txid);
}
