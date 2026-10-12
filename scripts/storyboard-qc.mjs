import {verifyDirector, deriveShotbook, deriveExplanationMap} from "./director-contract-lib.mjs";
import {resolveInside} from "./alignment-lib.mjs";
import fs from "node:fs/promises";
import path from "node:path";
import {parseArgs, writeJson, sha256, readJson} from "./lib.mjs";
import {analyzeStoryboard} from "./storyboard-lib.mjs";

const args = parseArgs();
const required = ["chain", "treatment", "map", "shotbook", "scenes", "script"];
if (required.some((key) => !args[key])) {
  console.error("用法: node storyboard-qc.mjs --chain <knowledge-chain.md> --treatment <visual-treatment.md> --map <visual-explanation-map.md> --shotbook <shotbook.json> --scenes <scenes.json> --script <final-voiceover.md> [--report <storyboard-report.json>]");
  process.exit(2);
}

const sourcePaths = Object.fromEntries(required.map((key) => [key, path.resolve(args[key])]));
const inputs = {
  chain: await fs.readFile(sourcePaths.chain, "utf8"),
  treatment: await fs.readFile(sourcePaths.treatment, "utf8"),
  explanationMap: await fs.readFile(sourcePaths.map, "utf8"),
  shotbook: JSON.parse(await fs.readFile(sourcePaths.shotbook, "utf8")),
  scenes: JSON.parse(await fs.readFile(sourcePaths.scenes, "utf8")),
  script: await fs.readFile(sourcePaths.script, "utf8"),
};
const reportPath = path.resolve(args.report || path.join(path.dirname(sourcePaths.scenes), "storyboard-report.json"));
const report = analyzeStoryboard(inputs);
if (inputs.scenes.video?.directorVersion === 1) {
  const root = path.dirname(sourcePaths.scenes);
  const audio = await resolveInside(root, inputs.scenes.video.audio, "audio");
  const evidence = await readJson(await resolveInside(root, inputs.scenes.video.timingEvidence, "evidence"));
  const contract = verifyDirector(inputs.scenes, evidence, sha256(await fs.readFile(audio)));
  const derived = JSON.stringify(deriveShotbook(inputs.scenes)) === JSON.stringify(inputs.shotbook) && deriveExplanationMap(inputs.scenes) === inputs.explanationMap;
  report.directorContract = contract;
  report.checks.push({name:"canonical director timeline and generated views match", passed:contract.passed && derived, detail:contract.errors});
  report.passed = report.passed && contract.passed && derived;
  report.executionPassed = report.executionPassed && contract.passed && derived;
}

report.sources = sourcePaths;
await writeJson(reportPath, report);
console.log(JSON.stringify({passed: report.passed, report: reportPath, metrics: report.metrics, failed: report.checks.filter((check) => !check.passed).map((check) => check.name)}, null, 2));
if (!report.passed) process.exitCode = 1;
