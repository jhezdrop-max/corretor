import { login, register } from "../api/auth.adapter.js";
import { setSession } from "../store.js";
import { showToast } from "../components/toast.js";

const LOGIN_GUARD_KEY = "orbita-login-guard";
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_WINDOW_MS = 5 * 60 * 1000;

function isValidEmail(value) {
  return /\S+@\S+\.\S+/.test(value);
}

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
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
          <label for="login-email">E-mail</label>
          <input class="input" id="login-email" type="email" placeholder="voce@empresa.com" required />
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
          <label for="register-email">E-mail</label>
          <input class="input" id="register-email" type="email" required />
        </div>
        <div class="field">
          <label for="register-cpf">CPF</label>
          <input class="input mono" id="register-cpf" type="text" maxlength="14" required />
        </div>
        <div class="field">
          <label for="register-pix">Chave Pix</label>
          <input class="input" id="register-pix" type="text" required />
        </div>
        <div class="field">
          <label for="register-address">Endereço residencial</label>
          <input class="input" id="register-address" type="text" required />
        </div>
        <div class="field">
          <label for="register-referral">Código de indicação (opcional)</label>
          <input class="input mono" id="register-referral" type="text" value="${referralFromUrl}" />
        </div>
        <div class="field">
          <label for="register-password">Senha</label>
          <input class="input" id="register-password" type="password" required />
        </div>
        <div class="field">
          <label for="register-password-confirm">Confirmar senha</label>
          <input class="input" id="register-password-confirm" type="password" required />
        </div>
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

    const email = container.querySelector("#login-email").value.trim();
    const password = container.querySelector("#login-password").value.trim();

    if (!email || !password) {
      showMessage("Preencha e-mail e senha para entrar.");
      return;
    }

    if (!isValidEmail(email)) {
      showMessage("Formato de e-mail inválido.");
      return;
    }

    try {
      const session = await login({ email, password });
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
    const email = container.querySelector("#register-email").value.trim();
    const cpf = onlyDigits(container.querySelector("#register-cpf").value);
    const pixKey = container.querySelector("#register-pix").value.trim();
    const address = container.querySelector("#register-address").value.trim();
    const referralCode = container.querySelector("#register-referral").value.trim();
    const password = container.querySelector("#register-password").value.trim();
    const confirm = container.querySelector("#register-password-confirm").value.trim();
    const termsAccepted = container.querySelector("#register-terms").checked;

    if (!name || !email || !cpf || !pixKey || !address || !password || !confirm) {
      showMessage("Todos os campos do cadastro são obrigatórios.");
      return;
    }

    if (!isValidEmail(email)) {
      showMessage("Informe um e-mail válido.");
      return;
    }

    if (password.length < 6) {
      showMessage("A senha deve ter pelo menos 6 caracteres.");
      return;
    }

    if (cpf.length !== 11) {
      showMessage("CPF inválido. Informe 11 dígitos.");
      return;
    }

    if (address.length < 8) {
      showMessage("Informe um endereço residencial válido.");
      return;
    }

    if (password !== confirm) {
      showMessage("As senhas não conferem.");
      return;
    }

    if (!termsAccepted) {
      showMessage("Você precisa aceitar os termos para continuar.");
      return;
    }

    try {
      const session = await register({ name, email, cpf, pixKey, address, password, referralCode });
      setSession(session);
      showMessage("Cadastro concluído. Redirecionando...", "success");
      showToast("Conta criada com sucesso.", "success");
      setTimeout(() => navigate("/dashboard"), 500);
    } catch (error) {
      showMessage(error.message || "Falha no cadastro.");
    }
  });
}
