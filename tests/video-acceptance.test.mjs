import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {fileURLToPath} from "node:url";
import {SW_BRAND_BGM} from "../scripts/bgm-policy-lib.mjs";
import {STORYBOARD_REPORT_SCHEMA_VERSION} from "../scripts/storyboard-lib.mjs";
import {VIDEO_FINAL_FILES, evaluateVideoAcceptance, fingerprintVideoArtifacts, fingerprintVideoSourceInputs, inspectVideoAcceptance, serializeSubtitles} from "../scripts/video-acceptance-lib.mjs";

const run = promisify(execFile);
const scriptDir = fileURLToPath(new URL("../scripts/", import.meta.url));
const digest = "a".repeat(64);
function goodReport() {
  const mix = {status: "passed", required: true, substitutionAllowed: false, brandBgm: {assetId: SW_BRAND_BGM.assetId, sha256: SW_BRAND_BGM.sha256, window: {startSeconds: 60, durationSeconds: 60}}, finalMix: {sha256: digest}};
  return {
    status: "video-candidate-ready",
    alignment: {passed: true, asr: {scriptAudioMatch: true, wordTimestamps: true, manualReviewAnchorsSeconds: [0, 30, 59]}, subtitles: {normalizedSubtitleTextEqualsAuthoritativeScript: true, overlapCount: 0, outOfBoundsCount: 0}, policy: {oldTimestampScalingProhibited: true}},
    storyboard: {schemaVersion: STORYBOARD_REPORT_SCHEMA_VERSION, executionPassed: true, passed: true, metrics: {knowledgeBeatsIdentified: 3, mappedKnowledgeBeats: 3, directorScenes: 4, completeDirectorScenes: 4, semanticBeats: 4}, assetPolicy: {nativeLogicSceneCount: 2, platformLayoutScreenshotCount: 0}},
    checks: {temporal: {passed: true, blackEvents: [], rapidFlashPairs: [], freezeEvents: []}, cover: {passed: true, firstFrameMatchesCover: true, firstFrameSsim: 0.99, size: {width: 1080, height: 1920}}, forbiddenHits: [], sceneDurationViolations: [], subtitleDurationViolations: [], transitionPolicy: "画面只在语义镜头边界切换；字幕层独立更新，不重置主画面动画"},
    render: {engine: "remotion", frameDriven: true, staticLoopClips: false, knowledgeLogicRenderer: "native-remotion"},
    visual: {style: "paper-collage", passed: true, requiredSceneCount: 3, paperSceneCount: 3},
    assets: {platformLayoutScreenshots: [], paperCollage: Array.from({length: 9}, () => ({sha256: digest, source: "bundled-skill:sw-paper-collage-v1"})), brandBgm: {assetId: SW_BRAND_BGM.assetId, sha256: SW_BRAND_BGM.sha256, path: SW_BRAND_BGM.workspacePath}},
    audio: {mix},
    probe: {format: {duration: "60"}, streams: [{codec_type: "video", codec_name: "h264", width: 1080, height: 1920, r_frame_rate: "30/1"}, {codec_type: "audio", codec_name: "aac"}]},
    artifacts: Object.fromEntries(Object.entries(VIDEO_FINAL_FILES).map(([key, file]) => [key, {file, sha256: digest, sizeBytes: 10}])),
    sourceInputs: {schemaVersion: 1, files: [{path: "AIworkspace/40-video/current/scenes.json", sha256: digest, sizeBytes: 10}, {path: "AIworkspace/40-video/current/final-voiceover.md", sha256: digest, sizeBytes: 10}]},
  };
}
function evaluate(report = goodReport()) {
  return evaluateVideoAcceptance({report, mixReport: report.audio.mix, artifactChecks: Object.entries(report.artifacts || {}).map(([key, item]) => ({key, ...item, passed: true})), sourceChecks: report.sourceInputs?.files?.map((item) => ({path: item.path, passed: true})) || []});
}
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sw-video-acceptance-"));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  const artifactDir = path.join(root, "AIworkspace", "40-video", "current", "output");
  await fs.mkdir(artifactDir, {recursive: true});
  for (const file of Object.values(VIDEO_FINAL_FILES)) await fs.writeFile(path.join(artifactDir, file), "test fixture, not production media\n");
  const png = Buffer.alloc(24); png.write("PNG", 1); png.writeUInt32BE(1080, 16); png.writeUInt32BE(1920, 20);
  await fs.writeFile(path.join(artifactDir, VIDEO_FINAL_FILES.cover), png);
  const report = goodReport(); report.artifacts = await fingerprintVideoArtifacts(artifactDir);
  const sourceFiles = report.sourceInputs.files.map((item) => path.join(root, item.path));
  for (const file of sourceFiles) await fs.writeFile(file, "original source A\n");
  report.sourceInputs = await fingerprintVideoSourceInputs({unitRoot: root, files: sourceFiles});
  const save = async () => {
    await fs.writeFile(path.join(artifactDir, "video-report.json"), JSON.stringify(report));
    await fs.writeFile(path.join(artifactDir, "mix-report.json"), JSON.stringify(report.audio.mix));
  };
  await save();
  return {root, artifactDir, report, save, sourceFiles};
}

