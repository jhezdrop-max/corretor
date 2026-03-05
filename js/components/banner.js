function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}

export function renderBannerBlock(contentConfig, slotKey) {
  const banner = contentConfig?.banners?.[slotKey];
  if (!banner || !banner.enabled) return "";

  const title = escapeHtml(banner.title || "");
  const text = escapeHtml(banner.text || "");
  const image = String(banner.imageUrl || "").trim();
  const link = String(banner.linkUrl || "").trim();

  const body = `
    <article class="section-card promo-banner-card">
      ${title ? `<h3 class="promo-banner-title">${title}</h3>` : ""}
      ${text ? `<p class="promo-banner-text">${text}</p>` : ""}
      ${image ? `<img class="promo-banner-image" src="${escapeHtml(image)}" alt="${title || "Banner"}" />` : ""}
    </article>
  `;

  if (link) {
    return `<a href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer" class="promo-banner-link-wrap">${body}</a>`;
  }
  return body;
}

