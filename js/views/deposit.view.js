import { createPixCharge, getPixChargeStatus } from "../api/pix.adapter.js";
import { getContentConfig } from "../api/content.adapter.js";
import { renderBannerBlock } from "../components/banner.js";
import { applyDeposit, getBalance } from "../api/wallet.adapter.js";
import { formatCurrency, formatDateTime } from "../store.js";
import { showToast } from "../components/toast.js";
import { updateHeaderBalance } from "../components/header.js";

function formatCountdown(expiresAt) {
  if (!Number.isFinite(Number(expiresAt))) return "--:--";
  const distance = Math.max(0, expiresAt - Date.now());
  const minutes = Math.floor(distance / 60000)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor((distance % 60000) / 1000)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function normalizeQrImageSrc(value, copyPaste = "") {
  const raw = String(value || "").trim();
  const emv = String(copyPaste || "").trim();

  if (!raw) {
    if (emv) {
      return `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(emv)}`;
    }
    return "";
  }
  if (raw.startsWith("data:image/")) return raw;
  if (/^https?:\/\//i.test(raw)) return raw;

  if (raw.length > 120 && /^[A-Za-z0-9+/=\s]+$/.test(raw)) {
    const compact = raw.replace(/\s+/g, "");
    return `data:image/png;base64,${compact}`;
  }

  if (emv) {
    return `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(emv)}`;
  }

  return "";
}

function badgeClass(status) {
  if (status === "PAID") return "badge-paid";
  if (status === "EXPIRED") return "badge-expired";
  return "badge-pending";
}

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

export async function renderDepositView(container) {
  let charge = null;
  let countdownTimer = null;
  let method = "pix";

  const [wallet, contentConfig] = await Promise.all([getBalance(), getContentConfig()]);

  container.innerHTML = `
    <section class="main-content anim-fade-up">
      <div class="section-card">
        <div class="section-header">
          <h3>Depósito (Pix e Cartão 1x)</h3>
          <span class="mono">Saldo atual: ${formatCurrency(wallet.available)}</span>
        </div>

        <div class="tabs" style="margin-bottom:0.8rem;">
          <button class="tab-btn active" data-method="pix" type="button">Pix</button>
          <button class="tab-btn" data-method="credit_card" type="button">Cartão 1x</button>
        </div>

        <form id="deposit-form" class="form-grid" style="max-width: 460px;">
          <div class="field">
            <label for="deposit-amount">Valor do depósito (R$)</label>
            <input class="input" id="deposit-amount" type="number" min="30" step="0.01" placeholder="100.00" required />
          </div>

          <div id="card-fields" class="hidden">
            <div class="field">
              <label for="card-holder">Nome no cartão</label>
              <input class="input" id="card-holder" type="text" placeholder="Nome igual ao cartão" />
            </div>
            <div class="field">
              <label for="card-number">Número do cartão</label>
              <input class="input" id="card-number" type="text" inputmode="numeric" placeholder="0000 0000 0000 0000" maxlength="23" />
            </div>
            <div class="grid-2">
              <div class="field">
                <label for="card-exp-month">Mês</label>
                <input class="input" id="card-exp-month" type="text" inputmode="numeric" placeholder="MM" maxlength="2" />
              </div>
              <div class="field">
                <label for="card-exp-year">Ano</label>
                <input class="input" id="card-exp-year" type="text" inputmode="numeric" placeholder="AA/AAAA" maxlength="4" />
              </div>
            </div>
            <div class="field">
              <label for="card-cvv">CVV</label>
              <input class="input" id="card-cvv" type="password" inputmode="numeric" placeholder="***" maxlength="4" />
            </div>
            <p class="help-text">Pagamento de cartão habilitado somente em 1x.</p>
          </div>

          <button class="btn btn-primary" type="submit" id="deposit-submit-btn">Gerar Cobrança Pix</button>
          <p class="help-text">Depósito mínimo: R$ 30,00.</p>
        </form>

        ${renderBannerBlock(contentConfig, "deposit_after_generate")}

        <div id="deposit-message" class="hidden" style="margin-top:1rem;"></div>
      </div>

      <div id="pix-result" class="section-card hidden"></div>
    </section>
  `;

  const form = container.querySelector("#deposit-form");
  const tabs = [...container.querySelectorAll("[data-method]")];
  const cardFields = container.querySelector("#card-fields");
  const submitBtn = container.querySelector("#deposit-submit-btn");
  const messageBox = container.querySelector("#deposit-message");
  const resultBox = container.querySelector("#pix-result");

  function showMessage(message, type = "error") {
    messageBox.textContent = message;
    messageBox.className = type === "success" ? "success-box" : type === "info" ? "info-box" : "error-box";
  }

  function setMethod(nextMethod) {
    method = nextMethod === "credit_card" ? "credit_card" : "pix";
    tabs.forEach((btn) => btn.classList.toggle("active", btn.dataset.method === method));
    cardFields.classList.toggle("hidden", method !== "credit_card");
    submitBtn.textContent = method === "credit_card" ? "Pagar com Cartão (1x)" : "Gerar Cobrança Pix";
  }

  function refreshStatusBadge() {
    const badge = resultBox.querySelector("#pix-status");
    if (badge && charge) {
      badge.className = `badge ${badgeClass(charge.status)}`;
      badge.textContent = charge.status;
    }
  }

  async function creditIfPaid() {
    if (!charge || charge.status !== "PAID") return;
    try {
      const updatedWallet = await applyDeposit({ amount: charge.amount, txid: charge.txid });
      updateHeaderBalance(updatedWallet.available);
      showMessage(`Pagamento confirmado. Novo saldo: ${formatCurrency(updatedWallet.available)}`, "success");
      showToast("Depósito confirmado e saldo atualizado.", "success");
    } catch (error) {
      showMessage(error.message || "Falha ao creditar depósito.");
    }
  }

  async function checkPayment() {
    if (!charge) return;

    try {
      const statusResult = await getPixChargeStatus({ txid: charge.txid });
      charge.status = statusResult.status;
      refreshStatusBadge();

      if (charge.status === "PAID") {
        await creditIfPaid();
      } else if (charge.status === "EXPIRED") {
        showMessage("Cobrança expirada. Gere uma nova cobrança.");
      } else {
        showMessage("Pagamento ainda pendente. Tente novamente em instantes.", "info");
      }
    } catch (error) {
      showMessage(error.message || "Falha ao consultar status da cobrança.");
    }
  }

  function renderCharge() {
    if (!charge) {
      resultBox.classList.add("hidden");
      return;
    }

    resultBox.classList.remove("hidden");
    const isPix = String(charge.paymentMethod || "pix").toLowerCase() !== "credit_card";

    if (!Number.isFinite(Number(charge.expiresAt)) || Number(charge.expiresAt) <= Date.now()) {
      charge.expiresAt = Date.now() + 10 * 60 * 1000;
    }

    if (isPix) {
      const hasCopyCode = Boolean(String(charge.copyPaste || "").trim());
      const qrImageSrc = normalizeQrImageSrc(charge.qrCodeBase64 || "", charge.copyPaste || "");
      const hasQrImage = Boolean(qrImageSrc);

      resultBox.innerHTML = `
        <div class="section-header">
          <h3>Cobrança ${charge.txid}</h3>
          <span id="pix-status" class="badge ${badgeClass(charge.status)}">${charge.status}</span>
        </div>
        <div class="grid-2">
          <div class="qr-box">
            ${
              hasQrImage
                ? `<img src="${qrImageSrc}" alt="QR Code Pix" />`
                : '<div class="help-text">QR Code não retornado para esta cobrança.</div>'
            }
          </div>
          <div class="form-grid">
            <div class="field">
              <label>Código Pix Copia e Cola</label>
              <textarea class="input mono" id="pix-copy-code" rows="4" readonly>${charge.copyPaste || ""}</textarea>
            </div>
            ${
              !hasCopyCode
                ? '<div class="info-box">A API não retornou código Pix EMV para copiar. Confirme em "Já paguei".</div>'
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

      if (countdownTimer) clearInterval(countdownTimer);
      countdownTimer = setInterval(() => {
        const node = resultBox.querySelector("#pix-countdown");
        if (node) node.textContent = formatCountdown(charge.expiresAt);

        if (Number.isFinite(Number(charge.expiresAt)) && Date.now() > charge.expiresAt && charge.status === "PENDING") {
          charge.status = "EXPIRED";
          refreshStatusBadge();
          clearInterval(countdownTimer);
        }
      }, 1000);
      return;
    }

    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }

    resultBox.innerHTML = `
      <div class="section-header">
        <h3>Pagamento Cartão ${charge.txid}</h3>
        <span id="pix-status" class="badge ${badgeClass(charge.status)}">${charge.status}</span>
      </div>
      <div class="form-grid">
        <div class="info-box">Cartão de crédito em 1x enviado com sucesso. Atualize o status abaixo.</div>
        <div class="help-text">Valor: ${formatCurrency(charge.amount)}</div>
        <div class="help-text">Criado em: ${formatDateTime(charge.createdAt)}</div>
        <div class="inline-actions">
          <button class="btn btn-primary" id="pix-check-btn">Atualizar Status</button>
        </div>
      </div>
    `;

    resultBox.querySelector("#pix-check-btn")?.addEventListener("click", checkPayment);
  }

  tabs.forEach((btn) => {
    btn.addEventListener("click", () => setMethod(btn.dataset.method));
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    messageBox.className = "hidden";

    const amount = Number(container.querySelector("#deposit-amount").value);

    if (!amount || amount < 30) {
      showMessage("O valor mínimo para depósito é R$ 30,00.");
      return;
    }

    let cardPayload = null;
    if (method === "credit_card") {
      const holderName = container.querySelector("#card-holder").value.trim();
      const number = onlyDigits(container.querySelector("#card-number").value);
      const expMonth = onlyDigits(container.querySelector("#card-exp-month").value);
      const expYear = onlyDigits(container.querySelector("#card-exp-year").value);
      const cvv = onlyDigits(container.querySelector("#card-cvv").value);

      if (!holderName || number.length < 13 || expMonth.length < 1 || expYear.length < 2 || cvv.length < 3) {
        showMessage("Preencha corretamente os dados do cartão para pagamento 1x.");
        return;
      }

      cardPayload = { holderName, number, expMonth, expYear, cvv };
    }

    try {
      charge = await createPixCharge({ amount, paymentMethod: method, card: cardPayload });
      showMessage(`${method === "credit_card" ? "Pagamento cartão" : "Cobrança Pix"} ${charge.txid} criada com sucesso.`, "success");
      renderCharge();
      if (charge.status === "PAID") {
        await creditIfPaid();
      }
    } catch (error) {
      showMessage(error.message || "Não foi possível gerar o depósito.");
    }
  });

  return () => {
    if (countdownTimer) clearInterval(countdownTimer);
  };
}
