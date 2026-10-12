import {visualFramePlan, writeVisualReview, writeCandidateVisualReview} from './visual-review-lib.mjs';
import {directorReviewTemplate} from "./director-review-lib.mjs";
import {verifyDirector, deriveShotbook, deriveExplanationMap, deriveTreatment} from "./director-contract-lib.mjs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {bundle} from "@remotion/bundler";
import {renderMedia, renderStill, selectComposition} from "@remotion/renderer";
import {
  compactCount, ensureDir, exists, forbiddenHits, parseArgs,
  platformPaths, pngSize, readJson, sha256, skillRoot, writeJson,
} from "./lib.mjs";
import {probeAudio, resolveInside, verifyAlignmentReport} from "./alignment-lib.mjs";
import {SW_BRAND_BGM, ensureBrandBgm, brandBgmDuckingFilter} from "./bgm-policy-lib.mjs";
import {analyzeVisualPolicy} from "./visual-policy-lib.mjs";
import {requireConfirmedVoiceover} from "./confirmed-voiceover-lib.mjs";
import {analyzeStoryboard, reportMatchesStoryboardInputs} from "./storyboard-lib.mjs";
import {classifyVideoAsset} from "./video-asset-policy-lib.mjs";
import {inspectVideo} from "./video-qc.mjs";
import {fingerprintVideoArtifacts, fingerprintVideoSourceInputs, inspectVideoAcceptance, serializeSubtitles} from "./video-acceptance-lib.mjs";

const run = promisify(execFile);
const args = parseArgs();
if (!args.unit) {
  console.error("用法: node build-video.mjs --unit <内容单元路径> [--workspace <视频工作区>] [--keep-work]");
  process.exit(2);
}

// Explicit runtime overrides preserve reviewed local capabilities; defaults stay reproducible.
const browserExecutable = process.env.SW_REMOTION_BROWSER || undefined;
if (browserExecutable && !await exists(browserExecutable)) throw new Error("SW_REMOTION_BROWSER does not exist");
const renderConcurrency = Number(process.env.SW_RENDER_CONCURRENCY || 2);
if (!Number.isInteger(renderConcurrency) || renderConcurrency < 1 || renderConcurrency > 64) throw new Error("SW_RENDER_CONCURRENCY must be 1..64");
const x264Preset = process.env.SW_X264_PRESET || "medium";

const unit = path.resolve(args.unit);
const defaultVideo = platformPaths(unit).video;
const video = args.workspace ? path.resolve(args.workspace) : defaultVideo;
const relativeWorkspace = path.relative(unit, video);
if (relativeWorkspace.startsWith("..") || path.isAbsolute(relativeWorkspace)) throw new Error("视频工作区必须位于当前内容单元内");
// 把 Remotion 浏览器下载与 webpack 缓存目录钉在 skill 的 node_modules 下，
// 避免渲染副作用在内容单元根目录生成 .remotion / .cache 而破坏「仅四目录」验收约束。
process.chdir(skillRoot);

let confirmedVoiceover;
const chainPath = path.join(video, "knowledge-chain.md");

const scenesPath = path.join(video, "scenes.json");
if (!await exists(scenesPath)) throw new Error(`缺少 scenes.json: ${scenesPath}`);
const data = await readJson(scenesPath);
const {width = 1080, height = 1920, fps = 30, audio, duration} = data.video || {};
if (width !== 1080 || height !== 1920) throw new Error(`SW 视频必须为 1080×1920，当前 ${width}×${height}`);
if (fps !== 30) throw new Error(`SW 视频必须为 30 fps，当前 ${fps}`);
if (!Number.isFinite(duration) || duration <= 0) throw new Error("scenes.json 缺少有效 video.duration");
const brandBgm = await ensureBrandBgm({
  skillRoot,
  videoRoot: video,
  configuredPath: data.video?.brandBgm,
  videoDuration: duration,
  requestedStartSeconds: data.video?.brandBgmStartSeconds,
});
const audioPath = await resolveInside(video, audio || "", "工作音频");
if (!audio || !await exists(audioPath)) throw new Error(`缺少用户返回的真实音频: ${audioPath}`);
const audioHash = sha256(await fs.readFile(audioPath));

const scenes = Array.isArray(data.scenes) ? data.scenes : [];
const subtitles = Array.isArray(data.subtitles) ? data.subtitles : [];
if (!scenes.length) throw new Error("scenes.json 至少需要一个镜头");
if (!subtitles.length) throw new Error("scenes.json 至少需要一条字幕");

