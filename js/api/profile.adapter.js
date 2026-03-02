import { API_MODE, ENDPOINTS } from "../config.js";
import {
  createWithdrawalRequest,
  getUserProfile,
  listMyTransactions,
  listMyWithdrawalRequests,
  updateUserProfile,
} from "../mocks/mock-db.js";
import { requireSession } from "../store.js";

export async function getProfile() {
  const session = requireSession();

  if (API_MODE === "real") {
    const response = await fetch(`${ENDPOINTS.auth}/profile`, {
      headers: {
        Authorization: `Bearer ${session.token}`,
      },
    });

    if (!response.ok) {
      throw new Error("Falha ao carregar perfil.");
    }

    return response.json();
  }

  return getUserProfile(session.user.id);
}

export async function saveProfile(payload) {
  const session = requireSession();

  if (API_MODE === "real") {
    const response = await fetch(`${ENDPOINTS.auth}/profile`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.token}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error("Falha ao salvar perfil.");
    }

    return response.json();
  }

  return updateUserProfile(session.user.id, payload);
}

export async function requestWithdrawal({ amount }) {
  const session = requireSession();

  if (API_MODE === "real") {
    const response = await fetch(`${ENDPOINTS.wallet}/withdrawals`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.token}`,
      },
      body: JSON.stringify({ amount }),
    });

    if (!response.ok) {
      throw new Error("Falha ao solicitar saque.");
    }

    return response.json();
  }

  return createWithdrawalRequest(session.user.id, Number(amount));
}

export async function listMyWithdrawals() {
  const session = requireSession();

  if (API_MODE === "real") {
    const response = await fetch(`${ENDPOINTS.wallet}/withdrawals`, {
      headers: {
        Authorization: `Bearer ${session.token}`,
      },
    });

    if (!response.ok) {
      throw new Error("Falha ao listar saques.");
    }

    return response.json();
  }

  return listMyWithdrawalRequests(session.user.id);
}

export async function listClientTransactions() {
  const session = requireSession();

  if (API_MODE === "real") {
    const response = await fetch(`${ENDPOINTS.wallet}/transactions`, {
      headers: {
        Authorization: `Bearer ${session.token}`,
      },
    });

    if (!response.ok) {
      throw new Error("Falha ao carregar extrato do cliente.");
    }

    return response.json();
  }

  return listMyTransactions(session.user.id);
}
