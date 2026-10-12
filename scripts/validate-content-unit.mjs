import {inspectGraphic} from './graphic-integrity-lib.mjs';
import fs from "node:fs/promises";
import path from "node:path";
import {WECHAT_CHARACTER_RANGE, compactCount, exists, forbiddenHits, parseArgs, platformPaths, pngSize, readJson, sha256, writeJson} from "./lib.mjs";
import {confirmedVoiceoverMatches} from "./confirmed-voiceover-lib.mjs";
import {analyzeVoiceover} from "./voiceover-lib.mjs";
import {WECHAT_BRAND_ASSETS, WECHAT_BRAND_COPY} from "./wechat-brand-shell.mjs";
import {WECHAT_COVER_SPECS} from "./wechat-cover-lib.mjs";
import {inspectVideoAcceptance} from "./video-acceptance-lib.mjs";

const args = parseArgs();
if (!args.unit) { console.error("用法: node validate-content-unit.mjs --unit <内容单元路径>"); process.exit(2); }
const paths = platformPaths(args.unit);
const manifest = await exists(path.join(paths.ai,'manifest.json')) ? await readJson(path.join(paths.ai,'manifest.json')) : {};
const defaultScope = manifest.scope ? [['xhs','xiaohongshu'],['wechat','wechat'],['voiceover','video']].filter(([,key])=>manifest.scope[key]).map(([p])=>p) : ['xhs','wechat','voiceover'];
const requested = args.platform ? args.platform.split(',').map(p=>p.trim()) : defaultScope;
if(!requested.length || requested.some(p=>!['xhs','wechat','voiceover','video'].includes(p)))throw new Error('Unknown platform');
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
    else if (!entry.name.endsWith("report.json") && /\.(md|txt|html|srt|vtt)$/iu.test(entry.name) && !target.includes(`${path.sep}00-source${path.sep}`) && !target.includes(`${path.sep}90-archive${path.sep}`)) scanFiles.push(target);
  }
}
// Scan reader-facing outputs, not internal reports that may quote disallowed examples.
for (const platform of requested.filter(p=>p!=='voiceover')) await collectText(path.join(paths[platform],'output'));
if(requested.includes('voiceover')) for(const name of ['voiceover-draft.md','tts-input.txt']) {
  const file=path.join(paths.video,name);if(await exists(file))scanFiles.push(file);
}
const identity = {};
for (const file of scanFiles) {
  const hits = forbiddenHits(await fs.readFile(file, "utf8"));
  if (hits.length) identity[path.relative(paths.unit, file)] = hits;
}
add("public candidate identity scan is zero", Object.keys(identity).length === 0, identity);

const xhsOut = path.join(paths.xhs, "output");
if(requested.includes("xhs")) {
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

}
const wechatOut = path.join(paths.wechat, "output");
if(requested.includes("wechat")) {
if (await exists(wechatOut)) {
  const required = ["article.md", "article.html", "article-full.png", "share-copy.md", WECHAT_COVER_SPECS.wide.file, WECHAT_COVER_SPECS.square.file];
  for (const name of required) add(`wechat ${name} exists`, await exists(path.join(wechatOut, name)));
  for (const key of ["wide", "square"]) {
    const spec = WECHAT_COVER_SPECS[key];
    const file = path.join(wechatOut, spec.file);
    const size = await exists(file) ? pngSize(await fs.readFile(file)) : null;
    add(`wechat ${key} cover is ${spec.width}x${spec.height}`, size?.width === spec.width && size?.height === spec.height, size);
  }
  const reportPath = path.join(wechatOut, "check-report.json");
  if (await exists(reportPath)) {
    const report = await readJson(reportPath);
    add(`wechat reader-visible body ${WECHAT_CHARACTER_RANGE.min}-${WECHAT_CHARACTER_RANGE.max}`, report.characterCount >= WECHAT_CHARACTER_RANGE.min && report.characterCount <= WECHAT_CHARACTER_RANGE.max, {characterCount: report.characterCount});
    add("wechat browser check passed", report.passed, report.errors);
    add("wechat dual-cover report passed", report.cover?.passed === true, report.cover);
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

}
if(requested.includes("voiceover")) {
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
    add("video voiceover report is passed and current", confirmedVoiceoverMatches(storedVoiceover, await fs.readFile(draftPath, "utf8"), await fs.readFile(ttsPath, "utf8")));

  }
}
if (!audioFiles.length) add("video waits for manually generated audio", true, "没有音频时不要求分镜或成片", "info");
else add("video returned audio has follow-up report", await exists(path.join(paths.video, "audio-report.json")), audioFiles, "warning");

}
if(requested.includes("video")) {
const videoOutput = path.join(paths.video, "output");
const videoReportPath = path.join(videoOutput, "video-report.json");
add("requested video candidate exists", await exists(path.join(videoOutput,"video-candidate.mp4")));
const videoPromotionState = await exists(path.join(paths.ai, "state.json")) ? await readJson(path.join(paths.ai, "state.json")) : {};
for (const [label, artifactDir] of [["candidate", videoOutput], ["final", paths.videoFinal]]) {
  const hasVideo = await exists(path.join(artifactDir, "video-candidate.mp4"));
  const hasCandidateReport = label === "candidate" && await exists(videoReportPath);
  const hasFinalState = label === "final" && (Boolean(videoPromotionState.videoFinalAcceptance) || (await fs.readdir(paths.videoFinal).catch(() => [])).length > 0);
  if (!hasVideo && !hasCandidateReport && !hasFinalState) continue;
  const acceptance = await inspectVideoAcceptance({artifactDir, unitRoot: paths.unit, sourceMode: label, reportPath: videoReportPath, mixReportPath: path.join(videoOutput, "mix-report.json")});
  for (const check of acceptance.checks) add(`video ${label}: ${check.name}`, check.passed);
}

}
for(const platform of requested.filter(p=>['xhs','wechat'].includes(p))) {
  const integrity=await inspectGraphic({platform,unitRoot:paths.unit});
  add(`${platform} current inputs and outputs match`,integrity.ready,integrity.reasons);
}
// A review page is an optional presentation, not a prerequisite for individual delivery.
const failed = checks.filter((item) => !item.passed && item.level === "error");
const report = {generatedAt: new Date().toISOString(), unit: paths.unit, requested, summary: {passed: checks.filter((item) => item.passed).length, failed: failed.length, warnings: checks.filter((item) => !item.passed && item.level === "warning").length}, checks};
await writeJson(path.join(paths.ai, "validation-report.json"), report);
console.log(JSON.stringify(report.summary));
if (failed.length) process.exitCode = 1;
