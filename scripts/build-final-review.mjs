import fs from "node:fs/promises";
import path from "node:path";
import {dataUrl, ensureDir, exists, findPlaywright, parseArgs, platformPaths, writeJson} from "./lib.mjs";
import {pathToFileURL} from "node:url";

const args = parseArgs();
if (!args.unit) { console.error("用法: node build-final-review.mjs --unit <内容单元路径> [--source candidate|final]"); process.exit(2); }
const paths = platformPaths(args.unit);
const sourceMode = args.source === "final" ? "final" : "candidate";
const xhsSource = sourceMode === "final" ? paths.xhsFinal : path.join(paths.xhs, "output");
const wechatSource = sourceMode === "final" ? paths.wechatFinal : path.join(paths.wechat, "output");
if (!await exists(xhsSource) || !await exists(wechatSource)) throw new Error("小红书或公众号来源目录不存在");
const xhsPages = (await fs.readdir(xhsSource)).filter((name) => /^page-\d{2}\.png$/u.test(name)).sort();
if (!xhsPages.length) throw new Error("未找到小红书逐页 PNG");
const encodedPages = [];
for (const name of xhsPages) encodedPages.push({name, src: await dataUrl(path.join(xhsSource, name))});
const caption = await fs.readFile(path.join(xhsSource, "caption.md"), "utf8");
const wechatHtml = await fs.readFile(path.join(wechatSource, "article.html"), "utf8");
const wechatText = await fs.readFile(path.join(wechatSource, "article.md"), "utf8");
const payload = Buffer.from(JSON.stringify({pages: encodedPages, caption, wechatHtml, wechatText}), "utf8").toString("base64");
const title = path.basename(paths.unit);
const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}｜SW 最终验收</title><style>
:root{font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;color:#2b2929;background:#eee9e5}*{box-sizing:border-box}body{margin:0}header{position:sticky;top:0;z-index:10;display:flex;gap:18px;align-items:center;padding:16px 24px;background:rgba(252,250,248,.96);border-bottom:3px solid #9e2f3f}header h1{margin:0;font-size:22px}header span{color:#756d6d;font-size:14px}.layout{display:grid;grid-template-columns:minmax(340px,1fr) minmax(390px,1fr);gap:22px;padding:22px;align-items:start}.panel{background:#fcfaf8;border:1px solid #d8c4c7;border-radius:14px;box-shadow:0 12px 34px rgba(50,35,35,.08);overflow:hidden}.bar{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid #e5d9da}.bar h2{margin:0 auto 0 0;font-size:18px}.bar button{border:0;border-radius:8px;background:#9e2f3f;color:#fff;padding:9px 12px;font-weight:650;cursor:pointer}.bar button.secondary{background:#2b2929}.xhs-stage{display:flex;justify-content:center;padding:18px;background:#e9e4e0}.xhs-stage img{display:block;width:min(100%,540px);height:auto;box-shadow:0 9px 28px rgba(0,0,0,.12)}.thumbs{display:flex;gap:8px;overflow:auto;padding:12px}.thumbs button{padding:0;border:3px solid transparent;background:none;cursor:pointer}.thumbs button.active{border-color:#9e2f3f}.thumbs img{display:block;width:76px;height:102px;object-fit:cover}.wechat-wrap{height:calc(100vh - 138px);min-height:700px;background:#e9e4e0}.wechat-wrap iframe{width:100%;height:100%;border:0;background:#fff}.status{position:fixed;right:18px;bottom:18px;padding:11px 15px;border-radius:10px;background:#2b2929;color:#fff;opacity:0;transform:translateY(10px);transition:.2s}.status.show{opacity:1;transform:none}@media(max-width:900px){.layout{grid-template-columns:1fr}.wechat-wrap{height:760px}header{position:static;flex-wrap:wrap}}
</style></head><body><header><h1>SW 跨平台内容验收</h1><span>${title} · ${sourceMode === "final" ? "当前成品" : "生成候选，待人工确认"}</span></header><main class="layout"><section class="panel"><div class="bar"><h2>小红书</h2><button id="prev" class="secondary">上一页</button><button id="next" class="secondary">下一页</button><button id="copy-xhs">复制正文</button></div><div class="xhs-stage"><img id="xhs-main" alt="小红书当前页"></div><div class="thumbs" id="thumbs"></div></section><section class="panel"><div class="bar"><h2>公众号</h2><button id="copy-wechat-text" class="secondary">复制纯文本</button><button id="copy-wechat">复制排版</button></div><div class="wechat-wrap"><iframe id="wechat-frame" title="公众号完整排版"></iframe></div></section></main><div class="status" id="status"></div><script>
const data=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob('${payload}'),c=>c.charCodeAt(0))));let index=0;const main=document.querySelector('#xhs-main'),thumbs=document.querySelector('#thumbs'),status=document.querySelector('#status');
function flash(text){status.textContent=text;status.classList.add('show');setTimeout(()=>status.classList.remove('show'),1600)}
function render(){main.src=data.pages[index].src;main.alt=data.pages[index].name;[...thumbs.children].forEach((b,i)=>b.classList.toggle('active',i===index))}
data.pages.forEach((item,i)=>{const b=document.createElement('button');b.innerHTML='<img alt="'+item.name+'" src="'+item.src+'">';b.onclick=()=>{index=i;render()};thumbs.appendChild(b)});render();
document.querySelector('#prev').onclick=()=>{index=(index-1+data.pages.length)%data.pages.length;render()};document.querySelector('#next').onclick=()=>{index=(index+1)%data.pages.length;render()};document.addEventListener('keydown',e=>{if(e.key==='ArrowLeft')document.querySelector('#prev').click();if(e.key==='ArrowRight')document.querySelector('#next').click()});
async function copyPlain(text){try{await navigator.clipboard.writeText(text)}catch{const t=document.createElement('textarea');t.value=text;document.body.appendChild(t);t.select();document.execCommand('copy');t.remove()}}
async function copyRich(html,text){if(navigator.clipboard&&window.ClipboardItem){try{await navigator.clipboard.write([new ClipboardItem({'text/html':new Blob([html],{type:'text/html'}),'text/plain':new Blob([text],{type:'text/plain'})})]);return}catch{}}const box=document.createElement('div');box.contentEditable='true';box.style.position='fixed';box.style.left='-9999px';box.innerHTML=html;document.body.appendChild(box);const range=document.createRange();range.selectNodeContents(box);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);document.execCommand('copy');selection.removeAllRanges();box.remove()}
document.querySelector('#copy-xhs').onclick=async()=>{await copyPlain(data.caption);flash('已复制小红书正文')};document.querySelector('#copy-wechat-text').onclick=async()=>{await copyPlain(data.wechatText);flash('已复制公众号纯文本')};document.querySelector('#copy-wechat').onclick=async()=>{await copyRich(data.wechatHtml,data.wechatText);flash('已复制公众号排版')};document.querySelector('#wechat-frame').srcdoc=data.wechatHtml;
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
await page.waitForFunction(() => document.querySelector("#xhs-main")?.naturalWidth > 0 && document.querySelector("#wechat-frame")?.contentDocument?.body?.innerText.length > 0);
const before = await page.locator("#xhs-main").getAttribute("alt");
await page.click("#next");
const after = await page.locator("#xhs-main").getAttribute("alt");
await page.click("#copy-xhs");
await page.click("#copy-wechat-text");
await page.click("#copy-wechat");
const metrics = await page.evaluate(() => ({
  thumbs: document.querySelectorAll("#thumbs button").length,
  xhsNatural: {width: document.querySelector("#xhs-main").naturalWidth, height: document.querySelector("#xhs-main").naturalHeight},
  wechatTextLength: document.querySelector("#wechat-frame").contentDocument.body.innerText.length,
  overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
}));
await page.screenshot({path: path.join(paths.review, "review-page.png"), fullPage: true});
await browser.close();
const passed = before !== after && metrics.thumbs === xhsPages.length && metrics.xhsNatural.width === 1080 && metrics.xhsNatural.height === 1440 && metrics.wechatTextLength > 0 && metrics.overflowX <= 1 && Object.values(errors).every((items) => items.length === 0);
await writeJson(path.join(paths.review, "review-report.json"), {generatedAt: new Date().toISOString(), sourceMode, xhsPages: xhsPages.length, xhsCaptionCharacters: [...caption].length, wechatHtmlCharacters: [...wechatHtml].length, selfContained: true, carouselChanged: before !== after, metrics, errors, passed});
if (!passed) throw new Error(`最终验收页检查失败: ${JSON.stringify({before, after, metrics, errors})}`);
console.log(JSON.stringify({status: "review-ready", index: path.join(paths.review, "index.html"), sourceMode, xhsPages: xhsPages.length}, null, 2));
