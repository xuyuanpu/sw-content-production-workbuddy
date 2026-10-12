import fs from "node:fs/promises";
import {createReadStream} from "node:fs";
import {createHash, randomUUID} from "node:crypto";
import path from "node:path";
import {pngSize} from "./lib.mjs";
import {SW_BRAND_BGM} from "./bgm-policy-lib.mjs";
import {STORYBOARD_REPORT_SCHEMA_VERSION} from "./storyboard-lib.mjs";

export const VIDEO_FINAL_FILES = Object.freeze({
  finalVideo: "video-candidate.mp4",
  cover: "video-cover.png",
  subtitles: "subtitles.srt",
  voiceover: "final-voiceover.md",
});
const isHash = (value) => typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
const empty = (value) => Array.isArray(value) && value.length === 0;

function inferUnitRoot(artifactDir) {
  let current = path.resolve(artifactDir);
  if (path.basename(current) === "短视频") return path.dirname(current);
  while (current !== path.dirname(current)) {
    if (path.basename(current) === "AIworkspace") return path.dirname(current);
    current = path.dirname(current);
  }
  throw new Error("无法识别内容单元，请显式传入 unitRoot");
}

async function insideUnit(unitRoot, relativePath) {
  if (typeof relativePath !== "string" || !relativePath || path.isAbsolute(relativePath)) throw new Error("输入路径必须相对当前内容单元");
  const root = await fs.realpath(unitRoot);
  const target = path.resolve(root, relativePath);
  const relative = path.relative(root, target);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error("输入路径越过当前内容单元");
  const real = await fs.realpath(target);
  const realRelative = path.relative(root, real);
  if (realRelative === ".." || realRelative.startsWith(`..${path.sep}`) || path.isAbsolute(realRelative)) throw new Error("输入符号链接越过当前内容单元");
  return real;
}

async function fingerprint(file) {
  const stat = await fs.stat(file);
  if (!stat.isFile() || stat.size === 0) throw new Error("文件缺失、为空或不是普通文件");
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return {sha256: hash.digest("hex"), sizeBytes: stat.size};
}

export async function fingerprintVideoArtifacts(artifactDir) {
  return Object.fromEntries(await Promise.all(Object.entries(VIDEO_FINAL_FILES).map(async ([key, file]) => [key, {file, ...await fingerprint(path.join(artifactDir, file))}])));
}

export async function fingerprintVideoSourceInputs({unitRoot, files}) {
  const unique = [...new Set(files.map((file) => path.relative(path.resolve(unitRoot), path.resolve(file)).split(path.sep).join("/")))];
  return {schemaVersion: 1, files: await Promise.all(unique.map(async (relativePath) => ({path: relativePath, ...await fingerprint(await insideUnit(unitRoot, relativePath))})))};
}

// A new snapshot is never overwritten. Only the small pointer in state.json
// changes after a successful promotion; a later candidate cannot mutate A.
export async function createVideoAcceptanceSnapshot({unitRoot, report, mixReport}) {
  const relativePath = `AIworkspace/40-video/promoted/${randomUUID()}/acceptance.json`;
  const videoRoot = await insideUnit(unitRoot, "AIworkspace/40-video");
  await fs.mkdir(path.join(videoRoot, "promoted"), {recursive: true});
  await insideUnit(unitRoot, "AIworkspace/40-video/promoted");
  const target = path.join(unitRoot, relativePath);
  await fs.mkdir(path.dirname(target), {recursive: true});
  const content = JSON.stringify({schemaVersion: 1, createdAt: new Date().toISOString(), report, mixReport});
  await fs.writeFile(target, content, {flag: "wx"});
  return {schemaVersion: 1, snapshot: relativePath, sha256: createHash("sha256").update(content).digest("hex")};
}

