import { getAwardsConfig } from "../api/awards.adapter.js";
import { listMyWithdrawals } from "../api/profile.adapter.js";
import { formatCurrency } from "../store.js";

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}

export async function renderAwardsView(container) {
  const [withdrawals, awardsConfig] = await Promise.all([listMyWithdrawals(), getAwardsConfig()]);
  const AWARDS = [...awardsConfig].sort((a, b) => Number(a.goal) - Number(b.goal));
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

      <div class="section-card awards-journey">
        <div class="awards-journey-bg"></div>
        <div class="awards-journey-line"></div>
        <div class="awards-journey-list">
        ${AWARDS.map((award, index) => {
          const achieved = totalPaidWithdrawals >= award.goal;
          const pct = Math.max(0, Math.min((totalPaidWithdrawals / award.goal) * 100, 100));
          const sideClass = index % 2 === 0 ? "left" : "right";
          return `
            <article class="awards-tier awards-tier-journey ${sideClass} ${achieved ? "awards-tier-done" : ""}">
              <div class="awards-tier-head">
                <h3>${escapeHtml(award.title)}</h3>
                <span class="badge ${achieved ? "badge-paid" : "badge-pending"}">${achieved ? "LIBERADA" : "EM PROGRESSO"}</span>
              </div>
              <p class="mono awards-tier-goal">META: ${formatCurrency(award.goal)}</p>
              <p class="awards-tier-desc">${escapeHtml(award.description)}</p>
              <div class="awards-progress-track awards-progress-track-sm">
                <div class="awards-progress-fill" style="width:${pct.toFixed(2)}%;"></div>
              </div>
              <p class="help-text" style="margin-top:0.55rem;">Progresso: ${pct.toFixed(2)}%</p>
              <ul class="awards-reward-list">
                ${award.rewards.map((reward) => `<li>${escapeHtml(reward)}</li>`).join("")}
              </ul>
              ${
                award.imageUrl
                  ? `<img class="awards-image-preview" src="${escapeHtml(award.imageUrl)}" alt="${escapeHtml(award.imageAlt || award.title)}" />`
                  : '<div class="awards-image-slot">Espaço para imagem da premiação</div>'
              }
            </article>
          `;
        }).join("")}
        </div>
      </div>
    </section>
  `;
}