const authoritativeScriptPath = await resolveInside(video, data.video?.authoritativeScript || "final-voiceover.md", "最终口播稿");
confirmedVoiceover = await requireConfirmedVoiceover(video, authoritativeScriptPath);
const alignmentReportPath = await resolveInside(video, data.video?.alignmentReport || "alignment-report.json", "字幕对齐报告");
const audioProbe = await probeAudio(audioPath);
if (Math.abs(audioProbe.durationSeconds - duration) > 0.08) {
  throw new Error(`scenes.json 时长必须跟随当前工作音频重新建立: ${duration} != ${audioProbe.durationSeconds}`);
}
const alignment = await verifyAlignmentReport({
  reportPath: alignmentReportPath,
  audioPath,
  scriptPath: authoritativeScriptPath,
  subtitles,
  duration,
});
if (!alignment.passed) {
  throw new Error(`字幕对齐硬门失败，禁止渲染: ${JSON.stringify(alignment.checks.filter((check) => !check.passed))}`);
}

const storyboardPaths = {
  treatment: path.join(video, "visual-treatment.md"),
  explanationMap: path.join(video, "visual-explanation-map.md"),
  shotbook: path.join(video, "shotbook.json"),
  report: path.join(video, "storyboard-report.json"),
};
if (!(await Promise.all(Object.values(storyboardPaths).map(exists))).every(Boolean)) {
  throw new Error("缺少 visual-treatment.md、visual-explanation-map.md、shotbook.json 或 storyboard-report.json，禁止跳过视觉解释导演层");
}
const storyboardInputs = {
  chain: await fs.readFile(chainPath, "utf8"),
  treatment: await fs.readFile(storyboardPaths.treatment, "utf8"),
  explanationMap: await fs.readFile(storyboardPaths.explanationMap, "utf8"),
  shotbook: await readJson(storyboardPaths.shotbook),
  scenes: data,
  script: await fs.readFile(authoritativeScriptPath, "utf8"),
};
const timingEvidencePath = await resolveInside(video, data.video.timingEvidence || "", "导演时间证据");
if (!data.video.timingEvidence) throw new Error("先运行 compile-director.mjs：缺少真实音频锚点绑定");
const directorContract = verifyDirector(data, await readJson(timingEvidencePath), audioHash);
if (!directorContract.passed) throw new Error(`导演执行契约失败: ${JSON.stringify(directorContract.errors)}`);
if (JSON.stringify(deriveShotbook(data)) !== JSON.stringify(storyboardInputs.shotbook) || deriveExplanationMap(data) !== storyboardInputs.explanationMap || deriveTreatment(data) !== storyboardInputs.treatment) throw new Error("派生分镜漂移；重新 compile-director，禁止手改 SHOTBOOK 时间表");
const storyboardAnalysis = analyzeStoryboard(storyboardInputs);
const storedStoryboardReport = await readJson(storyboardPaths.report);
if (!storyboardAnalysis.passed || !reportMatchesStoryboardInputs(storedStoryboardReport, storyboardInputs)) {
  throw new Error(`视觉解释与分镜硬门失败或报告过期，禁止渲染: ${JSON.stringify(storyboardAnalysis.checks.filter((check) => !check.passed))}`);
}

const minimumSceneDuration = Number(data.video.minimumSceneDuration || 1.8);
const minimumSubtitleDuration = Number(data.video.minimumSubtitleDuration || 1.2);
const minimumCoverDuration = Number(data.video.minimumCoverDuration || 1.8);
const firstScene = scenes[0];
const coverTitleLines = (Array.isArray(firstScene.titleLines) ? firstScene.titleLines : [firstScene.overlayTitle])
  .map((line) => String(line || "").trim()).filter(Boolean);
const coverTitle = coverTitleLines.join("");
if (firstScene.start !== 0 || firstScene.visual !== "cover") throw new Error("第一镜必须从 0 秒开始且 visual=cover");
if (firstScene.end - firstScene.start < minimumCoverDuration) throw new Error(`封面镜头不得少于 ${minimumCoverDuration}s`);
if (coverTitleLines.length < 1 || coverTitleLines.length > 3 || compactCount(coverTitle) < 4 || compactCount(coverTitle) > 28 || coverTitleLines.some((line) => compactCount(line) > 14)) {
  throw new Error("封面标题必须按语义拆成 1–3 行，每行不超过 14 字，总长 4–28 字");
}

