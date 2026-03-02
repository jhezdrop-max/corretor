import {
  approveWithdrawRequest,
  getPlatformStats,
  getPixConfigStatus,
  listClientAccounts,
  listAllClientTransactions,
  listWithdrawRequests,
  payWithdrawRequest,
  rejectWithdrawRequest,
  savePixConfig,
  updateClientAccount,
} from "../api/admin.adapter.js";
import { openModal } from "../components/modal.js";
import { showToast } from "../components/toast.js";
import { API_MODE } from "../config.js";
import { formatCurrency, formatDateTime } from "../store.js";

function badge(status) {
  if (status === "PAID") return '<span class="badge badge-paid">PAID</span>';
  if (status === "REJECTED") return '<span class="badge badge-loss">REJECTED</span>';
  if (status === "PROCESSING") return '<span class="badge badge-pending">PROCESSING</span>';
  return '<span class="badge badge-pending">PENDING</span>';
}

function txBadge(status) {
  if (status === "CONFIRMED") return '<span class="badge badge-paid">CONFIRMED</span>';
  if (status === "OPEN") return '<span class="badge badge-pending">OPEN</span>';
  return '<span class="badge badge-pending">PENDING</span>';
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}

export async function renderAdminView(container) {
  let stats = await getPlatformStats();
  let requests = await listWithdrawRequests();
  let transactions = await listAllClientTransactions();
  let clientAccounts = await listClientAccounts();
  let autoRefreshTimer = null;

  container.innerHTML = `
    <section class="main-content anim-fade-up">
      <div class="grid-3">
        <article class="card-kpi">
          <p class="kpi-label">Saldo Total de Clientes</p>
          <h2 class="kpi-value mono" id="admin-total-balance">${formatCurrency(stats.totalClientBalance)}</h2>
        </article>
        <article class="card-kpi">
          <p class="kpi-label">Saques Pendentes</p>
          <h2 class="kpi-value mono" id="admin-pending">${stats.pendingWithdrawalsCount} / ${formatCurrency(stats.pendingWithdrawalsAmount)}</h2>
        </article>
        <article class="card-kpi">
          <p class="kpi-label">Volume Pago</p>
          <h2 class="kpi-value mono" id="admin-approved">${formatCurrency(stats.approvedWithdrawalsAmount)}</h2>
        </article>
      </div>

      <div class="grid-3">
        <article class="card-kpi">
          <p class="kpi-label">Saldo da Corretora</p>
          <h2 class="kpi-value mono ${stats.brokerageBalance >= 0 ? "kpi-positive" : "kpi-negative"}" id="admin-brokerage-balance">${formatCurrency(stats.brokerageBalance || 0)}</h2>
        </article>
        <article class="card-kpi">
          <p class="kpi-label">Exposição Total</p>
          <h2 class="kpi-value mono" id="admin-total-liability">${formatCurrency(stats.totalLiability || 0)}</h2>
        </article>
        <article class="card-kpi">
          <p class="kpi-label">Clientes Ativos/Bloqueados</p>
          <h2 class="kpi-value mono" id="admin-clients-status">${stats.clientsActive || 0} / ${stats.clientsBlocked || 0}</h2>
        </article>
      </div>

      <article class="section-card">
        <div class="section-header">
          <h3>Observabilidade</h3>
          <button class="btn btn-secondary" id="refresh-metrics-btn">Atualizar Métricas</button>
        </div>
        <div class="metric-inline">
          <div class="metric-item">
            <small>Requests API</small>
            <strong class="mono" id="obs-requests">-</strong>
          </div>
          <div class="metric-item">
            <small>Erros 4xx</small>
            <strong class="mono" id="obs-4xx">-</strong>
          </div>
          <div class="metric-item">
            <small>Erros 5xx</small>
            <strong class="mono" id="obs-5xx">-</strong>
          </div>
          <div class="metric-item">
            <small>Uptime</small>
            <strong class="mono" id="obs-uptime">-</strong>
          </div>
        </div>
      </article>

      <article class="section-card">
        <div class="section-header">
          <h3>Gestão de Contas de Clientes</h3>
          <div style="display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap;">
            <small class="help-text">Bloquear/ativar conta, editar dados e ajustar saldo manualmente.</small>
            <button class="btn btn-secondary" id="admin-refresh-data-btn" type="button">Atualizar Painel</button>
          </div>
        </div>
        ${
          API_MODE === "mock"
            ? '<div class="info-box" style="margin-bottom:1rem;">Modo mock ativo: os dados de contas são locais deste navegador/dispositivo.</div>'
            : ""
        }
        <div class="grid-3" style="margin-bottom:1rem;">
          <div class="field">
            <label for="client-filter-query">Cliente (nome/e-mail)</label>
            <input class="input" id="client-filter-query" type="text" placeholder="Buscar cliente" />
          </div>
          <div class="field">
            <label for="client-filter-status">Status da conta</label>
            <select class="select" id="client-filter-status">
              <option value="">Todos</option>
              <option value="active">Ativos</option>
              <option value="blocked">Bloqueados</option>
            </select>
          </div>
          <div class="field">
            <label for="client-filter-balance">Saldo</label>
            <select class="select" id="client-filter-balance">
              <option value="">Todos</option>
              <option value="positive">Positivo</option>
              <option value="zero">Zerado</option>
            </select>
          </div>
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Status</th>
                <th>Saldo</th>
                <th>Depósitos</th>
                <th>Saques</th>
                <th>Dados Pix/CPF</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody id="admin-clients-tbody"></tbody>
          </table>
        </div>
      </article>

      <article class="section-card">
        <div class="section-header">
          <h3>Configuração API Pix (Servidor)</h3>
          <small class="help-text">Token fica oculto e salvo apenas no backend.</small>
        </div>
        <form id="pix-config-form" class="form-grid" style="margin-bottom:1rem;">
          <div class="grid-2">
            <div class="field">
              <label for="pix-base-url">URL base do provedor</label>
              <input class="input" id="pix-base-url" type="text" value="https://api.tribopay.com.br/api/public/v1/" required />
            </div>
            <div class="field">
              <label for="pix-auth-scheme">Auth scheme</label>
              <input class="input" id="pix-auth-scheme" type="text" value="Bearer" required />
            </div>
          </div>
          <div class="grid-2">
            <div class="field">
              <label for="pix-create-path">Path criar cobrança</label>
              <input class="input" id="pix-create-path" type="text" value="transactions" required />
            </div>
            <div class="field">
              <label for="pix-status-path">Path status (use {txid})</label>
              <input class="input" id="pix-status-path" type="text" value="transactions/{txid}" required />
            </div>
          </div>
          <div class="grid-2">
            <div class="field">
              <label for="pix-offer-hash">Offer hash</label>
              <input class="input" id="pix-offer-hash" type="text" placeholder="7becb" required />
            </div>
            <div class="field">
              <label for="pix-product-hash">Product hash</label>
              <input class="input" id="pix-product-hash" type="text" placeholder="7tjdfkshdv" required />
            </div>
          </div>
          <div class="field">
            <label for="pix-product-title">Título do produto (cart)</label>
            <input class="input" id="pix-product-title" type="text" value="Deposito Bye Trader" required />
          </div>
          <div class="grid-2">
            <div class="field">
              <label for="pix-product-cover">Cover do produto (opcional)</label>
              <input class="input" id="pix-product-cover" type="text" placeholder="https://..." />
            </div>
            <div class="field">
              <label for="pix-product-sale-page">Sale page (opcional)</label>
              <input class="input" id="pix-product-sale-page" type="text" placeholder="https://byeptrader.com" />
            </div>
          </div>
          <div class="field">
            <label for="pix-api-token">Token API Pix (oculto)</label>
            <input class="input" id="pix-api-token" type="password" placeholder="Cole o token aqui" required />
          </div>
          <div class="field">
            <label for="pix-admin-secret">Segredo admin do servidor (opcional)</label>
            <input class="input" id="pix-admin-secret" type="password" placeholder="Somente se ADMIN_PANEL_SECRET estiver configurado" />
          </div>
          <div class="inline-actions">
            <button class="btn btn-primary" type="submit">Salvar Configuração Pix</button>
            <button class="btn btn-secondary" type="button" id="pix-status-btn">Recarregar Status</button>
          </div>
          <div id="pix-config-status" class="info-box">Carregando status...</div>
        </form>
      </article>

      <article class="section-card">
        <div class="section-header">
          <h3>Painel de Saques (Admin)</h3>
          <small class="help-text">Fluxo: PENDING -> PROCESSING -> PAID / REJECTED</small>
        </div>
        <div id="admin-message" class="hidden" style="margin-bottom:1rem;"></div>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Cliente</th>
                <th>CPF</th>
                <th>Chave Pix</th>
                <th>Endereço</th>
                <th>Valor</th>
                <th>Status</th>
                <th>Ação</th>
              </tr>
            </thead>
            <tbody id="admin-withdraw-tbody"></tbody>
          </table>
        </div>
      </article>

      <article class="section-card">
        <div class="section-header">
          <h3>Todas as Transações dos Clientes</h3>
          <small class="help-text">Controle completo de depósito, saque e trade por cliente.</small>
        </div>
        <div class="grid-3" style="margin-bottom:1rem;">
          <div class="field">
            <label for="tx-filter-client">Cliente (nome/e-mail)</label>
            <input class="input" id="tx-filter-client" type="text" placeholder="Buscar cliente" />
          </div>
          <div class="field">
            <label for="tx-filter-category">Categoria</label>
            <select class="select" id="tx-filter-category">
              <option value="">Todas</option>
              <option value="deposit">deposit</option>
              <option value="withdraw">withdraw</option>
              <option value="trade">trade</option>
              <option value="admin">admin</option>
            </select>
          </div>
          <div class="field">
            <label for="tx-filter-status">Status</label>
            <select class="select" id="tx-filter-status">
              <option value="">Todos</option>
              <option value="CONFIRMED">CONFIRMED</option>
              <option value="PENDING">PENDING</option>
              <option value="OPEN">OPEN</option>
            </select>
          </div>
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Cliente</th>
                <th>Categoria</th>
                <th>Evento</th>
                <th>Status</th>
                <th>Valor</th>
                <th>Saldo Após</th>
                <th>Referência</th>
              </tr>
            </thead>
            <tbody id="admin-transactions-tbody"></tbody>
          </table>
        </div>
      </article>
    </section>
  `;

  const message = container.querySelector("#admin-message");
  const tbody = container.querySelector("#admin-withdraw-tbody");
  const transactionsTbody = container.querySelector("#admin-transactions-tbody");
  const clientsTbody = container.querySelector("#admin-clients-tbody");
  const pixStatusNode = container.querySelector("#pix-config-status");

  function setMessage(text, type = "error") {
    message.textContent = text;
    message.className = type === "success" ? "success-box" : "error-box";
  }

  async function refreshPixStatus() {
    try {
      const adminSecret = container.querySelector("#pix-admin-secret").value.trim();
      const status = await getPixConfigStatus({ adminSecret });
      const source = status.source === "runtime" ? "runtime" : "env";
      pixStatusNode.className = status.configured ? "success-box" : "info-box";
      pixStatusNode.textContent = status.configured
        ? `API Pix configurada (${source}).`
        : "API Pix ainda não configurada.";

      if (status.baseUrl) container.querySelector("#pix-base-url").value = status.baseUrl;
      if (status.createPath) container.querySelector("#pix-create-path").value = status.createPath;
      if (status.statusPathTemplate) container.querySelector("#pix-status-path").value = status.statusPathTemplate;
      if (status.authScheme) container.querySelector("#pix-auth-scheme").value = status.authScheme;
      if (status.offerHash) container.querySelector("#pix-offer-hash").value = status.offerHash;
      if (status.productHash) container.querySelector("#pix-product-hash").value = status.productHash;
      if (status.productTitle) container.querySelector("#pix-product-title").value = status.productTitle;
      if (status.productCover) container.querySelector("#pix-product-cover").value = status.productCover;
      if (status.productSalePage) container.querySelector("#pix-product-sale-page").value = status.productSalePage;
    } catch (error) {
      pixStatusNode.className = "error-box";
      pixStatusNode.textContent = error.message || "Não foi possível obter status da configuração Pix.";
    }
  }

  async function refreshMetrics() {
    try {
      const response = await fetch("/api/metrics", { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Métricas indisponíveis.");
      }
      const payload = await response.json();
      container.querySelector("#obs-requests").textContent = String(payload.totalRequests ?? 0);
      container.querySelector("#obs-4xx").textContent = String(payload.errors4xx ?? 0);
      container.querySelector("#obs-5xx").textContent = String(payload.errors5xx ?? 0);
      container.querySelector("#obs-uptime").textContent = `${payload.uptimeSeconds ?? 0}s`;
    } catch {
      container.querySelector("#obs-requests").textContent = "n/d";
      container.querySelector("#obs-4xx").textContent = "n/d";
      container.querySelector("#obs-5xx").textContent = "n/d";
      container.querySelector("#obs-uptime").textContent = "n/d";
    }
  }

  function filteredTransactions() {
    const clientQuery = container.querySelector("#tx-filter-client").value.trim().toLowerCase();
    const category = container.querySelector("#tx-filter-category").value;
    const status = container.querySelector("#tx-filter-status").value;

    return transactions.filter((item) => {
      if (clientQuery) {
        const hay = `${item.userName} ${item.userEmail}`.toLowerCase();
        if (!hay.includes(clientQuery)) return false;
      }
      if (category && item.category !== category) return false;
      if (status && item.status !== status) return false;
      return true;
    });
  }

  function txTimestamp(item) {
    const raw =
      item?.createdAt ??
      item?.timestamp ??
      item?.updatedAt ??
      item?.paidAt ??
      item?.paid_at ??
      Date.now();
    const time = new Date(raw).getTime();
    return Number.isFinite(time) ? time : Date.now();
  }

  function filteredClientAccounts() {
    const query = container.querySelector("#client-filter-query").value.trim().toLowerCase();
    const status = container.querySelector("#client-filter-status").value;
    const balance = container.querySelector("#client-filter-balance").value;

    return clientAccounts.filter((item) => {
      if (query) {
        const hay = `${item.name} ${item.email}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }
      if (status === "active" && !item.isActive) return false;
      if (status === "blocked" && item.isActive) return false;
      if (balance === "positive" && Number(item.availableBalance || 0) <= 0) return false;
      if (balance === "zero" && Number(item.availableBalance || 0) !== 0) return false;
      return true;
    });
  }

  function renderClientAccounts() {
    const rows = filteredClientAccounts();
    if (!rows.length) {
      clientsTbody.innerHTML =
        '<tr><td colspan="7" style="color:var(--text-2);">Sem contas para os filtros aplicados.</td></tr>';
      return;
    }

    clientsTbody.innerHTML = rows
      .map(
        (item) => `
          <tr>
            <td>
              ${escapeHtml(item.name)}<br/>
              <small style="color:var(--text-2)">${escapeHtml(item.email)}</small>
            </td>
            <td>${item.isActive ? '<span class="badge badge-paid">ATIVA</span>' : '<span class="badge badge-loss">BLOQUEADA</span>'}</td>
            <td class="mono">${formatCurrency(item.availableBalance || 0)}</td>
            <td class="mono">${formatCurrency(item.totalDeposited || 0)}</td>
            <td class="mono">${formatCurrency(item.totalWithdrawn || 0)}</td>
            <td>
              <small class="mono">${escapeHtml(item.pixKey || "-")}</small><br/>
              <small class="mono" style="color:var(--text-2)">${escapeHtml(item.cpf || "-")}</small>
            </td>
            <td>
              <button class="btn btn-secondary" data-client-toggle="${item.userId}">
                ${item.isActive ? "Bloquear" : "Ativar"}
              </button>
              <button class="btn btn-secondary" data-client-edit="${item.userId}">Editar</button>
              <button class="btn btn-primary" data-client-adjust="${item.userId}">Ajustar saldo</button>
            </td>
          </tr>
        `,
      )
      .join("");

    bindClientActions();
  }

  function renderTransactions() {
    const rows = filteredTransactions().sort((a, b) => txTimestamp(b) - txTimestamp(a));
    if (!rows.length) {
      transactionsTbody.innerHTML =
        '<tr><td colspan="8" style="color:var(--text-2);">Sem transações de clientes para os filtros aplicados.</td></tr>';
      return;
    }

    transactionsTbody.innerHTML = rows
      .map(
        (item) => `
          <tr>
            <td>${formatDateTime(txTimestamp(item))}</td>
            <td>${escapeHtml(item.userName)}<br/><small style="color:var(--text-2)">${escapeHtml(item.userEmail)}</small></td>
            <td>${escapeHtml(item.category)}</td>
            <td>${escapeHtml(item.eventType)}</td>
            <td>${txBadge(item.status)}</td>
            <td class="mono">${formatCurrency(item.amount)}</td>
            <td class="mono">${formatCurrency(item.balanceAfter)}</td>
            <td class="mono">${escapeHtml(item.referenceId || "-")}</td>
          </tr>
        `,
      )
      .join("");
  }

  async function refreshData() {
    stats = await getPlatformStats();
    requests = await listWithdrawRequests();
    transactions = await listAllClientTransactions();
    clientAccounts = await listClientAccounts();
    renderStats();
    renderTable();
    renderTransactions();
    renderClientAccounts();
  }

  function renderTable() {
    if (!requests.length) {
      tbody.innerHTML = `<tr><td colspan="8" style="color:var(--text-2);">Sem solicitações de saque.</td></tr>`;
      return;
    }

    tbody.innerHTML = requests
      .map(
        (item) => `
          <tr>
            <td>${formatDateTime(item.requestedAt)}</td>
            <td>${escapeHtml(item.userName)}<br/><small style="color:var(--text-2)">${escapeHtml(item.userEmail)}</small></td>
            <td class="mono">${escapeHtml(item.cpf)}</td>
            <td class="mono">${escapeHtml(item.pixKey)}</td>
            <td>${escapeHtml(item.address || "-")}</td>
            <td class="mono">${formatCurrency(item.amount)}</td>
            <td>${badge(item.status)}</td>
            <td>
              ${renderActions(item)}
            </td>
          </tr>
        `,
      )
      .join("");

    bindActions();
  }

  function renderActions(item) {
    if (item.status === "PENDING") {
      return `<button class="btn btn-secondary" data-processing-id="${item.requestId}">Processar</button> <button class="btn btn-danger" data-reject-id="${item.requestId}">Rejeitar</button>`;
    }

    if (item.status === "PROCESSING") {
      return `<button class="btn btn-success" data-pay-id="${item.requestId}">Marcar Pago</button> <button class="btn btn-danger" data-reject-id="${item.requestId}">Rejeitar</button>`;
    }

    if (item.status === "REJECTED") {
      return `<small style="color:var(--loss)">${escapeHtml(item.rejectReason || "Rejeitado")}</small>`;
    }

    return `<small style="color:var(--gain)">${item.approvedAt ? formatDateTime(item.approvedAt) : "Pago"}</small>`;
  }

  function bindActions() {
    tbody.querySelectorAll("[data-processing-id]").forEach((button) => {
      button.addEventListener("click", async () => {
        try {
          await approveWithdrawRequest({ requestId: button.dataset.processingId });
          await refreshData();
          setMessage("Saque movido para processamento.", "success");
          showToast("Saque em processamento.", "success");
        } catch (error) {
          setMessage(error.message || "Não foi possível processar saque.");
        }
      });
    });

    tbody.querySelectorAll("[data-pay-id]").forEach((button) => {
      button.addEventListener("click", async () => {
        openModal({
          title: "Confirmar pagamento",
          message: "Confirma que o saque foi pago ao cliente?",
          confirmLabel: "Confirmar pago",
          onConfirm: async () => {
            try {
              await payWithdrawRequest({ requestId: button.dataset.payId });
              await refreshData();
              setMessage("Saque marcado como pago.", "success");
              showToast("Saque pago.", "success");
            } catch (error) {
              setMessage(error.message || "Não foi possível marcar como pago.");
            }
          },
        });
      });
    });

    tbody.querySelectorAll("[data-reject-id]").forEach((button) => {
      button.addEventListener("click", async () => {
        const requestId = button.dataset.rejectId;
        const reason = window.prompt("Motivo da rejeição do saque:", "Dados inválidos");
        if (reason === null) return;

        try {
          await rejectWithdrawRequest({ requestId, reason });
          await refreshData();
          setMessage("Saque rejeitado e estornado ao cliente.", "success");
          showToast("Saque rejeitado.", "success");
        } catch (error) {
          setMessage(error.message || "Não foi possível rejeitar saque.");
        }
      });
    });
  }

  function renderStats() {
    container.querySelector("#admin-total-balance").textContent = formatCurrency(stats.totalClientBalance);
    container.querySelector("#admin-pending").textContent = `${stats.pendingWithdrawalsCount} / ${formatCurrency(stats.pendingWithdrawalsAmount)}`;
    container.querySelector("#admin-approved").textContent = formatCurrency(stats.approvedWithdrawalsAmount);
    const brokerageNode = container.querySelector("#admin-brokerage-balance");
    brokerageNode.textContent = formatCurrency(stats.brokerageBalance || 0);
    brokerageNode.classList.toggle("kpi-positive", Number(stats.brokerageBalance || 0) >= 0);
    brokerageNode.classList.toggle("kpi-negative", Number(stats.brokerageBalance || 0) < 0);
    container.querySelector("#admin-total-liability").textContent = formatCurrency(stats.totalLiability || 0);
    container.querySelector("#admin-clients-status").textContent = `${stats.clientsActive || 0} / ${stats.clientsBlocked || 0}`;
  }

  function bindClientActions() {
    clientsTbody.querySelectorAll("[data-client-toggle]").forEach((button) => {
      button.addEventListener("click", async () => {
        const userId = button.dataset.clientToggle;
        const current = clientAccounts.find((item) => item.userId === userId);
        if (!current) return;

        try {
          await updateClientAccount({
            userId,
            isActive: !current.isActive,
          });
          await refreshData();
          showToast(`Conta ${current.isActive ? "bloqueada" : "ativada"} com sucesso.`, "success");
        } catch (error) {
          setMessage(error.message || "Falha ao atualizar status da conta.");
        }
      });
    });

    clientsTbody.querySelectorAll("[data-client-adjust]").forEach((button) => {
      button.addEventListener("click", async () => {
        const userId = button.dataset.clientAdjust;
        const current = clientAccounts.find((item) => item.userId === userId);
        if (!current) return;
        const raw = window.prompt(`Ajuste de saldo para ${current.name} (use + ou -, ex: -50 ou 200):`, "0");
        if (raw === null) return;
        const value = Number(String(raw).replace(",", "."));
        if (!Number.isFinite(value) || Math.abs(value) < 0.000001) {
          setMessage("Valor de ajuste inválido.");
          return;
        }

        try {
          await updateClientAccount({
            userId,
            balanceAdjustment: value,
          });
          await refreshData();
          showToast("Saldo ajustado com sucesso.", "success");
        } catch (error) {
          setMessage(error.message || "Falha ao ajustar saldo do cliente.");
        }
      });
    });

    clientsTbody.querySelectorAll("[data-client-edit]").forEach((button) => {
      button.addEventListener("click", async () => {
        const userId = button.dataset.clientEdit;
        const current = clientAccounts.find((item) => item.userId === userId);
        if (!current) return;

        const nextName = window.prompt("Nome completo:", current.name);
        if (nextName === null) return;
        const nextEmail = window.prompt("E-mail:", current.email);
        if (nextEmail === null) return;
        const nextCpf = window.prompt("CPF:", current.cpf || "");
        if (nextCpf === null) return;
        const nextPixKey = window.prompt("Chave Pix:", current.pixKey || "");
        if (nextPixKey === null) return;
        const nextAddress = window.prompt("Endereço residencial:", current.address || "");
        if (nextAddress === null) return;

        try {
          await updateClientAccount({
            userId,
            name: nextName,
            email: nextEmail,
            cpf: nextCpf,
            pixKey: nextPixKey,
            address: nextAddress,
          });
          await refreshData();
          showToast("Dados do cliente atualizados.", "success");
        } catch (error) {
          setMessage(error.message || "Falha ao editar cliente.");
        }
      });
    });
  }

  ["#tx-filter-client", "#tx-filter-category", "#tx-filter-status"].forEach((selector) => {
    container.querySelector(selector).addEventListener("input", renderTransactions);
    container.querySelector(selector).addEventListener("change", renderTransactions);
  });
  ["#client-filter-query", "#client-filter-status", "#client-filter-balance"].forEach((selector) => {
    container.querySelector(selector).addEventListener("input", renderClientAccounts);
    container.querySelector(selector).addEventListener("change", renderClientAccounts);
  });
  container.querySelector("#pix-status-btn").addEventListener("click", refreshPixStatus);
  container.querySelector("#admin-refresh-data-btn")?.addEventListener("click", async () => {
    try {
      await refreshData();
      showToast("Painel administrativo atualizado.", "success");
    } catch (error) {
      setMessage(error.message || "Falha ao atualizar dados do painel.");
    }
  });
  container.querySelector("#pix-config-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const baseUrl = container.querySelector("#pix-base-url").value.trim();
    const createPath = container.querySelector("#pix-create-path").value.trim();
    const statusPathTemplate = container.querySelector("#pix-status-path").value.trim();
    const authScheme = container.querySelector("#pix-auth-scheme").value.trim();
    const offerHash = container.querySelector("#pix-offer-hash").value.trim();
    const productHash = container.querySelector("#pix-product-hash").value.trim();
    const productTitle = container.querySelector("#pix-product-title").value.trim();
    const productCover = container.querySelector("#pix-product-cover").value.trim();
    const productSalePage = container.querySelector("#pix-product-sale-page").value.trim();
    const apiToken = container.querySelector("#pix-api-token").value.trim();
    const adminSecret = container.querySelector("#pix-admin-secret").value.trim();

    if (!baseUrl || !createPath || !statusPathTemplate || !authScheme || !apiToken || !offerHash || !productHash || !productTitle) {
      pixStatusNode.className = "error-box";
      pixStatusNode.textContent = "Preencha todos os campos da configuração Pix.";
      return;
    }

    try {
      await savePixConfig({
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
        adminSecret,
      });
      container.querySelector("#pix-api-token").value = "";
      await refreshPixStatus();
      showToast("Configuração Pix salva no servidor.", "success");
    } catch (error) {
      pixStatusNode.className = "error-box";
      pixStatusNode.textContent = error.message || "Falha ao salvar configuração Pix.";
    }
  });
  container.querySelector("#refresh-metrics-btn").addEventListener("click", refreshMetrics);

  autoRefreshTimer = setInterval(async () => {
    try {
      await refreshData();
    } catch {
      // evita quebrar a UI em caso de erro temporário
    }
  }, 7000);

  renderTable();
  renderTransactions();
  renderClientAccounts();
  await refreshPixStatus();
  await refreshMetrics();

  return () => {
    if (autoRefreshTimer) clearInterval(autoRefreshTimer);
  };
}
