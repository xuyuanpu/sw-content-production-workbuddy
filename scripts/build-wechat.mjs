import {fingerprintGraphic} from './graphic-integrity-lib.mjs';
import fs from "node:fs/promises";
import path from "node:path";
import {WECHAT_CHARACTER_RANGE, ensureDir, findPlaywright, forbiddenHits, parseArgs, platformPaths, pngSize, readJson, sha256, compactCount, dataUrl, writeJson} from "./lib.mjs";
import {pathToFileURL} from "node:url";
import {WECHAT_BRAND_ASSETS, WECHAT_BRAND_COPY} from "./wechat-brand-shell.mjs";
import {analyzeWechatCover, analyzeWechatCoverOutputs, WECHAT_COVER_SPECS} from "./wechat-cover-lib.mjs";

const args = parseArgs();
if (!args.unit) { console.error("用法: node build-wechat.mjs --unit <内容单元路径>"); process.exit(2); }
const {wechat} = platformPaths(args.unit);
const data = await readJson(path.join(wechat, "article.json"));
if (!data.title || !data.lead || !Array.isArray(data.sections) || !data.sections.length || !data.image?.src) throw new Error("article.json 缺少标题、导语、章节或实质内容图");
const coverAnalysis = analyzeWechatCover(data.cover, data.title);
if (!coverAnalysis.passed) throw new Error(`公众号封面配置未通过: ${JSON.stringify(coverAnalysis.checks.filter((check) => !check.passed))}`);
const imageSource = path.resolve(wechat, data.image.src);
await fs.access(imageSource);
const coverSource = path.resolve(wechat, coverAnalysis.normalized.src);
await fs.access(coverSource);
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
  if (/^(article\.(md|html)|article-full\.png|share-copy\.md|logo\.png|brand-(header\.gif|footer-group\.png|footer-channels\.webp)|content-image\.(png|jpe?g|svg|webp)|cover-(wide|square)\.png|check-report\.json)$/iu.test(name)) await fs.unlink(path.join(out, name));
}
const escapeHtml = (value) => String(value ?? "").replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;");
const imageName = `content-image${path.extname(imageSource).toLowerCase() || ".png"}`;
await fs.copyFile(logoSource, path.join(out, "logo.png"));
await fs.copyFile(imageSource, path.join(out, imageName));
for (const [name, source] of Object.entries(brandSources)) await fs.copyFile(source, path.join(out, name));
const imageData = await dataUrl(imageSource);
const coverImageData = await dataUrl(coverSource);
const logoData = await dataUrl(logoSource);
const brandData = Object.fromEntries(await Promise.all(Object.entries(brandSources).map(async ([name, source]) => [name, await dataUrl(source)])));
const cover = coverAnalysis.normalized;
const coverTitleLength = Math.max(...cover.titleLines.map((line) => compactCount(line)));
const coverTitleFontSize = coverTitleLength > 11 ? 38 : coverTitleLength > 8 ? 42 : 46;
const coverLineHtml = cover.titleLines.map((line) => {
  if (!cover.highlight || !line.includes(cover.highlight)) return `<span class="semantic-line">${escapeHtml(line)}</span>`;
  const [before, ...after] = line.split(cover.highlight);
  return `<span class="semantic-line">${escapeHtml(before)}<em>${escapeHtml(cover.highlight)}</em>${escapeHtml(after.join(cover.highlight))}</span>`;
}).join("<br>");
const coverHtml = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>*{box-sizing:border-box}html,body{width:1000px;height:1000px;margin:0;overflow:hidden}body{font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif}#cover-master{position:relative;width:1000px;height:1000px;overflow:hidden;background:#2b2929}.photo{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:${cover.position.x}% ${cover.position.y}%;filter:saturate(.72) contrast(.96)}.veil{position:absolute;inset:0;background:linear-gradient(90deg,rgba(25,23,23,.18),rgba(25,23,23,.56) 50%,rgba(25,23,23,.18))}.edge{position:absolute;top:309px;width:50px;height:383px;background:#9e2f3f}.edge.left{left:0}.edge.right{right:0}.cover-panel{position:absolute;left:250px;top:309px;width:500px;height:383px;padding:25px 38px 23px;background:rgba(252,250,248,.96);border-top:8px solid #9e2f3f;box-shadow:0 20px 54px rgba(0,0,0,.22);text-align:center}.brand-row{display:flex;align-items:center;justify-content:center;gap:16px}.brand-row img{width:112px;height:auto;display:block}.brand-row span{padding-left:16px;border-left:1px solid #d8c4c7;color:#6c6465;font-size:15px;line-height:1.35;letter-spacing:.12em;text-align:left}h1{margin:17px auto 10px;color:#2b2929;font-size:${coverTitleFontSize}px;line-height:1.16;letter-spacing:-.04em;font-weight:820}h1 .semantic-line{white-space:nowrap}h1 em{color:#9e2f3f;font-style:normal}.subtitle{margin:0;color:#5c5556;font-size:17px;line-height:1.45;letter-spacing:.04em}.topic-code{position:absolute;left:38px;right:38px;bottom:17px;display:flex;align-items:center;justify-content:space-between;padding-top:10px;border-top:1px solid #d8c4c7;color:#8a7d7f;font-size:12px;letter-spacing:.07em}</style></head><body><main id="cover-master"><img id="cover-source" class="photo" src="${coverImageData}" alt="${escapeHtml(cover.alt)}"><div class="veil"></div><div class="edge left"></div><div class="edge right"></div><section class="cover-panel"><div class="brand-row"><img id="cover-logo" src="${logoData}" alt="Skill&Will"><span>SW 官方<br>专业解读</span></div><h1 id="cover-title">${coverLineHtml}</h1>${cover.subtitle ? `<p class="subtitle">${escapeHtml(cover.subtitle)}</p>` : ""}<div class="topic-code"><span>${escapeHtml(cover.category)}</span><span>SW</span></div></section></main></body></html>`;
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
const errors = {console: [], page: [], request: [], remoteResources: []};
const attachErrors = (targetPage) => {
  targetPage.on("console", (message) => { if (message.type() === "error") errors.console.push(message.text()); });
  targetPage.on("pageerror", (error) => errors.page.push(error.message));
  targetPage.on("requestfailed", (request) => errors.request.push({url: request.url(), error: request.failure()?.errorText || "unknown"}));
  targetPage.on("request", (request) => { if (/^https?:/iu.test(request.url())) errors.remoteResources.push(request.url()); });
};

