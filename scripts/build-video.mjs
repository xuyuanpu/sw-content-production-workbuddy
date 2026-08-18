import fs from "node:fs/promises";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {compactCount, ensureDir, exists, findPlaywright, parseArgs, platformPaths, pngSize, readJson, writeJson, sha256, forbiddenHits} from "./lib.mjs";
import {inspectVideo} from "./video-qc.mjs";

const run = promisify(execFile);
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/gu, (character) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"})[character]);
const args = parseArgs();
if (!args.unit) { console.error("用法: node build-video.mjs --unit <内容单元路径>"); process.exit(2); }
const {video} = platformPaths(args.unit);

// ---- 读取 scenes.json 与确认稿 ----
const scenesPath = path.join(video, "scenes.json");
if (!await exists(scenesPath)) throw new Error("缺少 scenes.json，先完成转写对齐");
const data = await readJson(scenesPath);
const {width, height, fps, audio, brand} = data.video;
const audioPath = path.join(video, audio);
if (!await exists(audioPath)) throw new Error(`缺少音频: ${audioPath}`);
const audioHash = sha256(await fs.readFile(audioPath));

// ---- 构建帧序列（含无字幕间隔帧，总时长覆盖整片）----
const segments = []; // {start, end, scene, subtitle, gap}
const scenes = data.scenes;
const subs = data.subtitles;
if (!Array.isArray(scenes) || !scenes.length) throw new Error("scenes.json 至少需要一个镜头");
if (!Array.isArray(subs) || !subs.length) throw new Error("scenes.json 至少需要一条字幕");
const minimumSceneDuration = Number(data.video.minimumSceneDuration || 1.8);
const minimumSubtitleDuration = Number(data.video.minimumSubtitleDuration || 1.2);
const minimumCoverDuration = Number(data.video.minimumCoverDuration || 1.8);
const firstScene = scenes[0];
const coverTitleLines = (Array.isArray(firstScene.titleLines) ? firstScene.titleLines : [firstScene.overlayTitle])
  .map((line) => String(line || "").trim())
  .filter(Boolean);
const coverTitle = coverTitleLines.join("");
const coverAssetPath = path.join(video, firstScene.asset || "assets/cover.png");
if (firstScene.start !== 0 || firstScene.visual !== "cover") throw new Error("第一镜必须从 0 秒开始且 visual=cover，确保视频第一帧就是正式封面");
if (firstScene.end - firstScene.start < minimumCoverDuration) throw new Error(`封面镜头不得少于 ${minimumCoverDuration}s`);
if (!await exists(coverAssetPath)) throw new Error(`封面镜头缺少高分辨率位图素材: ${coverAssetPath}`);
if (coverTitleLines.length < 1 || coverTitleLines.length > 3 || compactCount(coverTitle) < 4 || compactCount(coverTitle) > 28 || coverTitleLines.some((line) => compactCount(line) > 14)) {
  throw new Error("封面标题必须按语义拆成 1–3 行，每行不超过 14 字，总长 4–28 字；优先使用 titleLines 明确断行");
}
const sceneDurationViolations = scenes.filter((scene) => scene.end - scene.start < minimumSceneDuration).map((scene) => ({id: scene.id, duration: scene.end - scene.start}));
const subtitleDurationViolations = subs.filter((subtitle) => subtitle.end - subtitle.start < minimumSubtitleDuration).map((subtitle) => ({text: subtitle.text, duration: subtitle.end - subtitle.start}));
const sceneOrderViolations = scenes.filter((scene, index) => scene.end <= scene.start || (index > 0 && scene.start < scenes[index - 1].end)).map((scene) => scene.id);
if (sceneDurationViolations.length) throw new Error(`镜头过短，常规镜头不得少于 ${minimumSceneDuration}s: ${JSON.stringify(sceneDurationViolations)}`);
if (subtitleDurationViolations.length) throw new Error(`字幕停留过短，不得少于 ${minimumSubtitleDuration}s: ${JSON.stringify(subtitleDurationViolations)}`);
if (sceneOrderViolations.length) throw new Error(`镜头时间轴重叠或倒序: ${sceneOrderViolations.join(", ")}`);
const sceneAt = (time) => scenes.find((scene) => time >= scene.start && time < scene.end)
  || [...scenes].reverse().find((scene) => time >= scene.end)
  || scenes[0];
