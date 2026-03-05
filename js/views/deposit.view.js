import { createPixCharge, getPixChargeStatus } from "../api/pix.adapter.js";
import { getContentConfig } from "../api/content.adapter.js";
import { renderBannerBlock } from "../components/banner.js";
import { applyDeposit, getBalance } from "../api/wallet.adapter.js";
import { formatCurrency, formatDateTime } from "../store.js";
import { showToast } from "../components/toast.js";
import { updateHeaderBalance } from "../components/header.js";

function formatCountdown(expiresAt) {
  const distance = Math.max(0, expiresAt - Date.now());
  const minutes = Math.floor(distance / 60000)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor((distance % 60000) / 1000)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export async function renderDepositView(container) {
  let charge = null;
  let countdownTimer = null;

  const [wallet, contentConfig] = await Promise.all([getBalance(), getContentConfig()]);

  container.innerHTML = `
    <section class="main-content anim-fade-up">
      <div class="section-card">
        <div class="section-header">
          <h3>Depósito via Pix</h3>
          <span class="mono">Saldo atual: ${formatCurrency(wallet.available)}</span>
        </div>

        <form id="deposit-form" class="form-grid" style="max-width: 420px;">
          <div class="field">
            <label for="deposit-amount">Valor do depósito (R$)</label>
            <input class="input" id="deposit-amount" type="number" min="30" step="0.01" placeholder="100.00" required />
          </div>
          <button class="btn btn-primary" type="submit">Gerar Cobrança Pix</button>
          <p class="help-text">Depósito mínimo: R$ 30,00. API Pix: <span class="mono">createPixCharge()</span> e <span class="mono">getPixChargeStatus()</span>.</p>
        </form>
        ${renderBannerBlock(contentConfig, "deposit_after_generate")}

        <div id="deposit-message" class="hidden" style="margin-top:1rem;"></div>
      </div>

      <div id="pix-result" class="section-card hidden"></div>
    </section>
  `;

  const form = container.querySelector("#deposit-form");
  const messageBox = container.querySelector("#deposit-message");
  const resultBox = container.querySelector("#pix-result");

  function showMessage(message, type = "error") {
    messageBox.textContent = message;
    messageBox.className = type === "success" ? "success-box" : type === "info" ? "info-box" : "error-box";
  }

  function renderCharge() {
    if (!charge) {
      resultBox.classList.add("hidden");
      return;
    }

    resultBox.classList.remove("hidden");
    const hasCopyCode = Boolean(String(charge.copyPaste || "").trim());
    const hasQrImage = Boolean(String(charge.qrCodeBase64 || "").trim());
    resultBox.innerHTML = `
      <div class="section-header">
        <h3>Cobrança ${charge.txid}</h3>
        <span id="pix-status" class="badge ${badgeClass(charge.status)}">${charge.status}</span>
      </div>
      <div class="grid-2">
        <div class="qr-box">
          ${
            hasQrImage
              ? `<img src="${charge.qrCodeBase64}" alt="QR Code Pix" />`
              : '<div class="help-text">QR Code não retornado pela API para esta cobrança.</div>'
          }
        </div>
        <div class="form-grid">
          <div class="field">
            <label>Código Pix Copia e Cola</label>
            <textarea class="input mono" id="pix-copy-code" rows="4" readonly>${charge.copyPaste || ""}</textarea>
          </div>
          ${
            !hasCopyCode
              ? '<div class="info-box">A API não retornou código Pix EMV para copiar. Confirme no botão "Já paguei" após efetuar o pagamento no seu banco.</div>'
              : ""
          }
          <div class="help-text">Valor: ${formatCurrency(charge.amount)} | Expira em: <strong id="pix-countdown" class="mono">${formatCountdown(charge.expiresAt)}</strong></div>
          <div class="help-text">Criado em: ${formatDateTime(charge.createdAt)}</div>
          <div class="inline-actions">
            <button class="btn btn-secondary" id="pix-copy-btn">Copiar Código</button>
            <button class="btn btn-primary" id="pix-check-btn">Já paguei</button>
          </div>
        </div>
      </div>
    `;

    resultBox.querySelector("#pix-copy-btn")?.addEventListener("click", async () => {
      const input = resultBox.querySelector("#pix-copy-code");
      if (!input.value.trim()) {
        showToast("Sem código Pix para copiar nesta cobrança.", "error");
        return;
      }
      await navigator.clipboard.writeText(input.value);
      showToast("Código Pix copiado.", "success");
    });

    resultBox.querySelector("#pix-check-btn")?.addEventListener("click", checkPayment);

    if (countdownTimer) {
      clearInterval(countdownTimer);
    }

    countdownTimer = setInterval(() => {
      const node = resultBox.querySelector("#pix-countdown");
      if (node) {
        node.textContent = formatCountdown(charge.expiresAt);
      }

      if (Date.now() > charge.expiresAt && charge.status === "PENDING") {
        charge.status = "EXPIRED";
        refreshStatusBadge();
        clearInterval(countdownTimer);
      }
    }, 1000);
  }

  function badgeClass(status) {
    if (status === "PAID") return "badge-paid";
    if (status === "EXPIRED") return "badge-expired";
    return "badge-pending";
  }

  function refreshStatusBadge() {
    const badge = resultBox.querySelector("#pix-status");
    if (badge) {
      badge.className = `badge ${badgeClass(charge.status)}`;
      badge.textContent = charge.status;
    }
  }

  async function checkPayment() {
    if (!charge) return;

    try {
      const statusResult = await getPixChargeStatus({ txid: charge.txid });
      charge.status = statusResult.status;
      refreshStatusBadge();

      if (charge.status === "PAID") {
        const updatedWallet = await applyDeposit({ amount: charge.amount, txid: charge.txid });
        updateHeaderBalance(updatedWallet.available);
        showMessage(`Pagamento confirmado. Novo saldo: ${formatCurrency(updatedWallet.available)}`, "success");
        showToast("Depósito confirmado e saldo atualizado.", "success");
      } else if (charge.status === "EXPIRED") {
        showMessage("Cobrança expirada. Gere uma nova cobrança Pix.");
      } else {
        showMessage("Pagamento ainda pendente. Tente novamente em instantes.", "info");
      }
    } catch (error) {
      showMessage(error.message || "Falha ao consultar status da cobrança.");
    }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    messageBox.className = "hidden";

    const amount = Number(container.querySelector("#deposit-amount").value);

    if (!amount || amount < 30) {
      showMessage("O valor mínimo para depósito é R$ 30,00.");
      return;
    }

    try {
      charge = await createPixCharge({ amount });
      showMessage(`Cobrança ${charge.txid} criada com sucesso.`, "success");
      renderCharge();
    } catch (error) {
      showMessage(error.message || "Não foi possível gerar cobrança Pix.");
    }
  });

  return () => {
    if (countdownTimer) {
      clearInterval(countdownTimer);
    }
  };
}
