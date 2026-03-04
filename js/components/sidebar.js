const BASE_ITEMS = [
  { route: "/dashboard", label: "Dashboard" },
  { route: "/deposit", label: "Depósito Pix" },
  { route: "/trade", label: "Operações" },
  { route: "/account", label: "Conta & Saques" },
];

export function renderSidebar(currentRoute, session) {
  const nav = document.createElement("aside");
  nav.className = "sidebar anim-fade-up";
  const items = [...BASE_ITEMS];
  if (session?.user?.isAdmin) {
    items.push({ route: "/admin", label: "Painel Admin" });
  }

  nav.innerHTML = `
    <div class="brand-row">
      <img src="./assets/bye-trade-logo.png" alt="Bye Trader Logo" />
    </div>
    <ul class="nav-list">
      ${items.map(
        (item) => `
        <li>
          <a href="#${item.route}" class="nav-link ${currentRoute === item.route ? "active" : ""}">
            ${item.label}
          </a>
        </li>
      `,
      ).join("")}
    </ul>
  `;

  return nav;
}