let cursor = 0;
for (const sub of subs) {
  if (sub.start > cursor) segments.push({start: cursor, end: sub.start, scene: sceneAt(cursor), subtitle: "", gap: true});
  segments.push({start: sub.start, end: sub.end, scene: sceneAt(sub.start), subtitle: sub.text, gap: false});
  cursor = sub.end;
}
const videoEnd = Math.max(data.video.duration, cursor + 0.3);
if (videoEnd > cursor) segments.push({start: cursor, end: videoEnd, scene: sceneAt(Math.max(cursor - 0.01, 0)), subtitle: "", gap: true});

// ---- 禁止词扫描 ----
const publicText = [coverTitle, firstScene.deck || "", ...segments.map((s) => s.subtitle)].join("\n");
const hits = forbiddenHits(publicText);
if (hits.length) throw new Error(`字幕命中个人归属禁用项: ${hits.join(", ")}`);

// ---- 渲染帧目录 ----
const framesDir = path.join(video, ".frames");
await ensureDir(framesDir);
for (const name of await fs.readdir(framesDir)) { if (name.endsWith(".png") || name.endsWith(".html")) await fs.unlink(path.join(framesDir, name)); }

// 预读资源转 dataURL（自包含，避免远程/本地路径问题）
async function assetDataUrl(file) {
  if (!await exists(file)) return null;
  const ext = path.extname(file).toLowerCase();
  const mime = {".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml"}[ext] || "application/octet-stream";
  return `data:${mime};base64,${(await fs.readFile(file)).toString("base64")}`;
}
const coverData = await assetDataUrl(coverAssetPath);
const layersData = await assetDataUrl(path.join(video, "assets", "content-image.png"));
const logoData = await assetDataUrl(path.join(video, "assets", "logo.png"));

