import fs from "node:fs/promises";
import path from "node:path";
import {ensureDir, findPlaywright, forbiddenHits, parseArgs, platformPaths, pngSize, readJson, sha256, compactCount, dataUrl, writeJson} from "./lib.mjs";
import {pathToFileURL} from "node:url";

const args = parseArgs();
if (!args.unit) { console.error("用法: node build-wechat.mjs --unit <内容单元路径>"); process.exit(2); }
const {wechat} = platformPaths(args.unit);
const data = await readJson(path.join(wechat, "article.json"));
if (!data.title || !data.lead || !Array.isArray(data.sections) || !data.sections.length || !data.image?.src) throw new Error("article.json 缺少标题、导语、章节或实质内容图");
const imageSource = path.resolve(wechat, data.image.src);
await fs.access(imageSource);
const logoSource = path.join(wechat, "assets", "logo.png");
const logoBuffer = await fs.readFile(logoSource);
if (sha256(logoBuffer) !== "0fee5573addd255ab7976ea1b625ff34206f2d4b72987368354539c8e7312c57") throw new Error("Logo 不是 SW 标准原件");

const visibleParts = [data.lead];
for (const section of data.sections) visibleParts.push(section.heading, ...(section.paragraphs || []));
visibleParts.push(data.image.caption || "", data.boundary || "", data.closing || "");
const characterCount = compactCount(visibleParts.join(""));
if (characterCount > 500) throw new Error(`公众号读者可见正文 ${characterCount}/500 字，必须先压缩`);
const publicText = JSON.stringify(data);
const hits = forbiddenHits(publicText);
if (hits.length) throw new Error(`命中个人归属禁用项: ${hits.join(", ")}`);

const out = path.join(wechat, "output");
await ensureDir(out);
for (const name of await fs.readdir(out)) {
  if (/^(article\.(md|html)|article-full\.png|share-copy\.md|logo\.png|content-image\.(png|jpe?g|svg|webp)|check-report\.json)$/iu.test(name)) await fs.unlink(path.join(out, name));
}
const escapeHtml = (value) => String(value ?? "").replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;");
const imageName = `content-image${path.extname(imageSource).toLowerCase() || ".png"}`;
await fs.copyFile(logoSource, path.join(out, "logo.png"));
await fs.copyFile(imageSource, path.join(out, imageName));
const logoData = await dataUrl(logoSource);
const imageData = await dataUrl(imageSource);
const sectionHtml = data.sections.map((section) => `<h2 style="margin:38px 0 17px;padding:0 0 9px 12px;border-bottom:3px solid #2B2929;border-left:6px solid #9E2F3F;color:#2B2929;font-size:21px;line-height:1.42;font-weight:800;">${escapeHtml(section.heading)}</h2>${(section.paragraphs || []).map((paragraph) => `<p style="margin:0 0 18px;color:#2B2929;font-size:17px;line-height:1.92;letter-spacing:.01em;">${escapeHtml(paragraph)}</p>`).join("")}`).join("");
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="${escapeHtml(data.summary || "SW 专业内容")}"><title>${escapeHtml(data.title)}｜SW</title></head><body style="margin:0;background:#ECE7E4;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;"><main id="phone-screen" style="width:100%;max-width:390px;margin:0 auto;overflow:hidden;background:#FCFAF8;min-height:844px;"><header style="display:flex;align-items:center;padding:18px 25px 10px;border-bottom:1px solid #E5D9DA;"><img id="brand-logo" src="${logoData}" alt="" width="800" height="468" style="display:block;width:88px;height:auto;max-height:52px;object-fit:contain;object-position:left center;"></header><article id="article-content" style="padding:25px 25px 48px;background:linear-gradient(90deg,transparent 0 27px,rgba(158,47,63,.09) 27px 28px,transparent 28px);"><h1 style="margin:0 0 18px;padding:0 0 0 14px;border-left:7px solid #9E2F3F;color:#2B2929;font-size:27px;line-height:1.34;font-weight:800;letter-spacing:-.025em;">${escapeHtml(data.title)}</h1><p style="margin:0 0 25px;padding:0 0 0 12px;border-left:3px solid #9E2F3F;color:#685C5E;font-size:15px;line-height:1.72;">${escapeHtml(data.lead)}</p>${sectionHtml}<figure style="margin:24px 0 10px;padding:10px;border:1px solid #D8C4C7;background:#FFFDFB;"><img id="content-image" src="${imageData}" alt="${escapeHtml(data.image.alt || "")}" style="display:block;width:100%;max-width:100%;height:auto;border:0;"><figcaption style="margin:9px 3px 0;color:#756D6D;font-size:13px;line-height:1.6;">${escapeHtml(data.image.caption || "")}</figcaption></figure>${data.boundary ? `<p style="margin:20px 0 18px;padding:13px 14px;border:1px solid #D8C4C7;border-left:5px solid #9E2F3F;background:#FFFDFB;color:#2B2929;font-size:17px;line-height:1.9;">${escapeHtml(data.boundary)}</p>` : ""}${data.closing ? `<p style="margin:0 0 18px;padding:13px 14px;border-left:5px solid #9E2F3F;background:#F6E8E8;color:#2B2929;font-size:17px;line-height:1.9;">${escapeHtml(data.closing)}</p>` : ""}<div style="height:3px;margin:34px 0 0;background:linear-gradient(90deg,#9E2F3F 0 56%,#2B2929 56% 100%);"></div></article></main></body></html>\n`;
const markdown = [`# ${data.title}`, "", `> ${data.lead}`, "", ...data.sections.flatMap((section) => [`## ${section.heading}`, "", ...(section.paragraphs || []).flatMap((paragraph) => [paragraph, ""]),]), `![${data.image.alt || "专业解释图"}](${imageName})`, "", data.image.caption || "", "", data.boundary || "", "", data.closing || ""].join("\n").trim() + "\n";
const share = `# 公众号分享文案\n\n## 标题\n\n${data.share?.title || data.title}\n\n## 摘要\n\n${data.share?.summary || data.summary || ""}\n\n## 朋友圈转发语\n\n${data.share?.moments || data.closing || ""}\n`;
await fs.writeFile(path.join(out, "article.html"), html);
await fs.writeFile(path.join(out, "article.md"), markdown);
await fs.writeFile(path.join(out, "share-copy.md"), share);

