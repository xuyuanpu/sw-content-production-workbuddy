import fs from "node:fs/promises";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {WECHAT_CHARACTER_RANGE, compactCount, dataUrl, ensureDir, exists, findPlaywright, parseArgs, platformPaths, pngSize, writeJson} from "./lib.mjs";
import {analyzeVoiceover} from "./voiceover-lib.mjs";

const args = parseArgs();
if (!args.unit) {
  console.error("用法: node build-final-review.mjs --unit <内容单元路径> [--source candidate|final]");
  process.exit(2);
}

const paths = platformPaths(args.unit);
const sourceMode = args.source === "final" ? "final" : "candidate";
const xhsSource = sourceMode === "final" ? paths.xhsFinal : path.join(paths.xhs, "output");
const wechatSource = sourceMode === "final" ? paths.wechatFinal : path.join(paths.wechat, "output");

async function readText(file) {
  if (!await exists(file)) return "";
  return fs.readFile(file, "utf8");
}

async function inspectXhs() {
  const reasons = [];
  const pages = [];
  if (!await exists(xhsSource)) reasons.push("小红书来源目录不存在");
  const names = await exists(xhsSource)
    ? (await fs.readdir(xhsSource)).filter((name) => /^page-\d{2}\.png$/u.test(name)).sort()
    : [];
  if (names.length < 3 || names.length > 10) reasons.push(`逐页图数量应为 3-10，当前为 ${names.length}`);
  for (const name of names) {
    const file = path.join(xhsSource, name);
    try {
      const buffer = await fs.readFile(file);
      const size = pngSize(buffer);
      if (size.width !== 1080 || size.height !== 1440) reasons.push(`${name} 尺寸为 ${size.width}×${size.height}`);
      pages.push({name, src: await dataUrl(file), size});
    } catch (error) {
      reasons.push(`${name} 无法读取为 PNG：${error.message}`);
    }
  }
  const caption = await readText(path.join(xhsSource, "caption.md"));
  if (!caption.trim()) reasons.push("小红书正文为空或不存在");
  return {ready: reasons.length === 0, reasons, pages, caption};
}

