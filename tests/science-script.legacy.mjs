import assert from "node:assert/strict";
import test from "node:test";
import {analyzeScienceScript, reportMatchesScienceInputs, scienceScriptFingerprints} from "../legacy/science-script/science-script-lib.mjs";

const goodInputs = {
  brief: `# SW 科普短视频脚本 Brief
## 目标受众
- 人群：刚接触 MBTI 的职场人
- 具体处境：发现很会社交的人测评结果却偏好内向
## 唯一科普问题
很会社交的人，为什么仍可能偏好内向？
## 核心结论（8～25 字）
MBTI 描述偏好，不给能力打分
## 观众承诺
学会区分一个人做得好和做完以后如何恢复能量。
## 三个内容角度
- A：社交能力与偏好
- B：外向行为的来源
- C：能量恢复方式
- 采用：A
## 共识与裂缝
- 常见理解：能说会道就是外向
- 漏掉的关键：行为熟练度不等于心理偏好
## 来源与专业边界
- 来源编号：S-01
- 可讲事实：类型偏好不等同于能力高低
- 待专业审核：能量恢复的具体表述
- 不可外推：不能仅凭一次社交表现判定类型
## 主验证目标
用同一个人会主持但会后需要独处的对比，解释能力与偏好的差别。`,
  hooks: `# SW 短视频钩子实验
## H-01
- 类型：反常识
- 口播：很会社交的人，为什么仍可能偏好内向？
- 屏幕字：会聊天，不等于偏好外向
- 首帧：会主持的人独自收拾会场
- 承诺：解释能力与偏好的差别
- 正文兑现：用会后恢复方式给出判断
## H-02
- 类型：高识别场景
- 口播：台上最会说的人，下台后为什么只想一个人待着？
- 屏幕字：台上外向，台下内向？
- 首帧：舞台与空房间对比
- 承诺：看懂两种表现为什么不矛盾
- 正文兑现：区分熟练行为和自然偏好
## H-03
- 类型：代价后果
- 口播：只看一个人会不会聊天，最容易把 MBTI 看反。
- 屏幕字：别用能力猜类型
- 首帧：错误标签被撕下
- 承诺：给出更可靠的观察角度
- 正文兑现：观察行为后的能量恢复
## 选择
- 采用：H-01
- 中段再钩：关键不是他会不会说，而是说完以后发生了什么。
- 再钩位置：专业机制之后`,
  chain: `# SW 短视频科普论证链
## B-01 · 具体现象
- 内容：有人主持会议很熟练，会后却需要独处恢复。
- 来源：S-01
- 画面：会场与空会议室
## B-02 · 常见理解与漏掉的关键
- 内容：很多人把能说会道直接等同于偏好外向，却漏掉训练和角色要求。
- 来源：S-01
- 画面：外向标签与训练卡片
## B-03 · 专业机制
- 内容：MBTI 描述的是更自然的心理偏好，不是能力评分。
- 来源：S-01
- 画面：能力与偏好两条轴
## B-04 · 例子或对比
- 内容：同一个人能主持两小时，会后却要独处半天恢复。
- 来源：S-01
- 画面：两格对比
## B-05 · 边界
- 内容：一次行为不能判定类型，测评也不能替代专业解释。
- 来源：S-01
- 画面：边界提示
## B-06 · 带走的判断
- 内容：少问他会不会，多观察什么状态让他更自然。
- 来源：S-01
- 画面：观察问题`,
  draft: `# 口播候选
## 口播稿
很会社交的人，为什么仍可能偏好内向？

我们常把能说会道直接等同于外向。但你看，一个人做得好，可能只是因为受过训练，或者岗位要求他必须做到。

MBTI 描述的是更自然的心理偏好，不是能力评分。关键不是他会不会说，而是说完以后发生了什么。

比如同一个人能主持两小时，会后却要独处半天恢复。主持是他已经掌握的能力，独处恢复才暴露了他更自然的能量方向。这两件事并不矛盾。

当然，一次行为不能判定类型，测评也不能替代专业解释。下次别急着问一个人会不会社交，多观察什么状态让他更自然。MBTI 描述偏好，不给能力打分。`,
  review: {
    schemaVersion: 2,
    reviewerRole: "second-pass-science-editor",
    decision: "pass",
    writer: {id: "writer-test", contextId: "draft-context-test"},
    reviewer: {id: "reviewer-test", contextId: "review-context-test", mode: "new-context-agent", recordRef: "test-fixture/independent-review-record"},
    inputFingerprints: {},
    checks: {oneQuestion: true, oneThesis: true, hookPayoffAligned: true, mechanismExplained: true, exampleConcrete: true, boundaryPresent: true, informationGain: true, genericLanguageRemoved: true, factsTraceable: true, swOfficialVoice: true, noPersonalAttribution: true},
    evidence: {
      hook: {excerpt: "很会社交的人，为什么仍可能偏好内向？", reason: "以会社交但偏好内向的具体矛盾提出唯一问题。", beatIds: ["B-01"]},
      rehook: {excerpt: "关键不是他会不会说，而是说完以后发生了什么。", reason: "把观察从社交表现推进到活动后的恢复过程。", beatIds: ["B-03"]},
      mechanism: {excerpt: "MBTI 描述的是更自然的心理偏好，不是能力评分。", reason: "明确区分偏好与能力两个维度，解释开头看似矛盾的情形。", beatIds: ["B-03"]},
      exampleOrContrast: {excerpt: "同一个人能主持两小时，会后却要独处半天恢复。", reason: "同一人物在主持和会后恢复两个情境中形成具体对照。", beatIds: ["B-04"]},
      boundary: {excerpt: "一次行为不能判定类型，测评也不能替代专业解释。", reason: "明示单次观察和测评不能承担的判断，约束结论外推。", beatIds: ["B-05"]},
      takeaway: {excerpt: "多观察什么状态让他更自然。", reason: "把类型猜测改成可操作的观察问题，回到偏好与能力之分。", beatIds: ["B-06"]}
    },
    threeQuestions: {
      learningOutcome: {answer: "观众学会区分社交技能表现与自然心理偏好。", excerpt: "MBTI 描述偏好，不给能力打分。", reason: "末句直接表达本片新增的判断维度，不是鼓励性口号。", beatIds: ["B-06"]},
      mechanism: {answer: "训练与岗位要求能提高行为熟练度，因此做得好不等于自然偏好。", excerpt: "一个人做得好，可能只是因为受过训练，或者岗位要求他必须做到。", reason: "给出行为熟练度的其他成因，说明不能由社交能力直接推出偏好。", beatIds: ["B-02", "B-03"]},
      example: {answer: "同一人主持熟练而会后独处恢复，展示能力与偏好可以并存。", excerpt: "同一个人能主持两小时，会后却要独处半天恢复。", reason: "对象、行为、时长和后续状态具体可辨，是解释用对比而非真实效果证明。", beatIds: ["B-04"]}
    },
    knowledgeBeatMapping: [
      {beatId: "B-01", chainExcerpt: "有人主持会议很熟练，会后却需要独处恢复。", draftExcerpt: "同一个人能主持两小时，会后却要独处半天恢复。", reason: "稿件用主持与会后独处的同一人物，把链条中的现象具体呈现。"},
      {beatId: "B-02", chainExcerpt: "很多人把能说会道直接等同于偏好外向，却漏掉训练和角色要求。", draftExcerpt: "一个人做得好，可能只是因为受过训练，或者岗位要求他必须做到。", reason: "实际稿件提供训练和岗位这两个成因，补足原先判断中的遗漏。"},
      {beatId: "B-03", chainExcerpt: "MBTI 描述的是更自然的心理偏好，不是能力评分。", draftExcerpt: "MBTI 描述的是更自然的心理偏好，不是能力评分。", reason: "稿件原文承接偏好与能力的区分，形成此拍的概念解释。"},
      {beatId: "B-04", chainExcerpt: "同一个人能主持两小时，会后却要独处半天恢复。", draftExcerpt: "主持是他已经掌握的能力，独处恢复才暴露了他更自然的能量方向。", reason: "稿件把主持和恢复分别映射到能力和偏好，兑现例子的解释任务。"},
      {beatId: "B-05", chainExcerpt: "一次行为不能判定类型，测评也不能替代专业解释。", draftExcerpt: "一次行为不能判定类型，测评也不能替代专业解释。", reason: "稿件原样保留单次行为和测评的推断限制，避免无条件下结论。"},
      {beatId: "B-06", chainExcerpt: "少问他会不会，多观察什么状态让他更自然。", draftExcerpt: "下次别急着问一个人会不会社交，多观察什么状态让他更自然。", reason: "结尾给出下次可以实践的观察方向，而不是重复工具名称。"}
    ],
    informationGain: ["一个人做得好，可能只是因为受过训练", "MBTI 描述的是更自然的心理偏好，不是能力评分", "主持是他已经掌握的能力，独处恢复才暴露了他更自然的能量方向"],
    genericSubstitutionTest: {originalTerm: "MBTI", replacement: "技能考核", originalExcerpt: "MBTI 描述的是更自然的心理偏好，不是能力评分。", substitutedExcerpt: "技能考核 描述的是更自然的心理偏好，不是能力评分。", stillValid: false, reason: "技能考核可以直接评价能力，替换后对评价对象的描述发生冲突，不再支撑偏好与能力的专门区分。"},
    notes: []
  }
};