const sceneDurationViolations = scenes.filter((scene) => scene.end - scene.start < minimumSceneDuration).map((scene) => ({id: scene.id, duration: scene.end - scene.start}));
const subtitleDurationViolations = subtitles.filter((subtitle) => subtitle.end - subtitle.start < minimumSubtitleDuration).map((subtitle) => ({text: subtitle.text, duration: subtitle.end - subtitle.start}));
const sceneOrderViolations = scenes.filter((scene, index) => scene.end <= scene.start || (index > 0 && Math.abs(scene.start - scenes[index - 1].end) > 0.02)).map((scene) => scene.id);
if (sceneDurationViolations.length) throw new Error(`镜头过短: ${JSON.stringify(sceneDurationViolations)}`);
if (subtitleDurationViolations.length) throw new Error(`字幕停留过短: ${JSON.stringify(subtitleDurationViolations)}`);
if (sceneOrderViolations.length) throw new Error(`镜头必须无重叠、无空档连续衔接: ${sceneOrderViolations.join(", ")}`);
if (Math.abs(scenes.at(-1).end - duration) > 0.08) throw new Error(`最后一镜应覆盖 video.duration：${scenes.at(-1).end} != ${duration}`);

const visualAnalysis = analyzeVisualPolicy({video: data.video, scenes});
if (!visualAnalysis.passed) {
  throw new Error(`所选视觉组件可读性检查失败: ${JSON.stringify(visualAnalysis.checks.filter((check) => !check.passed))}`);
}

const {componentText, walkComponents} = await import('../assets/templates/video/remotion/component-library.mjs');
const publicText = [
  ...scenes.flatMap(componentText),
  coverTitle,
  ...scenes.flatMap((scene) => [scene.name, scene.overlayTitle, ...(scene.overlayLines || []), scene.deck, scene.supportingText, scene.revealText, scene.oldText, scene.newText, ...(scene.steps || []), ...(scene.nodes || []), ...(scene.can || []), ...(scene.cannot || []), ...(scene.items || []).map((item) => typeof item === "string" ? item : item?.text), ...(scene.paperItems || []).map((item) => item.text), ...(scene.beats || []).flatMap((beat) => [beat.anchor, beat.action, beat.target])]),
  ...subtitles.map((subtitle) => subtitle.text),
].filter(Boolean).join("\n");
const hits = forbiddenHits(publicText);
if (hits.length) throw new Error(`公开候选文字命中个人归属禁用项: ${hits.join(", ")}`);

const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "sw-remotion-work-"));
const publicDir = path.join(workDir, "public");
const stagedAssetDir = path.join(publicDir, "assets");
const bundleDir = path.join(workDir, "bundle");
await fs.rm(workDir, {recursive: true, force: true});
await ensureDir(stagedAssetDir);

function resolveUnitAsset(value) {
  if (!value) return null;
  const candidate = value.startsWith("unit:")
    ? path.resolve(unit, value.slice("unit:".length).replace(/^\/+/, ""))
    : path.resolve(video, value);
  const rel = path.relative(unit, candidate);
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error(`资产超出内容单元，已拒绝: ${value}`);
  return candidate;
}

const assetManifest = [];
async function stageAsset(sourceValue, label, assetRole = "") {
  const source = resolveUnitAsset(sourceValue);
  if (!source || !await exists(source)) throw new Error(`镜头资产缺失 (${label}): ${sourceValue}`);
  const buffer = await fs.readFile(source);
  const digest = sha256(buffer);
  const ext = path.extname(source).toLowerCase() || ".png";
  const stagedName = `${label}-${digest.slice(0, 12)}${ext}`;
  const staged = path.join(stagedAssetDir, stagedName);
  await fs.writeFile(staged, buffer);
  const rel = path.relative(unit, source);
  const platform = rel.includes(`${path.sep}20-xhs${path.sep}`) ? "xhs"
    : rel.includes(`${path.sep}30-wechat${path.sep}`) ? "wechat"
      : rel.includes(`${path.sep}10-shared-assets${path.sep}`) ? "shared" : "video";
  const assetClass = classifyVideoAsset(sourceValue, assetRole);
  assetManifest.push({label, source, sourceRelativeToUnit: rel, staged: `assets/${stagedName}`, sha256: digest, platform, assetRole: assetRole || null, assetClass});
  return `assets/${stagedName}`;
}