async function inspectWechat() {
  const reasons = [];
  if (!await exists(wechatSource)) reasons.push("公众号来源目录不存在");
  const html = await readText(path.join(wechatSource, "article.html"));
  const text = await readText(path.join(wechatSource, "article.md"));
  if (!html.trim()) reasons.push("公众号 HTML 为空或不存在");
  if (!text.trim()) reasons.push("公众号正文为空或不存在");
  let characterCount = 0;
  if (text.trim()) {
    const bodyMarkdown = text
      .replace(/<!-- FIXED-BRAND-INTRO-START -->[\s\S]*?<!-- FIXED-BRAND-INTRO-END -->/gu, "")
      .replace(/<!-- FIXED-BRAND-LEGAL-START -->[\s\S]*?<!-- FIXED-BRAND-LEGAL-END -->/gu, "")
      .replace(/^#\s+[^\n]*\n?/u, "")
      .replace(/^!\[[^\]]*\]\([^\n]*\)\s*$/gmu, "")
      .replace(/^#{2,6}\s+/gmu, "")
      .replace(/^>\s?/gmu, "")
      .replace(/[*_`~]/gu, "");
    characterCount = compactCount(bodyMarkdown);
    if (characterCount < WECHAT_CHARACTER_RANGE.min || characterCount > WECHAT_CHARACTER_RANGE.max) reasons.push(`公众号读者可见正文应为 ${WECHAT_CHARACTER_RANGE.min}～${WECHAT_CHARACTER_RANGE.max} 字，当前为 ${characterCount} 字`);
  }
  if (sourceMode === "candidate") {
    const checkPath = path.join(wechatSource, "check-report.json");
    if (!await exists(checkPath)) reasons.push("公众号检查报告不存在");
    else {
      const check = JSON.parse(await fs.readFile(checkPath, "utf8"));
      if (check.passed !== true) reasons.push("公众号浏览器检查未通过");
      if (check.characterCount !== characterCount) reasons.push(`公众号正文与检查报告计数不一致：正文 ${characterCount}，报告 ${check.characterCount}`);
    }
  }
  return {ready: reasons.length === 0, reasons, html, text, characterCount};
}

const xhs = await inspectXhs();
const wechat = await inspectWechat();
async function inspectVoiceover() {
  const reasons = [];
  const draftPath = path.join(paths.video, "voiceover-draft.md");
  const ttsPath = path.join(paths.video, "tts-input.txt");
  const reportPath = path.join(paths.video, "voiceover-report.json");
  const draft = await readText(draftPath);
  const ttsInput = await readText(ttsPath);
  if (!draft.trim()) reasons.push("口播内容稿为空或不存在");
  if (!ttsInput.trim()) reasons.push("MiniMax 机器稿为空或不存在");
  let analysis = null;
  if (draft.trim() && ttsInput.trim()) {
    analysis = analyzeVoiceover(draft, ttsInput);
    if (!analysis.passed) reasons.push(...analysis.checks.filter((check) => !check.passed).map((check) => check.name));
  }
  if (!await exists(reportPath)) reasons.push("voiceover-report.json 不存在");
  else if (analysis) {
    const stored = JSON.parse(await fs.readFile(reportPath, "utf8"));
    if (stored.passed !== true || stored.fingerprints?.draftBody !== analysis.fingerprints.draftBody || stored.fingerprints?.ttsInput !== analysis.fingerprints.ttsInput) reasons.push("口播检查报告未通过或已过期");
  }
  return {ready: reasons.length === 0, reasons, ttsInput: ttsInput.trim(), analysis};
}
const voiceover = await inspectVoiceover();
const videoFile = sourceMode === "final"
  ? path.join(paths.videoFinal, "video-candidate.mp4")
  : path.join(paths.video, "output", "video-candidate.mp4");
let video = null;
if (await exists(videoFile)) {
  const baseDir = path.dirname(videoFile);
  const reportFile = path.join(baseDir, "video-report.json");
  const report = await exists(reportFile) ? JSON.parse(await fs.readFile(reportFile, "utf8")) : null;
  const srtCandidates = [
    path.join(baseDir, "subtitles.srt"),
    sourceMode === "final" ? path.join(paths.videoFinal, "subtitles.srt") : path.join(paths.video, "subtitles.srt"),
  ];
  let subtitles = "";
  for (const candidate of srtCandidates) {
    if (await exists(candidate)) {
      subtitles = await fs.readFile(candidate, "utf8");
      break;
    }
  }
  video = {
    src: path.relative(paths.review, videoFile).split(path.sep).join("/"),
    cover: await exists(path.join(baseDir, "video-cover.png")) ? await dataUrl(path.join(baseDir, "video-cover.png")) : null,
    report,
    subtitles,
    sizeBytes: (await fs.stat(videoFile)).size,
  };
}

const payload = Buffer.from(JSON.stringify({xhs, wechat, voiceover, video}), "utf8").toString("base64");
const title = path.basename(paths.unit).replace(/[&<>"']/gu, (character) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"})[character]);
const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}｜SW 最终验收</title><style>
:root{font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;color:#2b2929;background:#eee9e5}*{box-sizing:border-box}body{margin:0}header{position:sticky;top:0;z-index:10;display:flex;gap:18px;align-items:center;padding:16px 24px;background:rgba(252,250,248,.96);border-bottom:3px solid #9e2f3f}header h1{margin:0;font-size:22px}header span{color:#756d6d;font-size:14px}.layout{display:grid;grid-template-columns:minmax(300px,1fr) minmax(300px,1fr) minmax(360px,1fr);gap:22px;padding:22px;align-items:start}.panel{background:#fcfaf8;border:1px solid #d8c4c7;border-radius:14px;box-shadow:0 12px 34px rgba(50,35,35,.08);overflow:hidden}.bar{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid #e5d9da}.bar h2{margin:0 auto 0 0;font-size:18px}.bar button{border:0;border-radius:8px;background:#9e2f3f;color:#fff;padding:9px 12px;font-weight:650;cursor:pointer}.bar button.secondary{background:#2b2929}.bar button:disabled{background:#b9b1b1;color:#f4f1f1;cursor:not-allowed;opacity:.75}.empty-state{margin:18px;padding:42px 22px;border:2px dashed #d8c4c7;border-radius:12px;background:#fffdfb;text-align:center;color:#756d6d;line-height:1.7}.empty-state strong{display:block;color:#9e2f3f;margin-bottom:8px}.xhs-stage{display:flex;justify-content:center;padding:18px;background:#e9e4e0}.xhs-stage img{display:block;width:min(100%,540px);height:auto;box-shadow:0 9px 28px rgba(0,0,0,.12)}.thumbs{display:flex;gap:8px;overflow:auto;padding:12px}.thumbs button{padding:0;border:3px solid transparent;background:none;cursor:pointer}.thumbs button.active{border-color:#9e2f3f}.thumbs img{display:block;width:76px;height:102px;object-fit:cover}.caption-box,.voice-box,.sub-box{max-height:300px;overflow:auto;border-top:1px solid #e5d9da;padding:16px;background:#fffdfb}.caption-box h3,.voice-box h3,.sub-box h3{margin:0 0 10px;font-size:15px;color:#9e2f3f}.caption-box pre,.voice-box pre,.sub-box pre{margin:0;white-space:pre-wrap;word-break:break-word;font-family:inherit;font-size:14px;line-height:1.7}.wechat-wrap{height:calc(100vh - 138px);min-height:700px;background:#e9e4e0}.wechat-wrap iframe{width:100%;height:100%;border:0;background:#fff}.badge{padding:4px 10px;border-radius:999px;background:#f6e8e8;color:#9e2f3f;font-size:12px;font-weight:650}.badge.ok{background:#e8f2e8;color:#3f7a3f}.video-stage{display:flex;justify-content:center;padding:12px;background:#2b2929}.video-stage video{display:none;width:min(100%,300px);height:auto;background:#000;border-radius:10px}.video-empty{color:#c9bdb8;font-size:15px;padding:60px 0;text-align:center}.video-meta{display:flex;flex-wrap:wrap;gap:7px;padding:12px 16px;border-bottom:1px solid #e5d9da}.chip{background:#f6e8e8;color:#9e2f3f;border-radius:999px;padding:3px 10px;font-size:12px}.status{position:fixed;right:18px;bottom:18px;padding:11px 15px;border-radius:10px;background:#2b2929;color:#fff;opacity:0;transform:translateY(10px);transition:.2s}.status.show{opacity:1;transform:none}[hidden]{display:none!important}@media(max-width:900px){.layout{grid-template-columns:1fr}.wechat-wrap{height:760px}header{position:static;flex-wrap:wrap}}
</style></head><body><header><h1>SW 跨平台内容验收</h1><span>${title} · ${sourceMode === "final" ? "当前成品" : "生成候选，待人工确认"}</span></header><main class="layout">
<section class="panel"><div class="bar"><h2>小红书</h2><button id="prev" class="secondary">上一页</button><button id="next" class="secondary">下一页</button><button id="copy-xhs">复制正文</button></div><div id="xhs-empty" class="empty-state" hidden><strong>小红书尚未形成有效候选</strong><span id="xhs-reason"></span></div><div class="xhs-stage" id="xhs-stage"><img id="xhs-main" alt="小红书当前页"></div><div class="thumbs" id="thumbs"></div><div class="caption-box" id="caption-box"><h3>小红书正文</h3><pre id="caption-text"></pre></div></section>
<section class="panel"><div class="bar"><h2>公众号</h2><button id="copy-wechat-text" class="secondary">复制纯文本</button><button id="copy-wechat">复制排版</button></div><div id="wechat-empty" class="empty-state" hidden><strong>公众号尚未形成有效候选</strong><span id="wechat-reason"></span></div><div class="wechat-wrap" id="wechat-wrap"><iframe id="wechat-frame" title="公众号完整排版"></iframe></div></section>
<section class="panel"><div class="bar"><h2>短视频</h2><span class="badge" id="voiceover-badge">—</span><button id="copy-voiceover">复制口播稿</button></div><div id="voiceover-empty" class="empty-state" hidden><strong>口播机器稿尚未通过</strong><span id="voiceover-reason"></span></div><div class="voice-box" id="voiceover-box"><h3>MiniMax 唯一机器稿</h3><pre id="voiceover-text"></pre></div><div class="video-stage"><video id="video-player" controls preload="metadata"></video><img id="video-cover-check" alt="" hidden><div id="video-empty" class="video-empty">收到确认音频后再生成视频</div></div><div class="video-meta" id="video-meta"></div><div class="sub-box"><h3>字幕</h3><pre id="subtitle-text"></pre></div></section>
</main><div class="status" id="status"></div><script>
const data=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob('${payload}'),c=>c.charCodeAt(0))));let index=0;const main=document.querySelector('#xhs-main'),thumbs=document.querySelector('#thumbs'),status=document.querySelector('#status');
function flash(text){status.textContent=text;status.classList.add('show');setTimeout(()=>status.classList.remove('show'),1600)}
function disable(ids,value){ids.forEach(id=>{document.querySelector(id).disabled=value})}
function renderXhs(){if(!data.xhs.ready)return;main.src=data.xhs.pages[index].src;main.alt=data.xhs.pages[index].name;[...thumbs.children].forEach((button,i)=>button.classList.toggle('active',i===index))}
if(data.xhs.ready){data.xhs.pages.forEach((item,i)=>{const button=document.createElement('button');const image=document.createElement('img');image.alt=item.name;image.src=item.src;button.appendChild(image);button.onclick=()=>{index=i;renderXhs()};thumbs.appendChild(button)});document.querySelector('#caption-text').textContent=data.xhs.caption;renderXhs()}else{document.querySelector('#xhs-empty').hidden=false;document.querySelector('#xhs-reason').textContent=data.xhs.reasons.join('；');document.querySelector('#xhs-stage').hidden=true;thumbs.hidden=true;document.querySelector('#caption-box').hidden=true;disable(['#prev','#next','#copy-xhs'],true)}
document.querySelector('#prev').onclick=()=>{if(!data.xhs.ready)return;index=(index-1+data.xhs.pages.length)%data.xhs.pages.length;renderXhs()};document.querySelector('#next').onclick=()=>{if(!data.xhs.ready)return;index=(index+1)%data.xhs.pages.length;renderXhs()};document.addEventListener('keydown',event=>{if(event.key==='ArrowLeft')document.querySelector('#prev').click();if(event.key==='ArrowRight')document.querySelector('#next').click()});
if(data.wechat.ready){document.querySelector('#wechat-frame').srcdoc=data.wechat.html}else{document.querySelector('#wechat-empty').hidden=false;document.querySelector('#wechat-reason').textContent=data.wechat.reasons.join('；');document.querySelector('#wechat-wrap').hidden=true;disable(['#copy-wechat-text','#copy-wechat'],true)}
async function copyPlain(text){try{await navigator.clipboard.writeText(text)}catch{const area=document.createElement('textarea');area.value=text;document.body.appendChild(area);area.select();document.execCommand('copy');area.remove()}}
async function copyRich(html,text){if(navigator.clipboard&&window.ClipboardItem){try{await navigator.clipboard.write([new ClipboardItem({'text/html':new Blob([html],{type:'text/html'}),'text/plain':new Blob([text],{type:'text/plain'})})]);return}catch{}}const box=document.createElement('div');box.contentEditable='true';box.style.position='fixed';box.style.left='-9999px';box.innerHTML=html;document.body.appendChild(box);const range=document.createRange();range.selectNodeContents(box);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);document.execCommand('copy');selection.removeAllRanges();box.remove()}
document.querySelector('#copy-xhs').onclick=async()=>{if(!data.xhs.ready)return;await copyPlain(data.xhs.caption);flash('已复制小红书正文')};document.querySelector('#copy-wechat-text').onclick=async()=>{if(!data.wechat.ready)return;await copyPlain(data.wechat.text);flash('已复制公众号纯文本')};document.querySelector('#copy-wechat').onclick=async()=>{if(!data.wechat.ready)return;await copyRich(data.wechat.html,data.wechat.text);flash('已复制公众号排版')};
if(data.voiceover.ready){document.querySelector('#voiceover-text').textContent=data.voiceover.ttsInput;document.querySelector('#voiceover-badge').textContent='语气检查通过';document.querySelector('#voiceover-badge').classList.add('ok')}else{document.querySelector('#voiceover-empty').hidden=false;document.querySelector('#voiceover-reason').textContent=data.voiceover.reasons.join('；');document.querySelector('#voiceover-box').hidden=true;disable(['#copy-voiceover'],true);document.querySelector('#voiceover-badge').textContent='未通过'}document.querySelector('#copy-voiceover').onclick=async()=>{if(!data.voiceover.ready)return;await copyPlain(data.voiceover.ttsInput);flash('已复制 MiniMax 口播稿')};
(function(){const player=document.querySelector('#video-player'),coverCheck=document.querySelector('#video-cover-check'),empty=document.querySelector('#video-empty'),badge=document.querySelector('#video-badge'),meta=document.querySelector('#video-meta'),subtitle=document.querySelector('#subtitle-text');if(!data.video){subtitle.textContent='（视频尚未生成，无字幕数据）';return}player.style.display='block';empty.hidden=true;player.src=data.video.src;if(data.video.cover){player.poster=data.video.cover;coverCheck.src=data.video.cover}const report=data.video.report;const temporalPassed=report?.checks?.temporal?.passed===true;const coverPassed=report?.checks?.cover?.passed===true&&Boolean(data.video.cover);const ready=temporalPassed&&coverPassed;badge.textContent=ready?'候选':'未通过';if(ready)badge.classList.add('ok');const chips=[];if(report?.probe?.format?.duration)chips.push((Math.round(Number(report.probe.format.duration)*10)/10)+'s');chips.push(coverPassed?'首帧封面通过':'首帧封面缺失或失败');chips.push(temporalPassed?'闪烁检查通过':'闪烁检查缺失或失败');meta.innerHTML=chips.map(value=>'<span class="chip">'+value+'</span>').join('');subtitle.textContent=data.video.subtitles||'（无字幕文件）'})();
document.body.dataset.xhsReady=data.xhs.ready?'1':'0';document.body.dataset.wechatReady=data.wechat.ready?'1':'0';document.body.dataset.voiceoverReady=data.voiceover.ready?'1':'0';document.body.dataset.hasVideo=data.video?'1':'0';document.body.dataset.initialized='1';
</script></body></html>`;

await ensureDir(paths.review);
await fs.writeFile(path.join(paths.review, "index.html"), html);
const {chromium} = await findPlaywright();
const browser = await chromium.launch({headless: true});
const page = await browser.newPage({viewport: {width: 1440, height: 1000}, deviceScaleFactor: 1});
const errors = {console: [], page: [], remoteResources: []};
page.on("console", (message) => { if (message.type() === "error") errors.console.push(message.text()); });
page.on("pageerror", (error) => errors.page.push(error.message));
page.on("request", (request) => { if (/^https?:/iu.test(request.url())) errors.remoteResources.push(request.url()); });
await page.goto(pathToFileURL(path.join(paths.review, "index.html")).href, {waitUntil: "load"});
await page.waitForFunction(() => document.body.dataset.initialized === "1");
if (xhs.ready) await page.waitForFunction(() => document.querySelector("#xhs-main")?.naturalWidth > 0 && [...document.querySelectorAll("#thumbs img")].every((image) => image.complete && image.naturalWidth > 0));
if (wechat.ready) await page.waitForFunction(() => document.querySelector("#wechat-frame")?.contentDocument?.body?.innerText.length > 0);
if (video) await page.waitForFunction(() => document.querySelector("#video-player")?.videoWidth > 0 && document.querySelector("#video-player")?.duration > 0 && (!data.video.cover || document.querySelector("#video-cover-check")?.naturalWidth > 0));
let before = null;
let after = null;
if (xhs.ready) {
  before = await page.locator("#xhs-main").getAttribute("alt");
  await page.click("#next");
  after = await page.locator("#xhs-main").getAttribute("alt");
  await page.click("#copy-xhs");
}
if (wechat.ready) {
  await page.click("#copy-wechat-text");
  await page.click("#copy-wechat");
}
if (voiceover.ready) await page.click("#copy-voiceover");
const metrics = await page.evaluate(() => ({
  xhs: {ready: document.body.dataset.xhsReady === "1", thumbs: document.querySelectorAll("#thumbs button").length, natural: {width: document.querySelector("#xhs-main").naturalWidth, height: document.querySelector("#xhs-main").naturalHeight}, copyDisabled: document.querySelector("#copy-xhs").disabled, emptyVisible: !document.querySelector("#xhs-empty").hidden},
  wechat: {ready: document.body.dataset.wechatReady === "1", textLength: document.querySelector("#wechat-frame").contentDocument?.body?.innerText.length || 0, copyTextDisabled: document.querySelector("#copy-wechat-text").disabled, copyRichDisabled: document.querySelector("#copy-wechat").disabled, emptyVisible: !document.querySelector("#wechat-empty").hidden},
  voiceover: {ready: document.body.dataset.voiceoverReady === "1", textLength: document.querySelector("#voiceover-text").innerText.length, copyDisabled: document.querySelector("#copy-voiceover").disabled, emptyVisible: !document.querySelector("#voiceover-empty").hidden},
  video: {src: document.querySelector("#video-player").getAttribute("src") || "", width: document.querySelector("#video-player").videoWidth, duration: Number.isFinite(document.querySelector("#video-player").duration) ? document.querySelector("#video-player").duration : 0, cover: {width: document.querySelector("#video-cover-check").naturalWidth, height: document.querySelector("#video-cover-check").naturalHeight}, subtitleLength: document.querySelector("#subtitle-text").innerText.length},
  overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
}));
await page.screenshot({path: path.join(paths.review, "review-page.png"), fullPage: true});
await browser.close();

const xhsBehavior = xhs.ready
  ? before !== after && metrics.xhs.thumbs === xhs.pages.length && metrics.xhs.natural.width === 1080 && metrics.xhs.natural.height === 1440 && !metrics.xhs.copyDisabled && !metrics.xhs.emptyVisible
  : metrics.xhs.copyDisabled && metrics.xhs.emptyVisible && metrics.xhs.thumbs === 0 && metrics.xhs.natural.width === 0;
const wechatBehavior = wechat.ready
  ? metrics.wechat.textLength > 0 && !metrics.wechat.copyTextDisabled && !metrics.wechat.copyRichDisabled && !metrics.wechat.emptyVisible
  : metrics.wechat.copyTextDisabled && metrics.wechat.copyRichDisabled && metrics.wechat.emptyVisible && metrics.wechat.textLength === 0;
const voiceoverBehavior = voiceover.ready
  ? metrics.voiceover.textLength > 0 && !metrics.voiceover.copyDisabled && !metrics.voiceover.emptyVisible
  : metrics.voiceover.copyDisabled && metrics.voiceover.emptyVisible && metrics.voiceover.textLength === 0;
const videoBehavior = !video || (video.report?.checks?.temporal?.passed === true && video.report?.checks?.cover?.passed === true && metrics.video.width > 0 && metrics.video.duration > 0 && metrics.video.cover.width === 1080 && metrics.video.cover.height === 1920);
const passed = xhs.ready && wechat.ready && voiceover.ready && xhsBehavior && wechatBehavior && voiceoverBehavior && videoBehavior && metrics.overflowX <= 1 && Object.values(errors).every((items) => items.length === 0);
const report = {generatedAt: new Date().toISOString(), sourceMode, components: {xhs: {ready: xhs.ready, reasons: xhs.reasons, pages: xhs.pages.length, behaviorPassed: xhsBehavior}, wechat: {ready: wechat.ready, reasons: wechat.reasons, behaviorPassed: wechatBehavior}, voiceover: {ready: voiceover.ready, reasons: voiceover.reasons, behaviorPassed: voiceoverBehavior, metrics: voiceover.analysis?.metrics || null}, video: video ? {ready: videoBehavior, src: video.src, sizeBytes: video.sizeBytes, coverAssetPresent: Boolean(video.cover), coverPassed: video.report?.checks?.cover?.passed === true && Boolean(video.cover), temporalPassed: video.report?.checks?.temporal?.passed ?? null, behaviorPassed: videoBehavior} : {ready: false, behaviorPassed: true}}, carouselChanged: xhs.ready ? before !== after : false, metrics, errors, passed};
await writeJson(path.join(paths.review, "review-report.json"), report);
if (!passed) throw new Error(`最终验收页未达到可交付状态，已生成缺失提示页并禁用无效复制按钮: ${JSON.stringify(report.components)}`);
console.log(JSON.stringify({status: "review-ready", index: path.join(paths.review, "index.html"), sourceMode, xhsPages: xhs.pages.length, video: video ? "candidate" : "none"}, null, 2));
