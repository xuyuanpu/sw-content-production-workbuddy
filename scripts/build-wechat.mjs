import fs from "node:fs/promises";
import path from "node:path";
import {WECHAT_CHARACTER_RANGE, ensureDir, findPlaywright, forbiddenHits, parseArgs, platformPaths, pngSize, readJson, sha256, compactCount, dataUrl, writeJson} from "./lib.mjs";
import {pathToFileURL} from "node:url";
import {WECHAT_BRAND_ASSETS, WECHAT_BRAND_COPY} from "./wechat-brand-shell.mjs";

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
const brandSources = Object.fromEntries(Object.keys(WECHAT_BRAND_ASSETS).map((name) => [name, path.join(wechat, "assets", name)]));
for (const [name, source] of Object.entries(brandSources)) {
  const actual = sha256(await fs.readFile(source));
  if (actual !== WECHAT_BRAND_ASSETS[name]) throw new Error(`公众号固定品牌素材不是原始文件: ${name}`);
}

const visibleParts = [data.lead];
for (const section of data.sections) visibleParts.push(section.heading, ...(section.paragraphs || []));
visibleParts.push(data.image.caption || "", data.boundary || "", data.closing || "");
const characterCount = compactCount(visibleParts.join(""));
const characterRange = WECHAT_CHARACTER_RANGE;
if (characterCount < characterRange.min || characterCount > characterRange.max) {
  const action = characterCount < characterRange.min
    ? "请补足由原始材料支持的论证、例子、边界或行动建议；材料不足时停止上报，不得用空话凑字数"
    : "请压缩重复表达和旁枝，不得删除必要边界或把正文藏入图片";
  throw new Error(`公众号读者可见正文 ${characterCount} 字，不在 ${characterRange.min}～${characterRange.max} 字范围内。${action}`);
}
const publicText = JSON.stringify(data);
const hits = forbiddenHits(publicText);
if (hits.length) throw new Error(`命中个人归属禁用项: ${hits.join(", ")}`);