// This is the single machine acceptance contract used by build, validation,
// promotion and the review page. It is not human or publication approval.
export function evaluateVideoAcceptance({report, mixReport, artifactChecks = [], sourceChecks = [], sourceMode = "candidate", snapshotCheck = false}) {
  const checks = [];
  const add = (name, passed) => checks.push({name, passed: Boolean(passed)});
  const alignment = report?.alignment;
  const storyboard = report?.storyboard;
  const temporal = report?.checks?.temporal;
  const cover = report?.checks?.cover;
  const mix = report?.audio?.mix;
  add("视频报告存在且为候选构建报告", report?.status === "video-candidate-ready");
  if (report?.productionPipelineVersion >= 2) add("当前口播已人工确认", report?.editorial?.passed === true && report?.editorial?.basis === "explicit-user-confirmation");
  else if (report?.productionPipelineVersion >= 1) add("当前独立内容审阅通过（旧版本验收）", report?.editorial?.passed === true);
  const sourceFiles = report?.sourceInputs?.files;
  const sourceManifestValid = report?.sourceInputs?.schemaVersion === 1 && Array.isArray(sourceFiles) && sourceFiles.length > 0 && new Set(sourceFiles.map((item) => item.path)).size === sourceFiles.length && sourceFiles.every((item) => typeof item.path === "string" && !path.isAbsolute(item.path) && !item.path.split(/[\\/]/u).includes("..") && isHash(item.sha256) && item.sizeBytes > 0);
  add("构建上游输入指纹清单完整", sourceManifestValid);
  if (sourceMode === "final") add("成品使用已提升版本的独立验收快照（旧版缺快照不可自动恢复）", snapshotCheck);
  else add("候选绑定当前上游输入，修改后必须重新构建", sourceManifestValid && sourceChecks.length === sourceFiles.length && sourceChecks.every((item) => item.passed === true));
  add("当前稿音匹配与词级对齐通过", alignment?.passed === true && alignment?.asr?.scriptAudioMatch === true && alignment?.asr?.wordTimestamps === true && alignment?.asr?.manualReviewAnchorsSeconds?.length >= 3);
  add("字幕与确认稿一致且时间轴合法", alignment?.subtitles?.normalizedSubtitleTextEqualsAuthoritativeScript === true && alignment?.subtitles?.overlapCount === 0 && alignment?.subtitles?.outOfBoundsCount === 0 && alignment?.policy?.oldTimestampScalingProhibited === true);
  if (report?.directorContract) add("真实音频锚点与可执行动作契约通过", report.directorContract.version === 1 && report.directorContract.passed === true);
  add("当前导演报告及执行绑定通过", storyboard?.schemaVersion === STORYBOARD_REPORT_SCHEMA_VERSION && storyboard?.passed === true && storyboard?.executionPassed === true && storyboard?.metrics?.knowledgeBeatsIdentified > 0 && storyboard?.metrics?.mappedKnowledgeBeats === storyboard?.metrics?.knowledgeBeatsIdentified && storyboard?.metrics?.directorScenes > 0 && storyboard?.metrics?.completeDirectorScenes === storyboard?.metrics?.directorScenes && storyboard?.metrics?.semanticBeats >= 1);
  add("无黑闪和快速强切；静止段交导演复核", temporal?.passed === true && empty(temporal?.blackEvents) && empty(temporal?.rapidFlashPairs) && (empty(temporal?.freezeEvents) || report?.directorContract?.version === 1 && temporal?.freezeReviewRequired === true));
  add("首帧封面尺寸及一致性通过", cover?.passed === true && cover?.firstFrameMatchesCover === true && cover?.firstFrameSsim >= 0.98 && cover?.size?.width === 1080 && cover?.size?.height === 1920);
  add("Remotion 逐帧原生知识动画通过", report?.render?.engine === "remotion" && report?.render?.frameDriven === true && report?.render?.staticLoopClips === false && report?.render?.knowledgeLogicRenderer === "native-remotion" && storyboard?.assetPolicy?.nativeLogicSceneCount >= 1);
  add("未使用平台排版截图", empty(report?.assets?.platformLayoutScreenshots) && storyboard?.assetPolicy?.platformLayoutScreenshotCount === 0);
  const paperSceneCount = report?.visual?.paperSceneCount;
  if (report?.visual?.policyVersion >= 2) add("已移除纸片组件且无装饰纹理资产", paperSceneCount === 0 && report?.assets?.paperCollage?.length === 0);
  const paperAssets = report?.assets?.paperCollage;
  add("所选视觉组件检查通过（不限定装饰风格）", report?.visual?.passed === true && Number.isInteger(paperSceneCount) && paperSceneCount >= 0);
  add("选用纸条时资产来源及指纹完整", Array.isArray(paperAssets) && (paperSceneCount === 0 || paperAssets.length === 9) && paperAssets.every((item) => isHash(item.sha256) && item.source === "bundled-skill:sw-paper-collage-v1"));
  add("固定 SW 品牌 BGM 及实际混音通过", report?.assets?.brandBgm?.assetId === SW_BRAND_BGM.assetId && report?.assets?.brandBgm?.sha256 === SW_BRAND_BGM.sha256 && report?.assets?.brandBgm?.path === SW_BRAND_BGM.workspacePath && mix?.status === "passed" && mix?.required === true && mix?.substitutionAllowed === false && mix?.brandBgm?.assetId === SW_BRAND_BGM.assetId && mix?.brandBgm?.sha256 === SW_BRAND_BGM.sha256 && isHash(mix?.finalMix?.sha256) && Number.isFinite(mix?.brandBgm?.window?.startSeconds) && mix?.brandBgm?.window?.durationSeconds > 0 && mixReport?.status === "passed" && JSON.stringify(mixReport) === JSON.stringify(mix));
  const streams = report?.probe?.streams || [];
  const videoStream = streams.find((stream) => stream.codec_type === "video");
  const audioStream = streams.find((stream) => stream.codec_type === "audio");
  const [numerator, denominator = "1"] = String(videoStream?.r_frame_rate || "0").split("/");
  add("成片探测为 1080×1920 30fps H.264/AAC", videoStream?.width === 1080 && videoStream?.height === 1920 && Number(numerator) / Number(denominator) === 30 && videoStream?.codec_name === "h264" && audioStream?.codec_name === "aac" && Number(report?.probe?.format?.duration) > 0);
  add("公开文字与镜头字幕时长检查通过", empty(report?.checks?.forbiddenHits) && empty(report?.checks?.sceneDurationViolations) && empty(report?.checks?.subtitleDurationViolations));
  add("字幕切换不重置整帧转场", report?.checks?.transitionPolicy === "画面只在语义镜头边界切换；字幕层独立更新，不重置主画面动画");
  for (const [key, file] of Object.entries(VIDEO_FINAL_FILES)) {
    const expected = report?.artifacts?.[key];
    const actual = artifactChecks.find((item) => item.key === key);
    add(`${file} 存在且绑定当前成品指纹`, expected?.file === file && isHash(expected?.sha256) && expected?.sizeBytes > 0 && actual?.passed === true && actual?.sha256 === expected.sha256 && actual?.sizeBytes === expected.sizeBytes);
  }
  const reasons = checks.filter((check) => !check.passed).map((check) => check.name);
  return {ready: reasons.length === 0, passed: reasons.length === 0, reasons, checks};
}