function bindReview(inputs) {
  const fingerprints = scienceScriptFingerprints(inputs);
  inputs.review.inputFingerprints = Object.fromEntries(["brief", "hooks", "chain", "draft"].map((key) => [key, fingerprints[key]]));
  return inputs;
}
bindReview(goodInputs);

test("accepts a source-traceable science explainer with hook, mechanism, example and boundary", () => {
  const report = analyzeScienceScript(goodInputs);
  assert.equal(report.passed, true, JSON.stringify(report.checks.filter((check) => !check.passed), null, 2));
  assert.equal(report.schemaVersion, 3);
  assert.equal(report.structure.passed, true);
  assert.equal(report.independentReview.status, "recorded-pass");
  assert.equal(report.independentReview.identityVerification, "not-performed");
  assert.equal(report.assurance, "structural-checks-and-recorded-independent-review-only");
  assert.equal(report.metrics.knowledgeBeats, 6);
  assert.equal(report.metrics.knowledgeBeatRoles.mechanism[0], "B-03");
});

test("rejects the old generic motivational monologue even when it sounds conversational", () => {
  const weak = {
    brief: goodInputs.brief,
    hooks: goodInputs.hooks,
    chain: goodInputs.chain,
    draft: `## 口播稿\n你是不是也觉得，怎么努力都不对？先别急。可能不是你不够好，是你拿错了尺子。很多时候我们需要换个角度看自己。你看，真正重要的不是标签，而是理解。其实，只要愿意了解自己，就能走得更远。所以别怀疑自己，答案一直都在你心里。`,
    review: {...goodInputs.review, decision: "revise", evidence: {...goodInputs.review.evidence, hook: "你是不是也觉得，怎么努力都不对？"}, informationGain: []}
  };
  const report = analyzeScienceScript(weak);
  assert.equal(report.passed, false);
  assert(report.checks.some((check) => check.name === "selected hook exists and opens the draft" && !check.passed));
  assert(report.checks.some((check) => check.name === "second-pass science review explicitly passes" && !check.passed));
  assert(report.checks.some((check) => check.name === "information gain density fits a 45-90 second explainer" && !check.passed));
});

