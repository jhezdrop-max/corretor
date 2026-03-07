import { formatCurrency } from "../store.js";

export function renderHeader({ user, balance, onLogout }) {
  const el = document.createElement("header");
  el.className = "main-header anim-fade-up";
  el.innerHTML = `
    <div style="display:flex; align-items:center; gap:0.8rem;">
      <img src="./assets/bye-trade-logo.png" alt="Bye Trader Logo" style="height:56px;width:auto;max-width:220px;object-fit:contain;" />
    </div>
    <div style="display:flex; align-items:center; gap:1rem; flex-wrap:wrap; justify-content:flex-end;">
      <div>
        <small style="color:var(--text-2); display:block;">Saldo disponível</small>
        <strong id="header-balance" class="mono">${formatCurrency(balance)}</strong>
      </div>
      <div>
        <small style="color:var(--text-2); display:block;">Conta</small>
        <strong id="header-user-name"></strong>
      </div>
      <button class="btn btn-secondary" id="logout-btn">Sair</button>
    </div>
  `;

  const userNameNode = el.querySelector("#header-user-name");
  if (userNameNode) {
    userNameNode.textContent = user.name;
  }

  el.querySelector("#logout-btn")?.addEventListener("click", onLogout);
  return el;
}

export function updateHeaderBalance(value) {
  const el = document.getElementById("header-balance");
  if (el) {
    el.textContent = formatCurrency(value);
    el.classList.add("anim-pulse");
    setTimeout(() => el.classList.remove("anim-pulse"), 450);
  }
}

export function updateHeaderUserName(name) {
  const node = document.getElementById("header-user-name");
  if (node) {
    node.textContent = name || "";
  }
}