const coverContext = await browser.newContext({viewport: {width: 1000, height: 1000}, deviceScaleFactor: 1});
const coverPage = await coverContext.newPage();
attachErrors(coverPage);
await coverPage.setContent(coverHtml, {waitUntil: "load"});
await coverPage.evaluate(async () => document.fonts.ready);
await coverPage.waitForFunction(() => {
  const source = document.querySelector("#cover-source");
  const logo = document.querySelector("#cover-logo");
  return source?.complete && source.naturalWidth > 0 && logo?.complete && logo.naturalWidth > 0;
});
const coverMetrics = await coverPage.evaluate(() => {
  const source = document.querySelector("#cover-source");
  const logo = document.querySelector("#cover-logo");
  const title = document.querySelector("#cover-title");
  const panel = document.querySelector(".cover-panel");
  return {
    source: {naturalWidth: source.naturalWidth, naturalHeight: source.naturalHeight, displayWidth: source.getBoundingClientRect().width, displayHeight: source.getBoundingClientRect().height},
    logo: {naturalWidth: logo.naturalWidth, naturalHeight: logo.naturalHeight, displayWidth: logo.getBoundingClientRect().width, displayHeight: logo.getBoundingClientRect().height},
    titleOverflow: title.scrollWidth - title.clientWidth,
    panelOverflow: panel.scrollHeight - panel.clientHeight,
  };
});
if (coverMetrics.source.naturalWidth < 1000 || coverMetrics.source.naturalHeight < 1000) throw new Error(`公众号封面主视觉至少需要 1000×1000 可裁切像素，当前 ${coverMetrics.source.naturalWidth}×${coverMetrics.source.naturalHeight}`);
if (coverMetrics.logo.naturalWidth < coverMetrics.logo.displayWidth || coverMetrics.logo.naturalHeight < coverMetrics.logo.displayHeight) throw new Error("公众号封面 Logo 被低分辨率放大");
if (coverMetrics.titleOverflow > 1 || coverMetrics.panelOverflow > 1) throw new Error(`公众号封面标题或面板溢出: ${JSON.stringify(coverMetrics)}`);
const coverMasterPath = path.join(wechat, "assets", "cover-master.png");
await coverPage.locator("#cover-master").screenshot({path: coverMasterPath});
await coverPage.screenshot({path: path.join(out, WECHAT_COVER_SPECS.wide.file), clip: {x: 50, y: 309, width: WECHAT_COVER_SPECS.wide.width, height: WECHAT_COVER_SPECS.wide.height}});
await coverPage.screenshot({path: path.join(out, WECHAT_COVER_SPECS.square.file), clip: {x: 250, y: 250, width: WECHAT_COVER_SPECS.square.width, height: WECHAT_COVER_SPECS.square.height}});
const coverOutputs = {
  master: pngSize(await fs.readFile(coverMasterPath)),
  wide: pngSize(await fs.readFile(path.join(out, WECHAT_COVER_SPECS.wide.file))),
  square: pngSize(await fs.readFile(path.join(out, WECHAT_COVER_SPECS.square.file))),
};
const coverOutputAnalysis = analyzeWechatCoverOutputs(coverOutputs);
if (!coverOutputAnalysis.passed) throw new Error(`公众号封面输出尺寸未通过: ${JSON.stringify(coverOutputAnalysis.checks.filter((check) => !check.passed))}`);
await coverContext.close();

