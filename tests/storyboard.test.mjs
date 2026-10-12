import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import {analyzeStoryboard, reportMatchesStoryboardInputs} from "../scripts/storyboard-lib.mjs";

const chain = [
  ["B-01", "具体现象"], ["B-02", "常见误区与认知缺口"], ["B-03", "专业机制"],
  ["B-04", "例子或对比"], ["B-05", "边界"], ["B-06", "带走的判断"],
].map(([id, type]) => `## ${id} · ${type}\n- 内容：这是足够具体的知识内容\n- 来源：S-01`).join("\n\n");

const entries = [
  ["B-01", "orient", "s2"], ["B-02", "replace", "s2"], ["B-03", "cause-effect", "s2"],
  ["B-04", "case", "s3"], ["B-05", "boundary", "s4"], ["B-06", "reveal", "s5"],
];
const explanationMap = entries.map(([id, operation, sceneId]) => `## ${id}\n- 观众原来以为：只需要记住一个结论\n- 观众看完知道：这个知识点之间存在具体关系\n- 视觉任务：${operation}\n- 证据来源：S-01\n- 画面依据：使用真实对象和关系变化\n- 为什么有帮助：让观众直接看见前后认知差异\n- 对应镜头：${sceneId}\n- 禁止替代：不能只放一句结论大字`).join("\n\n");

const treatment = `# 全片视觉导演方案

- 核心视觉命题：把错误答案拆开并重建为观众能够复述的专业关系
- 起点认知：观众只想快速记住结论
- 终点认知：观众看见机制证据边界和行动
- 视觉母题：一张持续被改写的工作坊教案桌面
- 主体接力线：错误答案交给机制关系机制再交给证据与边界
- 相机总策略：只在认知转折处推近或拉开并维持空间方向连续
- 运动能量曲线：开头快速建立冲突中段减速解释结尾收静停留
- 素材策略：优先原生关系动画技术图只承担具体证据
- 视觉元素职责：只负责提出旧判断遮挡和揭示
- 声音策略：转折词触发视觉换挡
- 克制原则：同一时刻只有一个主要动作并保留空象限
- 禁止模板化：禁止逐句弹字等距轮播和每段同构卡片

## ACT-1 · 建立冲突
- 认知目标：让观众发现旧答案不成立
- 画面状态：输入纸条围住一个错误答案
- 主要运动：答案倾斜并被红笔划除
- 交接：红笔划痕交给机制节点

## ACT-2 · 拆解机制
- 认知目标：让观众看见因素之间的关系
- 画面状态：三个节点按先后建立联系
- 主要运动：关系线生长并把重心交给结果
- 交接：结果节点变成证据取景框

## ACT-3 · 证据收束
- 认知目标：让观众理解证据边界与行动
- 画面状态：证据聚焦后拉开为左右边界
- 主要运动：局部推近边界分离结尾收静
- 交接：两侧退场交给最终判断`;

const scenes = {
  video: {duration: 30},
  scenes: [
    {id: "cover", visual: "cover", start: 0, end: 3},
    {id: "s2", visual: "cause-map", start: 3, end: 11, beats: [{at: 1, anchor: "因果关系", action: "主体出现并建立关系", target: "当前核心对象"}]},
    {id: "s3", visual: "evidence-focus", start: 11, end: 18, asset: "unit:AIworkspace/10-shared-assets/technical-diagram.png", assetRole: "technical-diagram", beats: [{at: 1, anchor: "真实案例", action: "主体出现并建立关系", target: "当前核心对象"}]},
    {id: "s4", visual: "boundary-split", start: 18, end: 24, beats: [{at: 1, anchor: "边界", action: "主体出现并建立关系", target: "当前核心对象"}]},
    {id: "s5", visual: "cta", start: 24, end: 28},
    {id: "cta", visual: "cta", start: 28, end: 30},
  ],
  subtitles: [
    {start: 3, end: 6, text: "看见因果关系"},
    {start: 11, end: 14, text: "真实案例证明"},
    {start: 18, end: 21, text: "边界必须说清"},
    {start: 24, end: 27, text: "最后带走判断"},
  ],
};

