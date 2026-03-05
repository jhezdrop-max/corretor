import { createSupportTicket, listSupportTickets } from "../api/support.adapter.js";
import { formatDateTime } from "../store.js";
import { showToast } from "../components/toast.js";

function badge(status) {
  if (status === "CLOSED") return '<span class="badge badge-paid">CLOSED</span>';
  return '<span class="badge badge-pending">OPEN</span>';
}

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

export async function renderSupportView(container) {
  let tickets = await listSupportTickets();

  container.innerHTML = `
    <section class="main-content anim-fade-up">
      <article class="section-card">
        <div class="section-header">
          <h3>Suporte</h3>
          <small class="help-text">Envie seu problema e seu WhatsApp para contato.</small>
        </div>
        <form id="support-form" class="form-grid" style="max-width:680px;">
          <div class="field">
            <label for="support-whatsapp">WhatsApp</label>
            <input class="input" id="support-whatsapp" type="text" placeholder="(11) 99999-9999" required />
          </div>
          <div class="field">
            <label for="support-message">Descreva seu problema</label>
            <textarea class="input" id="support-message" rows="5" placeholder="Explique o que aconteceu..." required></textarea>
          </div>
          <div class="inline-actions">
            <button class="btn btn-primary" type="submit">Enviar Chamado</button>
          </div>
          <div id="support-message-box" class="hidden"></div>
        </form>
      </article>

      <article class="section-card">
        <div class="section-header">
          <h3>Meus Chamados</h3>
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Data</th>
                <th>WhatsApp</th>
                <th>Mensagem</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody id="support-tickets-tbody"></tbody>
          </table>
        </div>
      </article>
    </section>
  `;

  const tbody = container.querySelector("#support-tickets-tbody");
  const messageBox = container.querySelector("#support-message-box");

  function setMessage(text, type = "error") {
    messageBox.textContent = text;
    messageBox.className = type === "success" ? "success-box" : "error-box";
  }

  function renderTable() {
    if (!tickets.length) {
      tbody.innerHTML = '<tr><td colspan="4" style="color:var(--text-2);">Nenhum chamado enviado.</td></tr>';
      return;
    }
    tbody.innerHTML = tickets
      .map(
        (item) => `
        <tr>
          <td>${formatDateTime(item.createdAt)}</td>
          <td class="mono">${item.whatsapp}</td>
          <td>${item.message}</td>
          <td>${badge(item.status)}</td>
        </tr>
      `,
      )
      .join("");
  }

  renderTable();

  container.querySelector("#support-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const whatsapp = onlyDigits(container.querySelector("#support-whatsapp").value);
    const message = container.querySelector("#support-message").value.trim();
    if (!whatsapp || whatsapp.length < 10) {
      setMessage("Informe um WhatsApp válido.");
      return;
    }
    if (message.length < 10) {
      setMessage("Descreva melhor seu problema (mínimo 10 caracteres).");
      return;
    }

    try {
      await createSupportTicket({ whatsapp, message });
      tickets = await listSupportTickets();
      renderTable();
      container.querySelector("#support-message").value = "";
      setMessage("Chamado enviado com sucesso.", "success");
      showToast("Chamado enviado ao suporte.", "success");
    } catch (error) {
      setMessage(error.message || "Falha ao enviar chamado.");
    }
  });
}