test("invalidates a previously passed report after any source file changes", () => {
  const report = analyzeScienceScript(goodInputs);
  assert.equal(reportMatchesScienceInputs(report, goodInputs), true);
  assert.equal(reportMatchesScienceInputs({...report, schemaVersion: 2}, goodInputs), false);
  assert.equal(reportMatchesScienceInputs(report, {...goodInputs, draft: `${goodInputs.draft}\n新增一句。`}), false);
});

test("checkboxes cannot replace independent identities, work context and review record", () => {
  for (const mutate of [
    (review) => { delete review.reviewer; },
    (review) => { review.reviewer.id = review.writer.id; },
    (review) => { review.reviewer.contextId = review.writer.contextId; },
    (review) => { review.reviewer.mode = "same-context-role-switch"; },
    (review) => { review.reviewer.recordRef = ""; },
  ]) {
    const inputs = structuredClone(goodInputs);
    mutate(inputs.review);
    const report = analyzeScienceScript(inputs);
    assert.equal(report.structure.passed, true);
    assert.equal(report.independentReview.status, "incomplete-or-revise");
    assert.equal(report.passed, false);
  }
});

test("accepts a separately recorded human review without claiming machine semantic approval", () => {
  const inputs = structuredClone(goodInputs);
  inputs.review.reviewer.mode = "separate-human";
  const report = analyzeScienceScript(inputs);
  assert.equal(report.passed, true);
  assert.match(report.independentReview.limitation, /不能认证/u);
});

test("rerunning QC cannot reapprove a review bound to an older draft or chain", () => {
  for (const key of ["brief", "hooks", "chain", "draft"]) {
    const inputs = structuredClone(goodInputs);
    inputs[key] += "\n当前版本修订。";
    const report = analyzeScienceScript(inputs);
    assert.equal(report.passed, false, key);
    assert(report.checks.some((check) => check.name === "independent review binds all current content inputs" && !check.passed));
  }
});

