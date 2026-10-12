import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";
import {SW_BRAND_BGM, analyzeBrandBgm, inspectBundledBrandBgm, selectBrandBgmWindow} from "../scripts/bgm-policy-lib.mjs";

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("bundles the exact mandatory SW brand BGM", async () => {
  const report = await inspectBundledBrandBgm(skillRoot);
  assert.equal(report.passed, true);
  assert.equal(report.sha256, SW_BRAND_BGM.sha256);
  assert.equal(report.manifest.substitutionAllowed, false);
});

test("keeps the approved 60 second section when the video fits", () => {
  const window = selectBrandBgmWindow(64.099188);
  assert.equal(window.startSeconds, 60);
  assert.equal(window.loops, false);
});

test("moves the automatic start earlier for a longer video instead of wrapping", () => {
  const window = selectBrandBgmWindow(96.064);
  assert.equal(window.startSeconds, 50.326204);
  assert.equal(window.loops, false);
});

test("rejects substitute music and fingerprint drift", () => {
  const report = analyzeBrandBgm({
    configuredPath: "assets/bgm/other.mp3",
    actualSha256: "bad",
    manifest: {assetId: SW_BRAND_BGM.assetId, sha256: SW_BRAND_BGM.sha256, required: true, substitutionAllowed: false},
    videoDuration: 60,
  });
  assert.equal(report.passed, false);
  assert(report.checks.some((check) => check.name === "fixed workspace path" && !check.passed));
  assert(report.checks.some((check) => check.name === "exact master audio fingerprint" && !check.passed));
});

test('production ducked stem amplitude is 60 percent of the original mix baseline',async()=>{
 const {execFileSync}=await import('node:child_process');
 const {brandBgmDuckingFilter}=await import('../scripts/bgm-policy-lib.mjs');
 const filter=brandBgmDuckingFilter();
 const render=graph=>execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','sine=frequency=220:duration=0.5:sample_rate=48000','-f','lavfi','-i','sine=frequency=700:duration=0.5:sample_rate=48000','-filter_complex',graph,'-map','[ducked]','-t','0.25','-f','f32le','-'],{timeout:10000});
 const baseline=render(filter.replace(',volume=0.6[ducked]','[ducked]')),quiet=render(filter);
 assert.equal(quiet.length,baseline.length);let energy=0,error=0;
 for(let i=0;i<quiet.length;i+=4){const a=baseline.readFloatLE(i),b=quiet.readFloatLE(i);energy+=a*a;error+=(b-.6*a)**2;}
 assert.ok(energy>0);assert.ok(error/energy<1e-10);assert.equal(SW_BRAND_BGM.postDuckGain,0.6);
});
