import {
  approveWithdrawRequest,
  getPlatformStats,
  getPixConfigStatus,
  getContentConfigAdmin,
  getAwardsConfigAdmin,
  listClientAccounts,
  listSupportTicketsAdmin,
  listAffiliateApplicationsAdmin,
  listAllClientTransactions,
  listWithdrawRequests,
  payWithdrawRequest,
  approveAffiliateApplicationAdmin,
  rejectAffiliateApplicationAdmin,
  rejectWithdrawRequest,
  savePixConfig,
  updateContentConfigAdmin,
  updateAwardsConfigAdmin,
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
  let supportTickets = await listSupportTicketsAdmin();
  let affiliateApplications = await listAffiliateApplicationsAdmin();
  let contentConfig = await getContentConfigAdmin();
  let awardsConfig = [];
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
          <div class="field">
            <label for="pix-provider">Provedor Pix</label>
            <select class="select" id="pix-provider" required>
              <option value="pagarme" selected>Pagar.me</option>
              <option value="tribopay">TriboPay</option>
              <option value="generic">Genérico</option>
            </select>
          </div>
          <div class="grid-2">
            <div class="field">
              <label for="pix-base-url">URL base do provedor</label>
              <input class="input" id="pix-base-url" type="text" value="https://api.pagar.me/core/v5/" required />
            </div>
            <div class="field">
              <label for="pix-auth-scheme">Auth scheme</label>
              <input class="input" id="pix-auth-scheme" type="text" value="Bearer" required />
            </div>
          </div>
          <div class="grid-2">
            <div class="field">
              <label for="pix-create-path">Path criar cobrança</label>
              <input class="input" id="pix-create-path" type="text" value="orders" required />
            </div>
            <div class="field">
              <label for="pix-status-path">Path status (use {txid})</label>
              <input class="input" id="pix-status-path" type="text" value="orders/{txid}" required />
            </div>
          </div>
          <div class="grid-2">
            <div class="field">
              <label for="pix-offer-hash">Offer hash (TriboPay)</label>
              <input class="input" id="pix-offer-hash" type="text" placeholder="7becb" />
            </div>
            <div class="field">
              <label for="pix-product-hash">Product hash (TriboPay)</label>
              <input class="input" id="pix-product-hash" type="text" placeholder="7tjdfkshdv" />
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
          <h3>Gerenciar Premiações</h3>
          <small class="help-text">Altere as imagens sem editar código.</small>
        </div>
        <div id="awards-admin-message" class="info-box" style="margin-bottom:1rem;">
          Carregando premiações...
        </div>
        <div id="awards-admin-list" class="awards-admin-list"></div>
        <div class="inline-actions" style="margin-top:0.9rem;">
          <button class="btn btn-primary" type="button" id="awards-save-btn">Salvar Premiações</button>
          <button class="btn btn-secondary" type="button" id="awards-reload-btn">Recarregar</button>
        </div>
      </article>

      <article class="section-card">
        <div class="section-header">
          <h3>Banners + Página Bônus e CPA</h3>
          <small class="help-text">Conteúdo promocional editável pelo admin.</small>
        </div>
        <div id="content-admin-message" class="info-box" style="margin-bottom:1rem;">Carregando conteúdo...</div>
        <div class="grid-2">
          <div class="field">
            <label for="bonus-page-title">Título da página</label>
            <input class="input" id="bonus-page-title" type="text" />
          </div>
          <div class="field">
            <label for="bonus-cpa-value">Valor CPA (R$)</label>
            <input class="input" id="bonus-cpa-value" type="number" min="0" step="0.01" />
          </div>
        </div>
        <div class="field" style="margin-bottom:1rem;">
          <label for="bonus-recurring-rate">Percentual nos próximos depósitos (%)</label>
          <input class="input" id="bonus-recurring-rate" type="number" min="0" step="0.01" />
        </div>
        <div class="field" style="margin-bottom:1rem;">
          <label for="bonus-page-text">Texto da página</label>
          <textarea class="input" id="bonus-page-text" rows="3"></textarea>
        </div>
        <div id="content-banner-list" class="awards-admin-list"></div>
        <div class="inline-actions" style="margin-top:0.9rem;">
          <button class="btn btn-primary" type="button" id="content-save-btn">Salvar Conteúdo</button>
          <button class="btn btn-secondary" type="button" id="content-reload-btn">Recarregar</button>
        </div>
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
                <th>Valor Líquido</th>
                <th>Taxa</th>
                <th>Débito Total</th>
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
          <h3>Solicitações de Afiliados</h3>
          <small class="help-text">Aprovar ou rejeitar pedidos com WhatsApp.</small>
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Cliente</th>
                <th>WhatsApp</th>
                <th>Status</th>
                <th>Ação</th>
              </tr>
            </thead>
            <tbody id="admin-affiliates-tbody"></tbody>
          </table>
        </div>
      </article>

      <article class="section-card">
        <div class="section-header">
          <h3>Chamados de Suporte</h3>
          <small class="help-text">Mensagens enviadas pelos clientes.</small>
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Cliente</th>
                <th>WhatsApp</th>
                <th>Mensagem</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody id="admin-support-tbody"></tbody>
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
              <option value="affiliate">affiliate</option>
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
  const supportTbody = container.querySelector("#admin-support-tbody");
  const affiliatesTbody = container.querySelector("#admin-affiliates-tbody");
  const pixStatusNode = container.querySelector("#pix-config-status");
  const awardsNode = container.querySelector("#awards-admin-list");
  const awardsMessageNode = container.querySelector("#awards-admin-message");
  const contentMessageNode = container.querySelector("#content-admin-message");
  const bannerListNode = container.querySelector("#content-banner-list");

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

      if (status.provider) container.querySelector("#pix-provider").value = status.provider;
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

  function applyPixProviderPreset(provider) {
    const providerKey = String(provider || "").toLowerCase();
    if (providerKey === "pagarme") {
      container.querySelector("#pix-base-url").value = "https://api.pagar.me/core/v5/";
      container.querySelector("#pix-create-path").value = "orders";
      container.querySelector("#pix-status-path").value = "orders/{txid}";
      container.querySelector("#pix-auth-scheme").value = "Bearer";
      return;
    }

    if (providerKey === "tribopay") {
      container.querySelector("#pix-base-url").value = "https://api.tribopay.com.br/api/public/v1/";
      container.querySelector("#pix-create-path").value = "transactions";
      container.querySelector("#pix-status-path").value = "transactions/{txid}";
      container.querySelector("#pix-auth-scheme").value = "Bearer";
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

  function renderAwardsEditor() {
    if (!awardsConfig.length) {
      awardsNode.innerHTML = '<div class="info-box">Nenhuma premiação configurada.</div>';
      return;
    }

    awardsNode.innerHTML = awardsConfig
      .map(
        (award, index) => `
        <div class="section-card" style="margin-bottom:0.85rem;">
          <div class="section-header">
            <h3>${escapeHtml(award.title || `Premiação ${index + 1}`)}</h3>
            <span class="mono">${formatCurrency(award.goal || 0)}</span>
          </div>
          <div class="grid-2">
            <div class="field">
              <label>Título</label>
              <input class="input" data-award-title="${index}" type="text" value="${escapeHtml(award.title || "")}" />
            </div>
            <div class="field">
              <label>Meta (R$)</label>
              <input class="input" data-award-goal="${index}" type="number" min="1" step="1" value="${Number(award.goal || 0)}" />
            </div>
          </div>
          <div class="field">
            <label>Descrição</label>
            <textarea class="input" data-award-description="${index}" rows="2">${escapeHtml(award.description || "")}</textarea>
          </div>
          <div class="field">
            <label>Recompensas (uma por linha)</label>
            <textarea class="input" data-award-rewards="${index}" rows="3">${escapeHtml((award.rewards || []).join("\n"))}</textarea>
          </div>
          <div class="field">
            <label>URL da imagem</label>
            <input class="input" data-award-image-url="${index}" type="text" value="${escapeHtml(award.imageUrl || "")}" placeholder="https://..." />
          </div>
          <div class="field">
            <label>Texto alternativo da imagem</label>
            <input class="input" data-award-image-alt="${index}" type="text" value="${escapeHtml(award.imageAlt || "")}" placeholder="Descrição da imagem" />
          </div>
        </div>
      `,
      )
      .join("");
  }

  async function loadAwardsConfig() {
    try {
      awardsConfig = await getAwardsConfigAdmin();
      renderAwardsEditor();
      awardsMessageNode.className = "success-box";
      awardsMessageNode.textContent = "Premiações carregadas.";
    } catch (error) {
      awardsMessageNode.className = "error-box";
      awardsMessageNode.textContent = error.message || "Falha ao carregar premiações.";
    }
  }

  function collectAwardsFromEditor() {
    return awardsConfig.map((award, index) => {
      const title = container.querySelector(`[data-award-title="${index}"]`)?.value?.trim() || award.title || `Premiação ${index + 1}`;
      const goalRaw = Number(container.querySelector(`[data-award-goal="${index}"]`)?.value || award.goal || 0);
      const goal = Number.isFinite(goalRaw) && goalRaw > 0 ? goalRaw : Number(award.goal || 1000);
      const description =
        container.querySelector(`[data-award-description="${index}"]`)?.value?.trim() ||
        award.description ||
        "";
      const rewardsText = container.querySelector(`[data-award-rewards="${index}"]`)?.value || "";
      const rewards = rewardsText
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean);
      const imageUrl = container.querySelector(`[data-award-image-url="${index}"]`)?.value?.trim() || "";
      const imageAlt = container.querySelector(`[data-award-image-alt="${index}"]`)?.value?.trim() || "";
      return {
        ...award,
        title,
        goal,
        description,
        rewards: rewards.length ? rewards : award.rewards || [],
        imageUrl,
        imageAlt,
      };
    });
  }

  function renderContentEditor() {
    const slots = [
      { key: "dashboard_after_awards", label: "Dashboard (abaixo da barra de premiações)" },
      { key: "awards_before_progress", label: "Premiações (acima da barra de progresso)" },
      { key: "deposit_after_generate", label: "Depósito Pix (abaixo do botão gerar)" },
      { key: "trade_before_history", label: "Operações (acima do histórico de operações)" },
      { key: "bonus_bottom", label: "Bônus e CPA (fim da página)" },
    ];

    const bonus = contentConfig?.bonusCpa || {};
    container.querySelector("#bonus-page-title").value = bonus.pageTitle || "";
    container.querySelector("#bonus-page-text").value = bonus.pageText || "";
    container.querySelector("#bonus-cpa-value").value = Number(bonus.cpaValue || 20);
    container.querySelector("#bonus-recurring-rate").value = Number(bonus.recurringRatePct || 20);

    bannerListNode.innerHTML = slots
      .map((slot, index) => {
        const banner = contentConfig?.banners?.[slot.key] || {};
        return `
          <div class="section-card" style="margin-bottom:0.85rem;">
            <div class="section-header">
              <h3>${slot.label}</h3>
            </div>
            <div class="field">
              <label><input type="checkbox" data-banner-enabled="${slot.key}" ${banner.enabled ? "checked" : ""}/> Ativar banner</label>
            </div>
            <div class="grid-2">
              <div class="field">
                <label>Título</label>
                <input class="input" data-banner-title="${slot.key}" type="text" value="${escapeHtml(banner.title || "")}" />
              </div>
              <div class="field">
                <label>URL do clique (opcional)</label>
                <input class="input" data-banner-link="${slot.key}" type="text" value="${escapeHtml(banner.linkUrl || "")}" />
              </div>
            </div>
            <div class="field">
              <label>Texto</label>
              <textarea class="input" data-banner-text="${slot.key}" rows="2">${escapeHtml(banner.text || "")}</textarea>
            </div>
            <div class="field">
              <label>URL da imagem</label>
              <input class="input" data-banner-image="${slot.key}" type="text" value="${escapeHtml(banner.imageUrl || "")}" />
            </div>
          </div>
        `;
      })
      .join("");
  }

  function collectContentFromEditor() {
    const slots = [
      "dashboard_after_awards",
      "awards_before_progress",
      "deposit_after_generate",
      "trade_before_history",
      "bonus_bottom",
    ];
    const banners = {};
    slots.forEach((key) => {
      banners[key] = {
        enabled: Boolean(container.querySelector(`[data-banner-enabled="${key}"]`)?.checked),
        title: container.querySelector(`[data-banner-title="${key}"]`)?.value?.trim() || "",
        text: container.querySelector(`[data-banner-text="${key}"]`)?.value?.trim() || "",
        imageUrl: container.querySelector(`[data-banner-image="${key}"]`)?.value?.trim() || "",
        linkUrl: container.querySelector(`[data-banner-link="${key}"]`)?.value?.trim() || "",
      };
    });
    const cpaRaw = Number(container.querySelector("#bonus-cpa-value").value);
    const recurringRateRaw = Number(container.querySelector("#bonus-recurring-rate").value);
    return {
      banners,
      bonusCpa: {
        pageTitle: container.querySelector("#bonus-page-title").value.trim() || "Bônus e CPA",
        pageText: container.querySelector("#bonus-page-text").value.trim(),
        cpaValue: Number.isFinite(cpaRaw) && cpaRaw >= 0 ? cpaRaw : 20,
        recurringRatePct: Number.isFinite(recurringRateRaw) && recurringRateRaw >= 0 ? recurringRateRaw : 20,
      },
    };
  }

  async function loadContentConfig() {
    try {
      contentConfig = await getContentConfigAdmin();
      renderContentEditor();
      contentMessageNode.className = "success-box";
      contentMessageNode.textContent = "Conteúdo carregado.";
    } catch (error) {
      contentMessageNode.className = "error-box";
      contentMessageNode.textContent = error.message || "Falha ao carregar conteúdo.";
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

  function renderSupportTickets() {
    if (!supportTickets.length) {
      supportTbody.innerHTML =
        '<tr><td colspan="5" style="color:var(--text-2);">Sem chamados de suporte.</td></tr>';
      return;
    }
    supportTbody.innerHTML = supportTickets
      .map(
        (item) => `
          <tr>
            <td>${formatDateTime(item.createdAt)}</td>
            <td>${escapeHtml(item.userName)}<br/><small style="color:var(--text-2)">${escapeHtml(item.userEmail)}</small></td>
            <td class="mono">${escapeHtml(item.whatsapp || "-")}</td>
            <td>${escapeHtml(item.message || "-")}</td>
            <td>${txBadge(item.status || "OPEN")}</td>
          </tr>
        `,
      )
      .join("");
  }

  function renderAffiliateApplications() {
    if (!affiliateApplications.length) {
      affiliatesTbody.innerHTML =
        '<tr><td colspan="5" style="color:var(--text-2);">Sem solicitações de afiliado.</td></tr>';
      return;
    }
    affiliatesTbody.innerHTML = affiliateApplications
      .map(
        (item) => `
          <tr>
            <td>${formatDateTime(item.createdAt)}</td>
            <td>${escapeHtml(item.userName)}<br/><small style="color:var(--text-2)">${escapeHtml(item.userEmail)}</small></td>
            <td class="mono">${escapeHtml(item.whatsapp || "-")}</td>
            <td>${txBadge(item.status || "PENDING")}</td>
            <td>
              ${
                item.status === "PENDING"
                  ? `<button class="btn btn-success" data-aff-approve="${item.requestId}">Aprovar</button>
                     <button class="btn btn-danger" data-aff-reject="${item.requestId}">Rejeitar</button>`
                  : `<small>${escapeHtml(item.reason || "-")}</small>`
              }
            </td>
          </tr>
        `,
      )
      .join("");

    affiliatesTbody.querySelectorAll("[data-aff-approve]").forEach((button) => {
      button.addEventListener("click", async () => {
        try {
          await approveAffiliateApplicationAdmin({ requestId: button.dataset.affApprove });
          affiliateApplications = await listAffiliateApplicationsAdmin();
          renderAffiliateApplications();
          showToast("Afiliado aprovado.", "success");
        } catch (error) {
          setMessage(error.message || "Falha ao aprovar afiliado.");
        }
      });
    });

    affiliatesTbody.querySelectorAll("[data-aff-reject]").forEach((button) => {
      button.addEventListener("click", async () => {
        const reason = window.prompt("Motivo da rejeição:", "Requisitos não atendidos");
        if (reason === null) return;
        try {
          await rejectAffiliateApplicationAdmin({ requestId: button.dataset.affReject, reason });
          affiliateApplications = await listAffiliateApplicationsAdmin();
          renderAffiliateApplications();
          showToast("Afiliado rejeitado.", "success");
        } catch (error) {
          setMessage(error.message || "Falha ao rejeitar afiliado.");
        }
      });
    });
  }

  async function refreshData() {
    stats = await getPlatformStats();
    requests = await listWithdrawRequests();
    transactions = await listAllClientTransactions();
    clientAccounts = await listClientAccounts();
    supportTickets = await listSupportTicketsAdmin();
    affiliateApplications = await listAffiliateApplicationsAdmin();
    renderStats();
    renderTable();
    renderTransactions();
    renderClientAccounts();
    renderSupportTickets();
    renderAffiliateApplications();
  }

  function renderTable() {
    if (!requests.length) {
      tbody.innerHTML = `<tr><td colspan="10" style="color:var(--text-2);">Sem solicitações de saque.</td></tr>`;
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
            <td class="mono">${formatCurrency(item.feeAmount || 0)}</td>
            <td class="mono">${formatCurrency(item.totalDebit || item.amount)}</td>
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
  container.querySelector("#pix-provider").addEventListener("change", (event) => {
    applyPixProviderPreset(event.target.value);
  });
  container.querySelector("#awards-reload-btn").addEventListener("click", loadAwardsConfig);
  container.querySelector("#awards-save-btn").addEventListener("click", async () => {
    const nextAwards = collectAwardsFromEditor();
    try {
      awardsConfig = await updateAwardsConfigAdmin({ awards: nextAwards });
      renderAwardsEditor();
      awardsMessageNode.className = "success-box";
      awardsMessageNode.textContent = "Premiações salvas com sucesso.";
      showToast("Premiações atualizadas.", "success");
    } catch (error) {
      awardsMessageNode.className = "error-box";
      awardsMessageNode.textContent = error.message || "Falha ao salvar premiações.";
    }
  });
  container.querySelector("#content-reload-btn").addEventListener("click", loadContentConfig);
  container.querySelector("#content-save-btn").addEventListener("click", async () => {
    const next = collectContentFromEditor();
    try {
      contentConfig = await updateContentConfigAdmin({ content: next });
      renderContentEditor();
      contentMessageNode.className = "success-box";
      contentMessageNode.textContent = "Conteúdo salvo com sucesso.";
      showToast("Banners e CPA atualizados.", "success");
    } catch (error) {
      contentMessageNode.className = "error-box";
      contentMessageNode.textContent = error.message || "Falha ao salvar conteúdo.";
    }
  });
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
    const provider = container.querySelector("#pix-provider").value.trim();
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

    if (!provider || !baseUrl || !createPath || !statusPathTemplate || !authScheme || !apiToken || !productTitle) {
      pixStatusNode.className = "error-box";
      pixStatusNode.textContent = "Preencha todos os campos da configuração Pix.";
      return;
    }

    if (provider === "tribopay" && (!offerHash || !productHash)) {
      pixStatusNode.className = "error-box";
      pixStatusNode.textContent = "Para TriboPay, informe Offer hash e Product hash.";
      return;
    }

    try {
      await savePixConfig({
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
  renderSupportTickets();
  renderAffiliateApplications();
  await refreshPixStatus();
  await loadAwardsConfig();
  await loadContentConfig();
  await refreshMetrics();

  return () => {
    if (autoRefreshTimer) clearInterval(autoRefreshTimer);
  };
}
