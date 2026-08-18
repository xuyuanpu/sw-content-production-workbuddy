import {execFile} from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {promisify} from "node:util";
import {exists, parseArgs, writeJson} from "./lib.mjs";

const run = promisify(execFile);

function parseRate(value) {
  const [numerator, denominator = "1"] = String(value || "0/1").split("/").map(Number);
  return denominator ? numerator / denominator : 0;
}

export async function inspectVideo(input) {
  const file = path.resolve(input);
  if (!await exists(file)) throw new Error(`视频不存在: ${file}`);
  const options = {maxBuffer: 20 * 1024 * 1024};
  const probeResult = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration,size,bit_rate:stream=codec_name,codec_type,width,height,r_frame_rate,avg_frame_rate,pix_fmt,sample_rate,channels", "-of", "json", file], options);
  const probe = JSON.parse(probeResult.stdout);
  const videoStream = probe.streams?.find((stream) => stream.codec_type === "video") || {};
  const fps = parseRate(videoStream.avg_frame_rate || videoStream.r_frame_rate) || 30;
  const blackResult = await run("ffmpeg", ["-hide_banner", "-i", file, "-vf", "blackdetect=d=0.02:pix_th=0.10", "-an", "-f", "null", "-"], options);
  const blackEvents = [...blackResult.stderr.matchAll(/black_start:([0-9.]+)\s+black_end:([0-9.]+)\s+black_duration:([0-9.]+)/gu)].map((match) => ({start: Number(match[1]), end: Number(match[2]), duration: Number(match[3])}));
  const sceneResult = await run("ffmpeg", ["-hide_banner", "-i", file, "-vf", "select=gt(scene\\,0.55),showinfo", "-an", "-f", "null", "-"], options);
  const sceneChanges = [...sceneResult.stderr.matchAll(/pts_time:([0-9.]+)/gu)].map((match) => Number(match[1]));
  const rapidWindow = Math.max(3 / fps, 0.12);
  const rapidFlashPairs = [];
  for (let index = 1; index < sceneChanges.length; index += 1) {
    const interval = sceneChanges[index] - sceneChanges[index - 1];
    if (interval <= rapidWindow) rapidFlashPairs.push({from: sceneChanges[index - 1], to: sceneChanges[index], interval});
  }
  return {
    input: file,
    probe,
    fps,
    blackEvents,
    sceneChanges,
    rapidFlashPairs,
    policy: {
      maxBlackEvents: 0,
      rapidFlashWindowSeconds: rapidWindow,
      note: "SW 浅底色视频不允许非脚本化整帧黑闪；相邻强切变化小于三帧视为疑似单帧闪烁。",
    },
    passed: blackEvents.length === 0 && rapidFlashPairs.length === 0,
  };
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const args = parseArgs();
  if (!args.input) {
    console.error("用法: node video-qc.mjs --input <视频路径> [--report <JSON路径>]");
    process.exit(2);
  }
  const report = await inspectVideo(args.input);
  if (args.report) await writeJson(path.resolve(args.report), report);
  else await fs.writeFile(path.join(path.dirname(path.resolve(args.input)), "video-temporal-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({input: report.input, passed: report.passed, blackEvents: report.blackEvents.length, rapidFlashPairs: report.rapidFlashPairs.length}, null, 2));
  if (!report.passed) process.exitCode = 1;
}
