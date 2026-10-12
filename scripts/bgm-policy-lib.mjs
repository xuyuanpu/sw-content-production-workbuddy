import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export const SW_BRAND_BGM = Object.freeze({
  assetId: "sw-brand-bgm-v1",
  workspacePath: "assets/bgm/sw-brand-bgm.mp3",
  bundledPath: "assets/templates/video/assets/bgm/sw-brand-bgm.mp3",
  bundledManifestPath: "assets/templates/video/assets/bgm/asset-manifest.json",
  sha256: "0be398827ba3f1b4a297748b9b49f6b104d0db5549f08471daf7cc98892b9c7c",
  durationSeconds: 146.390204,
  preferredStartSeconds: 60,
  fadeInSeconds: 0.6,
  fadeOutSeconds: 1.0,
  preDuckGainDb: -2,
  postDuckGain: 0.6, // Fixed relative to the original brand mix; never compound prior exports.
  sidechain: Object.freeze({threshold: 0.03, ratio: 2.2, attackMs: 18, releaseMs: 320, makeup: 1}),
  limiter: Object.freeze({limitLinear: 0.891, attackMs: 5, releaseMs: 50}),
});

function digest(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function normalizedRelative(value) {
  return String(value || "").replaceAll("\\", "/").replace(/^\.\//u, "");
}

export function selectBrandBgmWindow(videoDuration, requestedStartSeconds) {
  const duration = Number(videoDuration);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("视频时长无效，无法选择固定品牌 BGM 片段");
  const explicit = requestedStartSeconds !== undefined && requestedStartSeconds !== null && requestedStartSeconds !== "";
  const requested = explicit ? Number(requestedStartSeconds) : null;
  if (explicit && (!Number.isFinite(requested) || requested < 0 || requested >= SW_BRAND_BGM.durationSeconds)) {
    throw new Error(`brandBgmStartSeconds 必须位于 0–${SW_BRAND_BGM.durationSeconds.toFixed(3)} 秒内`);
  }
  const startSeconds = explicit
    ? requested
    : Math.min(SW_BRAND_BGM.preferredStartSeconds, Math.max(0, SW_BRAND_BGM.durationSeconds - duration));
  return {
    startSeconds: Number(startSeconds.toFixed(6)),
    durationSeconds: duration,
    loops: startSeconds + duration > SW_BRAND_BGM.durationSeconds,
    selection: explicit ? "explicit" : "automatic-preserve-preferred-section",
  };
}

export function analyzeBrandBgm({configuredPath, actualSha256, manifest, videoDuration, requestedStartSeconds}) {
  let window = null;
  let windowError = null;
  try { window = selectBrandBgmWindow(videoDuration, requestedStartSeconds); }
  catch (error) { windowError = error.message; }
  const normalizedPath = normalizedRelative(configuredPath || SW_BRAND_BGM.workspacePath);
  const checks = [
    {name: "fixed workspace path", passed: normalizedPath === SW_BRAND_BGM.workspacePath, detail: normalizedPath},
    {name: "exact master audio fingerprint", passed: actualSha256 === SW_BRAND_BGM.sha256, detail: actualSha256},
    {name: "manifest asset id", passed: manifest?.assetId === SW_BRAND_BGM.assetId, detail: manifest?.assetId},
    {name: "manifest fingerprint", passed: manifest?.sha256 === SW_BRAND_BGM.sha256, detail: manifest?.sha256},
    {name: "mandatory without substitution", passed: manifest?.required === true && manifest?.substitutionAllowed === false, detail: {required: manifest?.required, substitutionAllowed: manifest?.substitutionAllowed}},
    {name: "valid music window", passed: Boolean(window), detail: windowError || window},
  ];
  return {passed: checks.every((check) => check.passed), checks, window};
}

export async function inspectBundledBrandBgm(skillRoot) {
  const audioPath = path.join(skillRoot, SW_BRAND_BGM.bundledPath);
  const manifestPath = path.join(skillRoot, SW_BRAND_BGM.bundledManifestPath);
  const [buffer, manifestText] = await Promise.all([fs.readFile(audioPath), fs.readFile(manifestPath, "utf8")]);
  const manifest = JSON.parse(manifestText);
  const actualSha256 = digest(buffer);
  const checks = [
    {name: "bundled master fingerprint", passed: actualSha256 === SW_BRAND_BGM.sha256, detail: actualSha256},
    {name: "bundled manifest fingerprint", passed: manifest.sha256 === actualSha256, detail: manifest.sha256},
    {name: "bundled manifest file", passed: manifest.file === path.basename(audioPath), detail: manifest.file},
    {name: "bundled manifest policy", passed: manifest.assetId === SW_BRAND_BGM.assetId && manifest.required === true && manifest.substitutionAllowed === false, detail: {assetId: manifest.assetId, required: manifest.required, substitutionAllowed: manifest.substitutionAllowed}},
  ];
  return {passed: checks.every((check) => check.passed), checks, audioPath, manifestPath, manifest, sha256: actualSha256};
}

export async function ensureBrandBgm({skillRoot, videoRoot, configuredPath, videoDuration, requestedStartSeconds}) {
  const bundled = await inspectBundledBrandBgm(skillRoot);
  if (!bundled.passed) throw new Error(`Skill 固定品牌 BGM 资产失效: ${JSON.stringify(bundled.checks.filter((check) => !check.passed))}`);

  const normalizedPath = normalizedRelative(configuredPath || SW_BRAND_BGM.workspacePath);
  if (normalizedPath !== SW_BRAND_BGM.workspacePath) throw new Error(`SW 短视频不得替换 BGM，必须使用 ${SW_BRAND_BGM.workspacePath}`);
  const targetPath = path.join(videoRoot, ...SW_BRAND_BGM.workspacePath.split("/"));
  await fs.mkdir(path.dirname(targetPath), {recursive: true});
  try {
    const existing = await fs.readFile(targetPath);
    const existingHash = digest(existing);
    if (existingHash !== SW_BRAND_BGM.sha256) throw new Error(`内容单元中的固定 BGM 指纹不符: ${existingHash}`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await fs.copyFile(bundled.audioPath, targetPath);
  }
  const targetBuffer = await fs.readFile(targetPath);
  const actualSha256 = digest(targetBuffer);
  const analysis = analyzeBrandBgm({configuredPath: normalizedPath, actualSha256, manifest: bundled.manifest, videoDuration, requestedStartSeconds});
  if (!analysis.passed) throw new Error(`固定品牌 BGM 检查失败: ${JSON.stringify(analysis.checks.filter((check) => !check.passed))}`);
  return {
    ...analysis,
    assetId: SW_BRAND_BGM.assetId,
    targetPath,
    relativePath: SW_BRAND_BGM.workspacePath,
    sha256: actualSha256,
    source: "bundled-skill:sw-brand-bgm-v1",
    manifest: bundled.manifest,
  };
}

// Shared by the only production mixer; preview is cut from its encoded output.
export function brandBgmDuckingFilter() {
  const p = SW_BRAND_BGM;
  return `[0:a]volume=${p.preDuckGainDb}dB[bgmpre];[bgmpre][1:a]sidechaincompress=threshold=${p.sidechain.threshold}:ratio=${p.sidechain.ratio}:attack=${p.sidechain.attackMs}:release=${p.sidechain.releaseMs}:makeup=${p.sidechain.makeup},volume=${p.postDuckGain}[ducked]`;
}
