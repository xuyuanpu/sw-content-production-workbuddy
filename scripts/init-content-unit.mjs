import fs from "node:fs/promises";
import path from "node:path";
import {contentUnitName, copyTree, ensureDir, exists, nextId, parseArgs, sha256, skillRoot, writeJson} from "./lib.mjs";

const args = parseArgs();
if (!args.workspace || !args.topic) {
  console.error("用法: node init-content-unit.mjs --workspace <工作空间> --topic <选题名称> [--source <原始资料文件>] [--id 01]");
  process.exit(2);
}

const selected = [...new Set(String(args.platform || 'xhs,wechat,video').split(',').map(p => p.trim()))];
if (!selected.length || selected.some(p => !['xhs','wechat','video'].includes(p))) throw new Error('平台应为 xhs、wechat、video，可用逗号组合');
const workspace = path.resolve(args.workspace);
const outputRoot = path.join(workspace, "output");
const id = args.id ? Number(args.id) : await nextId(outputRoot);
if (!Number.isInteger(id) || id < 1 || id > 99) throw new Error("内容编号必须是 01–99");
const unit = path.join(outputRoot, contentUnitName(id, args.topic));
if (await exists(unit)) throw new Error(`内容单元已存在: ${unit}`);

const roots = ["小红书", "公众号", "短视频", "AIworkspace"];
const aiFolders = ["00-source", "10-shared-assets", "20-xhs", "30-wechat", "40-video", "50-final-review", "90-archive"];
await ensureDir(outputRoot);
for (const name of roots) await ensureDir(path.join(unit, name));
for (const name of aiFolders) await ensureDir(path.join(unit, "AIworkspace", name));

const sourceRecords = [];
if (args.source) {
  const source = path.resolve(args.source);
  const buffer = await fs.readFile(source);
  const target = path.join(unit, "AIworkspace", "00-source", `original${path.extname(source) || ".txt"}`);
  await fs.copyFile(source, target);
  sourceRecords.push({
    originalName: path.basename(source),
    storedAs: path.relative(unit, target),
    sha256: sha256(buffer),
    visibility: "internal",
    authorization: "待员工确认",
  });
} else {
  const target = path.join(unit, "AIworkspace", "00-source", "original.txt");
  await fs.writeFile(target, "请在此粘贴或保存原始资料，并更新 manifest.json。\n");
  sourceRecords.push({storedAs: path.relative(unit, target), visibility: "internal", authorization: "待员工确认"});
}

const xhs = path.join(unit, "AIworkspace", "20-xhs", "current");
const wechat = path.join(unit, "AIworkspace", "30-wechat", "current");
const video = path.join(unit, "AIworkspace", "40-video", "current");
for(const platform of selected) {
  const current={xhs,wechat,video}[platform];await ensureDir(current);
  if(platform==='video') await fs.copyFile(path.join(skillRoot,'assets/templates/video/voiceover-draft.md'),path.join(current,'voiceover-draft.md'));
}

const manifest = {
  schemaVersion: 1,
  contentUnit: path.basename(unit),
  topic: args.topic,
  createdAt: new Date().toISOString(),
  brand: "SW / Skill&Will",
  narrative: "official-organization",
  sourceRecords,
  scope: {xiaohongshu: selected.includes("xhs"), wechat: selected.includes("wechat"), video: selected.includes("video")},
  status: {professionalReview: "pending", sourceAuthorization: "pending", brandReview: "pending", publishAuthorization: "pending"},
};
await writeJson(path.join(unit, "AIworkspace", "manifest.json"), manifest);
await writeJson(path.join(unit, "AIworkspace", "state.json"), {stage: "initialized", updatedAt: new Date().toISOString(), ...Object.fromEntries(["xhs","wechat","video"].map(p => [p,selected.includes(p)?"not-started":"not-requested"]))});
await fs.writeFile(path.join(unit, "AIworkspace", "content-plan.md"), ["# 本次内容判断", "", "- 原题／要回答的问题：", "- 给谁看／看完获得什么：", "- 已有依据／还缺什么：", "- 原题是否需改（无必要则保留）：", ...selected.map(p => `- ${{xhs:'小红书',wechat:'公众号',video:'口播'}[p]}表达角度：`), ""].join("\n"));
console.log(JSON.stringify({unit, id: String(id).padStart(2, "0"), sourceRecords}, null, 2));