const stagedScenes = [];
for (let index = 0; index < scenes.length; index += 1) {
  const scene = structuredClone(scenes[index]);
  for (const {node} of walkComponents(scene)) if (node.type === "image") node.asset = await stageAsset(node.asset, `component-${index}-${node.id}`, node.assetRole);
  if (scene.asset) scene.asset = await stageAsset(scene.asset, `scene-${String(index + 1).padStart(2, "0")}`, scene.assetRole);
  stagedScenes.push(scene);
}
const defaultLogo = path.join(video, "assets", "logo.png");
let logo = null;
if (data.brand?.logo) logo = await stageAsset(data.brand.logo, "brand-logo");
else if (await exists(defaultLogo)) logo = await stageAsset("assets/logo.png", "brand-logo");
const reusedCrossPlatformAssets = assetManifest.filter((item) => ["xhs", "wechat", "shared"].includes(item.platform));
const approvedKnowledgeAssets = assetManifest.filter((item) => ["technical-diagram", "original-evidence", "shared-visual"].includes(item.assetClass));
const platformLayoutScreenshots = assetManifest.filter((item) => item.assetClass === "platform-layout-screenshot");
if (platformLayoutScreenshots.length) throw new Error(`检测到公众号/小红书排版成品截图，禁止进入视频: ${JSON.stringify(platformLayoutScreenshots)}`);

const inputProps = {
  video: {...data.video, width, height, fps, duration},
  brand: {name: data.brand?.name || "SW 编辑部 · MBTI 观察", column: data.brand?.column || "专业编辑解读", logo},
  scenes: stagedScenes,
  subtitles,
};
await writeJson(path.join(workDir, "render-input.json"), inputProps);
await writeJson(path.join(workDir, "asset-manifest.json"), assetManifest);

const outDir = path.join(video, "output");
await ensureDir(outDir);
const silentPath = path.join(workDir, "video-silent.mp4");
const selectedBgmPath = path.join(workDir, "bgm-selected.wav");
const duckedBgmPath = path.join(workDir, "bgm-ducked.wav");
const finalMixPath = path.join(workDir, "final-mix.wav");
const finalPath = path.join(outDir, "video-candidate.mp4");
const coverOutputPath = path.join(outDir, "video-cover.png");
const entryPoint = path.join(skillRoot, "assets", "templates", "video", "remotion", "index.jsx");
// Capture before rendering; the final acceptance rechecks these exact inputs.
const sourceInputs = await fingerprintVideoSourceInputs({unitRoot: unit, files: [
  timingEvidencePath,
  ...confirmedVoiceover.files, chainPath, scenesPath, audioPath,
  authoritativeScriptPath, alignmentReportPath, ...Object.values(storyboardPaths),
  brandBgm.targetPath, ...assetManifest.map((item) => item.source),
]});

console.log(JSON.stringify({status: "remotion-bundle-start", scenes: scenes.length, duration, nativeLogicScenes: storyboardAnalysis.assetPolicy.nativeLogicSceneCount, approvedKnowledgeAssets: approvedKnowledgeAssets.length}));
const serveUrl = await bundle({
  entryPoint, outDir: bundleDir, publicDir, enableCaching: false,
  onProgress: (progress) => {
    if (progress === 100 || Math.round(progress) % 25 === 0) process.stderr.write(`Remotion bundle ${Math.round(progress)}%\n`);
  },
});
const composition = await selectComposition({serveUrl, id: "SWDynamicVideo", inputProps, logLevel: "warn", browserExecutable});
if (composition.width !== width || composition.height !== height || composition.fps !== fps) throw new Error(`Remotion 合成参数漂移: ${composition.width}×${composition.height}@${composition.fps}`);

if (args.proof) {
 const proofDir=path.join(video, 'visual-proof');
 try {
  const proof=await writeVisualReview({outDir:proofDir,kind:'proof',plan:visualFramePlan({scenes,duration,fps,at:args.at}),subtitles,
   timelineSha256:data.directorCompilation.timelineSha256,sourceInputs,
   renderFrame:async(p,target)=>renderStill({composition,serveUrl,output:target,inputProps,frame:p.frame,imageFormat:'jpeg',jpegQuality:85,overwrite:true,logLevel:'warn',browserExecutable})});
  console.log(JSON.stringify({status:'visual-proof-ready',frames:proof.frames.length,output:path.join(proofDir,'index.html'),candidateRendered:false}));
 } finally { if(!args['keep-work'])await fs.rm(workDir,{recursive:true,force:true}); }
 process.exit(0);
}

