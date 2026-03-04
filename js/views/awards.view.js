import { listMyWithdrawals } from "../api/profile.adapter.js";
import { formatCurrency } from "../store.js";

const AWARDS = [
  {
    goal: 10000,
    title: "Premiação 1",
    description: "R$ 10.000,00 em saques sobre ganhos em operações.",
    rewards: ["Reconhecimento de nível inicial"],
  },
  {
    goal: 100000,
    title: "Premiação 2",
    description: "R$ 100.000,00 em saques sobre ganhos em operações.",
    rewards: ["1 iPhone 17 Pro Max", "1 caneca personalizada"],
  },
  {
    goal: 500000,
    title: "Premiação 3",
    description: "R$ 500.000,00 em saques sobre ganhos em operações.",
    rewards: ["1 iPhone 17 Pro Max", "1 MacBook M2"],
  },
  {
    goal: 1000000,
    title: "Premiação 4",
    description: "R$ 1.000.000,00 em saques sobre ganhos em operações.",
    rewards: ["1 iPhone 17 Pro Max", "1 MacBook M2", "Viagem para o Chile (2 pessoas, tudo pago)"],
  },
];

export async function renderAwardsView(container) {
  const withdrawals = await listMyWithdrawals();
  const totalPaidWithdrawals = withdrawals
    .filter((item) => item.status === "PAID")
    .reduce((acc, item) => acc + Number(item.amount || 0), 0);
  const maxGoal = AWARDS[AWARDS.length - 1].goal;
  const overallPct = Math.max(0, Math.min((totalPaidWithdrawals / maxGoal) * 100, 100));

  container.innerHTML = `
    <section class="main-content anim-fade-up">
      <article class="section-card awards-progress-card">
        <div class="section-header">
          <h3>Premiações por Saques</h3>
          <span class="mono">${formatCurrency(totalPaidWithdrawals)} / ${formatCurrency(maxGoal)}</span>
        </div>
        <div class="awards-progress-track">
          <div class="awards-progress-fill" style="width:${overallPct.toFixed(2)}%;"></div>
        </div>
        <p class="help-text" style="margin-top:0.75rem;">
          O progresso considera o total de saques pagos sobre ganhos em operações.
        </p>
      </article>

      <div class="awards-grid">
        ${AWARDS.map((award) => {
          const achieved = totalPaidWithdrawals >= award.goal;
          const pct = Math.max(0, Math.min((totalPaidWithdrawals / award.goal) * 100, 100));
          return `
            <article class="section-card awards-tier ${achieved ? "awards-tier-done" : ""}">
              <div class="section-header">
                <h3>${award.title}</h3>
                <span class="badge ${achieved ? "badge-paid" : "badge-pending"}">${achieved ? "LIBERADA" : "EM PROGRESSO"}</span>
              </div>
              <p class="mono" style="font-size:1.08rem; margin-bottom:0.45rem;">Meta: ${formatCurrency(award.goal)}</p>
              <p style="color:var(--text-1); margin-bottom:0.8rem;">${award.description}</p>
              <div class="awards-progress-track awards-progress-track-sm">
                <div class="awards-progress-fill" style="width:${pct.toFixed(2)}%;"></div>
              </div>
              <p class="help-text" style="margin-top:0.55rem;">Progresso da meta: ${pct.toFixed(2)}%</p>
              <ul class="awards-reward-list">
                ${award.rewards.map((reward) => `<li>${reward}</li>`).join("")}
              </ul>
              <div class="awards-image-slot">Espaço para imagem da premiação</div>
            </article>
          `;
        }).join("")}
      </div>
    </section>
  `;
}
