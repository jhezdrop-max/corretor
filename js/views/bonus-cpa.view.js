import { applyAffiliate, getAffiliateMe } from "../api/affiliate.adapter.js";
import { getContentConfig } from "../api/content.adapter.js";
import { renderBannerBlock } from "../components/banner.js";
import { showToast } from "../components/toast.js";
import { formatCurrency, formatDateTime } from "../store.js";

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function statusBadge(status) {
  if (status === "APPROVED") return '<span class="badge badge-paid">APROVADO</span>';
  if (status === "REJECTED") return '<span class="badge badge-loss">REJEITADO</span>';
  if (status === "PENDING") return '<span class="badge badge-pending">PENDENTE</span>';
  return '<span class="badge badge-pending">NÃO AFILIADO</span>';
}

export async function renderBonusCpaView(container) {
  let [content, affiliate] = await Promise.all([getContentConfig(), getAffiliateMe()]);

  const pageTitle = content?.bonusCpa?.pageTitle || "Bônus e CPA";
  const pageText = content?.bonusCpa?.pageText || "";
  const cpaValue = Number(content?.bonusCpa?.cpaValue || affiliate?.cpaValue || 20);
  const recurringRatePct = Number(content?.bonusCpa?.recurringRatePct || 20);

  container.innerHTML = `
    <section class="main-content anim-fade-up">
      <article class="section-card">
        <div class="section-header">
          <h3>${pageTitle}</h3>
          <span class="mono">CPA: ${formatCurrency(cpaValue)} | Recorrente: ${recurringRatePct.toFixed(2)}%</span>
        </div>
        <p style="color:var(--text-1); margin-bottom:0.85rem;">${pageText}</p>
        <div class="metric-inline">
          <div class="metric-item">
            <small>Status afiliado</small>
            <strong>${statusBadge(affiliate.status)}</strong>
          </div>
        </div>
        ${
          affiliate.status === "APPROVED"
            ? `
          <div class="metric-inline" style="margin-top:0.75rem;">
            <div class="metric-item">
              <small>Total CPA acumulado</small>
              <strong class="mono">${formatCurrency(affiliate.totalCpa || 0)}</strong>
            </div>
            <div class="metric-item">
              <small>Depositantes válidos</small>
              <strong class="mono">${Number(affiliate.referredDepositors || 0)}</strong>
            </div>
          </div>
        `
            : ""
        }
      </article>

      <article class="section-card">
        <div class="section-header">
          <h3>Solicitação de Afiliado</h3>
          <small class="help-text">Para ser afiliado, envie seu WhatsApp para aprovação.</small>
        </div>
        <form id="affiliate-apply-form" class="form-grid" style="max-width:560px;">
          <div class="field">
            <label for="affiliate-whatsapp">WhatsApp para contato</label>
            <input class="input" id="affiliate-whatsapp" type="text" value="${affiliate.whatsapp || ""}" placeholder="(11) 99999-9999" required />
          </div>
          <div class="inline-actions">
            <button class="btn btn-primary" type="submit">Solicitar Afiliação</button>
          </div>
          <div id="affiliate-message" class="hidden"></div>
        </form>

        ${
          affiliate.status === "APPROVED"
            ? `
          <div class="info-box" style="margin-top:0.8rem;">
            Seu código de indicação: <strong class="mono">${affiliate.referralCode || "-"}</strong><br/>
            Link sugerido: <span class="mono">https://byetrader.com/#/auth?ref=${affiliate.referralCode || ""}</span>
          </div>
        `
            : ""
        }

        ${
          affiliate.pendingApplication
            ? `<div class="info-box" style="margin-top:0.8rem;">Última solicitação: ${statusBadge(affiliate.pendingApplication.status)} em ${formatDateTime(affiliate.pendingApplication.createdAt)}</div>`
            : ""
        }
      </article>

      ${renderBannerBlock(content, "bonus_bottom")}
    </section>
  `;

  const messageBox = container.querySelector("#affiliate-message");
  function setMessage(text, type = "error") {
    messageBox.textContent = text;
    messageBox.className = type === "success" ? "success-box" : "error-box";
  }

  container.querySelector("#affiliate-apply-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const whatsapp = onlyDigits(container.querySelector("#affiliate-whatsapp").value);
    if (!whatsapp || whatsapp.length < 10) {
      setMessage("Informe um WhatsApp válido.");
      return;
    }
    try {
      await applyAffiliate({ whatsapp });
      showToast("Solicitação de afiliado enviada.", "success");
      setMessage("Solicitação enviada com sucesso.", "success");
    } catch (error) {
      setMessage(error.message || "Falha ao enviar solicitação.");
    }
  });
}
