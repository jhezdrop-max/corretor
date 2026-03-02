import { API_MODE, ENDPOINTS } from "../config.js";
import {
  approveWithdrawalRequest,
  getAdminPlatformStats,
  listClientAccounts as listClientAccountsMock,
  listAllTransactions,
  listAllWithdrawalRequests,
  payWithdrawalRequest,
  rejectWithdrawalRequest,
  updateClientAccount as updateClientAccountMock,
} from "../mocks/mock-db.js";
import { requireSession } from "../store.js";

function ensureAdmin(session) {
  if (!session.user?.isAdmin) {
    throw new Error("Acesso restrito ao administrador.");
  }
}

export async function getPlatformStats() {
  const session = requireSession();
  ensureAdmin(session);

  if (API_MODE === "real") {
    const response = await fetch(`${ENDPOINTS.wallet}/admin/stats`, {
      headers: {
        Authorization: `Bearer ${session.token}`,
      },
    });

    if (!response.ok) {
      throw new Error("Falha ao carregar métricas administrativas.");
    }

    return response.json();
  }

  return getAdminPlatformStats(session.user.id);
}

export async function listWithdrawRequests() {
  const session = requireSession();
  ensureAdmin(session);

  if (API_MODE === "real") {
    const response = await fetch(`${ENDPOINTS.wallet}/admin/withdrawals`, {
      headers: {
        Authorization: `Bearer ${session.token}`,
      },
    });

    if (!response.ok) {
      throw new Error("Falha ao listar saques pendentes.");
    }

    return response.json();
  }

  return listAllWithdrawalRequests(session.user.id);
}

export async function approveWithdrawRequest({ requestId }) {
  const session = requireSession();
  ensureAdmin(session);

  if (API_MODE === "real") {
    const response = await fetch(`${ENDPOINTS.wallet}/admin/withdrawals/${encodeURIComponent(requestId)}/processing`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.token}`,
      },
    });

    if (!response.ok) {
      throw new Error("Falha ao aprovar saque.");
    }

    return response.json();
  }

  return approveWithdrawalRequest(session.user.id, requestId);
}

export async function payWithdrawRequest({ requestId }) {
  const session = requireSession();
  ensureAdmin(session);

  if (API_MODE === "real") {
    const response = await fetch(`${ENDPOINTS.wallet}/admin/withdrawals/${encodeURIComponent(requestId)}/pay`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.token}`,
      },
    });

    if (!response.ok) {
      throw new Error("Falha ao marcar saque como pago.");
    }

    return response.json();
  }

  return payWithdrawalRequest(session.user.id, requestId);
}

export async function rejectWithdrawRequest({ requestId, reason }) {
  const session = requireSession();
  ensureAdmin(session);

  if (API_MODE === "real") {
    const response = await fetch(`${ENDPOINTS.wallet}/admin/withdrawals/${encodeURIComponent(requestId)}/reject`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.token}`,
      },
      body: JSON.stringify({ reason }),
    });

    if (!response.ok) {
      throw new Error("Falha ao rejeitar saque.");
    }

    return response.json();
  }

  return rejectWithdrawalRequest(session.user.id, requestId, reason);
}

export async function listAllClientTransactions() {
  const session = requireSession();
  ensureAdmin(session);

  if (API_MODE === "real") {
    const response = await fetch(`${ENDPOINTS.wallet}/admin/transactions`, {
      headers: {
        Authorization: `Bearer ${session.token}`,
      },
    });

    if (!response.ok) {
      throw new Error("Falha ao listar transações dos clientes.");
    }

    return response.json();
  }

  return listAllTransactions(session.user.id);
}

export async function listClientAccounts() {
  const session = requireSession();
  ensureAdmin(session);

  if (API_MODE === "real") {
    const response = await fetch(`${ENDPOINTS.wallet}/admin/clients`, {
      headers: {
        Authorization: `Bearer ${session.token}`,
      },
    });

    if (!response.ok) {
      throw new Error("Falha ao listar contas de clientes.");
    }

    return response.json();
  }

  return listClientAccountsMock(session.user.id);
}

export async function updateClientAccount({ userId, name, email, cpf, pixKey, address, isActive, balanceAdjustment }) {
  const session = requireSession();
  ensureAdmin(session);

  if (API_MODE === "real") {
    const response = await fetch(`${ENDPOINTS.wallet}/admin/clients/${encodeURIComponent(userId)}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.token}`,
      },
      body: JSON.stringify({
        name,
        email,
        cpf,
        pixKey,
        address,
        isActive,
        balanceAdjustment,
      }),
    });

    if (!response.ok) {
      throw new Error("Falha ao atualizar conta do cliente.");
    }

    return response.json();
  }

  return updateClientAccountMock(session.user.id, {
    userId,
    name,
    email,
    cpf,
    pixKey,
    address,
    isActive,
    balanceAdjustment,
  });
}

export async function getPixConfigStatus({ adminSecret = "" } = {}) {
  const session = requireSession();
  ensureAdmin(session);

  const response = await fetch(`/api/admin/pix-config/status`, {
    headers: {
      "X-Client-Session": session.token,
      ...(adminSecret ? { "X-Admin-Secret": adminSecret } : {}),
    },
  });

  if (!response.ok) {
    throw new Error("Falha ao consultar status de configuração Pix.");
  }

  return response.json();
}

export async function savePixConfig({
  baseUrl,
  createPath,
  statusPathTemplate,
  authScheme,
  offerHash,
  productHash,
  productTitle,
  productCover,
  productSalePage,
  apiToken,
  adminSecret = "",
}) {
  const session = requireSession();
  ensureAdmin(session);

  const response = await fetch(`/api/admin/pix-config`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Client-Session": session.token,
      ...(adminSecret ? { "X-Admin-Secret": adminSecret } : {}),
    },
    body: JSON.stringify({
      baseUrl,
      createPath,
      statusPathTemplate,
      authScheme,
      offerHash,
      productHash,
      productTitle,
      productCover,
      productSalePage,
      apiToken,
    }),
  });

  if (!response.ok) {
    throw new Error("Falha ao salvar configuração Pix.");
  }

  return response.json();
}