await renderStill({composition, serveUrl, output: coverOutputPath, inputProps, frame: 0, imageFormat: "png", overwrite: true, logLevel: "warn", browserExecutable});

let lastProgress = -1;
await renderMedia({
  composition, serveUrl, codec: "h264", outputLocation: silentPath, inputProps,
  pixelFormat: "yuv420p", crf: 20, x264Preset,
  overwrite: true, concurrency: renderConcurrency, logLevel: "warn", timeoutInMilliseconds: 120000, browserExecutable,
  onProgress: ({progress}) => {
    const bucket = Math.floor(progress * 10);
    if (bucket !== lastProgress) {
      lastProgress = bucket;
      process.stderr.write(`Remotion render ${Math.min(100, bucket * 10)}%\n`);
    }
  },
});

// 真实返回音频是唯一时长与人声基准，动画层不重新生成 TTS。
// 所有 SW 短视频固定使用随 Skill 交付且经指纹校验的品牌 BGM；不允许无声回退或替换曲目。
const fadeIn = Math.min(SW_BRAND_BGM.fadeInSeconds, duration / 4);
const fadeOut = Math.min(SW_BRAND_BGM.fadeOutSeconds, duration / 4);
const fadeOutStart = Math.max(0, duration - fadeOut);
await run("ffmpeg", [
  "-y", "-stream_loop", "-1", "-ss", String(brandBgm.window.startSeconds), "-i", brandBgm.targetPath,
  "-t", String(duration),
  "-af", `afade=t=in:st=0:d=${fadeIn},afade=t=out:st=${fadeOutStart}:d=${fadeOut}`,
  "-c:a", "pcm_s16le", "-ar", "48000", "-ac", "2", selectedBgmPath,
], {maxBuffer: 20 * 1024 * 1024});
await run("ffmpeg", [
  "-y", "-i", selectedBgmPath, "-i", audioPath,
  "-filter_complex", brandBgmDuckingFilter(),
  "-map", "[ducked]", "-c:a", "pcm_s16le", "-ar", "48000", "-ac", "2", duckedBgmPath,
], {maxBuffer: 20 * 1024 * 1024});
await run("ffmpeg", [
  "-y", "-i", audioPath, "-i", duckedBgmPath,
  "-filter_complex", `[0:a][1:a]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,alimiter=limit=${SW_BRAND_BGM.limiter.limitLinear}:attack=${SW_BRAND_BGM.limiter.attackMs}:release=${SW_BRAND_BGM.limiter.releaseMs}:level=disabled[mix]`,
  "-map", "[mix]", "-c:a", "pcm_s16le", "-ar", "48000", "-ac", "2", finalMixPath,
], {maxBuffer: 20 * 1024 * 1024});
await run("ffmpeg", [
  "-y", "-i", silentPath, "-i", finalMixPath, "-map", "0:v:0", "-map", "1:a:0",
  "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2",
  "-shortest", "-movflags", "+faststart", finalPath,
], {maxBuffer: 20 * 1024 * 1024});

const [selectedBgmBuffer, duckedBgmBuffer, finalMixBuffer] = await Promise.all([
  fs.readFile(selectedBgmPath), fs.readFile(duckedBgmPath), fs.readFile(finalMixPath),
]);
const [selectedBgmProbe, duckedBgmProbe, finalMixProbe] = await Promise.all([
  probeAudio(selectedBgmPath), probeAudio(duckedBgmPath), probeAudio(finalMixPath),
]);
const mixReport = {
  status: "passed",
  required: true,
  substitutionAllowed: false,
  brandBgm: {
    assetId: brandBgm.assetId,
    source: brandBgm.source,
    path: brandBgm.relativePath,
    sha256: brandBgm.sha256,
    sourceName: brandBgm.manifest.sourceName,
    declaredOrigin: brandBgm.manifest.declaredOrigin,
    window: brandBgm.window,
    fadeInSeconds: fadeIn,
    fadeOutSeconds: fadeOut,
    selectedStemSha256: sha256(selectedBgmBuffer),
    selectedStemProbe: selectedBgmProbe,
  },
  voice: {sha256: audioHash, probe: audioProbe},
  ducking: {
    preDuckGainDb: SW_BRAND_BGM.preDuckGainDb,
    postDuckGain: SW_BRAND_BGM.postDuckGain,
    ...SW_BRAND_BGM.sidechain,
    duckedStemSha256: sha256(duckedBgmBuffer),
    duckedStemProbe: duckedBgmProbe,
  },
  finalMix: {
    limiter: SW_BRAND_BGM.limiter,
    sha256: sha256(finalMixBuffer),
    probe: finalMixProbe,
  },
  listeningGate: "BGM 必须在手机外放中可感知且不压人声；机器通过不替代完整人工试听。",
  generatedAt: new Date().toISOString(),
};
await writeJson(path.join(outDir, "mix-report.json"), mixReport);