function frameHtml(segment) {
  const {scene, subtitle} = segment;
  const s = scene || scenes[0];
  const visual = renderVisual(s, segment);
  const subHtml = subtitle
    ? `<div class="sub"><span>${escapeHtml(subtitle)}</span></div>`
    : `<div class="sub empty"><span></span></div>`;
  const num = String(Math.max(0, scenes.indexOf(s)) + 1).padStart(2, "0");
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>
    *{box-sizing:border-box;margin:0;padding:0}
    html,body{width:${width}px;height:${height}px;overflow:hidden;background:#FCFAF8}
    body{font-family:'PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif;color:#2B2929;position:relative;display:flex;flex-direction:column}
    .brand{display:flex;align-items:center;gap:16px;padding:28px 40px 22px;border-bottom:2px solid #D8C4C7}
    .brand .logo{height:78px;object-fit:contain}
    .brand .name{font-size:30px;font-weight:650;color:#9E2F3F;letter-spacing:1px}
    .brand .rule{flex:1;height:2px;background:#D8C4C7;opacity:.5}
    .brand .col{font-size:22px;color:#756D6D}
    .stage{flex:1;position:relative;display:flex;align-items:center;justify-content:center;overflow:hidden}
    .sub{height:250px;display:flex;align-items:flex-start;justify-content:center;padding:34px 56px 40px;border-top:2px solid #D8C4C7}
    .sub span{font-size:40px;line-height:1.5;font-weight:500;text-align:center;color:#2B2929;max-width:960px}
    .sub.empty span{font-size:40px;color:#CFC6C6}
  </style></head><body>
    <div class="brand">
      ${logoData ? `<img class="logo" src="${logoData}">` : ""}
      <span class="name">SW 编辑部 · MBTI 观察</span>
      <div class="rule"></div>
      <span class="col">镜头 ${num}</span>
    </div>
    <div class="stage">${visual}</div>
    ${subHtml}
  </body></html>`;
}

function renderVisual(s, segment) {
  const tag = s.visual;
  const css = `
    .v{display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;height:100%;padding:40px}
    .h1{font-size:64px;font-weight:750;color:#2B2929;text-align:center;line-height:1.4;margin-bottom:18px}
    .h1.accent{color:#9E2F3F}
    .h2{font-size:42px;font-weight:650;color:#2B2929;text-align:center;line-height:1.5;margin-bottom:14px}
    .small{font-size:28px;color:#756D6D;text-align:center;line-height:1.6}
    .card{background:#FFFDFB;border:3px solid #D8C4C7;border-radius:24px;padding:56px 64px}
    .card.accent-card{background:#F6E8E8;border-color:#9E2F3F}
    .tagline{font-size:30px;font-weight:650;color:#9E2F3F;letter-spacing:2px;margin-bottom:20px}
    .cover-img{width:100%;max-width:980px;border-radius:18px;box-shadow:0 16px 44px rgba(50,35,35,.18);object-fit:cover}
    .cover-editorial{width:100%;height:100%;padding:54px 140px 54px 64px;display:grid;grid-template-rows:minmax(0,48%) auto;gap:38px;align-content:center}
    .cover-figure{position:relative;min-height:0;overflow:hidden;border:2px solid #D8C4C7;border-radius:18px;background:#FFFDFB;box-shadow:0 18px 46px rgba(50,35,35,.12)}
    .cover-figure img{display:block;width:100%;height:100%;object-fit:cover;object-position:50% 48%}
    .cover-figure::after{content:"";position:absolute;left:0;right:0;bottom:0;height:8px;background:#9E2F3F}
    .cover-copy{align-self:start;text-align:left}
    .cover-kicker{font-size:27px;line-height:1.2;font-weight:700;letter-spacing:2px;color:#9E2F3F;margin-bottom:18px}
    .cover-title{font-size:74px;line-height:1.16;font-weight:760;letter-spacing:-2px;color:#2B2929}
    .cover-title span{display:block;white-space:nowrap}
    .cover-title span:first-child{color:#9E2F3F}
    .cover-deck{font-size:30px;line-height:1.5;font-weight:450;color:#756D6D;margin-top:22px;max-width:780px}
    .strike{position:relative;display:inline-block}
    .strike::after{content:"";position:absolute;left:-4%;top:52%;width:108%;height:6px;background:#9E2F3F;border-radius:3px;transform:rotate(-4deg)}
    .path-step{display:flex;align-items:center;gap:22px}
    .node{min-width:200px;padding:24px 30px;border-radius:18px;border:3px solid #D8C4C7;background:#FFFDFB;font-size:34px;font-weight:650;color:#756D6D;text-align:center}
    .node.on{border-color:#9E2F3F;background:#F6E8E8;color:#9E2F3F}
    .arrow{font-size:44px;color:#9E2F3F}
    .comment{width:120px;height:120px;border-radius:50%;background:#F6E8E8;border:3px solid #9E2F3F;display:flex;align-items:center;justify-content:center;font-size:56px;color:#9E2F3F;margin-bottom:24px}
  `;
  let body = "";
  if (tag === "cover" && coverData) {
    const titleLines = (Array.isArray(s.titleLines) ? s.titleLines : [s.overlayTitle]).map((line) => `<span>${escapeHtml(line)}</span>`).join("");
    body = `<div class="cover-editorial"><figure class="cover-figure"><img data-cover-source src="${coverData}" alt=""></figure><section class="cover-copy"><div class="cover-kicker">SW 专业编辑解读</div><h1 class="cover-title" data-cover-title>${titleLines}</h1>${s.deck ? `<p class="cover-deck">${escapeHtml(s.deck)}</p>` : ""}</section></div>`;
  } else if (tag === "question-card") {
    body = `<div class="v"><div class="card accent-card"><div class="tagline">一个更深的问法</div><div class="h1 accent" style="font-size:76px">${s.overlayTitle || "我为什么会这样？"}</div><div class="small" style="margin-top:18px">很多工具就接不住了</div></div></div>`;
  } else if (tag === "comparison") {
    body = `<div class="v"><div class="h2" style="margin-bottom:30px">这不是强弱，而是偏好</div>
      <div style="display:flex;gap:0;align-items:stretch;width:100%;max-width:920px">
        <div style="flex:1;background:#FFFDFB;border:3px solid #D8C4C7;border-radius:20px 0 0 20px;padding:44px 30px;text-align:center"><div class="small" style="margin-bottom:26px">别人更果断、更外向</div><div class="h2" style="color:#756D6D;font-size:52px">只是不同</div></div>
        <div style="width:6px;background:#9E2F3F;border-radius:3px;margin:0 0"></div>
        <div style="flex:1;background:#F6E8E8;border:3px solid #9E2F3F;border-radius:0 20px 20px 0;padding:44px 30px;text-align:center"><div class="small" style="margin-bottom:26px">能量来源与判断路径</div><div class="h1 accent" style="font-size:52px">才是你</div></div>
      </div></div>`;
  } else if (tag === "layers-diagram" && layersData) {
    body = `<div class="v"><div class="tagline" style="margin-bottom:14px">MBTI 真正不可替代的地方</div><img class="cover-img" src="${layersData}" style="max-width:980px"><div class="small" style="margin-top:26px">回到你内在的心理起点</div></div>`;
  } else if (tag === "path") {
    const step = segment.gap ? 3 : 3;
    body = `<div class="v"><div class="h2" style="margin-bottom:40px">用对 MBTI 的三步</div>
      <div class="path-step"><div class="node on">接纳自己</div><span class="arrow">→</span><div class="node on">找到方向</div><span class="arrow">→</span><div class="node on">不依赖标签</div></div>
      <div class="small" style="margin-top:36px">接纳，却不放弃成长</div></div>`;
  } else if (tag === "boundary-card") {
    body = `<div class="v"><div class="card accent-card"><div class="tagline">边界声明</div>
      <div class="h2" style="font-size:52px"><span class="strike">不是诊断</span>&nbsp;&nbsp;<span class="strike">也不是命运</span></div>
      <div style="height:26px"></div><div class="h1 accent" style="font-size:60px">只是一个回到起点的入口</div></div></div>`;
  } else if (tag === "cta") {
    body = `<div class="v"><div class="comment">💬</div><div class="h1" style="font-size:58px;max-width:860px">${s.overlayTitle || "你最近一次问自己，是什么时候？"}</div><div class="small" style="margin-top:22px">欢迎在评论区聊聊</div></div>`;
  } else {
    body = `<div class="v"><div class="h1 accent">${escapeHtml(s.name)}</div><div class="small">${escapeHtml(s.voiceover || "")}</div></div>`;
  }
  return `<style>${css}</style>${body}`;
}

// ---- Chromium 渲染每一帧 ----
const {chromium} = await findPlaywright();
const browser = await chromium.launch({headless: true});
const page = await browser.newPage({viewport: {width, height}, deviceScaleFactor: 1});
let firstFrameMetrics = null;
try {
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    const html = frameHtml(segment);
    const file = path.join(framesDir, `frame-${String(index + 1).padStart(2, "0")}.html`);
    await fs.writeFile(file, html);
    await page.goto(pathToFileURL(file).href, {waitUntil: "load"});
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map((item) => item.decode()));
    });
    if (index === 0) {
      firstFrameMetrics = await page.evaluate(() => {
        const source = document.querySelector("[data-cover-source]");
        const title = document.querySelector("[data-cover-title]");
        const sourceBox = source?.getBoundingClientRect();
        const titleBox = title?.getBoundingClientRect();
        return {
          canvas: {width: document.documentElement.clientWidth, height: document.documentElement.clientHeight},
          source: source ? {naturalWidth: source.naturalWidth, naturalHeight: source.naturalHeight, displayWidth: sourceBox.width, displayHeight: sourceBox.height} : null,
          title: titleBox ? {left: titleBox.left, top: titleBox.top, right: titleBox.right, bottom: titleBox.bottom} : null,
          overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          overflowY: document.documentElement.scrollHeight - document.documentElement.clientHeight,
        };
      });
    }
    await page.screenshot({path: file.replace(/\.html$/u, ".png")});
  }
} finally {
  await browser.close();
}

const titleInSafeCore = firstFrameMetrics?.title
  && firstFrameMetrics.title.left >= 60
  && firstFrameMetrics.title.right <= 940
  && firstFrameMetrics.title.top >= 240
  && firstFrameMetrics.title.bottom <= 1680;
const sourceNotUpscaled = firstFrameMetrics?.source
  && firstFrameMetrics.source.naturalWidth >= firstFrameMetrics.source.displayWidth
  && firstFrameMetrics.source.naturalHeight >= firstFrameMetrics.source.displayHeight;
if (!titleInSafeCore) throw new Error(`封面标题超出 9:16 中央 3:4 安全核心区: ${JSON.stringify(firstFrameMetrics?.title)}`);
if (!sourceNotUpscaled) throw new Error(`封面位图被低分辨率放大: ${JSON.stringify(firstFrameMetrics?.source)}`);
if (firstFrameMetrics.overflowX > 0 || firstFrameMetrics.overflowY > 0) throw new Error(`封面首帧发生溢出: ${JSON.stringify(firstFrameMetrics)}`);

// ---- ffmpeg 合成 ----
const outDir = path.join(video, "output");
await ensureDir(outDir);
const coverOutputPath = path.join(outDir, "video-cover.png");
await fs.copyFile(path.join(framesDir, "frame-01.png"), coverOutputPath);
const coverOutputSize = pngSize(await fs.readFile(coverOutputPath));
if (coverOutputSize.width !== width || coverOutputSize.height !== height) throw new Error(`视频封面尺寸错误: ${coverOutputSize.width}×${coverOutputSize.height}`);
const clipDir = path.join(video, ".clips");
await ensureDir(clipDir);
for (const name of await fs.readdir(clipDir)) { if (name.endsWith(".mp4")) await fs.unlink(path.join(clipDir, name)); }

const list = [];
for (let index = 0; index < segments.length; index += 1) {
  const seg = segments[index];
  const frame = path.join(framesDir, `frame-${String(index + 1).padStart(2, "0")}.png`);
  const clip = path.join(clipDir, `clip-${String(index + 1).padStart(2, "0")}.mp4`);
  const duration = Number((seg.end - seg.start).toFixed(3));
  const frameCount = Math.max(1, Math.round(duration * fps));
  // 字幕边界只更新字幕层，不做整帧淡入淡出，也不重置逐段缩放动画。
  const vf = `scale=${width}:${height}:flags=lanczos,format=yuv420p`;
  await run("ffmpeg", ["-y", "-loop", "1", "-framerate", String(fps), "-i", frame, "-vf", vf, "-frames:v", String(frameCount), "-r", String(fps), "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", clip]);
  list.push(`file '${clip}'`);
}
const concatList = path.join(clipDir, "list.txt");
await fs.writeFile(concatList, list.join("\n"));
const videoNoAudio = path.join(clipDir, "video-noaudio.mp4");
await run("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", concatList, "-c", "copy", videoNoAudio]);

// 音频转 AAC 48k（视频规范 AAC 兼容）
const audioAac = path.join(clipDir, "voiceover.m4a");
await run("ffmpeg", ["-y", "-i", audioPath, "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2", audioAac]);

const finalName = "video-candidate.mp4";
const finalPath = path.join(outDir, finalName);
await run("ffmpeg", ["-y", "-i", videoNoAudio, "-i", audioAac, "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", finalPath]);

// 独立封面必须与视频解码后的第一帧实质一致，避免上传封面和开场画面跳变。
const decodedFirstFrame = path.join(clipDir, "decoded-first-frame.png");
await run("ffmpeg", ["-y", "-i", finalPath, "-frames:v", "1", decodedFirstFrame]);
const ssimResult = await run("ffmpeg", ["-i", coverOutputPath, "-i", decodedFirstFrame, "-lavfi", "ssim", "-f", "null", "-"]);
const firstFrameSsim = Number(`${ssimResult.stdout}\n${ssimResult.stderr}`.match(/All:([0-9.]+)/u)?.[1] || 0);
const firstFrameMatchesCover = firstFrameSsim >= 0.98;

// ---- 探测与报告 ----
const probe = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_name,codec_type,width,height,r_frame_rate,sample_rate,channels", "-of", "json", finalPath]);
const temporal = await inspectVideo(finalPath);
const report = {
  status: "video-candidate-ready",
  output: finalPath,
  segments: segments.map((s) => ({start: s.start, end: s.end, scene: s.scene.id, subtitle: s.subtitle, gap: s.gap})),
  audio: {source: audio, sha256: audioHash},
  probe: JSON.parse(probe.stdout),
  checks: {
    forbiddenHits: hits,
    subtitles: data.subtitles.length,
    frames: segments.length,
    scenes: scenes.length,
    minimumSceneDuration,
    minimumSubtitleDuration,
    sceneDurationViolations,
    subtitleDurationViolations,
    cover: {
      passed: firstScene.start === 0 && firstScene.visual === "cover" && titleInSafeCore && sourceNotUpscaled && firstFrameMatchesCover,
      output: coverOutputPath,
      size: coverOutputSize,
      firstScene: {id: firstScene.id, start: firstScene.start, end: firstScene.end, duration: firstScene.end - firstScene.start},
      titleLines: coverTitleLines,
      safeCore: {x: 60, y: 240, width: 880, height: 1440},
      firstFrameSsim,
      firstFrameMatchesCover,
      metrics: firstFrameMetrics,
      policy: "第一帧即正式封面；独立封面由同一首帧导出；关键标题位于中央 3:4 安全核心区",
    },
    transitionPolicy: "画面只在镜头边界切换；字幕边界不做整帧淡入淡出或动画重置",
    temporal,
  },
  note: "BGM/音效未加：无已授权素材；如员工提供授权曲目可混音（人声优先，可侧链 4-7 dB）",
  generatedAt: new Date().toISOString(),
};
await writeJson(path.join(outDir, "video-report.json"), report);

// 清理中间帧与分片，保留字幕/脚本等源文件
for (const dir of [framesDir, clipDir]) {
  await fs.rm(dir, {recursive: true, force: true});
}

if (!report.checks.cover.passed) throw new Error(`视频首帧封面检查失败: ${JSON.stringify(report.checks.cover)}`);
if (!temporal.passed) throw new Error(`视频闪烁检查失败: ${JSON.stringify({blackEvents: temporal.blackEvents, rapidFlashPairs: temporal.rapidFlashPairs})}`);
console.log(JSON.stringify({status: report.status, output: finalPath, cover: coverOutputPath, duration: report.probe.format?.duration, frames: segments.length}, null, 2));