const context = await browser.newContext({viewport: {width: 390, height: 844}, deviceScaleFactor: 2});
const page = await context.newPage();
attachErrors(page);
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
const coverReport = {
  passed: coverAnalysis.passed && coverOutputAnalysis.passed && coverMetrics.source.naturalWidth >= 1000 && coverMetrics.source.naturalHeight >= 1000 && coverMetrics.titleOverflow <= 1 && coverMetrics.panelOverflow <= 1,
  source: {path: coverAnalysis.normalized.src, sha256: sha256(await fs.readFile(coverSource)), width: coverMetrics.source.naturalWidth, height: coverMetrics.source.naturalHeight},
  titleLines: cover.titleLines,
  outputs: coverOutputs,
  outputHashes: {
    wide: sha256(await fs.readFile(path.join(out, WECHAT_COVER_SPECS.wide.file))),
    square: sha256(await fs.readFile(path.join(out, WECHAT_COVER_SPECS.square.file))),
  },
  checks: [...coverAnalysis.checks, ...coverOutputAnalysis.checks],
  manualChecksPending: ["主视觉确为无文字 AI 位图、品牌自有图或获授权素材", "公众号后台头条和分享裁切预览"],
};
const report = {generatedAt: new Date().toISOString(), characterCount, characterRange, fixedBrandCopyExcludedFromCharacterCount: true, brandAssetHashes: WECHAT_BRAND_ASSETS, cover: coverReport, screenshot, metrics, errors, passed: coverReport.passed && Object.values(errors).every((items) => items.length === 0)};
report.provenance = await fingerprintGraphic("wechat", wechat, out);
await writeJson(path.join(out, "check-report.json"), report);
if (!report.passed) throw new Error(`公众号检查失败: ${JSON.stringify(errors)}`);
console.log(JSON.stringify({status: "wechat-candidate-ready", output: out, characterCount, screenshot}, null, 2));