const shot = (sceneId, knowledgeBeats, t, anchor, primaryVisualJob, visual) => ({
  sceneId, knowledgeBeats,
  viewerBefore: "观众还停在旧的简单判断",
  viewerAfter: "观众能看见对象之间的具体关系",
  intent: "让观众通过关系变化理解这一段的专业意义",
  visualStory: `${sceneId} 中两个主体先后进入并通过关系线改变画面中心的判断`,
  openingFrame: `${sceneId} 以旧判断占据中央位置开始`,
  closingFrame: `${sceneId} 以新关系完整建立结束`,
  primaryVisualJob,
  planes: {
    background: {content: "浅红纸张环境", motion: "缓慢横向移动", purpose: "维持空间连续"},
    subject: {content: "当前核心对象", motion: "逐项进入并建立关系", purpose: "承担认知变化"},
    text: {content: "必要标签与结论", motion: "随主体进入后保持", purpose: "标识对象关系"},
  },
  subjectGroups: ["核心对象", "解释对象"], emptyQuadrant: "top-right",
  subjectLifecycle: {enter: "主体从边缘进入", hold: "关系建立后保持", retire: "旧主体退到边缘"},
  cameraPhrase: {path: "中景轻推到主体", purpose: "强调关系变化", continuity: "沿同一方向交给下一镜"},
  handoff: {fromPrevious: "承接上一镜中心对象", toNext: "把当前结果交给下一镜"},
  motionPhases: {enter: "主体依次进入", hold: "关系完整建立", exit: "旧主体缓慢退出"},
  semanticBeats: [{t, anchor, action: "主体出现并建立关系", target: "当前核心对象", relation: "当前对象与解释对象发生作用", visualStateAfter: "画面形成一个可见的新关系"}],
  implementation: {visual, cameraPath: structuredClone(scenes.scenes.find((scene) => scene.id === sceneId).cameraPath), subjectHandoff: structuredClone(scenes.scenes.find((scene) => scene.id === sceneId).subjectHandoff), why: "该组件能够直接呈现当前对象之间的关系变化", forbiddenShortcut: "禁止替换为一句大字"},
});

for (const scene of scenes.scenes) {
  const duration = scene.end - scene.start;
  scene.cameraPath = [{t: 0, x: 0, y: 0, scale: 1, rotate: 0}, {t: duration, x: 0, y: 0, scale: 1, rotate: 0}];
  scene.subjectHandoff = {id: `${scene.id}-group`, target: "scene-content", action: "hold", fromSceneId: null, toSceneId: null, path: [{t: 0, x: 0, y: 0, scale: 1, opacity: 1}, {t: duration, x: 0, y: 0, scale: 1, opacity: 1}]};
}

const shotbook = {schemaVersion: 3, directingMode: "talkcraft-adapted-sw", scenes: [
  shot("cover", [], 1, "因果关系", "orient", "cover"),
  shot("s2", ["B-01", "B-02", "B-03"], 4, "因果关系", "explain", "cause-map"),
  shot("s3", ["B-04"], 12, "真实案例", "prove", "evidence-focus"),
  shot("s4", ["B-05"], 19, "边界", "boundary", "boundary-split"),
  shot("s5", ["B-06"], 25, "带走判断", "reveal", "cta"),
  shot("cta", [], 29, "带走判断", "reveal", "cta"),
]};

const script = "先看见因果关系，再用真实案例证明。边界必须说清，最后带走判断。";
const goodInputs = {chain, treatment, explanationMap, shotbook, scenes, script};

test("accepts a complete SW visual explanation map and speech-anchored SHOTBOOK", () => {
  const report = analyzeStoryboard(goodInputs);
  assert.equal(report.passed, true, JSON.stringify(report.checks.filter((check) => !check.passed), null, 2));
  assert.equal(report.schemaVersion, 4);
  assert.equal(report.executionPassed, true);
  assert.equal(report.metrics.knowledgeBeatsIdentified, 6);
  assert.equal(report.metrics.mappedKnowledgeBeats, 6);
  assert.equal(report.metrics.directorScenes, 6);
  assert.equal(report.metrics.semanticBeats, 6);
  assert.equal(reportMatchesStoryboardInputs(report, goodInputs), true);
});

test("accepts legacy treatment labels without requiring paper in new treatments", () => {
  const report = analyzeStoryboard({...goodInputs, treatment: treatment.replace("视觉元素职责", "视觉元素职责")});
  assert.equal(report.passed, true);
});

