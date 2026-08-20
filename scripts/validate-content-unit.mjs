import fs from "node:fs/promises";
import path from "node:path";
import {WECHAT_CHARACTER_RANGE, compactCount, exists, forbiddenHits, parseArgs, platformPaths, pngSize, readJson, sha256, writeJson} from "./lib.mjs";
import {analyzeVoiceover} from "./voiceover-lib.mjs";
import {WECHAT_BRAND_ASSETS, WECHAT_BRAND_COPY} from "./wechat-brand-shell.mjs";

const args = parseArgs();
if (!args.unit) { console.error("用法: node validate-content-unit.mjs --unit <内容单元路径>"); process.exit(2); }
const paths = platformPaths(args.unit);
const checks = [];
const add = (name, passed, detail = null, level = "error") => checks.push({name, passed: Boolean(passed), detail, level});

const rootEntries = (await fs.readdir(paths.unit, {withFileTypes: true})).filter((entry) => entry.name !== ".DS_Store");
const expectedRoots = ["AIworkspace", "公众号", "小红书", "短视频"].sort();
add("content-unit has exactly four first-level directories", rootEntries.every((entry) => entry.isDirectory()) && JSON.stringify(rootEntries.map((entry) => entry.name).sort()) === JSON.stringify(expectedRoots), rootEntries.map((entry) => entry.name));
for (const required of ["00-source", "10-shared-assets", "20-xhs", "30-wechat", "40-video", "50-final-review", "90-archive"]) add(`AIworkspace/${required} exists`, await exists(path.join(paths.ai, required)));

const scanFiles = [];
async function collectText(root) {
  if (!await exists(root)) return;
  for (const entry of await fs.readdir(root, {withFileTypes: true})) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) await collectText(target);
    else if (/\.(md|txt|json|html|js|css|srt|vtt)$/iu.test(entry.name) && !target.includes(`${path.sep}00-source${path.sep}`) && !target.includes(`${path.sep}90-archive${path.sep}`)) scanFiles.push(target);
  }
}
for (const root of [paths.xhs, paths.wechat, paths.video, paths.xhsFinal, paths.wechatFinal, paths.videoFinal]) await collectText(root);
const identity = {};
for (const file of scanFiles) {
  const hits = forbiddenHits(await fs.readFile(file, "utf8"));
  if (hits.length) identity[path.relative(paths.unit, file)] = hits;
}
add("public candidate identity scan is zero", Object.keys(identity).length === 0, identity);

const xhsOut = path.join(paths.xhs, "output");
if (await exists(xhsOut)) {
  const pages = (await fs.readdir(xhsOut)).filter((name) => /^page-\d{2}\.png$/u.test(name)).sort();
  const pageSizes = [];
  for (const name of pages) pageSizes.push({name, ...pngSize(await fs.readFile(path.join(xhsOut, name)))});
  add("xhs has 3-10 content-driven pages", pages.length >= 3 && pages.length <= 10, pages);
  add("xhs pages are 1080x1440", pageSizes.every((item) => item.width === 1080 && item.height === 1440), pageSizes);
  if (await exists(path.join(xhsOut, "carousel-long.png"))) {
    const size = pngSize(await fs.readFile(path.join(xhsOut, "carousel-long.png")));
    add("xhs long image directly stacks original pages", size.width === 1080 && size.height === pages.length * 1440, size);
  } else add("xhs long image exists", false);
  add("xhs caption exists", await exists(path.join(xhsOut, "caption.md")));
} else add("xhs candidate output exists", false);

const wechatOut = path.join(paths.wechat, "output");
if (await exists(wechatOut)) {
  const required = ["article.md", "article.html", "article-full.png", "share-copy.md"];
  for (const name of required) add(`wechat ${name} exists`, await exists(path.join(wechatOut, name)));
  const reportPath = path.join(wechatOut, "check-report.json");
  if (await exists(reportPath)) {
    const report = await readJson(reportPath);
    add(`wechat reader-visible body ${WECHAT_CHARACTER_RANGE.min}-${WECHAT_CHARACTER_RANGE.max}`, report.characterCount >= WECHAT_CHARACTER_RANGE.min && report.characterCount <= WECHAT_CHARACTER_RANGE.max, {characterCount: report.characterCount});
    add("wechat browser check passed", report.passed, report.errors);
  } else add("wechat check report exists", false);
  const imageFiles = (await fs.readdir(wechatOut)).filter((name) => /^content-image\.(png|jpe?g|svg|webp)$/iu.test(name));
  add("wechat has substantive content image", imageFiles.length >= 1, imageFiles);
  const brandAssetChecks = {};
  for (const [name, expected] of Object.entries(WECHAT_BRAND_ASSETS)) {
    const file = path.join(wechatOut, name);
    brandAssetChecks[name] = await exists(file) ? sha256(await fs.readFile(file)) === expected : false;
  }
  add("wechat fixed brand images are exact source copies", Object.values(brandAssetChecks).every(Boolean), brandAssetChecks);
  const articleHtml = await exists(path.join(wechatOut, "article.html")) ? await fs.readFile(path.join(wechatOut, "article.html"), "utf8") : "";
  const lockedBrandCopy = [...WECHAT_BRAND_COPY.intro, ...WECHAT_BRAND_COPY.legal];
  const articleVisibleText = articleHtml
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, "")
    .replace(/<[^>]+>/gu, "")
    .replace(/&amp;/gu, "&")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&quot;/gu, '"')
    .replace(/&#39;/gu, "'");
  add("wechat fixed brand copy is present verbatim", lockedBrandCopy.every((line) => articleVisibleText.includes(line)), lockedBrandCopy.filter((line) => !articleVisibleText.includes(line)));
} else add("wechat candidate output exists", false);

