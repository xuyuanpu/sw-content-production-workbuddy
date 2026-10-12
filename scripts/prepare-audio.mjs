import fs from "node:fs/promises";
import path from "node:path";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {fileURLToPath} from "node:url";
import {probeAudio} from "./alignment-lib.mjs";
import {exists, parseArgs, sha256, writeJson} from "./lib.mjs";

const run = promisify(execFile);

export function atempoFilters(speed) {
  if (!Number.isFinite(speed) || speed <= 0) throw new Error("speed 必须是正数");
  const filters = [];
  let remaining = speed;
  while (remaining > 2) { filters.push(2); remaining /= 2; }
  while (remaining < 0.5) { filters.push(0.5); remaining /= 0.5; }
  if (Math.abs(remaining - 1) > 1e-6 || !filters.length) filters.push(remaining);
  return filters.map((value) => `atempo=${Number(value.toFixed(8))}`);
}

export async function prepareAudio({input, output, speed, report, force = false}) {
  if (!await exists(input)) throw new Error(`原始音频不存在: ${input}`);
  if (path.resolve(input) === path.resolve(output)) throw new Error("工作音频必须写入新文件，禁止覆盖原始音频");
  if (path.extname(output).toLowerCase() !== ".wav") throw new Error("工作音频必须使用 .wav，便于无损对齐与重复渲染");
  if (await exists(output) && !force) throw new Error(`工作音频已存在；如确需替换请显式使用 --force: ${output}`);
  await fs.mkdir(path.dirname(output), {recursive: true});
  const filters = atempoFilters(speed);
  await run("ffmpeg", [
    "-hide_banner", "-loglevel", "error", force ? "-y" : "-n", "-i", input,
    "-vn", "-af", filters.join(","), "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", output,
  ], {maxBuffer: 20 * 1024 * 1024});
  await run("ffmpeg", ["-v", "error", "-i", output, "-f", "null", "-"], {maxBuffer: 20 * 1024 * 1024});
  const [inputProbe, outputProbe, inputBuffer, outputBuffer] = await Promise.all([
    probeAudio(input), probeAudio(output), fs.readFile(input), fs.readFile(output),
  ]);
  const expectedDuration = inputProbe.durationSeconds / speed;
  const durationDelta = Math.abs(outputProbe.durationSeconds - expectedDuration);
  const payload = {
    schemaVersion: 1,
    passed: outputProbe.durationSeconds > 0 && durationDelta <= Math.max(0.12, expectedDuration * 0.005),
    input: {path: path.resolve(input), sha256: sha256(inputBuffer), durationSeconds: inputProbe.durationSeconds},
    output: {path: path.resolve(output), sha256: sha256(outputBuffer), durationSeconds: outputProbe.durationSeconds, sampleRate: 48000, channels: 2, codec: "pcm_s16le"},
    transform: {speed, ffmpegFilter: filters.join(","), pitchPreserving: true},
    expectedDurationSeconds: expectedDuration,
    durationDeltaSeconds: durationDelta,
    policy: "原始音频不可覆盖；工作音频一旦改变，字幕、镜头和混音时间轴全部重新建立",
    generatedAt: new Date().toISOString(),
  };
  await writeJson(report, payload);
  if (!payload.passed) throw new Error(`音频变速时长校验失败: ${JSON.stringify({expectedDuration, actual: outputProbe.durationSeconds, durationDelta})}`);
  return payload;
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const args = parseArgs();
  if (!args.input || !args.output || !args.speed) {
    console.error("用法: node prepare-audio.mjs --input <原始音频> --output <新工作音频.wav> --speed <倍速> [--report <audio-transform-report.json>] [--force]");
    process.exit(2);
  }
  const output = path.resolve(args.output);
  const report = path.resolve(args.report || path.join(path.dirname(output), "audio-transform-report.json"));
  const result = await prepareAudio({input: path.resolve(args.input), output, speed: Number(args.speed), report, force: Boolean(args.force)});
  console.log(JSON.stringify({output, report, speed: result.transform.speed, duration: result.output.durationSeconds, sha256: result.output.sha256}, null, 2));
}
