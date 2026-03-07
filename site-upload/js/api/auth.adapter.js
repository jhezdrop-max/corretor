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

function slugifyUsername(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "")
    .slice(0, 40);
}

function normalizeRegisterPayload({ name, username, email, password, cpf, pixKey, address, referralCode }) {
  const usernameSlug = slugifyUsername(username || email || "");
  const resolvedEmail = String(email || "").trim() || `${usernameSlug || "cliente"}@cliente.byetrader.com`;
  return {
    name,
    email: resolvedEmail,
    password,
    cpf: String(cpf || "").trim() || "00000000000",
    pixKey: String(pixKey || "").trim(),
    address: String(address || "").trim() || "Não informado",
    referralCode: String(referralCode || "").trim(),
  };
}

function buildLoginCandidates(identifier) {
  const raw = String(identifier || "").trim();
  if (!raw) return [];
  if (raw.includes("@")) return [raw];
  const slug = slugifyUsername(raw) || raw.toLowerCase();
  return [
    `${slug}@cliente.byetrader.com`,
    `${slug}@byetrader.com`,
    raw,
  ];
}

export async function register({ name, username = "", email = "", password, cpf = "", pixKey, address = "", referralCode = "" }) {
  const payload = normalizeRegisterPayload({
    name,
    username,
    email,
    password,
    cpf,
    pixKey,
    address,
    referralCode,
  });

  if (API_MODE === "real") {
    const response = await fetch(`${ENDPOINTS.auth}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error("Falha ao cadastrar usuário.");
    }

    return response.json();
  }

  const user = registerUser(payload);
  return { user, token: fakeToken() };
}

export async function login({ email = "", username = "", password }) {
  const candidates = buildLoginCandidates(username || email);

  if (API_MODE === "real") {
    let lastResponse = null;
    for (const candidate of candidates) {
      const response = await fetch(`${ENDPOINTS.auth}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: candidate, password }),
      });
      lastResponse = response;
      if (response.ok) return response.json();
    }

    if (!lastResponse?.ok) {
      throw new Error("Falha ao autenticar usuário.");
    }
  }

  const candidateEmail = candidates[0] || email;
  const user = loginUser({ email: candidateEmail, password });
  return { user, token: fakeToken() };
}

export async function logout() {
  if (API_MODE === "real") {
    await fetch(`${ENDPOINTS.auth}/logout`, { method: "POST" });
  }
}
