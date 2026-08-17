(() => {
  const data = window.SW_XHS_CONTENT;
  if (!data || !Array.isArray(data.pages)) throw new Error("content.js 未提供有效页面数据");
  const pageNumber = Math.max(1, Math.min(data.pages.length, Number(new URLSearchParams(location.search).get("page") || 1)));
  const page = data.pages[pageNumber - 1];
  const escapeHtml = (value) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const emphasize = (text, highlights = []) => {
    let html = escapeHtml(text);
    for (const value of [...highlights].sort((a, b) => b.length - a.length)) {
      const escaped = escapeHtml(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      html = html.replace(new RegExp(escaped, "g"), `<strong>${escapeHtml(value)}</strong>`);
    }
    return html;
  };
  const header = `<header class="running-header"><img class="official-logo" data-logo src="./assets/logo.png" alt=""><div class="running-meta"><span>SW EDITORIAL</span><strong>${escapeHtml(data.runningTitle || "专业内容")}</strong></div></header>`;
  const footer = `<footer class="page-footer"><span>${escapeHtml(data.footer || "专业解释 · 持续观察")}</span><strong>${String(pageNumber).padStart(2, "0")} / ${String(data.pages.length).padStart(2, "0")}</strong></footer>`;
  const titleLines = (page.titleLines || [page.title]).map((line) => `<span data-title-line>${escapeHtml(line)}</span>`).join("");
  let body = "";
  if (page.type === "cover") {
    body = `<figure class="cover-figure"><img data-cover-image src="${escapeHtml(page.image || "./assets/cover.png")}" alt=""><figcaption>${escapeHtml(page.imageCaption || "场景示意")}<i></i>${escapeHtml(page.imageNote || "")}</figcaption></figure><section class="cover-copy"><p class="cover-kicker">${escapeHtml(page.kicker || "SW 专业编辑解读")}</p><h1 class="cover-title">${titleLines}</h1><p class="cover-lead">${escapeHtml(page.lead)}</p><p class="cover-entry">${escapeHtml(page.entry)}</p></section>`;
  } else {
    const heading = page.title ? `<header class="chapter-heading"><p class="chapter-number">${escapeHtml(page.chapterNumber || String(pageNumber - 1).padStart(2, "0"))}</p><h1>${titleLines}</h1></header>` : "";
    const figure = page.figure ? `<figure class="article-figure"><img data-content-image src="${escapeHtml(page.figure.src)}" alt=""><figcaption>${escapeHtml(page.figure.caption || "")}</figcaption></figure>` : "";
    const paragraphs = (page.paragraphs || []).map((item, index) => `<p data-block-id="p${pageNumber}-${index + 1}">${emphasize(item.text || item, item.highlights || [])}</p>`).join("");
    const closing = page.closing ? `<div class="closing-note">${emphasize(page.closing.text || page.closing, page.closing.highlights || [])}</div>` : "";
    body = `<section class="article-stream ${page.figure ? "has-figure" : ""}">${heading}${figure}<div class="prose" data-prose>${paragraphs}${closing}</div></section>`;
  }
  document.querySelector("#render-root").innerHTML = `<article class="canvas page-${String(pageNumber).padStart(2, "0")}" data-canvas data-page-id="page-${String(pageNumber).padStart(2, "0")}" data-page-type="${escapeHtml(page.type)}">${header}${body}${footer}</article>`;
})();