const {chromium} = await findPlaywright();
const browser = await chromium.launch({headless: true});
const context = await browser.newContext({viewport: {width: 390, height: 844}, deviceScaleFactor: 2});
const page = await context.newPage();
const errors = {console: [], page: [], request: [], remoteResources: []};
page.on("console", (message) => { if (message.type() === "error") errors.console.push(message.text()); });
page.on("pageerror", (error) => errors.page.push(error.message));
page.on("requestfailed", (request) => errors.request.push({url: request.url(), error: request.failure()?.errorText || "unknown"}));
page.on("request", (request) => { if (/^https?:/iu.test(request.url())) errors.remoteResources.push(request.url()); });
await page.goto(pathToFileURL(path.join(out, "article.html")).href, {waitUntil: "load"});
await page.evaluate(async () => document.fonts.ready);
const metrics = await page.evaluate(() => {
  const phone = document.querySelector("#phone-screen");
  const article = document.querySelector("#article-content");
  const image = document.querySelector("#content-image");
  const logo = document.querySelector("#brand-logo");
  return {
    pageOverflow: Math.max(document.documentElement.scrollWidth - innerWidth, document.body.scrollWidth - innerWidth),
    phoneOverflow: phone.scrollWidth - phone.clientWidth,
    clippedTextNodes: [...article.querySelectorAll("h1,h2,p,figcaption")].filter((node) => node.scrollWidth - node.clientWidth > 1).length,
    image: {naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight, displayWidth: image.getBoundingClientRect().width, displayHeight: image.getBoundingClientRect().height},
    logo: {naturalWidth: logo.naturalWidth, naturalHeight: logo.naturalHeight, displayWidth: logo.getBoundingClientRect().width, displayHeight: logo.getBoundingClientRect().height, objectFit: getComputedStyle(logo).objectFit},
    text: article.innerText,
  };
});
if (metrics.pageOverflow > 1 || metrics.phoneOverflow > 1 || metrics.clippedTextNodes) throw new Error(`公众号移动端溢出: ${JSON.stringify(metrics)}`);
if (metrics.image.naturalWidth < metrics.image.displayWidth || metrics.image.naturalHeight < metrics.image.displayHeight) throw new Error("公众号内容图被低分辨率放大");
if (forbiddenHits(metrics.text).length) throw new Error("公众号 DOM 命中个人归属禁用项");
await page.locator("#phone-screen").screenshot({path: path.join(out, "article-full.png")});
await context.close();
await browser.close();
const screenshot = pngSize(await fs.readFile(path.join(out, "article-full.png")));
const report = {generatedAt: new Date().toISOString(), characterCount, limit: 500, screenshot, metrics, errors, passed: Object.values(errors).every((items) => items.length === 0)};
await writeJson(path.join(out, "check-report.json"), report);
if (!report.passed) throw new Error(`公众号检查失败: ${JSON.stringify(errors)}`);
console.log(JSON.stringify({status: "wechat-candidate-ready", output: out, characterCount, screenshot}, null, 2));
