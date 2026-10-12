import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {inspectSubtitleTimeline, normalizeSpeechText, textSimilarity, verifyAlignmentReport} from "../scripts/alignment-lib.mjs";
import {buildAlignmentReport} from "../scripts/alignment-qc.mjs";
import {atempoFilters} from "../scripts/prepare-audio.mjs";
import {sha256} from "../scripts/lib.mjs";

const run = promisify(execFile);

test("speech normalization joins spaced English letters", () => {
  assert.equal(normalizeSpeechText("M B T I、F I 和 F E"), "mbtifi和fe");
});

test("script-audio mismatch is distinguishable from homophone noise", () => {
  const confirmed = "MBTI 告诉你的不是你表现怎么样，而是你是如何运作的。";
  const asr = "MBTI告诉你的不是你表现怎么样而是你是如何运作的";
  const wrong = "今天我们从天气开始聊团队里的沟通方式";
  assert.ok(textSimilarity(confirmed, asr) >= 0.98);
  assert.ok(textSimilarity(confirmed, wrong) < 0.5);
});

test("subtitle timeline rejects stale or incomplete captions", () => {
  const script = "先别急着找答案先问一句我为什么会这样";
  const valid = inspectSubtitleTimeline([
    {start: 0, end: 1.3, text: "先别急着找答案"},
    {start: 1.4, end: 3.0, text: "先问一句我为什么会这样"},
  ], 3.1, script, 1.2);
  assert.equal(valid.normalizedSubtitleTextEqualsAuthoritativeScript, true);
  assert.equal(valid.overlapCount, 0);
  assert.equal(valid.outOfBoundsCount, 0);
  const stale = inspectSubtitleTimeline([
    {start: 0, end: 0.6, text: "先别急着找答案"},
    {start: 0.5, end: 4.0, text: "旧字幕"},
  ], 3.1, script, 1.2);
  assert.equal(stale.minimumDurationPassed, false);
  assert.equal(stale.overlapCount, 1);
  assert.equal(stale.outOfBoundsCount, 1);
  assert.equal(stale.normalizedSubtitleTextEqualsAuthoritativeScript, false);
});

test("atempo chain remains inside ffmpeg supported range", () => {
  assert.deepEqual(atempoFilters(1.2), ["atempo=1.2"]);
  assert.deepEqual(atempoFilters(4), ["atempo=2", "atempo=2"]);
  assert.deepEqual(atempoFilters(0.25), ["atempo=0.5", "atempo=0.5"]);
});

test("alignment report is current-hash bound and blocks script mismatch", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sw-alignment-test-"));
  try {
    const audio = path.join(root, "voice.wav");
    const script = path.join(root, "final-voiceover.md");
    const scenes = path.join(root, "scenes.json");
    const evidence = path.join(root, "evidence.json");
    const report = path.join(root, "alignment-report.json");
    await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-t", "3", "-c:a", "pcm_s16le", audio]);
    const authoritative = "先看见对方再来行动";
    await fs.writeFile(script, authoritative);
    const sceneData = {
      video: {duration: 3, minimumSubtitleDuration: 1.2},
      subtitles: [
        {start: 0, end: 1.4, text: "先看见对方"},
        {start: 1.5, end: 2.9, text: "再来行动"},
      ],
    };
    await fs.writeFile(scenes, JSON.stringify(sceneData));
    const audioHash = sha256(await fs.readFile(audio));
    await fs.writeFile(evidence, JSON.stringify({
      engine: "fixture-word-aligner", model: "fixture", wordTimestamps: true,
      audioSha256: audioHash, transcript: authoritative, manualReviewAnchorsSeconds: [0, 1.5, 2.8],
    }));
    const passed = await buildAlignmentReport({audio, script, scenes, evidence, report});
    assert.equal(passed.passed, true);
    const current = await verifyAlignmentReport({reportPath: report, audioPath: audio, scriptPath: script, subtitles: sceneData.subtitles, duration: 3});
    assert.equal(current.passed, true);
    await fs.writeFile(script, `${authoritative}已经改变`);
    const stale = await verifyAlignmentReport({reportPath: report, audioPath: audio, scriptPath: script, subtitles: sceneData.subtitles, duration: 3});
    assert.equal(stale.passed, false);
    await fs.writeFile(script, authoritative);
    await fs.writeFile(evidence, JSON.stringify({
      engine: "fixture-word-aligner", model: "fixture", wordTimestamps: true,
      audioSha256: audioHash, transcript: "完全不同的内容", manualReviewAnchorsSeconds: [0, 1.5, 2.8],
    }));
    const blocked = await buildAlignmentReport({audio, script, scenes, evidence, report});
    assert.equal(blocked.passed, false);
    assert.equal(blocked.asr.scriptAudioMatch, false);
  } finally {
    await fs.rm(root, {recursive: true, force: true});
  }
});
