import { getBalance } from "../api/wallet.adapter.js";
import {
  getProfile,
  listClientTransactions,
  listMyWithdrawals,
  requestWithdrawal,
  saveProfile,
} from "../api/profile.adapter.js";
import { updateHeaderBalance, updateHeaderUserName } from "../components/header.js";
import { showToast } from "../components/toast.js";
import { formatCurrency, formatDateTime, getSession, setSession } from "../store.js";

function statusBadge(status) {
  if (status === "PAID") return '<span class="badge badge-paid">PAID</span>';
  if (status === "REJECTED") return '<span class="badge badge-loss">REJECTED</span>';
  if (status === "PROCESSING") return '<span class="badge badge-pending">PROCESSING</span>';
  return '<span class="badge badge-pending">PENDING</span>';
}

function normalizeCpf(value) {
  return String(value || "").replace(/\D/g, "");
}

export async function renderAccountView(container) {
  let profile = await getProfile();
  let wallet = await getBalance();
  let withdrawals = await listMyWithdrawals();
  let transactions = await listClientTransactions();

  container.innerHTML = `
    <section class="main-content anim-fade-up">
      <div class="grid-2">
        <article class="section-card">
          <div class="section-header">
            <h3>Dados da Conta</h3>
            <span class="help-text">Use estes dados para saque via Pix.</span>
          </div>
          <form id="profile-form" class="form-grid">
            <div class="field">
              <label for="profile-name">Nome completo</label>
              <input class="input" id="profile-name" type="text" required />
            </div>
            <div class="field">
              <label for="profile-email">E-mail</label>
              <input class="input" id="profile-email" type="email" required />
            </div>
            <div class="field">
              <label for="profile-cpf">CPF</label>
              <input class="input mono" id="profile-cpf" type="text" maxlength="14" required />
            </div>
            <div class="field">
              <label for="profile-pix">Chave Pix</label>
              <input class="input" id="profile-pix" type="text" required />
            </div>
            <div class="field">
              <label for="profile-address">Endereço residencial</label>
              <input class="input" id="profile-address" type="text" required />
            </div>
            <button class="btn btn-primary" type="submit">Salvar Dados</button>
            <div id="profile-message" class="hidden"></div>
          </form>
        </article>

        <article class="section-card">
          <div class="section-header">
            <h3>Solicitar Saque</h3>
            <span class="mono">Saldo: ${formatCurrency(wallet.available)}</span>
          </div>
          <form id="withdraw-form" class="form-grid">
            <div class="field">
              <label for="withdraw-amount">Valor do saque (R$)</label>
              <input class="input" id="withdraw-amount" type="number" min="80" step="0.01" required />
            </div>
            <button class="btn btn-secondary" type="submit">Pedir Saque</button>
            <div class="help-text">Mínimo R$ 80,00. Taxa de saque: 8,9%.</div>
            <div id="withdraw-message" class="hidden"></div>
          </form>
        </article>
      </div>

      <article class="section-card">
        <div class="section-header">
          <h3>Histórico de Saques</h3>
          <small class="help-text">Acompanhe o status das solicitações.</small>
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Valor Líquido</th>
                <th>Taxa</th>
                <th>Débito Total</th>
                <th>Status</th>
                <th>Finalizado em</th>
                <th>Motivo</th>
              </tr>
            </thead>
            <tbody id="withdraw-tbody"></tbody>
          </table>
        </div>
      </article>

      <article class="section-card">
        <div class="section-header">
          <h3>Extrato Completo do Cliente</h3>
          <small class="help-text">Depósitos, saques e operações de trade.</small>
        </div>
        <div class="grid-3" style="margin-bottom:1rem;">
          <div class="field">
            <label for="client-tx-category">Categoria</label>
            <select class="select" id="client-tx-category">
              <option value="">Todas</option>
              <option value="deposit">deposit</option>
              <option value="withdraw">withdraw</option>
              <option value="trade">trade</option>
              <option value="affiliate">affiliate</option>
            </select>
          </div>
          <div class="field">
            <label for="client-tx-status">Status</label>
            <select class="select" id="client-tx-status">
              <option value="">Todos</option>
              <option value="CONFIRMED">CONFIRMED</option>
              <option value="PENDING">PENDING</option>
              <option value="OPEN">OPEN</option>
            </select>
          </div>
          <div class="field">
            <label for="client-tx-search">Buscar referência/evento</label>
            <input class="input" id="client-tx-search" type="text" placeholder="TXID / trade id / evento" />
          </div>
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Categoria</th>
                <th>Evento</th>
                <th>Status</th>
                <th>Valor</th>
                <th>Saldo Após</th>
                <th>Referência</th>
              </tr>
            </thead>
            <tbody id="transactions-tbody"></tbody>
          </table>
        </div>
      </article>
    </section>
  `;

  const profileMessage = container.querySelector("#profile-message");
  const withdrawMessage = container.querySelector("#withdraw-message");
  const withdrawTbody = container.querySelector("#withdraw-tbody");
  const transactionsTbody = container.querySelector("#transactions-tbody");

  container.querySelector("#profile-name").value = profile.name || "";
  container.querySelector("#profile-email").value = profile.email || "";
  container.querySelector("#profile-cpf").value = profile.cpf || "";
  container.querySelector("#profile-pix").value = profile.pixKey || "";
  container.querySelector("#profile-address").value = profile.address || "";

  function renderWithdrawTable() {
    if (!withdrawals.length) {
      withdrawTbody.innerHTML = `<tr><td colspan="7" style="color:var(--text-2);">Nenhum saque solicitado.</td></tr>`;
      return;
    }

    withdrawTbody.innerHTML = withdrawals
      .map(
        (item) => `
          <tr>
            <td>${formatDateTime(item.requestedAt)}</td>
            <td class="mono">${formatCurrency(item.amount)}</td>
            <td class="mono">${formatCurrency(item.feeAmount || 0)}</td>
            <td class="mono">${formatCurrency(item.totalDebit || item.amount)}</td>
            <td>${statusBadge(item.status)}</td>
            <td>${item.approvedAt ? formatDateTime(item.approvedAt) : item.rejectedAt ? formatDateTime(item.rejectedAt) : "-"}</td>
            <td>${item.rejectReason || "-"}</td>
          </tr>
        `,
      )
      .join("");
  }

  function txBadge(status) {
    if (status === "CONFIRMED") return '<span class="badge badge-paid">CONFIRMED</span>';
    if (status === "OPEN") return '<span class="badge badge-pending">OPEN</span>';
    return '<span class="badge badge-pending">PENDING</span>';
  }

  function renderTransactionsTable() {
    const category = container.querySelector("#client-tx-category").value;
    const status = container.querySelector("#client-tx-status").value;
    const search = container.querySelector("#client-tx-search").value.trim().toLowerCase();
    const rows = transactions.filter((item) => {
      if (category && item.category !== category) return false;
      if (status && item.status !== status) return false;
      if (search) {
        const hay = `${item.eventType} ${item.referenceId} ${item.description}`.toLowerCase();
        if (!hay.includes(search)) return false;
      }
      return true;
    });

    if (!rows.length) {
      transactionsTbody.innerHTML =
        '<tr><td colspan="7" style="color:var(--text-2);">Sem transações para os filtros selecionados.</td></tr>';
      return;
    }

    transactionsTbody.innerHTML = rows
      .map(
        (item) => `
          <tr>
            <td>${formatDateTime(item.createdAt)}</td>
            <td>${item.category}</td>
            <td>${item.eventType}</td>
            <td>${txBadge(item.status)}</td>
            <td class="mono">${formatCurrency(item.amount)}</td>
            <td class="mono">${formatCurrency(item.balanceAfter)}</td>
            <td class="mono">${item.referenceId || "-"}</td>
          </tr>
        `,
      )
      .join("");
  }

  function setMessage(node, text, type = "error") {
    node.textContent = text;
    node.className = type === "success" ? "success-box" : type === "info" ? "info-box" : "error-box";
  }

  renderWithdrawTable();
  renderTransactionsTable();

  ["#client-tx-category", "#client-tx-status", "#client-tx-search"].forEach((selector) => {
    container.querySelector(selector).addEventListener("input", renderTransactionsTable);
    container.querySelector(selector).addEventListener("change", renderTransactionsTable);
  });

  container.querySelector("#profile-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const payload = {
      name: container.querySelector("#profile-name").value.trim(),
      email: container.querySelector("#profile-email").value.trim(),
      cpf: normalizeCpf(container.querySelector("#profile-cpf").value),
      pixKey: container.querySelector("#profile-pix").value.trim(),
      address: container.querySelector("#profile-address").value.trim(),
    };

    if (!payload.name || !payload.email || !payload.cpf || !payload.pixKey || !payload.address) {
      setMessage(profileMessage, "Preencha todos os campos do perfil.");
      return;
    }

    if (payload.cpf.length !== 11) {
      setMessage(profileMessage, "CPF inválido. Informe 11 dígitos.");
      return;
    }

    try {
      profile = await saveProfile(payload);
      const session = getSession();
      if (session) {
        setSession({
          ...session,
          user: { ...session.user, ...profile },
        });
      }
      updateHeaderUserName(profile.name);
      setMessage(profileMessage, "Dados atualizados com sucesso.", "success");
      showToast("Perfil atualizado.", "success");
    } catch (error) {
      setMessage(profileMessage, error.message || "Não foi possível salvar perfil.");
    }
  });

  container.querySelector("#withdraw-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const amount = Number(container.querySelector("#withdraw-amount").value);
    if (!amount || amount < 80) {
      setMessage(withdrawMessage, "Valor mínimo para saque: R$ 80,00.");
      return;
    }

    try {
      await requestWithdrawal({ amount });
      wallet = await getBalance();
      withdrawals = await listMyWithdrawals();
      transactions = await listClientTransactions();
      updateHeaderBalance(wallet.available);
      renderWithdrawTable();
      renderTransactionsTable();
      setMessage(withdrawMessage, "Saque solicitado. Aguarde validação do administrador.", "success");
      showToast("Solicitação de saque enviada.", "success");
    } catch (error) {
      setMessage(withdrawMessage, error.message || "Falha ao solicitar saque.");
    }
  });
}
