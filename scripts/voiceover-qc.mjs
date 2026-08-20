import fs from "node:fs/promises";
import path from "node:path";
import {parseArgs, writeJson} from "./lib.mjs";
import {analyzeVoiceover} from "./voiceover-lib.mjs";

const args = parseArgs();
if (!args.draft || !args.tts) {
  console.error("用法: node voiceover-qc.mjs --draft <voiceover-draft.md> --tts <tts-input.txt> [--report <voiceover-report.json>]");
  process.exit(2);
}

const draftPath = path.resolve(args.draft);
const ttsPath = path.resolve(args.tts);
const reportPath = path.resolve(args.report || path.join(path.dirname(ttsPath), "voiceover-report.json"));
const report = analyzeVoiceover(await fs.readFile(draftPath, "utf8"), await fs.readFile(ttsPath, "utf8"));
report.sources = {draft: draftPath, tts: ttsPath};
await writeJson(reportPath, report);
console.log(JSON.stringify({passed: report.passed, report: reportPath, metrics: report.metrics, failed: report.checks.filter((check) => !check.passed).map((check) => check.name)}, null, 2));
if (!report.passed) process.exitCode = 1;
