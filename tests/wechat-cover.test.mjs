import assert from "node:assert/strict";
import test from "node:test";
import {analyzeWechatCover, analyzeWechatCoverOutputs} from "../scripts/wechat-cover-lib.mjs";

const validCover = {
  src: "assets/cover-image.png",
  alt: "围坐讨论的专业工作坊场景",
  titleLines: ["会社交，", "就一定是外向型吗？"],
  subtitle: "从外显行为回到心理起点",
  highlight: "外向型",
  category: "MBTI · PROFESSIONAL VIEW",
  position: {x: 50, y: 50},
};

test("accepts a complete SW WeChat dual-cover contract", () => {
  const report = analyzeWechatCover(validCover, "会社交，就一定是外向型吗？");
  assert.equal(report.passed, true, JSON.stringify(report.checks.filter((check) => !check.passed), null, 2));
});

test("rejects a missing or mismatched WeChat cover", () => {
  assert.equal(analyzeWechatCover({}, "公众号标题").passed, false);
  assert.equal(analyzeWechatCover({...validCover, titleLines: ["另一个标题"]}, "公众号标题").passed, false);
});

test("requires both exact cover output sizes", () => {
  const passed = analyzeWechatCoverOutputs({master: {width: 1000, height: 1000}, wide: {width: 900, height: 383}, square: {width: 500, height: 500}});
  assert.equal(passed.passed, true);
  const failed = analyzeWechatCoverOutputs({master: {width: 1000, height: 1000}, wide: {width: 900, height: 400}, square: {width: 500, height: 500}});
  assert.equal(failed.passed, false);
});