test("complete current video contract passes", () => assert.equal(evaluate().ready, true));
test("non-paper candidate passes without textures while optional paper assets remain checked", () => {
  const report = goodReport();
  report.visual = {style: "content-driven", passed: true, requiredSceneCount: 0, paperSceneCount: 0};
  report.assets.paperCollage = [];
  assert.equal(evaluate(report).ready, true);
  report.storyboard.assetPolicy.nativeLogicSceneCount = 0;
  assert.equal(evaluate(report).ready, false);
  report.storyboard.assetPolicy.nativeLogicSceneCount = 2;
  report.visual.paperSceneCount = 1;
  assert.equal(evaluate(report).ready, false);
});
test("missing BGM, failed timing, stale storyboard and incomplete execution fail closed", () => {
  for (const change of [r => delete r.assets.brandBgm, r => r.checks.temporal.passed = false, r => r.checks.temporal.blackEvents.push({start: 1}), r => delete r.storyboard.schemaVersion, r => r.storyboard.executionPassed = false, r => r.alignment.passed = false, r => r.visual.passed = false, r => delete r.artifacts]) {
    const report = goodReport(); change(report); assert.equal(evaluate(report).ready, false);
  }
});
test("builder preserves storyboard report schema and execution contract", async () => {
  const source = await fs.readFile(path.join(scriptDir, "build-video.mjs"), "utf8");
  const projection = source.slice(source.indexOf("  storyboard: {"), source.indexOf("  probe: JSON.parse(probe.stdout),")).trim().replace(/,$/u, "");
  const original = goodReport();
  const projected = vm.runInNewContext(`({${projection}})`, {storyboardAnalysis: original.storyboard, storedStoryboardReport: original.storyboard, storyboardPaths: {report: "storyboard-report.json"}});
  original.storyboard = projected.storyboard;
  assert.equal(evaluate(original).ready, true);
});
test("current files pass but replacing MP4, cover or SRT invalidates old reports", async (t) => {
  const {artifactDir} = await fixture(t);
  assert.equal((await inspectVideoAcceptance({artifactDir})).ready, true);
  for (const key of ["finalVideo", "cover", "subtitles"]) {
    const file = path.join(artifactDir, VIDEO_FINAL_FILES[key]);
    const original = await fs.readFile(file);
    await fs.writeFile(file, Buffer.concat([original, Buffer.from("changed")]));
    const result = await inspectVideoAcceptance({artifactDir});
    assert.equal(result.ready, false);
    assert.ok(result.reasons.some((reason) => reason.startsWith(VIDEO_FINAL_FILES[key])));
    await fs.writeFile(file, original);
  }
  await fs.unlink(path.join(artifactDir, VIDEO_FINAL_FILES.finalVideo));
  assert.equal((await inspectVideoAcceptance({artifactDir})).ready, false);
});
test("failed preflight preserves existing finals and never creates an archive", async (t) => {
  const {root, report, save} = await fixture(t);
  const finalDir = path.join(root, "短视频"); await fs.mkdir(finalDir);
  await fs.writeFile(path.join(finalDir, "keep.txt"), "original");
  report.checks.temporal.passed = false; await save();
  await assert.rejects(run(process.execPath, [path.join(scriptDir, "promote.mjs"), "--unit", root, "--platform", "video", "--confirm", "YES"]));
  assert.equal(await fs.readFile(path.join(finalDir, "keep.txt"), "utf8"), "original");
  await assert.rejects(fs.access(path.join(root, "AIworkspace", "90-archive")));
  report.checks.temporal.passed = true; await save();
  await assert.rejects(run(process.execPath, [path.join(scriptDir, "promote.mjs"), "--unit", root, "--platform", "video,unknown", "--confirm", "YES"]));
  assert.equal(await fs.readFile(path.join(finalDir, "keep.txt"), "utf8"), "original");
});
test("promotion copies only final payload and final review checks actual final hashes", async (t) => {
  const {root, artifactDir} = await fixture(t);
  const finalDir = path.join(root, "短视频"); await fs.mkdir(finalDir);
  await fs.writeFile(path.join(finalDir, "old.txt"), "archive me");
  await fs.writeFile(path.join(artifactDir, "debug.log"), "must remain internal");
  await run(process.execPath, [path.join(scriptDir, "promote.mjs"), "--unit", root, "--platform", "video", "--confirm", "YES"]);
  assert.deepEqual((await fs.readdir(finalDir)).sort(), Object.values(VIDEO_FINAL_FILES).sort());
  const args = {artifactDir: finalDir, reportPath: path.join(artifactDir, "video-report.json"), mixReportPath: path.join(artifactDir, "mix-report.json")};
  assert.equal((await inspectVideoAcceptance(args)).ready, true);
  await fs.appendFile(path.join(finalDir, VIDEO_FINAL_FILES.finalVideo), "changed final");
  assert.equal((await inspectVideoAcceptance(args)).ready, false);
});
test("review UI and persisted video readiness share missing-BGM rejection", async () => {
  const source = await fs.readFile(path.join(scriptDir, "build-final-review.mjs"), "utf8");
  const report = goodReport(); delete report.assets.brandBgm;
  const acceptance = evaluate(report);
  const nodes = new Map();
  const document = {querySelector: selector => { if (!nodes.has(selector)) nodes.set(selector, {classList: {toggle() {}}, style: {}}); return nodes.get(selector); }};
  vm.runInNewContext(source.split("\n").find(line => line.startsWith("(function(){const player=")), {document, data: {video: {...acceptance, report, subtitles: "test"}}});
  assert.equal(nodes.get("#video-badge").textContent, "未通过");
  const predicate = source.split("\n").find(line => line.startsWith("const videoBehavior ="));
  assert.equal(vm.runInNewContext(`${predicate} videoBehavior`, {video: {}, metrics: {video: acceptance}}), false);
});
test("SRT derives directly from current aligned subtitle entries", () => {
  assert.equal(serializeSubtitles([{start: 0, end: 1.25, text: "当前确认字幕"}]), "1\n00:00:00,000 --> 00:00:01,250\n当前确认字幕\n");
});

