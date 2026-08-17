import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {copyTree, ensureDir, exists, skillRoot, timestamp} from "./lib.mjs";

const target = path.join(os.homedir(), ".workbuddy", "skills", "sw-content-production");
if (path.resolve(target) === path.resolve(skillRoot)) {
  console.log(JSON.stringify({status: "already-installed", target}, null, 2));
  process.exit(0);
}
let backup = null;
if (await exists(target)) {
  const backupRoot = path.join(os.homedir(), ".workbuddy", "skill-backups", "sw-content-production");
  await ensureDir(backupRoot);
  backup = path.join(backupRoot, timestamp());
  await fs.rename(target, backup);
}
await copyTree(skillRoot, target, (source) => {
  const excludedDirectories = ["node_modules", ".git"];
  if (excludedDirectories.some((name) => source.includes(`${path.sep}${name}${path.sep}`) || source.endsWith(`${path.sep}${name}`))) return false;
  return !source.endsWith(".DS_Store") && !source.endsWith(".zip");
});
console.log(JSON.stringify({status: "installed", target, backup, next: [`cd ${JSON.stringify(target)} && npm install`, `cd ${JSON.stringify(target)} && npx playwright install chromium`, `node ${JSON.stringify(path.join(target, "scripts", "doctor.mjs"))}`]}, null, 2));
