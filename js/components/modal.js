let layer = null;

export function openModal({ title, message, confirmLabel = "Confirmar", onConfirm }) {
  closeModal();

  layer = document.createElement("div");
  layer.className = "modal-layer anim-fade-up";
  layer.innerHTML = `
    <div class="modal-card">
      <h3>${title}</h3>
      <p style="margin: 0.75rem 0 1.1rem; color: var(--text-1);">${message}</p>
      <div class="inline-actions">
        <button class="btn btn-primary" data-modal-confirm>${confirmLabel}</button>
        <button class="btn btn-secondary" data-modal-cancel>Fechar</button>
      </div>
    </div>
  `;

  layer.querySelector("[data-modal-confirm]")?.addEventListener("click", () => {
    onConfirm?.();
    closeModal();
  });

  layer.querySelector("[data-modal-cancel]")?.addEventListener("click", closeModal);
  document.body.appendChild(layer);
}

export function closeModal() {
  if (layer) {
    layer.remove();
    layer = null;
  }
}