const coverSize = pngSize(await fs.readFile(coverOutputPath));
if (coverSize.width !== width || coverSize.height !== height) throw new Error(`视频封面尺寸错误: ${coverSize.width}×${coverSize.height}`);
const coverSource = assetManifest.find((item) => item.label === "scene-01");
const coverSourceSize = coverSource && path.extname(coverSource.source).toLowerCase() === ".png" ? pngSize(await fs.readFile(coverSource.source)) : null;
const sourceNotUpscaled = coverSourceSize ? coverSourceSize.width >= 1000 && coverSourceSize.height >= 675 : true;

const decodedFirstFrame = path.join(workDir, "decoded-first-frame.png");
await run("ffmpeg", ["-y", "-i", finalPath, "-frames:v", "1", decodedFirstFrame], {maxBuffer: 20 * 1024 * 1024});
const ssimResult = await run("ffmpeg", ["-i", coverOutputPath, "-i", decodedFirstFrame, "-filter_complex", "[0:v]format=yuv420p[ref];[ref][1:v]ssim", "-f", "null", "-"], {maxBuffer: 20 * 1024 * 1024});
const firstFrameSsim = Number(`${ssimResult.stdout}\n${ssimResult.stderr}`.match(/All:([0-9.]+)/u)?.[1] || 0);
const firstFrameMatchesCover = firstFrameSsim >= 0.98;

