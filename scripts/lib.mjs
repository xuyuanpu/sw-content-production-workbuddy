import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";

export const scriptDir = path.dirname(fileURLToPath(import.meta.url));
export const skillRoot = path.resolve(scriptDir, "..");
export const WECHAT_CHARACTER_RANGE = Object.freeze({min: 1000, max: 1500});

export function parseArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) continue;
    const key = value.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) args[key] = true;
    else { args[key] = next; index += 1; }
  }
  return args;
}

export async function exists(target) {
  try { await fs.access(target); return true; } catch { return false; }
}

export async function ensureDir(target) {
  await fs.mkdir(target, {recursive: true});
}

export async function readJson(target) {
  return JSON.parse(await fs.readFile(target, "utf8"));
}

export async function writeJson(target, value) {
  await ensureDir(path.dirname(target));
  await fs.writeFile(target, `${JSON.stringify(value, null, 2)}\n`);
}

export function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export function safeTopic(value) {
  return value.trim().replace(/[\\/:*?"<>|]/gu, "-").replace(/\s+/gu, " ").slice(0, 42);
}

export function compactCount(value) {
  return [...String(value).replace(/\s/gu, "")].length;
}

export function pngSize(buffer) {
  if (buffer.length < 24 || buffer.toString("ascii", 1, 4) !== "PNG") throw new Error("Not a PNG file");
  return {width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20)};
}

export async function copyTree(source, target, filter = () => true) {
  await fs.cp(source, target, {recursive: true, force: true, filter});
}

export function timestamp() {
  const value = new Date().toISOString().replace(/[-:]/gu, "").replace("T", "-").slice(0, 13);
  return value;
}

export function platformPaths(unit) {
  const root = path.resolve(unit);
  return {
    unit: root,
    xhsFinal: path.join(root, "小红书"),
    wechatFinal: path.join(root, "公众号"),
    videoFinal: path.join(root, "短视频"),
    ai: path.join(root, "AIworkspace"),
    xhs: path.join(root, "AIworkspace", "20-xhs", "current"),
    wechat: path.join(root, "AIworkspace", "30-wechat", "current"),
    video: path.join(root, "AIworkspace", "40-video", "current"),
    review: path.join(root, "AIworkspace", "50-final-review"),
    archive: path.join(root, "AIworkspace", "90-archive"),
  };
}

export const forbiddenRules = [
  /王\s*善\s*平/giu,
  /善\s*平\s*老\s*师/giu,
  /善\s*平\s*笔\s*记/giu,
  /王\s*老\s*师/giu,
  /(?:wang\s*)?shan\s*ping/giu,
  /wang\s*lao\s*shi/giu,
];

export function forbiddenHits(value) {
  return forbiddenRules.flatMap((rule) => [...String(value).matchAll(rule)].map((match) => match[0]));
}

export async function findPlaywright() {
  try { return await import("playwright"); } catch {}
  const candidates = [
    path.join(skillRoot, "node_modules", "playwright", "index.mjs"),
    path.join(os.homedir(), ".workbuddy", "skills", "sw-content-production", "node_modules", "playwright", "index.mjs"),
  ];
  for (const candidate of candidates) {
    if (await exists(candidate)) return import(pathToFileURL(candidate).href);
  }
  throw new Error("Playwright 未安装。请在 Skill 目录运行 npm install && npx playwright install chromium");
}

export function contentUnitName(id, topic) {
  return `${String(id).padStart(2, "0")}-${safeTopic(topic)}`;
}

export async function nextId(outputRoot) {
  if (!await exists(outputRoot)) return 1;
  const entries = await fs.readdir(outputRoot, {withFileTypes: true});
  const ids = entries.filter((entry) => entry.isDirectory()).map((entry) => Number(entry.name.match(/^(\d{2})-/u)?.[1])).filter(Number.isFinite);
  return ids.length ? Math.max(...ids) + 1 : 1;
}

export function mimeFor(file) {
  const extension = path.extname(file).toLowerCase();
  return ({".png": "image/png", ".gif": "image/gif", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml", ".webp": "image/webp"})[extension] || "application/octet-stream";
}

export async function dataUrl(file) {
  const buffer = await fs.readFile(file);
  return `data:${mimeFor(file)};base64,${buffer.toString("base64")}`;
}
