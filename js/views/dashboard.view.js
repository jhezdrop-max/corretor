import { getBalance } from "../api/wallet.adapter.js";
import { listTrades } from "../api/trade.adapter.js";
import { formatCurrency } from "../store.js";

export async function renderDashboardView(container, { navigate }) {
  const [wallet, trades] = await Promise.all([getBalance(), listTrades()]);
  const closedToday = trades.filter((trade) => trade.closedAt && new Date(trade.closedAt).toDateString() === new Date().toDateString());
  const pnlToday = closedToday.reduce((acc, trade) => {
    if (trade.status === "WIN") return acc + (trade.payoutAmount - trade.amount);
    if (trade.status === "LOSS") return acc - trade.amount;
    return acc;
  }, 0);

  const openCount = trades.filter((trade) => trade.status === "OPEN").length;
  const closedCount = trades.length - openCount;

  container.innerHTML = `
    <section class="main-content anim-fade-up">
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

  container.querySelector("#dashboard-go-deposit")?.addEventListener("click", () => navigate("/deposit"));
  container.querySelector("#dashboard-go-trade")?.addEventListener("click", () => navigate("/trade"));
}
