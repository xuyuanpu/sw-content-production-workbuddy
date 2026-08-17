import fs from "node:fs/promises";
import path from "node:path";
import {compactCount, exists, forbiddenHits, parseArgs, platformPaths, pngSize, readJson, writeJson} from "./lib.mjs";

const args = parseArgs();
if (!args.unit) { console.error("用法: node validate-content-unit.mjs --unit <内容单元路径>"); process.exit(2); }
const paths = platformPaths(args.unit);
const checks = [];
const add = (name, passed, detail = null, level = "error") => checks.push({name, passed: Boolean(passed), detail, level});

const rootEntries = (await fs.readdir(paths.unit, {withFileTypes: true})).filter((entry) => entry.name !== ".DS_Store");
const expectedRoots = ["AIworkspace", "公众号", "小红书", "短视频"].sort();
add("content-unit has exactly four first-level directories", rootEntries.every((entry) => entry.isDirectory()) && JSON.stringify(rootEntries.map((entry) => entry.name).sort()) === JSON.stringify(expectedRoots), rootEntries.map((entry) => entry.name));
for (const required of ["00-source", "10-shared-assets", "20-xhs", "30-wechat", "40-video", "50-final-review", "90-archive"]) add(`AIworkspace/${required} exists`, await exists(path.join(paths.ai, required)));

const scanFiles = [];
async function collectText(root) {
  if (!await exists(root)) return;
  for (const entry of await fs.readdir(root, {withFileTypes: true})) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) await collectText(target);
    else if (/\.(md|txt|json|html|js|css|srt|vtt)$/iu.test(entry.name) && !target.includes(`${path.sep}00-source${path.sep}`) && !target.includes(`${path.sep}90-archive${path.sep}`)) scanFiles.push(target);
  }
}
for (const root of [paths.xhs, paths.wechat, paths.video, paths.xhsFinal, paths.wechatFinal, paths.videoFinal]) await collectText(root);
const identity = {};
for (const file of scanFiles) {
  const hits = forbiddenHits(await fs.readFile(file, "utf8"));
  if (hits.length) identity[path.relative(paths.unit, file)] = hits;
}
add("public candidate identity scan is zero", Object.keys(identity).length === 0, identity);

const xhsOut = path.join(paths.xhs, "output");
if (await exists(xhsOut)) {
  const pages = (await fs.readdir(xhsOut)).filter((name) => /^page-\d{2}\.png$/u.test(name)).sort();
  const pageSizes = [];
  for (const name of pages) pageSizes.push({name, ...pngSize(await fs.readFile(path.join(xhsOut, name)))});
  add("xhs has 3-10 content-driven pages", pages.length >= 3 && pages.length <= 10, pages);
  add("xhs pages are 1080x1440", pageSizes.every((item) => item.width === 1080 && item.height === 1440), pageSizes);
  if (await exists(path.join(xhsOut, "carousel-long.png"))) {
    const size = pngSize(await fs.readFile(path.join(xhsOut, "carousel-long.png")));
    add("xhs long image directly stacks original pages", size.width === 1080 && size.height === pages.length * 1440, size);
  } else add("xhs long image exists", false);
  add("xhs caption exists", await exists(path.join(xhsOut, "caption.md")));
} else add("xhs candidate output exists", false);

const wechatOut = path.join(paths.wechat, "output");
if (await exists(wechatOut)) {
  const required = ["article.md", "article.html", "article-full.png", "share-copy.md"];
  for (const name of required) add(`wechat ${name} exists`, await exists(path.join(wechatOut, name)));
  const reportPath = path.join(wechatOut, "check-report.json");
  if (await exists(reportPath)) {
    const report = await readJson(reportPath);
    add("wechat reader-visible body <=500", report.characterCount <= 500, {characterCount: report.characterCount});
    add("wechat browser check passed", report.passed, report.errors);
  } else add("wechat check report exists", false);
  const imageFiles = (await fs.readdir(wechatOut)).filter((name) => /^content-image\.(png|jpe?g|svg|webp)$/iu.test(name));
  add("wechat has substantive content image", imageFiles.length >= 1, imageFiles);
} else add("wechat candidate output exists", false);

const audioInbox = path.join(paths.video, "audio-inbox");
const audioFiles = await exists(audioInbox) ? (await fs.readdir(audioInbox)).filter((name) => !name.startsWith(".")) : [];
add("video voiceover draft exists", await exists(path.join(paths.video, "voiceover-draft.md")), null, "warning");
add("video unique MiniMax input exists", await exists(path.join(paths.video, "tts-input.txt")), null, "warning");
if (!audioFiles.length) add("video waits for manually generated audio", true, "没有音频时不要求分镜或成片", "info");
else add("video returned audio has follow-up report", await exists(path.join(paths.video, "audio-report.json")), audioFiles, "warning");

const failed = checks.filter((item) => !item.passed && item.level === "error");
const report = {generatedAt: new Date().toISOString(), unit: paths.unit, summary: {passed: checks.filter((item) => item.passed).length, failed: failed.length, warnings: checks.filter((item) => !item.passed && item.level === "warning").length}, checks};
await writeJson(path.join(paths.ai, "validation-report.json"), report);
console.log(JSON.stringify(report.summary));
if (failed.length) process.exitCode = 1;