const out = path.join(wechat, "output");
await ensureDir(out);
for (const name of await fs.readdir(out)) {
  if (/^(article\.(md|html)|article-full\.png|share-copy\.md|logo\.png|brand-(header\.gif|footer-group\.png|footer-channels\.webp)|content-image\.(png|jpe?g|svg|webp)|check-report\.json)$/iu.test(name)) await fs.unlink(path.join(out, name));
}
const escapeHtml = (value) => String(value ?? "").replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;");
const imageName = `content-image${path.extname(imageSource).toLowerCase() || ".png"}`;
await fs.copyFile(logoSource, path.join(out, "logo.png"));
await fs.copyFile(imageSource, path.join(out, imageName));
for (const [name, source] of Object.entries(brandSources)) await fs.copyFile(source, path.join(out, name));
const imageData = await dataUrl(imageSource);
const brandData = Object.fromEntries(await Promise.all(Object.entries(brandSources).map(async ([name, source]) => [name, await dataUrl(source)])));
const sectionHtml = data.sections.map((section) => `<h2 style="margin:38px 0 17px;padding:0 0 9px 12px;border-bottom:3px solid #2B2929;border-left:6px solid #9E2F3F;color:#2B2929;font-size:21px;line-height:1.42;font-weight:800;">${escapeHtml(section.heading)}</h2>${(section.paragraphs || []).map((paragraph) => `<p style="margin:0 0 18px;color:#2B2929;font-size:17px;line-height:1.92;letter-spacing:.01em;">${escapeHtml(paragraph)}</p>`).join("")}`).join("");
const brandIntroHtml = `<section id="fixed-brand-copy" data-count-excluded="true" aria-label="SW 品牌介绍" style="margin:0;padding:32px 25px 30px;background:#FFFFFF;"><div aria-hidden="true" style="display:flex;align-items:center;gap:14px;margin:0 0 22px;color:#9E2F3F;"><span style="height:1px;flex:1;background:#9E2F3F;"></span><span style="font-size:22px;line-height:1;">💡</span><span style="height:1px;flex:1;background:#9E2F3F;"></span></div>${WECHAT_BRAND_COPY.intro.map((line, index) => `<p style="margin:${index ? "22px" : "0"} 0 0;color:#777;font-size:16px;line-height:1.95;letter-spacing:.01em;">${escapeHtml(line).replace("Skill&amp;Will™", '<strong style="color:#9E2F3F;font-weight:800;">Skill&amp;Will™</strong>')}</p>`).join("")}</section>`;
const brandFooterHtml = `<footer id="fixed-brand-footer" style="padding:0;background:#FFFFFF;"><img id="brand-footer-group" src="${brandData["brand-footer-group.png"]}" alt="SW测评与人才发展群介绍、入群二维码与MBTI商标说明" style="display:block;width:calc(100% - 36px);height:auto;margin:34px 18px 12px;border:0;"><img id="brand-footer-channels" src="${brandData["brand-footer-channels.webp"]}" alt="关注SW：公众号、视频号、小红书二维码，官网skillandwill.com，电话021-5108 2785" style="display:block;width:100%;height:auto;margin:12px 0 0;border:0;"></footer>`;
const brandLegalHtml = `<section id="fixed-brand-legal" data-count-excluded="true" aria-label="SW 商标说明" style="margin:0;padding:18px 25px 28px;background:#FFFFFF;"><p style="margin:0 0 18px;color:#9E2F3F;font-size:15px;line-height:1.7;text-align:right;font-weight:700;">${escapeHtml(WECHAT_BRAND_COPY.legal[0])}</p>${WECHAT_BRAND_COPY.legal.slice(1).map((line) => `<p style="margin:5px 0 0;color:#B5B1B1;font-size:12px;line-height:1.65;">${escapeHtml(line)}</p>`).join("")}</section>`;
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="${escapeHtml(data.summary || "SW 专业内容")}"><title>${escapeHtml(data.title)}｜SW</title></head><body style="margin:0;background:#ECE7E4;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;"><main id="phone-screen" style="width:100%;max-width:390px;margin:0 auto;overflow:hidden;background:#FCFAF8;min-height:844px;"><header id="fixed-brand-header" style="margin:0;background:#FFFFFF;"><img id="brand-header-image" src="${brandData["brand-header.gif"]}" alt="Skill&amp;Will（SW）官方品牌标识动画" style="display:block;width:100%;height:auto;border:0;"></header><article id="article-content" style="padding:25px 25px 48px;background:linear-gradient(90deg,transparent 0 27px,rgba(158,47,63,.09) 27px 28px,transparent 28px);"><h1 style="margin:0 0 18px;padding:0 0 0 14px;border-left:7px solid #9E2F3F;color:#2B2929;font-size:27px;line-height:1.34;font-weight:800;letter-spacing:-.025em;">${escapeHtml(data.title)}</h1><p style="margin:0 0 25px;padding:0 0 0 12px;border-left:3px solid #9E2F3F;color:#685C5E;font-size:15px;line-height:1.72;">${escapeHtml(data.lead)}</p>${sectionHtml}<figure style="margin:24px 0 10px;padding:10px;border:1px solid #D8C4C7;background:#FFFDFB;"><img id="content-image" src="${imageData}" alt="${escapeHtml(data.image.alt || "")}" style="display:block;width:100%;max-width:100%;height:auto;border:0;"><figcaption style="margin:9px 3px 0;color:#756D6D;font-size:13px;line-height:1.6;">${escapeHtml(data.image.caption || "")}</figcaption></figure>${data.boundary ? `<p style="margin:20px 0 18px;padding:13px 14px;border:1px solid #D8C4C7;border-left:5px solid #9E2F3F;background:#FFFDFB;color:#2B2929;font-size:17px;line-height:1.9;">${escapeHtml(data.boundary)}</p>` : ""}${data.closing ? `<p style="margin:0 0 18px;padding:13px 14px;border-left:5px solid #9E2F3F;background:#F6E8E8;color:#2B2929;font-size:17px;line-height:1.9;">${escapeHtml(data.closing)}</p>` : ""}<div style="height:3px;margin:34px 0 0;background:linear-gradient(90deg,#9E2F3F 0 56%,#2B2929 56% 100%);"></div></article>${brandIntroHtml}${brandFooterHtml}${brandLegalHtml}</main></body></html>\n`;
const markdown = [`# ${data.title}`, "", `![Skill&Will（SW）官方品牌标识动画](brand-header.gif)`, "", `> ${data.lead}`, "", ...data.sections.flatMap((section) => [`## ${section.heading}`, "", ...(section.paragraphs || []).flatMap((paragraph) => [paragraph, ""]),]), `![${data.image.alt || "专业解释图"}](${imageName})`, "", data.image.caption || "", "", data.boundary || "", "", data.closing || "", "", "<!-- FIXED-BRAND-INTRO-START -->", "", ...WECHAT_BRAND_COPY.intro.flatMap((line) => [line, ""]), "<!-- FIXED-BRAND-INTRO-END -->", "", `![SW测评与人才发展群介绍、入群二维码与MBTI商标说明](brand-footer-group.png)`, "", `![关注SW：公众号、视频号、小红书二维码，官网skillandwill.com，电话021-5108 2785](brand-footer-channels.webp)`, "", "<!-- FIXED-BRAND-LEGAL-START -->", "", ...WECHAT_BRAND_COPY.legal.flatMap((line) => [line, ""]), "<!-- FIXED-BRAND-LEGAL-END -->"].join("\n").trim() + "\n";
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
  const brandImages = [...document.querySelectorAll("#fixed-brand-header img,#fixed-brand-footer img")];
  return {
    pageOverflow: Math.max(document.documentElement.scrollWidth - innerWidth, document.body.scrollWidth - innerWidth),
    phoneOverflow: phone.scrollWidth - phone.clientWidth,
    clippedTextNodes: [...phone.querySelectorAll("h1,h2,p,figcaption")].filter((node) => node.scrollWidth - node.clientWidth > 1).length,
    image: {naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight, displayWidth: image.getBoundingClientRect().width, displayHeight: image.getBoundingClientRect().height},
    brandImages: brandImages.map((item) => ({naturalWidth: item.naturalWidth, naturalHeight: item.naturalHeight, displayWidth: item.getBoundingClientRect().width, displayHeight: item.getBoundingClientRect().height})),
    brandCopy: [document.querySelector("#fixed-brand-copy")?.innerText, document.querySelector("#fixed-brand-legal")?.innerText].filter(Boolean).join("\n"),
    text: article.innerText,
  };
});
if (metrics.pageOverflow > 1 || metrics.phoneOverflow > 1 || metrics.clippedTextNodes) throw new Error(`公众号移动端溢出: ${JSON.stringify(metrics)}`);
if (metrics.image.naturalWidth < metrics.image.displayWidth || metrics.image.naturalHeight < metrics.image.displayHeight) throw new Error("公众号内容图被低分辨率放大");
if (metrics.brandImages.length !== 3 || metrics.brandImages.some((item) => !item.naturalWidth || item.naturalWidth < item.displayWidth - 1 || item.naturalHeight < item.displayHeight - 1)) throw new Error("公众号固定品牌图片缺失或被放大");
if (![...WECHAT_BRAND_COPY.intro, ...WECHAT_BRAND_COPY.legal].every((line) => metrics.brandCopy.includes(line))) throw new Error("公众号固定品牌文字缺失或被改写");
if (forbiddenHits(metrics.text).length) throw new Error("公众号 DOM 命中个人归属禁用项");
await page.locator("#phone-screen").screenshot({path: path.join(out, "article-full.png")});
await context.close();
await browser.close();
const screenshot = pngSize(await fs.readFile(path.join(out, "article-full.png")));
const report = {generatedAt: new Date().toISOString(), characterCount, characterRange, fixedBrandCopyExcludedFromCharacterCount: true, brandAssetHashes: WECHAT_BRAND_ASSETS, screenshot, metrics, errors, passed: Object.values(errors).every((items) => items.length === 0)};
await writeJson(path.join(out, "check-report.json"), report);
if (!report.passed) throw new Error(`公众号检查失败: ${JSON.stringify(errors)}`);
console.log(JSON.stringify({status: "wechat-candidate-ready", output: out, characterCount, screenshot}, null, 2));
