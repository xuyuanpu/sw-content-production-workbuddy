import fs from "node:fs/promises";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {dataUrl, ensureDir, findPlaywright, forbiddenHits, parseArgs, platformPaths, pngSize, readJson, sha256, writeJson} from "./lib.mjs";

const args = parseArgs();
if (!args.unit) { console.error("用法: node render-xhs.mjs --unit <内容单元路径>"); process.exit(2); }
const {xhs} = platformPaths(args.unit);
const contentPath = path.join(xhs, "content.json");
const content = await readJson(contentPath);
if (!Array.isArray(content.pages) || content.pages.length < 3 || content.pages.length > 10 || content.pages[0]?.type !== "cover") throw new Error("小红书必须有 3–10 页，且第一页为 cover；材料不足时减少页数，不要摊薄内容");
const caption = await fs.readFile(path.join(xhs, "caption.md"), "utf8");
const publicText = `${JSON.stringify(content)}\n${caption}`;
if (forbiddenHits(publicText).length) throw new Error(`命中个人归属禁用项: ${forbiddenHits(publicText).join(", ")}`);
const logo = await fs.readFile(path.join(xhs, "assets", "logo.png"));
if (sha256(logo) !== "0fee5573addd255ab7976ea1b625ff34206f2d4b72987368354539c8e7312c57") throw new Error("Logo 不是 SW 标准原件");
await fs.access(path.join(xhs, "assets", "cover.png"));
await fs.writeFile(path.join(xhs, "content.js"), `window.SW_XHS_CONTENT = ${JSON.stringify(content, null, 2)};\n`);
const out = path.join(xhs, "output");
await ensureDir(out);
for (const name of await fs.readdir(out)) {
  if (/^(page-\d{2}\.png|carousel-long\.png|contact-sheet\.png|caption\.md|check-report\.json)$/u.test(name)) await fs.unlink(path.join(out, name));
}
const {chromium} = await findPlaywright();
const browser = await chromium.launch({headless: true});
const page = await browser.newPage({viewport: {width: 1080, height: 1440}, deviceScaleFactor: 1});
const diagnostics = {consoleErrors: [], pageErrors: [], remoteResources: [], pages: []};
page.on("console", (message) => { if (message.type() === "error") diagnostics.consoleErrors.push(message.text()); });
page.on("pageerror", (error) => diagnostics.pageErrors.push(error.message));
page.on("request", (request) => { if (/^https?:/iu.test(request.url())) diagnostics.remoteResources.push(request.url()); });
try {
  for (let index = 0; index < content.pages.length; index += 1) {
    const url = new URL(pathToFileURL(path.join(xhs, "index.html")).href);
    url.searchParams.set("page", String(index + 1));
    await page.goto(url.href, {waitUntil: "load"});
    await page.evaluate(async () => document.fonts.ready);
    await page.waitForFunction(() => [...document.images].every((image) => image.complete && image.naturalWidth > 0));
    const metrics = await page.evaluate(() => {
      const canvas = document.querySelector("[data-canvas]");
      const article = document.querySelector(".article-stream");
      const footer = document.querySelector(".page-footer");
      const cover = document.querySelector("[data-cover-image]");
      const prose = document.querySelector("[data-prose]");
      const proseStyle = prose ? getComputedStyle(prose) : null;
      const lastContent = [...(article?.querySelectorAll(".chapter-heading,.article-figure,.prose p,.closing-note") || [])].at(-1);
      const articleRect = article?.getBoundingClientRect();
      const usedHeight = articleRect && lastContent ? lastContent.getBoundingClientRect().bottom - articleRect.top : 0;
      return {
        width: canvas.clientWidth, height: canvas.clientHeight,
        overflowX: Math.max(canvas.scrollWidth - canvas.clientWidth, document.documentElement.scrollWidth - innerWidth),
        overflowY: Math.max(canvas.scrollHeight - canvas.clientHeight, document.documentElement.scrollHeight - innerHeight),
        articleBottom: article?.scrollHeight || 0,
        articleAvailable: article?.clientHeight || 0,
        usedHeight,
        fillRatio: articleRect?.height ? Number((usedHeight / articleRect.height).toFixed(3)) : null,
        footerTop: footer.getBoundingClientRect().top,
        prose: proseStyle ? {fontSize: parseFloat(proseStyle.fontSize), fontWeight: parseFloat(proseStyle.fontWeight), lineHeight: parseFloat(proseStyle.lineHeight)} : null,
        cover: cover ? {naturalWidth: cover.naturalWidth, naturalHeight: cover.naturalHeight, displayWidth: cover.getBoundingClientRect().width, displayHeight: cover.getBoundingClientRect().height, objectFit: getComputedStyle(cover).objectFit} : null,
        text: canvas.innerText,
      };
    });
    if (metrics.overflowX > 0 || metrics.overflowY > 0 || metrics.articleBottom > metrics.articleAvailable + 1) throw new Error(`page-${index + 1} 页面溢出: ${JSON.stringify(metrics)}`);
    if (content.pages[index].type !== "cover" && metrics.fillRatio < 0.32) throw new Error(`page-${index + 1} 内容过少（占用 ${metrics.fillRatio}），请合并页面，不要凑页数`);
    if (metrics.cover && (metrics.cover.naturalWidth < metrics.cover.displayWidth || metrics.cover.naturalHeight < metrics.cover.displayHeight)) throw new Error("封面图片被低分辨率放大");
    if (forbiddenHits(metrics.text).length) throw new Error(`page-${index + 1} DOM 命中禁用项`);
    const file = `page-${String(index + 1).padStart(2, "0")}.png`;
    await page.screenshot({path: path.join(out, file)});
    diagnostics.pages.push({file, ...metrics});
  }

  const encoded = [];
  for (let index = 0; index < content.pages.length; index += 1) encoded.push(await dataUrl(path.join(out, `page-${String(index + 1).padStart(2, "0")}.png`)));
  const composite = (mode) => `<!doctype html><html><body style="margin:0;background:${mode === "long" ? "#fff" : "#ece8e4"};display:${mode === "long" ? "block" : "grid"};grid-template-columns:repeat(3,540px);gap:${mode === "long" ? 0 : 28}px;padding:${mode === "long" ? 0 : 40}px">${encoded.map((src) => `<img src="${src}" style="display:block;width:${mode === "long" ? 1080 : 540}px;height:${mode === "long" ? 1440 : 720}px">`).join("")}</body></html>`;
  for (const mode of ["long", "contact"]) {
    const file = path.join(xhs, `composite-${mode}.html`);
    await fs.writeFile(file, composite(mode));
    await page.setViewportSize(mode === "long" ? {width: 1080, height: 1440} : {width: 1740, height: 1200});
    await page.goto(pathToFileURL(file).href, {waitUntil: "load"});
    await page.screenshot({path: path.join(out, mode === "long" ? "carousel-long.png" : "contact-sheet.png"), fullPage: true});
  }
} finally { await browser.close(); }
await fs.copyFile(path.join(xhs, "caption.md"), path.join(out, "caption.md"));
const dimensions = {};
for (const file of (await fs.readdir(out)).filter((name) => name.endsWith(".png"))) dimensions[file] = pngSize(await fs.readFile(path.join(out, file)));
const report = {generatedAt: new Date().toISOString(), pageCount: content.pages.length, dimensions, ...diagnostics, passed: diagnostics.consoleErrors.length === 0 && diagnostics.pageErrors.length === 0 && diagnostics.remoteResources.length === 0};
await writeJson(path.join(out, "check-report.json"), report);
if (!report.passed) throw new Error(`小红书渲染检查失败: ${JSON.stringify(diagnostics)}`);
console.log(JSON.stringify({status: "xhs-candidate-ready", output: out, pageCount: content.pages.length, long: dimensions["carousel-long.png"]}, null, 2));
