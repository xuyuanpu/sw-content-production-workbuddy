import fs from "node:fs/promises";
import path from "node:path";
import {parseArgs, writeJson} from "./lib.mjs";
import {analyzeVoiceover} from "./voiceover-lib.mjs";
const args = parseArgs();
if (!args.draft || !args.tts) throw new Error("用法: voiceover-qc.mjs --draft <稿件> --tts <机器稿> [--confirm YES] [--report <报告>]");
const draftPath = path.resolve(args.draft), ttsPath = path.resolve(args.tts);
const reportPath = path.resolve(args.report || path.join(path.dirname(ttsPath), "voiceover-report.json"));
const report = analyzeVoiceover(await fs.readFile(draftPath, "utf8"), await fs.readFile(ttsPath, "utf8"));
let previous = null;
try { previous = JSON.parse(await fs.readFile(reportPath, "utf8")); } catch {}
// --confirm records explicit user approval; never supply it merely to pass QC.
report.contentConfirmation = args.confirm === "YES"
  ? {method: "explicit-user-confirmation", draftHash: report.fingerprints.draftBody, recordedAt: new Date().toISOString()}
  : previous?.contentConfirmation?.draftHash === report.fingerprints.draftBody ? previous.contentConfirmation : null;
const confirmed = report.contentConfirmation?.method === "explicit-user-confirmation";
report.checks.unshift({name: "current draft has explicit user confirmation", passed: confirmed});
report.passed = report.passed && confirmed;
report.sources = {draft: draftPath, tts: ttsPath};
await writeJson(reportPath, report);
console.log(JSON.stringify({passed: report.passed, report: reportPath, warnings: report.warnings, failed: report.checks.filter(c => !c.passed).map(c => c.name)}));
if (!report.passed) process.exitCode = 1;