const audioInbox = path.join(paths.video, "audio-inbox");
const audioFiles = await exists(audioInbox) ? (await fs.readdir(audioInbox)).filter((name) => !name.startsWith(".")) : [];
const draftPath = path.join(paths.video, "voiceover-draft.md");
const ttsPath = path.join(paths.video, "tts-input.txt");
const voiceoverReportPath = path.join(paths.video, "voiceover-report.json");
add("video voiceover draft exists", await exists(draftPath));
add("video unique MiniMax input exists", await exists(ttsPath));
if (await exists(draftPath) && await exists(ttsPath)) {
  const liveVoiceover = analyzeVoiceover(await fs.readFile(draftPath, "utf8"), await fs.readFile(ttsPath, "utf8"));
  add("video voiceover content and prosody checks pass", liveVoiceover.passed, liveVoiceover.checks.filter((check) => !check.passed));
  add("video voiceover report exists", await exists(voiceoverReportPath));
  if (await exists(voiceoverReportPath)) {
    const storedVoiceover = await readJson(voiceoverReportPath);
    add("video voiceover report is passed and current", storedVoiceover.passed === true
      && storedVoiceover.fingerprints?.draftBody === liveVoiceover.fingerprints.draftBody
      && storedVoiceover.fingerprints?.ttsInput === liveVoiceover.fingerprints.ttsInput,
    {stored: storedVoiceover.fingerprints, current: liveVoiceover.fingerprints});
  }
}
if (!audioFiles.length) add("video waits for manually generated audio", true, "没有音频时不要求分镜或成片", "info");
else add("video returned audio has follow-up report", await exists(path.join(paths.video, "audio-report.json")), audioFiles, "warning");

const videoCandidate = path.join(paths.video, "output", "video-candidate.mp4");
if (await exists(videoCandidate)) {
  const videoCoverPath = path.join(paths.video, "output", "video-cover.png");
  add("video standalone cover exists", await exists(videoCoverPath));
  if (await exists(videoCoverPath)) {
    const coverSize = pngSize(await fs.readFile(videoCoverPath));
    add("video cover is 1080x1920", coverSize.width === 1080 && coverSize.height === 1920, coverSize);
  }
  const videoReportPath = path.join(paths.video, "output", "video-report.json");
  add("video report exists", await exists(videoReportPath));
  if (await exists(videoReportPath)) {
    const videoReport = await readJson(videoReportPath);
    add("video has no detected black-frame flashes", videoReport.checks?.temporal?.blackEvents?.length === 0, videoReport.checks?.temporal?.blackEvents);
    add("video has no rapid one-frame flash pairs", videoReport.checks?.temporal?.rapidFlashPairs?.length === 0, videoReport.checks?.temporal?.rapidFlashPairs);
    add("video subtitle boundaries do not reset full-frame transitions", videoReport.checks?.transitionPolicy === "画面只在镜头边界切换；字幕边界不做整帧淡入淡出或动画重置", videoReport.checks?.transitionPolicy);
    add("video first frame is the validated cover", videoReport.checks?.cover?.passed === true && videoReport.checks?.cover?.firstFrameMatchesCover === true && videoReport.checks?.cover?.firstFrameSsim >= 0.98, videoReport.checks?.cover);
  }
}

const reviewReportPath = path.join(paths.review, "review-report.json");
if (await exists(xhsOut) && await exists(wechatOut)) {
  add("final review report exists", await exists(reviewReportPath));
  if (await exists(reviewReportPath)) {
    const reviewReport = await readJson(reviewReportPath);
    add("final review is fully passed", reviewReport.passed, reviewReport.components);
    const xhsComponent = reviewReport.components?.xhs;
    const xhsMetrics = reviewReport.metrics?.xhs;
    add("xhs copy is enabled only with visible valid pages", xhsComponent?.ready
      ? xhsMetrics?.natural?.width === 1080 && xhsMetrics?.natural?.height === 1440 && xhsMetrics?.copyDisabled === false && xhsMetrics?.emptyVisible === false
      : xhsMetrics?.copyDisabled === true && xhsMetrics?.emptyVisible === true, {component: xhsComponent, metrics: xhsMetrics});
    const voiceoverComponent = reviewReport.components?.voiceover;
    const voiceoverMetrics = reviewReport.metrics?.voiceover;
    add("voiceover copy is enabled only with passed current machine稿", voiceoverComponent?.ready
      ? voiceoverMetrics?.textLength > 0 && voiceoverMetrics?.copyDisabled === false && voiceoverMetrics?.emptyVisible === false
      : voiceoverMetrics?.copyDisabled === true && voiceoverMetrics?.emptyVisible === true,
    {component: voiceoverComponent, metrics: voiceoverMetrics});
  }
}

const failed = checks.filter((item) => !item.passed && item.level === "error");
const report = {generatedAt: new Date().toISOString(), unit: paths.unit, summary: {passed: checks.filter((item) => item.passed).length, failed: failed.length, warnings: checks.filter((item) => !item.passed && item.level === "warning").length}, checks};
await writeJson(path.join(paths.ai, "validation-report.json"), report);
console.log(JSON.stringify(report.summary));
if (failed.length) process.exitCode = 1;
