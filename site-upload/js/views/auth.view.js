import { login, register } from "../api/auth.adapter.js";
import { setSession } from "../store.js";
import { showToast } from "../components/toast.js";

const LOGIN_GUARD_KEY = "orbita-login-guard";
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_WINDOW_MS = 5 * 60 * 1000;

function isValidUsername(value) {
  return /^[a-zA-Z0-9._-]{3,40}$/.test(String(value || "").trim());
}

function getGuardState() {
  try {
    const raw = localStorage.getItem(LOGIN_GUARD_KEY);
    if (!raw) {
      return { attempts: 0, lockedUntil: 0 };
    }
    const parsed = JSON.parse(raw);
    return {
      attempts: Number(parsed.attempts || 0),
      lockedUntil: Number(parsed.lockedUntil || 0),
    };
  } catch {
    return { attempts: 0, lockedUntil: 0 };
  }
}

function setGuardState(state) {
  localStorage.setItem(LOGIN_GUARD_KEY, JSON.stringify(state));
}

function registerFailedAttempt() {
  const guard = getGuardState();
  const nextAttempts = guard.attempts + 1;
  const lockedUntil = nextAttempts >= MAX_LOGIN_ATTEMPTS ? Date.now() + LOCK_WINDOW_MS : 0;
  setGuardState({
    attempts: lockedUntil ? 0 : nextAttempts,
    lockedUntil,
  });
}

function clearFailedAttempts() {
  setGuardState({ attempts: 0, lockedUntil: 0 });
}

export function renderAuthView(container, { navigate }) {
  const hashQuery = window.location.hash.includes("?") ? window.location.hash.split("?")[1] : "";
  const referralFromUrl =
    new URLSearchParams(window.location.search).get("ref") || new URLSearchParams(hashQuery).get("ref") || "";
  container.className = "auth-page";
  container.innerHTML = `
    <section class="auth-card anim-fade-up">
      <div class="brand-row">
        <img src="./assets/bye-trade-logo.png" alt="Bye Trader Logo" />
      </div>

      <div class="tabs">
        <button class="tab-btn active" data-tab="login">Entrar</button>
        <button class="tab-btn" data-tab="register">Cadastrar</button>
      </div>

      <div id="auth-message" class="hidden" style="margin-bottom:0.8rem;"></div>

      <form id="login-form" class="form-grid">
        <div class="field">
          <label for="login-username">Usuário ou e-mail</label>
          <input class="input" id="login-username" type="text" placeholder="seuusuario" required />
        </div>
        <div class="field">
          <label for="login-password">Senha</label>
          <input class="input" id="login-password" type="password" placeholder="********" required />
        </div>
        <button class="btn btn-primary btn-block" type="submit">Entrar na Plataforma</button>
      </form>

      <form id="register-form" class="form-grid hidden">
        <div class="field">
          <label for="register-name">Nome completo</label>
          <input class="input" id="register-name" type="text" required />
        </div>
        <div class="field">
          <label for="register-username">Usuário</label>
          <input class="input mono" id="register-username" type="text" placeholder="seuusuario" required />
        </div>
        <div class="field">
          <label for="register-referral">Código de indicação (opcional)</label>
          <input class="input mono" id="register-referral" type="text" value="${referralFromUrl}" />
        </div>
        <div class="field">
          <label for="register-password">Senha</label>
          <input class="input" id="register-password" type="password" required />
        </div>
        <label style="display:flex; gap:0.55rem; align-items:center; font-size:0.88rem; color:var(--text-1);">
          <input id="register-show-password" type="checkbox" />
          Ver senha
        </label>
        <label style="display:flex; gap:0.55rem; align-items:flex-start; font-size:0.88rem; color:var(--text-1);">
          <input id="register-terms" type="checkbox" style="margin-top:0.2rem;" />
          Aceito os termos de uso da plataforma.
        </label>
        <button class="btn btn-primary btn-block" type="submit">Criar Conta</button>
      </form>
    </section>
  `;

  const messageBox = container.querySelector("#auth-message");
  const loginForm = container.querySelector("#login-form");
  const registerForm = container.querySelector("#register-form");
  const tabButtons = Array.from(container.querySelectorAll("[data-tab]"));

  function showMessage(message, type = "error") {
    messageBox.textContent = message;
    messageBox.className = type === "success" ? "success-box" : "error-box";
  }

  function clearMessage() {
    messageBox.textContent = "";
    messageBox.className = "hidden";
  }

  function setTab(tab) {
    tabButtons.forEach((button) => {
      button.classList.toggle("active", button.dataset.tab === tab);
    });
    loginForm.classList.toggle("hidden", tab !== "login");
    registerForm.classList.toggle("hidden", tab !== "register");
    clearMessage();
  }

  tabButtons.forEach((button) => {
    button.addEventListener("click", () => setTab(button.dataset.tab));
  });

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearMessage();

    const guard = getGuardState();
    if (guard.lockedUntil > Date.now()) {
      const remainingMs = guard.lockedUntil - Date.now();
      const remainingMin = Math.ceil(remainingMs / 60000);
      showMessage(`Muitas tentativas inválidas. Tente novamente em ${remainingMin} minuto(s).`);
      return;
    }

    const username = container.querySelector("#login-username").value.trim();
    const password = container.querySelector("#login-password").value.trim();

    if (!username || !password) {
      showMessage("Preencha usuário (ou e-mail) e senha para entrar.");
      return;
    }

    try {
      const session = await login({ username, password });
      clearFailedAttempts();
      setSession(session);
      showToast("Login realizado com sucesso.", "success");
      navigate("/dashboard");
    } catch (error) {
      registerFailedAttempt();
      showMessage(error.message || "Não foi possível autenticar.");
    }
  });

  registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearMessage();

    const name = container.querySelector("#register-name").value.trim();
    const username = container.querySelector("#register-username").value.trim();
    const referralCode = container.querySelector("#register-referral").value.trim();
    const password = container.querySelector("#register-password").value.trim();
    const termsAccepted = container.querySelector("#register-terms").checked;

    if (!name || !username || !password) {
      showMessage("Todos os campos do cadastro são obrigatórios.");
      return;
    }

    if (!isValidUsername(username)) {
      showMessage("Usuário inválido. Use 3-40 caracteres: letras, números, ponto, hífen ou underline.");
      return;
    }

    if (password.length < 6) {
      showMessage("A senha deve ter pelo menos 6 caracteres.");
      return;
    }

    if (!termsAccepted) {
      showMessage("Você precisa aceitar os termos para continuar.");
      return;
    }

    try {
      const session = await register({
        name,
        username,
        pixKey: "",
        address: "Não informado",
        password,
        referralCode,
      });
      setSession(session);
      showMessage("Cadastro concluído. Redirecionando...", "success");
      showToast("Conta criada com sucesso.", "success");
      setTimeout(() => navigate("/dashboard"), 500);
    } catch (error) {
      showMessage(error.message || "Falha no cadastro.");
    }
  });

  container.querySelector("#register-show-password")?.addEventListener("change", (event) => {
    const checked = Boolean(event.target?.checked);
    const passwordNode = container.querySelector("#register-password");
    if (passwordNode) passwordNode.type = checked ? "text" : "password";
  });
}
