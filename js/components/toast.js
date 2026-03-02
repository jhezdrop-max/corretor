let container = null;

function ensureContainer() {
  if (!container) {
    container = document.createElement("div");
    container.className = "toast-container";
    document.body.appendChild(container);
  }

  return container;
}

export function showToast(message, variant = "info") {
  const target = ensureContainer();
  const node = document.createElement("div");
  node.className = `toast ${variant}`;
  node.textContent = message;
  target.appendChild(node);

  setTimeout(() => {
    node.remove();
  }, 3000);
}
