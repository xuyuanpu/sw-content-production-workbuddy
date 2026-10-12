import fs from "node:fs/promises";
import path from "node:path";
import {parseArgs, writeJson} from "../../scripts/lib.mjs";
import {analyzeScienceScript} from "./science-script-lib.mjs";

const args = parseArgs();
const required = ["brief", "hooks", "chain", "draft", "review"];
if (required.some((key) => !args[key])) {
  console.error("用法: node science-script-qc.mjs --brief <script-brief.md> --hooks <hook-lab.md> --chain <knowledge-chain.md> --draft <voiceover-draft.md> --review <script-review.json> [--report <science-script-report.json>]");
  process.exit(2);
}

const sourcePaths = Object.fromEntries(required.map((key) => [key, path.resolve(args[key])]));
const inputs = {
  brief: await fs.readFile(sourcePaths.brief, "utf8"),
  hooks: await fs.readFile(sourcePaths.hooks, "utf8"),
  chain: await fs.readFile(sourcePaths.chain, "utf8"),
  draft: await fs.readFile(sourcePaths.draft, "utf8"),
  review: JSON.parse(await fs.readFile(sourcePaths.review, "utf8")),
};
const reportPath = path.resolve(args.report || path.join(path.dirname(sourcePaths.draft), "science-script-report.json"));
const report = analyzeScienceScript(inputs);
report.sources = sourcePaths;
await writeJson(reportPath, report);
console.log(JSON.stringify({passed: report.passed, report: reportPath, metrics: report.metrics, failed: report.checks.filter((check) => !check.passed).map((check) => check.name)}, null, 2));
if (!report.passed) process.exitCode = 1;

