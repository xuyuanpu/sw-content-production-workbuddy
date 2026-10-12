import assert from "node:assert/strict";
import test from "node:test";
import {analyzeVideoAssetPolicy, classifyVideoAsset} from "../scripts/video-asset-policy-lib.mjs";

test("classifies platform pages separately from substantive diagrams", () => {
  assert.equal(classifyVideoAsset("unit:AIworkspace/20-xhs/current/output/page-02.png"), "platform-layout-screenshot");
  assert.equal(classifyVideoAsset("unit:AIworkspace/30-wechat/current/output/article-full.png"), "platform-layout-screenshot");
  assert.equal(classifyVideoAsset("unit:AIworkspace/30-wechat/current/output/content-image.png"), "technical-diagram");
});

test("requires native Remotion logic and rejects article-page fallback", () => {
  const report = analyzeVideoAssetPolicy({scenes: [{id: "s1", visual: "cover"}, {id: "s2", visual: "article-page", asset: "unit:AIworkspace/20-xhs/current/output/page-02.png"}]});
  assert.equal(report.passed, false);
  assert.equal(report.platformLayoutScreenshotCount, 1);
  assert.equal(report.nativeLogicSceneCount, 0);
});