test("rejects a mechanism that is only a generic statement", () => {
  const weakMap = explanationMap.replace("- 视觉任务：cause-effect", "- 视觉任务：orient");
  const report = analyzeStoryboard({...goodInputs, explanationMap: weakMap});
  assert.equal(report.passed, false);
  assert(report.checks.some((check) => check.name === "mechanism uses relational explanation instead of a slogan" && !check.passed));
});

test("rejects SHOTBOOK claims that do not match the rendered Remotion component", () => {
  const mismatchedScenes = {...scenes, scenes: scenes.scenes.map((scene) => scene.id === "s2" ? {...scene, visual: "statement", beats: undefined} : scene)};
  const report = analyzeStoryboard({...goodInputs, scenes: mismatchedScenes});
  assert.equal(report.passed, false);
  assert(report.checks.some((check) => check.name.includes("SHOTBOOK") && JSON.stringify(check.detail).includes("与实际 visual=statement 不一致")));
});

test("rejects Xiaohongshu and WeChat page screenshots as video assets", () => {
  const withPlatformScreenshot = {...scenes, scenes: scenes.scenes.map((scene) => scene.id === "s3" ? {...scene, asset: "unit:AIworkspace/30-wechat/current/output/article-full.png"} : scene)};
  const report = analyzeStoryboard({...goodInputs, scenes: withPlatformScreenshot});
  assert.equal(report.passed, false);
  assert(report.checks.some((check) => check.name === "platform layout screenshots are not video assets" && !check.passed));
});

test("accepts a substantive technical diagram as evidence", () => {
  const withDiagram = {...scenes, scenes: scenes.scenes.map((scene) => scene.id === "s3" ? {...scene, asset: "unit:AIworkspace/30-wechat/current/output/content-image.png", assetRole: "technical-diagram"} : scene)};
  const report = analyzeStoryboard({...goodInputs, scenes: withDiagram});
  assert.equal(report.passed, true, JSON.stringify(report.checks.filter((check) => !check.passed), null, 2));
});

test("rejects stale SHOTBOOK after scenes change", () => {
  const report = analyzeStoryboard(goodInputs);
  assert.equal(reportMatchesStoryboardInputs({...report, schemaVersion: 2}, goodInputs), false);
  assert.equal(reportMatchesStoryboardInputs(report, {...goodInputs, scenes: {...scenes, video: {duration: 31}}}), false);
});

test("rejects a missing whole-video director treatment", () => {
  const report = analyzeStoryboard({...goodInputs, treatment: ""});
  assert.equal(report.passed, false);
  assert(report.checks.some((check) => check.name.includes("片级导演方案") && !check.passed));
});

test("rejects the old shallow SHOTBOOK schema", () => {
  const report = analyzeStoryboard({...goodInputs, shotbook: {...shotbook, schemaVersion: 1, directingMode: undefined}});
  assert.equal(report.passed, false);
  assert(report.checks.some((check) => check.name === "SHOTBOOK uses director schema v3" && !check.passed));
});

test("rejects stale storyboard report after treatment changes", () => {
  const report = analyzeStoryboard(goodInputs);
  assert.equal(reportMatchesStoryboardInputs(report, {...goodInputs, treatment: treatment.replace("错误答案", "旧有答案")}), false);
});


test("accepts content-driven single-act treatment with an advisory warning", () => {
  const report = analyzeStoryboard({...goodInputs, treatment: treatment.split("## ACT-2")[0]});
  assert.equal(report.passed, true, JSON.stringify(report.checks.filter((check) => !check.passed)));
  assert.equal(report.metrics.directorActs, 1);
  assert(report.warnings.length > 0);
});

test("rejects a missing camera path and a valid but unbound director movement", () => {
  const missing = structuredClone(goodInputs);
  delete missing.scenes.scenes[0].cameraPath;
  assert.equal(analyzeStoryboard(missing).executionPassed, false);
  const drift = structuredClone(goodInputs);
  drift.scenes.scenes[0].cameraPath[1].x = 35;
  assert.equal(analyzeStoryboard(drift).executionPassed, false);
  assert.equal(analyzeStoryboard(drift).passed, false);
});

test("rejects subject handoff execution drift and incomplete timeline binding", () => {
  const drift = structuredClone(goodInputs);
  drift.scenes.scenes[1].subjectHandoff.id = "different-object";
  assert.equal(analyzeStoryboard(drift).executionPassed, false);
  const omitted = structuredClone(goodInputs);
  omitted.shotbook.scenes.shift();
  assert.equal(analyzeStoryboard(omitted).executionPassed, false);
});
