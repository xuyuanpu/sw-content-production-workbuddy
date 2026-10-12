import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {releaseSnapshot, verifyRelease} from "../scripts/release-integrity.mjs";

test("release fingerprint detects a same-version patch and ignores dependencies", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sw-release-test-"));
  try {
    await fs.writeFile(path.join(root, "package.json"), JSON.stringify({version: "1.12.0"}));
    await fs.writeFile(path.join(root, "SKILL.md"), "baseline");
    await fs.writeFile(path.join(root, "release-manifest.json"), JSON.stringify(await releaseSnapshot(root)));
    assert.equal((await verifyRelease(root)).passed, true);
    await fs.mkdir(path.join(root, "node_modules"));
    await fs.writeFile(path.join(root, "node_modules", "local-cache"), "runtime");
    assert.equal((await verifyRelease(root)).passed, true);
    await fs.writeFile(path.join(root, "SKILL.md"), "local-only patch");
    const result = await verifyRelease(root);
    assert.equal(result.passed, false);
    assert.deepEqual(result.changed, ["SKILL.md"]);
  } finally { await fs.rm(root, {recursive: true, force: true}); }
});