test("changing current upstream invalidates candidate and promotion without touching final A", async (t) => {
  const {root, artifactDir, sourceFiles} = await fixture(t);
  const promote = () => run(process.execPath, [path.join(scriptDir, "promote.mjs"), "--unit", root, "--platform", "video", "--confirm", "YES"]);
  await promote();
  const finalDir = path.join(root, "短视频");
  const stateBefore = await fs.readFile(path.join(root, "AIworkspace/state.json"), "utf8");
  for (const file of sourceFiles) {
    const original = await fs.readFile(file);
    await fs.appendFile(file, "changed B\n");
    const candidate = await inspectVideoAcceptance({artifactDir});
    assert.equal(candidate.ready, false);
    assert.ok(candidate.reasons.some((reason) => reason.includes("当前上游")));
    await assert.rejects(promote());
    assert.equal(await fs.readFile(path.join(root, "AIworkspace/state.json"), "utf8"), stateBefore);
    assert.equal((await inspectVideoAcceptance({artifactDir: finalDir})).ready, true);
    await fs.writeFile(file, original);
  }
});

test("final A selects its stable snapshot when current candidate B replaces every output and report", async (t) => {
  const {root, artifactDir, report, save, sourceFiles} = await fixture(t);
  await run(process.execPath, [path.join(scriptDir, "promote.mjs"), "--unit", root, "--platform", "video", "--confirm", "YES"]);
  const finalDir = path.join(root, "短视频");
  const pointer = JSON.parse(await fs.readFile(path.join(root, "AIworkspace/state.json"))).videoFinalAcceptance;
  const snapshotBefore = await fs.readFile(path.join(root, pointer.snapshot));
  for (const file of sourceFiles) await fs.appendFile(file, "source B\n");
  for (const file of Object.values(VIDEO_FINAL_FILES)) await fs.appendFile(path.join(artifactDir, file), "candidate B\n");
  report.artifacts = await fingerprintVideoArtifacts(artifactDir);
  report.sourceInputs = await fingerprintVideoSourceInputs({unitRoot: root, files: sourceFiles});
  await save();
  assert.equal((await inspectVideoAcceptance({artifactDir})).ready, true);
  assert.equal((await inspectVideoAcceptance({artifactDir: finalDir, reportPath: path.join(artifactDir, "video-report.json"), mixReportPath: path.join(artifactDir, "mix-report.json")})).ready, true);
  assert.deepEqual(await fs.readFile(path.join(root, pointer.snapshot)), snapshotBefore);
  await fs.appendFile(path.join(root, pointer.snapshot), "tampered");
  assert.equal((await inspectVideoAcceptance({artifactDir: finalDir})).ready, false);
});

