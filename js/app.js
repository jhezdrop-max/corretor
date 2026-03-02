import { logout } from "./api/auth.adapter.js";
import { getBalance } from "./api/wallet.adapter.js";
import { renderHeader } from "./components/header.js";
import { renderSidebar } from "./components/sidebar.js";
import { showToast } from "./components/toast.js";
import { getCurrentRoute, initRouter, navigate, onRouteChange } from "./router.js";
import { clearSession, getSession } from "./store.js";
import { renderAuthView } from "./views/auth.view.js";
import { renderAccountView } from "./views/account.view.js";
import { renderAdminView } from "./views/admin.view.js";
import { renderDashboardView } from "./views/dashboard.view.js";
import { renderDepositView } from "./views/deposit.view.js";
import { renderTradeView } from "./views/trade.view.js";

const app = document.getElementById("app");
let currentCleanup = null;

async function handleLogout() {
  await logout();
  clearSession();
  showToast("Sessão encerrada.", "info");
  navigate("/auth");
}

function cleanupCurrentView() {
  if (typeof currentCleanup === "function") {
    currentCleanup();
  }
  currentCleanup = null;
}

function protectedRoute(route) {
  return route === "/dashboard" || route === "/deposit" || route === "/trade" || route === "/account" || route === "/admin";
}

async function renderRoute(route) {
  cleanupCurrentView();

  const session = getSession();

  if (!session && protectedRoute(route)) {
    navigate("/auth");
    return;
  }

  if (session && route === "/auth") {
    navigate("/dashboard");
    return;
  }

  if (route === "/admin" && !session?.user?.isAdmin) {
    showToast("Acesso restrito ao administrador.", "error");
    navigate("/dashboard");
    return;
  }

  if (!session) {
    app.innerHTML = "";
    renderAuthView(app, { navigate });
    return;
  }

  let wallet;
  try {
    wallet = await getBalance();
  } catch (error) {
    clearSession();
    showToast("Sessão expirada/inválida. Faça login novamente.", "error");
    navigate("/auth");
    return;
  }

  app.className = "app-shell";
  app.innerHTML = "";

  const sidebar = renderSidebar(route, session);
  const mainArea = document.createElement("main");
  mainArea.className = "main-area";

  const header = renderHeader({
    user: session.user,
    balance: wallet.available,
    onLogout: handleLogout,
  });

  const content = document.createElement("section");
  content.className = "main-content";

  mainArea.appendChild(header);
  mainArea.appendChild(content);

  app.appendChild(sidebar);
  app.appendChild(mainArea);

  if (route === "/dashboard") {
    currentCleanup = await renderDashboardView(content, { navigate });
    return;
  }

  if (route === "/deposit") {
    currentCleanup = await renderDepositView(content, { navigate });
    return;
  }

  if (route === "/trade") {
    currentCleanup = await renderTradeView(content, { navigate });
    return;
  }

  if (route === "/account") {
    currentCleanup = await renderAccountView(content, { navigate });
    return;
  }

  if (route === "/admin") {
    currentCleanup = await renderAdminView(content, { navigate });
    return;
  }

  navigate("/dashboard");
}

onRouteChange((route) => {
  renderRoute(route).catch((error) => {
    console.error(error);
    showToast(error.message || "Falha ao renderizar rota.", "error");
  });
});

initRouter();
renderRoute(getCurrentRoute()).catch((error) => {
  console.error(error);
  showToast(error.message || "Falha na inicialização.", "error");
});
