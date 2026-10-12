import fs from "node:fs/promises";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {parseArgs, sha256, skillRoot, writeJson} from "./lib.mjs";

const manifestName = "release-manifest.json";
export function isReleaseFile(relative) {
  const parts = relative.split(path.sep);
  return !parts.some((part) => ["node_modules", ".git", ".DS_Store"].includes(part))
    && relative !== manifestName && !relative.endsWith(".zip");
}

export async function releaseSnapshot(root) {
  const files = {};
  async function walk(relative = "") {
    const entries = await fs.readdir(path.join(root, relative), {withFileTypes: true});
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const name = path.join(relative, entry.name);
      if (!isReleaseFile(name)) continue;
      if (/^(?:\.env(?:\..*)?|API_KEYS.*|.*\.(?:pem|key))$/iu.test(entry.name)) throw new Error(`密钥配置不得进入交付包: ${name}`);
      if (entry.isSymbolicLink()) throw new Error(`交付包不接受符号链接: ${name}`);
      if (entry.isDirectory()) await walk(name);
      else if (entry.isFile()) files[name.split(path.sep).join("/")] = sha256(await fs.readFile(path.join(root, name)));
    }
  }
  await walk();
  const canonical = Object.fromEntries(Object.entries(files).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
  const pkg = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
  return {schemaVersion: 1, version: pkg.version, digest: sha256(JSON.stringify(canonical)), files: canonical};
}

export async function verifyRelease(root) {
  const expected = JSON.parse(await fs.readFile(path.join(root, manifestName), "utf8"));
  const actual = await releaseSnapshot(root);
  const names = new Set([...Object.keys(expected.files || {}), ...Object.keys(actual.files)]);
  const changed = [...names].filter((name) => expected.files?.[name] !== actual.files[name]);
  return {passed: expected.schemaVersion === 1 && expected.version === actual.version && expected.digest === actual.digest && changed.length === 0,
    version: actual.version, digest: actual.digest, fileCount: Object.keys(actual.files).length, changed};
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = parseArgs();
  const root = args.root ? path.resolve(args.root) : skillRoot;
  if (args.seal) {
    const snapshot = await releaseSnapshot(root);
    await writeJson(path.join(root, manifestName), snapshot);
    console.log(JSON.stringify({status: "sealed", version: snapshot.version, digest: snapshot.digest, fileCount: Object.keys(snapshot.files).length}));
  } else {
    const result = await verifyRelease(root);
    console.log(JSON.stringify(result, null, 2));
    if (!result.passed) process.exitCode = 1;
  }
}
