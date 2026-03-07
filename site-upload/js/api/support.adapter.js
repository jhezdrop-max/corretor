import { API_MODE, ENDPOINTS } from "../config.js";
import { requireSession } from "../store.js";

const MOCK_TICKETS = [];

export async function listSupportTickets() {
  const session = requireSession();
  if (API_MODE === "real") {
    const response = await fetch(`${ENDPOINTS.support}/tickets`, {
      headers: {
        Authorization: `Bearer ${session.token}`,
      },
    });
    if (!response.ok) throw new Error("Falha ao listar chamados de suporte.");
    return response.json();
  }
  return [...MOCK_TICKETS];
}

export async function createSupportTicket({ whatsapp, message }) {
  const session = requireSession();
  if (API_MODE === "real") {
    const response = await fetch(`${ENDPOINTS.support}/tickets`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.token}`,
      },
      body: JSON.stringify({ whatsapp, message }),
    });
    if (!response.ok) throw new Error("Falha ao abrir chamado de suporte.");
    return response.json();
  }

  const ticket = {
    ticketId: `mock-${Date.now()}`,
    userId: session.user.id,
    userName: session.user.name,
    userEmail: session.user.email,
    whatsapp,
    message,
    status: "OPEN",
    createdAt: Date.now(),
  };
  MOCK_TICKETS.unshift(ticket);
  return ticket;
}

