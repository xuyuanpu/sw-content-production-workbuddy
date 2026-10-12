import fs from "node:fs/promises";
import path from "node:path";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {exists, readJson, sha256} from "./lib.mjs";

const run = promisify(execFile);

export function normalizeSpeechText(value) {
  return [...String(value || "").normalize("NFKC")]
    .filter((character) => /[\p{Script=Han}\p{Letter}\p{Number}]/u.test(character))
    .join("")
    .toLowerCase();
}

export function textSimilarity(left, right) {
  const a = [...normalizeSpeechText(left)];
  const b = [...normalizeSpeechText(right)];
  if (!a.length && !b.length) return 1;
  if (!a.length || !b.length) return 0;
  let previous = Array.from({length: b.length + 1}, (_, index) => index);
  for (let row = 1; row <= a.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= b.length; column += 1) {
      const cost = a[row - 1] === b[column - 1] ? 0 : 1;
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + cost,
      );
    }
    previous = current;
  }
  return 1 - previous[b.length] / Math.max(a.length, b.length);
}

export function subtitleFingerprint(subtitles) {
  const canonical = (Array.isArray(subtitles) ? subtitles : []).map((item) => ({
    start: Number(item.start), end: Number(item.end), text: String(item.text || ""),
  }));
  return sha256(Buffer.from(JSON.stringify(canonical)));
}

export function inspectSubtitleTimeline(subtitles, audioDuration, authoritativeScript, minimumDuration = 1.2) {
  const cues = Array.isArray(subtitles) ? subtitles : [];
  const invalidCues = [];
  const overlaps = [];
  const outOfBounds = [];
  for (let index = 0; index < cues.length; index += 1) {
    const cue = cues[index];
    const start = Number(cue.start);
    const end = Number(cue.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || !String(cue.text || "").trim()) invalidCues.push(index + 1);
    if (start < -0.001 || end > audioDuration + 0.08) outOfBounds.push(index + 1);
    if (index > 0 && Number(cues[index - 1].end) > start + 0.001) overlaps.push([index, index + 1]);
  }
  const durations = cues.map((cue) => Number(cue.end) - Number(cue.start)).filter(Number.isFinite);
  const subtitleText = cues.map((cue) => cue.text).join("");
  return {
    cueCount: cues.length,
    cuesSha256: subtitleFingerprint(cues),
    minimumCueDurationSeconds: durations.length ? Math.min(...durations) : 0,
    lastCueEndSeconds: cues.length ? Number(cues.at(-1).end) : 0,
    audioDurationSeconds: audioDuration,
    overlapCount: overlaps.length,
    overlaps,
    outOfBoundsCount: outOfBounds.length,
    outOfBounds,
    invalidCueCount: invalidCues.length,
    invalidCues,
    normalizedSubtitleTextEqualsAuthoritativeScript: normalizeSpeechText(subtitleText) === normalizeSpeechText(authoritativeScript),
    minimumDurationPassed: durations.length > 0 && durations.every((duration) => duration + 0.001 >= minimumDuration),
  };
}

export async function probeAudio(file) {
  const result = await run("ffprobe", [
    "-v", "error", "-show_entries", "format=duration,size,bit_rate:stream=codec_name,codec_type,sample_rate,channels",
    "-of", "json", file,
  ], {maxBuffer: 20 * 1024 * 1024});
  const probe = JSON.parse(result.stdout);
  return {probe, durationSeconds: Number(probe.format?.duration || 0)};
}

export function extractEvidenceTranscript(evidence) {
  if (typeof evidence?.transcript === "string") return evidence.transcript;
  if (Array.isArray(evidence?.segments)) return evidence.segments.map((segment) => segment.text || "").join("");
  return "";
}

export function hasWordTimestamps(evidence) {
  if (evidence?.wordTimestamps === true) return true;
  return Array.isArray(evidence?.segments) && evidence.segments.some((segment) => Array.isArray(segment.words) && segment.words.length > 0);
}

export async function verifyAlignmentReport({reportPath, audioPath, scriptPath, subtitles, duration}) {
  const checks = [];
  const add = (name, passed, detail = null) => checks.push({name, passed: Boolean(passed), detail});
  add("alignment report exists", await exists(reportPath), reportPath);
  add("authoritative script exists", await exists(scriptPath), scriptPath);
  if (!checks.every((check) => check.passed)) return {passed: false, checks};
  const [report, audioBuffer, scriptText] = await Promise.all([
    readJson(reportPath), fs.readFile(audioPath), fs.readFile(scriptPath, "utf8"),
  ]);
  const audioHash = sha256(audioBuffer);
  const scriptHash = sha256(Buffer.from(scriptText));
  const cueHash = subtitleFingerprint(subtitles);
  add("alignment report passed", report.passed === true, report.status);
  add("alignment uses current working audio", report.audio?.workingSha256 === audioHash, {stored: report.audio?.workingSha256, current: audioHash});
  add("alignment uses current authoritative script", report.script?.sha256 === scriptHash, {stored: report.script?.sha256, current: scriptHash});
  add("alignment uses current subtitle cues", report.subtitles?.cuesSha256 === cueHash, {stored: report.subtitles?.cuesSha256, current: cueHash});
  add("alignment uses factual timing evidence", report.asr?.wordTimestamps === true, report.asr);
  add("script and audio match threshold", report.asr?.scriptAudioMatch === true, report.asr?.similarity);
  add("subtitle text equals authoritative script", report.subtitles?.normalizedSubtitleTextEqualsAuthoritativeScript === true);
  add("subtitle timeline has no overlaps", report.subtitles?.overlapCount === 0, report.subtitles?.overlaps);
  add("subtitle timeline is within audio", report.subtitles?.outOfBoundsCount === 0, report.subtitles?.outOfBounds);
  add("alignment duration matches current render", Math.abs(Number(report.audio?.workingDurationSeconds) - Number(duration)) <= 0.08, {alignment: report.audio?.workingDurationSeconds, render: duration});
  add("old timestamp scaling is prohibited", report.policy?.oldTimestampScalingProhibited === true);
  return {passed: checks.every((check) => check.passed), checks, report};
}

export async function resolveInside(root, value, label) {
  const target = path.resolve(root, value);
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`${label} 必须位于当前视频工作区内`);
  return target;
}