export async function inspectVideoAcceptance({artifactDir, unitRoot = inferUnitRoot(artifactDir), sourceMode = path.basename(path.resolve(artifactDir)) === "短视频" ? "final" : "candidate", reportPath = path.join(artifactDir, "video-report.json"), mixReportPath = path.join(artifactDir, "mix-report.json")}) {
  const readReport = async (file) => { try { return JSON.parse(await fs.readFile(file, "utf8")); } catch { return null; } };
  let report, mixReport, snapshotCheck = false, snapshot = null;
  if (sourceMode === "final") {
    try {
      const state = await readReport(await insideUnit(unitRoot, "AIworkspace/state.json"));
      const pointer = state?.videoFinalAcceptance;
      if (pointer?.schemaVersion !== 1 || !isHash(pointer.sha256) || !/^AIworkspace\/40-video\/promoted\/[^/]+\/acceptance\.json$/u.test(pointer.snapshot)) throw new Error("缺少稳定成品验收指针");
      const target = await insideUnit(unitRoot, pointer.snapshot);
      const content = await fs.readFile(target);
      if (createHash("sha256").update(content).digest("hex") !== pointer.sha256) throw new Error("成品验收快照指纹失效");
      const saved = JSON.parse(content);
      if (saved.schemaVersion !== 1) throw new Error("成品验收快照版本失效");
      ({report, mixReport} = saved); snapshotCheck = true; snapshot = pointer;
    } catch { report = null; mixReport = null; }
  } else {
    const readInside = async (file) => { try { return await readReport(await insideUnit(unitRoot, path.relative(unitRoot, file))); } catch { return null; } };
    [report, mixReport] = await Promise.all([readInside(reportPath), readInside(mixReportPath)]);
  }
  const sourceChecks = sourceMode === "candidate" && Array.isArray(report?.sourceInputs?.files)
    ? await Promise.all(report.sourceInputs.files.map(async (item) => {
      try {
        const actual = await fingerprint(await insideUnit(unitRoot, item.path));
        return {path: item.path, passed: actual.sha256 === item.sha256 && actual.sizeBytes === item.sizeBytes};
      } catch (error) { return {path: item.path, passed: false, error: error.message}; }
    })) : [];
  const artifactChecks = await Promise.all(Object.entries(VIDEO_FINAL_FILES).map(async ([key, file]) => {
    try {
      const target = await insideUnit(unitRoot, path.relative(unitRoot, path.join(artifactDir, file)));
      const actual = await fingerprint(target);
      if (key === "cover") {
        const size = pngSize(await fs.readFile(target));
        if (size.width !== 1080 || size.height !== 1920) throw new Error("封面实际尺寸不是 1080×1920");
      }
      return {key, file, ...actual, passed: true};
    } catch (error) { return {key, file, passed: false, error: error.message}; }
  }));
  return {...evaluateVideoAcceptance({report, mixReport, artifactChecks, sourceChecks, sourceMode, snapshotCheck}), report, mixReport, artifactChecks, sourceChecks, sourceMode, snapshot};
}

export function serializeSubtitles(subtitles) {
  const timecode = (seconds) => {
    const ms = Math.round(seconds * 1000);
    return `${String(Math.floor(ms / 3600000)).padStart(2, "0")}:${String(Math.floor(ms / 60000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
  };
  return subtitles.map((item, index) => `${index + 1}\n${timecode(item.start)} --> ${timecode(item.end)}\n${item.text}\n`).join("\n");
}