const probe = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration,size,bit_rate:stream=codec_name,codec_type,width,height,r_frame_rate,sample_rate,channels", "-of", "json", finalPath], {maxBuffer: 20 * 1024 * 1024});
const temporal = await inspectVideo(finalPath);
await fs.writeFile(path.join(outDir, "subtitles.srt"), serializeSubtitles(subtitles));
await fs.copyFile(authoritativeScriptPath, path.join(outDir, "final-voiceover.md"));
const artifacts = await fingerprintVideoArtifacts(outDir);
const report = {
  productionPipelineVersion: 2,
  editorial: {passed: true, basis: "explicit-user-confirmation", draftHash: confirmedVoiceover.report.fingerprints.draftBody},
  status: "video-candidate-ready",
  output: finalPath,
  artifacts,
  sourceInputs,
  directorContract: {...directorContract, version: 1, timelineSha256: data.directorCompilation.timelineSha256, sceneIds: scenes.map(s => s.id), reviewStatus: "pending-human-review"},
  render: {
    engine: "remotion", remotionVersion: "4.0.516", officialSkillsSource: "https://github.com/remotion-dev/skills",
    officialSkillsCommit: "78834e618218fda87f5c7e4c54b5c55357f74d52", frameDriven: true, staticLoopClips: false, knowledgeLogicRenderer: "native-remotion", template: entryPoint,
  },
  assets: {
    manifest: assetManifest,
    approvedKnowledgeAssets,
    platformLayoutScreenshots,
    reusedCrossPlatformAssets,
    paperCollage: [],
    brandBgm: {assetId: brandBgm.assetId, source: brandBgm.source, path: brandBgm.relativePath, sha256: brandBgm.sha256},
  },
  visual: visualAnalysis,
  audio: {
    source: audioPath, sha256: audioHash, durationSeconds: audioProbe.durationSeconds,
    transform: alignment.report.audio?.transform || null,
    mix: mixReport,
    policy: "当前工作音频是唯一人声时间轴；音频改变后必须重做对齐、字幕、镜头和混音",
  },
  alignment: {
    passed: alignment.passed,
    report: alignmentReportPath,
    script: alignment.report.script,
    asr: {
      engine: alignment.report.asr?.engine,
      model: alignment.report.asr?.model,
      wordTimestamps: alignment.report.asr?.wordTimestamps,
      similarity: alignment.report.asr?.similarity,
      scriptAudioMatch: alignment.report.asr?.scriptAudioMatch,
      manualReviewAnchorsSeconds: alignment.report.asr?.manualReviewAnchorsSeconds,
    },
    subtitles: alignment.report.subtitles,
    policy: alignment.report.policy,
  },
  storyboard: {
    schemaVersion: storedStoryboardReport.schemaVersion,
    executionPassed: storedStoryboardReport.executionPassed,
    passed: storyboardAnalysis.passed,
    report: storyboardPaths.report,
    metrics: storyboardAnalysis.metrics,
    assetPolicy: storyboardAnalysis.assetPolicy,
    sourceMethod: storyboardAnalysis.sourceMethod,
    policy: "先设计并查看真实画面，再以语音锚点驱动所需图像与动画；公众号/小红书排版成品截图不得作为视频素材。",
  },
  probe: JSON.parse(probe.stdout),
  checks: {
    forbiddenHits: hits, subtitles: subtitles.length, scenes: scenes.length,
    minimumSceneDuration, minimumSubtitleDuration, sceneDurationViolations, subtitleDurationViolations,
    cover: {
      passed: firstScene.start === 0 && firstScene.visual === "cover" && sourceNotUpscaled && firstFrameMatchesCover,
      output: coverOutputPath, size: coverSize, source: coverSource, sourceSize: coverSourceSize, sourceNotUpscaled,
      titleLines: coverTitleLines, safeCore: {x: 60, y: 240, width: 880, height: 1440},
      firstFrameSsim, firstFrameMatchesCover,
      policy: "第一帧即正式封面；独立封面由同一 Remotion 首帧导出；关键标题位于中央 3:4 安全核心区",
    },
    transitionPolicy: "画面只在语义镜头边界切换；字幕层独立更新，不重置主画面动画",
    animationPolicy: "SW CameraRig + depth planes + subject lifecycle + speech-anchored semantic beats；useCurrentFrame + interpolate/spring；无 CSS transition/animation；动画只服务于解释",
    temporal,
  },
  generatedAt: new Date().toISOString(),
};
const visualReview=await writeCandidateVisualReview({outDir:path.join(outDir,'visual-review'),videoPath:finalPath,scenes,subtitles,duration,fps,
 timelineSha256:data.directorCompilation.timelineSha256,sourceInputs});
report.visualReview={status:visualReview.status,frames:visualReview.frames.length,page:'visual-review/index.html',report:'visual-review/review.json',videoSha256:visualReview.videoSha256};
await writeJson(path.join(outDir, "video-report.json"), report);
await writeJson(path.join(outDir, "director-review.template.json"), directorReviewTemplate(report));
await writeJson(path.join(outDir, "video-temporal-report.json"), temporal);

if (!report.checks.cover.passed) throw new Error(`视频首帧封面检查失败: ${JSON.stringify(report.checks.cover)}`);
if (!report.visual.passed) throw new Error(`视觉策略检查失败: ${JSON.stringify(report.visual.checks.filter((check) => !check.passed))}`);
if (!temporal.passed) throw new Error(`视频时序检查失败: ${JSON.stringify({blackEvents: temporal.blackEvents, rapidFlashPairs: temporal.rapidFlashPairs, freezeEvents: temporal.freezeEvents})}`);
const acceptance = await inspectVideoAcceptance({artifactDir: outDir, unitRoot: unit, sourceMode: "candidate"});
await writeJson(path.join(outDir, "acceptance-report.json"), acceptance);
// A render can finish while editorial/listening approval is pending. Promotion still checks acceptance.ready.

if (!args["keep-work"]) await fs.rm(workDir, {recursive: true, force: true});
console.log(JSON.stringify({status: acceptance.ready ? "candidate-accepted" : "rendered-awaiting-review", acceptanceReady: acceptance.ready, pending: acceptance.reasons, output: finalPath, cover: coverOutputPath, duration: report.probe.format?.duration, scenes: scenes.length, paperScenes: visualAnalysis.paperSceneCount, nativeLogicScenes: storyboardAnalysis.assetPolicy.nativeLogicSceneCount, approvedKnowledgeAssets: approvedKnowledgeAssets.length, brandBgm: {assetId: brandBgm.assetId, sha256: brandBgm.sha256, startSeconds: brandBgm.window.startSeconds}}, null, 2));
