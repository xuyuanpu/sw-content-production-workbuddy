import {inspectGraphic, createGraphicSnapshot} from './graphic-integrity-lib.mjs';
import {checkDirectorReview} from "./director-review-lib.mjs";
import fs from "node:fs/promises";
import path from "node:path";
import {WECHAT_CHARACTER_RANGE, copyTree, ensureDir, exists, parseArgs, platformPaths, pngSize, readJson, sha256, timestamp, writeJson} from "./lib.mjs";
import {WECHAT_COVER_SPECS} from "./wechat-cover-lib.mjs";
import {VIDEO_FINAL_FILES, createVideoAcceptanceSnapshot, inspectVideoAcceptance} from "./video-acceptance-lib.mjs";

const args = parseArgs();
if (!args.unit || args.confirm !== "YES") {
  console.error("只有员工明确确认版本后才可运行: node promote.mjs --unit <内容单元> --platform xhs,wechat[,video] --confirm YES");
  process.exit(2);
}
const paths = platformPaths(args.unit);
const selected = String(args.platform || "xhs,wechat").split(",").map((item) => item.trim()).filter(Boolean);
const map = {
  xhs: {source: path.join(paths.xhs, "output"), target: paths.xhsFinal, archive: "小红书"},
  wechat: {source: path.join(paths.wechat, "output"), target: paths.wechatFinal, archive: "公众号"},
  video: {source: path.join(paths.video, "output"), target: paths.videoFinal, archive: "短视频"},
};
// Complete every selected platform's preflight before moving any existing final.
if (!selected.length || new Set(selected).size !== selected.length) throw new Error("平台列表不能为空或重复");
for (const key of selected) {
  const item = map[key];
  if (!item) throw new Error(`未知平台: ${key}`);
  if (!await exists(item.source)) throw new Error(`候选目录不存在: ${item.source}`);
  const sourceEntries = (await fs.readdir(item.source)).filter((entry) => !entry.startsWith("."));
  if (!sourceEntries.length) throw new Error(`候选目录为空: ${item.source}`);
  if (await exists(item.target) && !(await fs.stat(item.target)).isDirectory()) throw new Error(`成品路径不是目录: ${item.target}`);
}
if (selected.includes("xhs")) {
  const source = map.xhs.source;
  const check = await readJson(path.join(source, "check-report.json"));
  const pages = (await fs.readdir(source)).filter((name) => /^page-\d{2}\.png$/u.test(name));
  if (check.passed !== true || pages.length < 3 || pages.length > 10 || !(await fs.readFile(path.join(source, "caption.md"), "utf8")).trim()) throw new Error("小红书候选检查、页数或正文未通过");
  for (const name of pages) {
    const size = pngSize(await fs.readFile(path.join(source, name)));
    if (size.width !== 1080 || size.height !== 1440) throw new Error(`小红书候选 ${name} 尺寸错误`);
  }
}
if (selected.includes("wechat")) {
  const checkPath = path.join(paths.wechat, "output", "check-report.json");
  if (!await exists(checkPath)) throw new Error("公众号候选缺少 check-report.json，不得提升成品");
  const check = JSON.parse(await fs.readFile(checkPath, "utf8"));
  if (check.passed !== true || check.cover?.passed !== true || check.characterCount < WECHAT_CHARACTER_RANGE.min || check.characterCount > WECHAT_CHARACTER_RANGE.max) {
    throw new Error(`公众号候选未通过 ${WECHAT_CHARACTER_RANGE.min}～${WECHAT_CHARACTER_RANGE.max} 字及浏览器检查，当前 ${check.characterCount ?? "未知"} 字`);
  }
  for (const key of ["wide", "square"]) {
    const spec = WECHAT_COVER_SPECS[key];
    const file = path.join(paths.wechat, "output", spec.file);
    if (!await exists(file)) throw new Error(`公众号候选缺少 ${spec.file}，不得提升成品`);
    const buffer = await fs.readFile(file);
    const size = pngSize(buffer);
    if (size.width !== spec.width || size.height !== spec.height || check.cover.outputHashes?.[key] !== sha256(buffer)) throw new Error(`公众号候选 ${spec.file} 尺寸错误或与检查报告不一致，不得提升成品`);
  }
}
const graphicAcceptances = {};
for (const platform of selected.filter(p => p !== 'video')) {
  const acceptance = await inspectGraphic({platform,unitRoot:paths.unit});
  if (!acceptance.ready) throw new Error(`${platform} 候选已过期或不完整：${acceptance.reasons.join('；')}`);
  graphicAcceptances[platform] = acceptance.report;
}
let videoAcceptance = null;
if (selected.includes("video")) {
  videoAcceptance = await inspectVideoAcceptance({artifactDir: map.video.source, unitRoot: paths.unit, sourceMode: "candidate"});
  if (!videoAcceptance.ready) throw new Error(`短视频候选未通过统一成品验收，不得提升: ${videoAcceptance.reasons.join("；")}`);
  if (videoAcceptance.report.directorContract?.version === 1) {
    const reviewPath = path.join(map.video.source, "director-review.json");
    const review = await exists(reviewPath) ? await readJson(reviewPath) : null;
    const checked = checkDirectorReview(review, videoAcceptance.report);
    if (!checked.passed) throw new Error(`导演审片尚未完成，不得以机器通过替代: ${checked.issues.join("；")}`);
    videoAcceptance.report = {...videoAcceptance.report, directorReview: review};
  }

}
const statePath = path.join(paths.ai, "state.json");
const state = await exists(statePath) ? JSON.parse(await fs.readFile(statePath, "utf8")) : {};
const videoSnapshot = videoAcceptance ? await createVideoAcceptanceSnapshot({unitRoot: paths.unit, report: videoAcceptance.report, mixReport: videoAcceptance.mixReport}) : null;
const graphicSnapshots = {};
for (const [platform,report] of Object.entries(graphicAcceptances)) graphicSnapshots[platform] = await createGraphicSnapshot(paths.unit,platform,report);
const actions = [];
for (const key of selected) {
  const item = map[key];
  await ensureDir(item.target);
  const currentEntries = (await fs.readdir(item.target)).filter((entry) => !entry.startsWith("."));
  let archive = null;
  if (currentEntries.length) {
    await ensureDir(path.join(paths.archive, item.archive));
    archive = await fs.mkdtemp(path.join(paths.archive, item.archive, `${timestamp()}-previous-`));
    if (key === "video" && state.videoFinalAcceptance) await writeJson(path.join(archive, "acceptance-pointer.json"), state.videoFinalAcceptance);
    for (const entry of currentEntries) await fs.rename(path.join(item.target, entry), path.join(archive, entry));
  }
  if (key === "video") {
    for (const file of Object.values(VIDEO_FINAL_FILES)) await fs.copyFile(path.join(item.source, file), path.join(item.target, file));
    state.videoFinalAcceptance = videoSnapshot;
  } else {
    state.graphicFinalAcceptance ||= {};
    if (archive && state.graphicFinalAcceptance[key]) await writeJson(path.join(archive,'acceptance-pointer.json'),state.graphicFinalAcceptance[key]);
    state.graphicFinalAcceptance[key] = graphicSnapshots[key];
    await copyTree(item.source, item.target, (source) => !source.endsWith("check-report.json") && !source.endsWith("contact-sheet.png"));
  }
  actions.push({platform: key, source: item.source, target: item.target, archive, ...(key === "video" ? {acceptance: videoSnapshot} : {})});
}
state.stage = "human-confirmed";
state.updatedAt = new Date().toISOString();
state.promoted = selected;
await writeJson(statePath, state);
console.log(JSON.stringify({status: "promoted-after-human-confirmation", actions}, null, 2));