test("legacy missing source fingerprints or final snapshot fails without fabricating recovery", async (t) => {
  const {root, artifactDir, report, save} = await fixture(t);
  delete report.sourceInputs; await save();
  assert.equal((await inspectVideoAcceptance({artifactDir})).ready, false);
  const finalDir = path.join(root, "短视频"); await fs.mkdir(finalDir);
  for (const file of Object.values(VIDEO_FINAL_FILES)) await fs.copyFile(path.join(artifactDir, file), path.join(finalDir, file));
  const result = await inspectVideoAcceptance({artifactDir: finalDir, reportPath: path.join(artifactDir, "video-report.json")});
  assert.equal(result.ready, false);
  assert.ok(result.reasons.some((reason) => reason.includes("缺快照不可自动恢复")));
});

test("source input paths and symlinks cannot escape the current unit", async (t) => {
  const {root, artifactDir, report, save} = await fixture(t);
  report.sourceInputs.files[0].path = "../outside.txt"; await save();
  assert.equal((await inspectVideoAcceptance({artifactDir})).ready, false);
  const link = path.join(root, "AIworkspace/40-video/current/outside-link");
  await fs.symlink(scriptDir, link);
  await assert.rejects(fingerprintVideoSourceInputs({unitRoot: root, files: [path.join(link, "video-acceptance-lib.mjs")]}), /越过当前内容单元/u);
});

test("final review does not infer a promoted video from candidate B report alone", async () => {
  const source = await fs.readFile(path.join(scriptDir, "build-final-review.mjs"), "utf8");
  const condition = source.split("\n").find((line) => line.startsWith("if (requested.includes(\"video\") && (await exists(videoFile) ||"));
  const expression = condition.slice(4, -3);
  const result = await vm.runInNewContext(`(async () => (${expression}))()`, {requested:["video"], sourceMode: "final", videoFile: "final.mp4", videoReportPath: "B-report.json", promotionState: {}, paths: {videoFinal: "final-dir"}, exists: async (file) => file === "B-report.json", fs: {readdir: async () => []}});
  assert.equal(result, false);
});

test('a technically rendered new candidate cannot pass editorial acceptance after revise',()=>{
 const r=goodReport();r.productionPipelineVersion=1;r.editorial={passed:false};
 assert.equal(evaluate(r).ready,false);
 assert.ok(evaluate(r).checks.some(c=>c.name.includes('独立内容')&&!c.passed));
 r.editorial.passed=true;assert.equal(evaluate(r).ready,true);
});

test('new pipeline requires user confirmation rather than a legacy editorial pass',()=>{
 const report=goodReport();report.productionPipelineVersion=2;report.editorial={passed:true};
 assert.equal(evaluate(report).ready,false);
 report.editorial.basis='explicit-user-confirmation';assert.equal(evaluate(report).ready,true);
 report.editorial.passed=false;assert.equal(evaluate(report).ready,false);
});