test("rejects legacy checkbox-only schema even when every assertion is true", () => {
  const inputs = structuredClone(goodInputs);
  inputs.review.schemaVersion = 1;
  for (const key of Object.keys(inputs.review.evidence)) inputs.review.evidence[key] = inputs.review.evidence[key].excerpt;
  assert.equal(analyzeScienceScript(inputs).passed, false);
});

test("rejects all six evidence roles copied from one sentence despite different snippets", () => {
  const inputs = structuredClone(goodInputs);
  const fragments = ["一个人做得好", "可能只是因为受过训练", "或者岗位要求他必须做到", "因为受过训练", "岗位要求他必须做到", "人做得好"];
  Object.values(inputs.review.evidence).forEach((item, index) => { item.excerpt = fragments[index]; });
  const report = analyzeScienceScript(inputs);
  assert.equal(report.passed, false);
  assert(report.checks.some((check) => check.name === "six evidence roles cannot reuse one sentence or one repeated rationale" && !check.passed));
});

test("rejects repeated generic encouragement dressed as six categories and information gains", () => {
  const inputs = structuredClone(goodInputs);
  const generic = "只要换个角度理解自己，就能找到更适合自己的方向。";
  inputs.draft += `\n${generic.repeat(5)}`;
  for (const item of Object.values(inputs.review.evidence)) { item.excerpt = generic; item.reason = "这句话说明了理解自己非常重要并且可以帮助成长。"; }
  inputs.review.informationGain = [generic, generic, generic];
  bindReview(inputs);
  const report = analyzeScienceScript(inputs);
  assert.equal(report.passed, false);
  assert(report.checks.some((check) => check.name === "six evidence roles cannot reuse one sentence or one repeated rationale" && !check.passed));
  assert(report.checks.some((check) => check.name === "information gain density fits a 45-90 second explainer" && !check.passed));
});

test("rejects missing or duplicated answers to the three substantive review questions", () => {
  for (const mutate of [
    (review) => { delete review.threeQuestions.mechanism; },
    (review) => { review.threeQuestions.example = structuredClone(review.threeQuestions.learningOutcome); },
    (review) => { review.evidence.mechanism.reason = ""; },
    (review) => { review.evidence.mechanism.beatIds = ["B-99"]; },
  ]) {
    const inputs = structuredClone(goodInputs);
    mutate(inputs.review);
    assert.equal(analyzeScienceScript(inputs).passed, false);
  }
});

test("chain labels alone cannot pass when claims are not mapped to current draft evidence", () => {
  for (const mutate of [
    (review) => { review.knowledgeBeatMapping.pop(); },
    (review) => { review.knowledgeBeatMapping[2].chainExcerpt = "这个定义并不存在于当前知识链。"; },
    (review) => { review.knowledgeBeatMapping[2].draftExcerpt = "这段专业解释只写在知识链却不在实际口播稿。"; },
    (review) => { review.knowledgeBeatMapping[2].beatId = "B-02"; },
  ]) {
    const inputs = structuredClone(goodInputs);
    mutate(inputs.review);
    const report = analyzeScienceScript(inputs);
    assert.equal(report.passed, false);
    assert(report.checks.some((check) => check.name === "every knowledge beat maps its current chain claim to the actual draft" && !check.passed));
  }
});

test("substitution false alone is not evidence of an actual tool-name substitution", () => {
  const inputs = structuredClone(goodInputs);
  inputs.review.genericSubstitutionTest.substitutedExcerpt = inputs.review.genericSubstitutionTest.originalExcerpt;
  assert.equal(analyzeScienceScript(inputs).passed, false);
});

test("accepts one retained opening and natural progression without a separate rehook", () => {
  const inputs = structuredClone(goodInputs);
  inputs.hooks = inputs.hooks.replace(/## H-02[\s\S]*?(?=## 选择)/u, "").replace(/- 中段再钩：[^\n]*/u, "- 中段再钩：");
  bindReview(inputs);
  const report = analyzeScienceScript(inputs);
  assert.equal(report.metrics.hookCandidates, 1);
  assert.equal(report.passed, true, JSON.stringify(report.checks.filter((item) => !item.passed)));
  delete inputs.review.evidence.rehook;
  assert.equal(analyzeScienceScript(inputs).passed, false, "optional rhetorical rehook does not remove evidence of actual progression");
});

test("rejects a declared rehook absent from the actual draft", () => {
  const inputs = structuredClone(goodInputs);
  inputs.hooks = inputs.hooks.replace(/- 中段再钩：[^\n]*/u, "- 中段再钩：这段承诺根本没有写进口播稿。");
  bindReview(inputs);
  assert.equal(analyzeScienceScript(inputs).passed, false);
});
