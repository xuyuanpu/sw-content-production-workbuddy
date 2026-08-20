import fs from "node:fs/promises";
import path from "node:path";
import {WECHAT_CHARACTER_RANGE, copyTree, ensureDir, exists, parseArgs, platformPaths, timestamp, writeJson} from "./lib.mjs";

const args = parseArgs();
if (!args.unit || args.confirm !== "YES") {
  console.error("只有员工明确确认版本后才可运行: node promote.mjs --unit <内容单元> --platform xhs,wechat[,video] --confirm YES");
  process.exit(2);
}
const paths = platformPaths(args.unit);
const selected = String(args.platform || "xhs,wechat").split(",").map((item) => item.trim()).filter(Boolean);
const map = {
  xhs: {source: path.join(paths.xhs, "output"), target: paths.xhsFinal, archive: "小红书"},
  wechat: {source: path.join(paths.wechat, "output"), target: paths.wechatFinal, archive: "公众号"},
  video: {source: path.join(paths.video, "output"), target: paths.videoFinal, archive: "短视频"},
};
if (selected.includes("wechat")) {
  const checkPath = path.join(paths.wechat, "output", "check-report.json");
  if (!await exists(checkPath)) throw new Error("公众号候选缺少 check-report.json，不得提升成品");
  const check = JSON.parse(await fs.readFile(checkPath, "utf8"));
  if (check.passed !== true || check.characterCount < WECHAT_CHARACTER_RANGE.min || check.characterCount > WECHAT_CHARACTER_RANGE.max) {
    throw new Error(`公众号候选未通过 ${WECHAT_CHARACTER_RANGE.min}～${WECHAT_CHARACTER_RANGE.max} 字及浏览器检查，当前 ${check.characterCount ?? "未知"} 字`);
  }
}
const actions = [];
for (const key of selected) {
  const item = map[key];
  if (!item) throw new Error(`未知平台: ${key}`);
  if (!await exists(item.source)) throw new Error(`候选目录不存在: ${item.source}`);
  const sourceEntries = (await fs.readdir(item.source)).filter((entry) => !entry.startsWith("."));
  if (!sourceEntries.length) throw new Error(`候选目录为空: ${item.source}`);
  const currentEntries = (await fs.readdir(item.target)).filter((entry) => !entry.startsWith("."));
  let archive = null;
  if (currentEntries.length) {
    archive = path.join(paths.archive, item.archive, `${timestamp()}-previous`);
    await ensureDir(archive);
    for (const entry of currentEntries) await fs.rename(path.join(item.target, entry), path.join(archive, entry));
  }
  await copyTree(item.source, item.target, (source) => !source.endsWith("check-report.json") && !source.endsWith("contact-sheet.png"));
  actions.push({platform: key, source: item.source, target: item.target, archive});
}
const statePath = path.join(paths.ai, "state.json");
const state = await exists(statePath) ? JSON.parse(await fs.readFile(statePath, "utf8")) : {};
state.stage = "human-confirmed";
state.updatedAt = new Date().toISOString();
state.promoted = selected;
await writeJson(statePath, state);
console.log(JSON.stringify({status: "promoted-after-human-confirmation", actions}, null, 2));
