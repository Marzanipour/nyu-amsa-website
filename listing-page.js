function renderListingPage(options) {
  const target = document.getElementById(options.targetId);
  const items = Array.isArray(options.items) ? options.items : [];

  if (!target) {
    return;
  }

  if (items.length === 0) {
    target.innerHTML = `
      <article class="empty-state">
        <h2>${escapeHtml(options.emptyTitle)}</h2>
        <p>${escapeHtml(options.emptyMessage)}</p>
      </article>
    `;
    return;
  }

  target.innerHTML = items.map((item) => renderListingCard(item, options.actionLabel)).join("");
}

function renderListingCard(item, actionLabel) {
  const meta = [item.date, item.time, item.location].filter(Boolean).join(" • ");
  const tags = Array.isArray(item.tags) ? item.tags : [];
  const link = item.link
    ? `<a class="card-link" href="${escapeAttribute(item.link)}" target="_blank" rel="noopener">${escapeHtml(actionLabel)}</a>`
    : "";

  return `
    <article class="listing-card">
      <div>
        ${item.type ? `<p class="card-kicker">${escapeHtml(item.type)}</p>` : ""}
        <h2>${escapeHtml(item.title || "Untitled")}</h2>
        ${meta ? `<p class="card-meta">${escapeHtml(meta)}</p>` : ""}
        ${item.description ? `<p>${escapeHtml(item.description)}</p>` : ""}
      </div>
      ${tags.length ? `<div class="tag-row">${tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>` : ""}
      ${link}
    </article>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}
