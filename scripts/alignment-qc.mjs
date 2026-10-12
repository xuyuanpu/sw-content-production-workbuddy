import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {
  extractEvidenceTranscript, hasWordTimestamps, inspectSubtitleTimeline,
  normalizeSpeechText, probeAudio, textSimilarity,
} from "./alignment-lib.mjs";
import {exists, parseArgs, readJson, sha256, writeJson} from "./lib.mjs";

export async function buildAlignmentReport({audio, script, scenes, evidence, report, sourceAudio = null, transformReport = null, minimumSimilarity = 0.88}) {
  for (const [label, file] of Object.entries({audio, script, scenes, evidence})) {
    if (!file || !await exists(file)) throw new Error(`${label} 文件不存在: ${file}`);
  }
  const [audioBuffer, scriptText, sceneData, evidenceData, audioProbe] = await Promise.all([
    fs.readFile(audio), fs.readFile(script, "utf8"), readJson(scenes), readJson(evidence), probeAudio(audio),
  ]);
  const audioHash = sha256(audioBuffer);
  if (transformReport && !sourceAudio) throw new Error("提供音频变速报告时必须同时提供不可变原始音频 --source-audio");
  const transcript = extractEvidenceTranscript(evidenceData);
  const similarity = textSimilarity(transcript, scriptText);
  const wordTimestamps = hasWordTimestamps(evidenceData);
  const manualReviewAnchors = Array.isArray(evidenceData.manualReviewAnchorsSeconds) ? evidenceData.manualReviewAnchorsSeconds : [];
  const subtitles = Array.isArray(sceneData.subtitles) ? sceneData.subtitles : [];
  const minimumCueDuration = Number(sceneData.video?.minimumSubtitleDuration || 1.2);
  const timeline = inspectSubtitleTimeline(subtitles, audioProbe.durationSeconds, scriptText, minimumCueDuration);
  const checks = [];
  const add = (name, passed, detail = null) => checks.push({name, passed: Boolean(passed), detail});
  add("audio duration is valid", audioProbe.durationSeconds > 0, audioProbe.durationSeconds);
  add("ASR transcript is non-empty", normalizeSpeechText(transcript).length > 0);
  add("word-level timestamps are present", wordTimestamps, evidenceData.engine);
  add("ASR evidence uses current audio hash", evidenceData.audioSha256 === audioHash, {stored: evidenceData.audioSha256, current: audioHash});
  add("actual audio matches authoritative script", similarity >= minimumSimilarity, {similarity, minimumSimilarity});
  add("manual anchor review has at least three points", manualReviewAnchors.length >= 3, manualReviewAnchors);
  add("subtitle text exactly matches authoritative script", timeline.normalizedSubtitleTextEqualsAuthoritativeScript);
  add("subtitle cues are structurally valid", timeline.invalidCueCount === 0, timeline.invalidCues);
  add("subtitle cues meet minimum duration", timeline.minimumDurationPassed, timeline.minimumCueDurationSeconds);
  add("subtitle cues do not overlap", timeline.overlapCount === 0, timeline.overlaps);
  add("subtitle cues stay inside audio", timeline.outOfBoundsCount === 0, timeline.outOfBounds);

  let transform = null;
  if (transformReport) {
    if (!await exists(transformReport)) throw new Error(`音频变速报告不存在: ${transformReport}`);
    transform = await readJson(transformReport);
    add("audio transform report passed", transform.passed === true, transform);
    add("transform output is current working audio", transform.output?.sha256 === audioHash, {stored: transform.output?.sha256, current: audioHash});
  }
  let source = null;
  if (sourceAudio) {
    const sourceBuffer = await fs.readFile(sourceAudio);
    const sourceProbe = await probeAudio(sourceAudio);
    source = {path: path.resolve(sourceAudio), sha256: sha256(sourceBuffer), durationSeconds: sourceProbe.durationSeconds};
    if (transform) add("transform input is immutable source audio", transform.input?.sha256 === source.sha256, {stored: transform.input?.sha256, current: source.sha256});
  }

  const payload = {
    schemaVersion: 1,
    status: checks.every((check) => check.passed) ? "passed" : "blocked",
    passed: checks.every((check) => check.passed),
    audio: {
      source,
      workingPath: path.resolve(audio),
      workingSha256: audioHash,
      workingDurationSeconds: audioProbe.durationSeconds,
      transform,
    },
    script: {path: path.resolve(script), sha256: sha256(Buffer.from(scriptText)), normalizedCharacters: normalizeSpeechText(scriptText).length},
    asr: {
      engine: evidenceData.engine || "unknown",
      model: evidenceData.model || "unknown",
      wordTimestamps,
      transcript,
      similarity,
      minimumSimilarity,
      scriptAudioMatch: similarity >= minimumSimilarity,
      manualReviewAnchorsSeconds: manualReviewAnchors,
      role: "ASR 只提供事实时间锚点；确认稿提供专业术语与公开字幕正字",
    },
    subtitles: timeline,
    policy: {
      derivedAudioIsSoleTimeline: true,
      oldTimestampScalingProhibited: true,
      sceneScheduleMustBeRebuiltAfterAudioChange: true,
    },
    checks,
    generatedAt: new Date().toISOString(),
  };
  await writeJson(report, payload);
  return payload;
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const args = parseArgs();
  if (!args.audio || !args.script || !args.scenes || !args.evidence) {
    console.error("用法: node alignment-qc.mjs --audio <工作音频> --script <final-voiceover.md> --scenes <scenes.json> --evidence <ASR证据.json> [--source-audio <原始音频>] [--transform-report <audio-transform-report.json>] [--report <alignment-report.json>]");
    process.exit(2);
  }
  const output = path.resolve(args.report || path.join(path.dirname(path.resolve(args.scenes)), "alignment-report.json"));
  const result = await buildAlignmentReport({
    audio: path.resolve(args.audio), script: path.resolve(args.script), scenes: path.resolve(args.scenes), evidence: path.resolve(args.evidence), report: output,
    sourceAudio: args["source-audio"] ? path.resolve(args["source-audio"]) : null,
    transformReport: args["transform-report"] ? path.resolve(args["transform-report"]) : null,
    minimumSimilarity: Number(args["minimum-similarity"] || 0.88),
  });
  console.log(JSON.stringify({report: output, passed: result.passed, similarity: result.asr.similarity, cues: result.subtitles.cueCount}, null, 2));
  if (!result.passed) process.exitCode = 1;
}
