import { API_MODE, ENDPOINTS } from "../config.js";
import { requireSession } from "../store.js";

const MOCK_STATE = {
  status: "NONE",
  whatsapp: "",
  referralCode: "",
  totalCpa: 0,
  referredDepositors: 0,
  pendingApplication: null,
  cpaValue: 20,
};

export async function getAffiliateMe() {
  const session = requireSession();
  if (API_MODE === "real") {
    const response = await fetch(`${ENDPOINTS.affiliates}/me`, {
      headers: {
        Authorization: `Bearer ${session.token}`,
      },
    });
    if (!response.ok) throw new Error("Falha ao carregar dados de afiliado.");
    return response.json();
  }
  return { ...MOCK_STATE };
}

export async function applyAffiliate({ whatsapp }) {
  const session = requireSession();
  if (API_MODE === "real") {
    const response = await fetch(`${ENDPOINTS.affiliates}/apply`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.token}`,
      },
      body: JSON.stringify({ whatsapp }),
    });
    if (!response.ok) throw new Error("Falha ao solicitar afiliação.");
    return response.json();
  }
  MOCK_STATE.status = "PENDING";
  MOCK_STATE.whatsapp = whatsapp;
  MOCK_STATE.pendingApplication = {
    requestId: `mock-aff-${Date.now()}`,
    status: "PENDING",
    createdAt: Date.now(),
  };
  return MOCK_STATE.pendingApplication;
}

