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

  const response = await fetch(`${ENDPOINTS.admin}/pix-config/status`, {
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
  provider,
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

  const response = await fetch(`${ENDPOINTS.admin}/pix-config`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Client-Session": session.token,
      ...(adminSecret ? { "X-Admin-Secret": adminSecret } : {}),
    },
    body: JSON.stringify({
      provider,
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

export async function getAwardsConfigAdmin() {
  const session = requireSession();
  ensureAdmin(session);

  if (API_MODE === "real") {
    const response = await fetch(`${ENDPOINTS.admin}/awards`, {
      headers: {
        Authorization: `Bearer ${session.token}`,
      },
    });

    if (!response.ok) {
      throw new Error("Falha ao carregar premiações.");
    }

    return response.json();
  }

  return DEFAULT_AWARDS;
}

export async function updateAwardsConfigAdmin({ awards }) {
  const session = requireSession();
  ensureAdmin(session);

  if (API_MODE === "real") {
    const response = await fetch(`${ENDPOINTS.admin}/awards`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.token}`,
      },
      body: JSON.stringify({ awards }),
    });

    if (!response.ok) {
      throw new Error("Falha ao salvar premiações.");
    }

    return response.json();
  }

  return awards;
}

export async function getContentConfigAdmin() {
  const session = requireSession();
  ensureAdmin(session);

  if (API_MODE === "real") {
    const response = await fetch(`${ENDPOINTS.admin}/content`, {
      headers: {
        Authorization: `Bearer ${session.token}`,
      },
    });
    if (!response.ok) throw new Error("Falha ao carregar conteúdo/banners.");
    return response.json();
  }
  return {
    banners: {},
    bonusCpa: { pageTitle: "Bônus e CPA", pageText: "", cpaValue: 20, recurringRatePct: 20 },
  };
}

export async function updateContentConfigAdmin({ content }) {
  const session = requireSession();
  ensureAdmin(session);

  if (API_MODE === "real") {
    const response = await fetch(`${ENDPOINTS.admin}/content`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.token}`,
      },
      body: JSON.stringify(content),
    });
    if (!response.ok) throw new Error("Falha ao salvar conteúdo/banners.");
    return response.json();
  }
  return content;
}

export async function listSupportTicketsAdmin() {
  const session = requireSession();
  ensureAdmin(session);
  if (API_MODE === "real") {
    const response = await fetch(`${ENDPOINTS.admin}/support/tickets`, {
      headers: {
        Authorization: `Bearer ${session.token}`,
      },
    });
    if (!response.ok) throw new Error("Falha ao listar chamados de suporte.");
    return response.json();
  }
  return [];
}

export async function listAffiliateApplicationsAdmin() {
  const session = requireSession();
  ensureAdmin(session);
  if (API_MODE === "real") {
    const response = await fetch(`${ENDPOINTS.admin}/affiliates/applications`, {
      headers: {
        Authorization: `Bearer ${session.token}`,
      },
    });
    if (!response.ok) throw new Error("Falha ao listar solicitações de afiliado.");
    return response.json();
  }
  return [];
}

export async function approveAffiliateApplicationAdmin({ requestId }) {
  const session = requireSession();
  ensureAdmin(session);
  if (API_MODE === "real") {
    const response = await fetch(
      `${ENDPOINTS.admin}/affiliates/applications/${encodeURIComponent(requestId)}/approve`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.token}`,
        },
      },
    );
    if (!response.ok) throw new Error("Falha ao aprovar afiliado.");
    return response.json();
  }
  return { requestId, status: "APPROVED" };
}

export async function rejectAffiliateApplicationAdmin({ requestId, reason }) {
  const session = requireSession();
  ensureAdmin(session);
  if (API_MODE === "real") {
    const response = await fetch(
      `${ENDPOINTS.admin}/affiliates/applications/${encodeURIComponent(requestId)}/reject`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({ reason }),
      },
    );
    if (!response.ok) throw new Error("Falha ao rejeitar afiliado.");
    return response.json();
  }
  return { requestId, status: "REJECTED", reason };
}
