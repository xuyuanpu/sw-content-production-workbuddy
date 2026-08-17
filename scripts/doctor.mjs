import {execFileSync} from "node:child_process";
import {findPlaywright} from "./lib.mjs";

const report = {node: process.version, playwright: false, chromiumLaunch: false, ffmpeg: false, ffprobe: false, warnings: []};
const major = Number(process.version.slice(1).split(".")[0]);
if (major < 18) report.warnings.push("Node.js 需要 18 或以上");
try {
  const {chromium} = await findPlaywright();
  report.playwright = true;
  const browser = await chromium.launch({headless: true});
  report.chromiumLaunch = true;
  await browser.close();
} catch (error) { report.warnings.push(error.message); }
for (const command of ["ffmpeg", "ffprobe"]) {
  try { execFileSync(command, ["-version"], {stdio: "ignore"}); report[command] = true; }
  catch { report.warnings.push(`${command} 未安装；小红书/公众号可运行，短视频成片阶段不可运行`); }
}
console.log(JSON.stringify(report, null, 2));
if (major < 18 || !report.playwright || !report.chromiumLaunch) process.exitCode = 1;
