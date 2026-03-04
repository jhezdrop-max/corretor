import { getBalance } from "../api/wallet.adapter.js";
import { listTrades } from "../api/trade.adapter.js";
import { formatCurrency } from "../store.js";
import { listMyWithdrawals } from "../api/profile.adapter.js";

const AWARD_TIERS = [10000, 100000, 500000, 1000000];

export async function renderDashboardView(container, { navigate }) {
  const [wallet, trades, withdrawals] = await Promise.all([getBalance(), listTrades(), listMyWithdrawals()]);
  const closedToday = trades.filter((trade) => trade.closedAt && new Date(trade.closedAt).toDateString() === new Date().toDateString());
  const pnlToday = closedToday.reduce((acc, trade) => {
    if (trade.status === "WIN") return acc + (trade.payoutAmount - trade.amount);
    if (trade.status === "LOSS") return acc - trade.amount;
    return acc;
  }, 0);

  const totalPaidWithdrawals = withdrawals
    .filter((item) => item.status === "PAID")
    .reduce((acc, item) => acc + Number(item.amount || 0), 0);
  const nextGoal = AWARD_TIERS.find((value) => totalPaidWithdrawals < value) || AWARD_TIERS[AWARD_TIERS.length - 1];
  const progressPct = Math.max(0, Math.min((totalPaidWithdrawals / nextGoal) * 100, 100));

  const openCount = trades.filter((trade) => trade.status === "OPEN").length;
  const closedCount = trades.length - openCount;

  container.innerHTML = `
    <section class="main-content anim-fade-up">
      <div class="section-card awards-progress-card">
        <div class="section-header">
          <h3>Progresso de Premiações</h3>
          <span class="mono">${formatCurrency(totalPaidWithdrawals)} / ${formatCurrency(nextGoal)}</span>
        </div>
        <div class="awards-progress-track">
          <div class="awards-progress-fill" style="width:${progressPct.toFixed(2)}%;"></div>
        </div>
        <p class="help-text" style="margin-top:0.7rem;">
          Sua progressão é baseada no total de saques pagos sobre ganhos em operações.
        </p>
        <div class="inline-actions" style="margin-top:0.8rem;">
          <button class="btn btn-primary" id="dashboard-go-awards">Ver Premiações</button>
        </div>
      </div>

      <div class="grid-3">
        <article class="card-kpi">
          <p class="kpi-label">Saldo Total</p>
          <h2 class="kpi-value mono">${formatCurrency(wallet.available)}</h2>
        </article>
        <article class="card-kpi">
          <p class="kpi-label">Lucro/Perda Hoje</p>
          <h2 class="kpi-value mono ${pnlToday >= 0 ? "kpi-positive" : "kpi-negative"}">
            ${formatCurrency(pnlToday)}
          </h2>
        </article>
        <article class="card-kpi">
          <p class="kpi-label">Operações</p>
          <h2 class="kpi-value mono">${openCount} abertas / ${closedCount} fechadas</h2>
        </article>
      </div>

      <div class="section-card">
        <div class="section-header">
          <h3>Próximas ações</h3>
        </div>
        <p style="color:var(--text-1); margin-bottom:1rem;">
          Use os atalhos para iniciar seu fluxo: depositar saldo via Pix e abrir operações no módulo de trade.
        </p>
        <div class="inline-actions">
          <button class="btn btn-primary" id="dashboard-go-deposit">Fazer Depósito</button>
          <button class="btn btn-secondary" id="dashboard-go-trade">Ir para Trade</button>
        </div>
      </div>

    </section>
  `;

  container.querySelector("#dashboard-go-awards")?.addEventListener("click", () => navigate("/awards"));
  container.querySelector("#dashboard-go-deposit")?.addEventListener("click", () => navigate("/deposit"));
  container.querySelector("#dashboard-go-trade")?.addEventListener("click", () => navigate("/trade"));
}
