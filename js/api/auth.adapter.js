import { API_MODE, ENDPOINTS } from "../config.js";
import { loginUser, registerUser } from "../mocks/mock-db.js";

function randomId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
}

function fakeToken() {
  return `mock-${randomId()}`;
}

export async function register({ name, email, password, cpf, pixKey, address }) {
  if (API_MODE === "real") {
    const response = await fetch(`${ENDPOINTS.auth}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, cpf, pixKey, address }),
    });

    if (!response.ok) {
      throw new Error("Falha ao cadastrar usuário.");
    }

    return response.json();
  }

  const user = registerUser({ name, email, password, cpf, pixKey, address });
  return { user, token: fakeToken() };
}

export async function login({ email, password }) {
  if (API_MODE === "real") {
    const response = await fetch(`${ENDPOINTS.auth}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      throw new Error("Falha ao autenticar usuário.");
    }

    return response.json();
  }

  const user = loginUser({ email, password });
  return { user, token: fakeToken() };
}

export async function logout() {
  if (API_MODE === "real") {
    await fetch(`${ENDPOINTS.auth}/logout`, { method: "POST" });
  }
}
