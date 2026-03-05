import { API_MODE, ENDPOINTS } from "../config.js";
import { requireSession } from "../store.js";

const DEFAULT_CONTENT = {
  banners: {
    dashboard_after_awards: { enabled: false, title: "", text: "", imageUrl: "", linkUrl: "" },
    awards_before_progress: { enabled: false, title: "", text: "", imageUrl: "", linkUrl: "" },
    deposit_after_generate: { enabled: false, title: "", text: "", imageUrl: "", linkUrl: "" },
    trade_before_history: { enabled: false, title: "", text: "", imageUrl: "", linkUrl: "" },
    bonus_bottom: { enabled: false, title: "", text: "", imageUrl: "", linkUrl: "" },
  },
  bonusCpa: {
    pageTitle: "Bônus e CPA",
    pageText:
      "Programa de afiliados com CPA fixo no 1º depósito e comissão percentual nos próximos depósitos do indicado.",
    cpaValue: 20,
    recurringRatePct: 20,
  },
};

export async function getContentConfig() {
  const session = requireSession();
  if (API_MODE === "real") {
    const response = await fetch(ENDPOINTS.content, {
      headers: {
        Authorization: `Bearer ${session.token}`,
      },
    });
    if (!response.ok) throw new Error("Falha ao carregar conteúdo.");
    return response.json();
  }
  return DEFAULT_CONTENT;
}
