import crypto from "node:crypto";
import {extractVoiceoverBody} from "../../scripts/voiceover-lib.mjs";

const compact = (value) => [...String(value || "").replace(/\s/gu, "")].length;
const fingerprint = (value) => crypto.createHash("sha256").update(String(value || "")).digest("hex");
const normalize = (value) => String(value || "")
  .replace(/[*_`~#>]/gu, "")
  .replace(/[\p{P}\p{Z}\p{S}]/gu, "")
  .toLowerCase();

function section(markdown, heading) {
  const normalized = String(markdown || "").replace(/\r\n/gu, "\n");
  const pattern = new RegExp(`^##\\s+${heading}\\s*$`, "mu");
  const match = normalized.match(pattern);
  if (!match) return "";
  const tail = normalized.slice(match.index + match[0].length);
  const next = tail.search(/^##\s+/mu);
  return tail.slice(0, next < 0 ? tail.length : next).trim();
}

function field(block, name) {
  return block.match(new RegExp(`^-[ \\t]*${name}：[ \\t]*([^\\r\\n]*)$`, "mu"))?.[1]?.trim() || "";
}

function hookBlocks(markdown) {
  const normalized = String(markdown || "").replace(/\r\n/gu, "\n");
  const matches = [...normalized.matchAll(/^##\s+(H-\d{2})\s*$/gmu)];
  return matches.map((match, index) => {
    const start = match.index + match[0].length;
    const end = matches[index + 1]?.index ?? normalized.length;
    const block = normalized.slice(start, end).trim();
    return {id: match[1], type: field(block, "类型"), spoken: field(block, "口播"), promise: field(block, "承诺"), payoff: field(block, "正文兑现")};
  });
}

function chainBlocks(markdown) {
  const normalized = String(markdown || "").replace(/\r\n/gu, "\n");
  const matches = [...normalized.matchAll(/^##\s+(B-\d{2})\s*·\s*([^\n]+)\s*$/gmu)];
  return matches.map((match, index) => {
    const start = match.index + match[0].length;
    const end = matches[index + 1]?.index ?? normalized.length;
    const block = normalized.slice(start, end).trim();
    return {id: match[1], type: match[2].trim(), content: field(block, "内容"), source: field(block, "来源")};
  });
}

function evidenceAppears(draft, excerpt) {
  if (typeof excerpt !== "string") return false;
  const needle = normalize(excerpt);
  return needle.length >= 4 && normalize(draft).includes(needle);
}

function validReview(review) {
  return review && typeof review === "object" && !Array.isArray(review);
}

const KNOWLEDGE_ROLE_PATTERNS = {
  entry: /具体现象|具体问题|冲突|场景/u,
  gap: /常见理解|常见误区|误解|漏掉的关键|认知缺口|反常识/u,
  mechanism: /专业机制|机制|原理|因果|解释/u,
  evidence: /例子|案例|对比|证据|情境/u,
  boundary: /边界|适用条件|限制|不能替代/u,
  takeaway: /带走的判断|结论|行动|建议|追问|判断/u,
};

function coveredKnowledgeRoles(blocks) {
  return Object.fromEntries(Object.entries(KNOWLEDGE_ROLE_PATTERNS).map(([role, pattern]) => [
    role,
    blocks.filter((item) => pattern.test(item.type)).map((item) => item.id),
  ]));
}

export function scienceScriptFingerprints(inputs) {
  return {
    brief: fingerprint(inputs.brief),
    hooks: fingerprint(inputs.hooks),
    chain: fingerprint(inputs.chain),
    draft: fingerprint(extractVoiceoverBody(inputs.draft)),
    review: fingerprint(JSON.stringify(inputs.review || {})),
  };
}

export function reportMatchesScienceInputs(report, inputs) {
  const current = scienceScriptFingerprints(inputs);
  return report?.schemaVersion === 3 && report?.passed === true && report?.structure?.passed === true && report?.independentReview?.status === "recorded-pass" && Object.entries(current).every(([key, value]) => report.fingerprints?.[key] === value);
}

export function analyzeScienceScript(inputs) {
  const brief = String(inputs.brief || "");
  const hooks = String(inputs.hooks || "");
  const chain = String(inputs.chain || "");
  const draft = extractVoiceoverBody(inputs.draft);
  const review = validReview(inputs.review) ? inputs.review : {};
  const uniqueQuestion = section(brief, "唯一科普问题");
  const thesis = section(brief, "核心结论（8～25 字）");
  const audience = section(brief, "目标受众");
  const sourceBoundary = section(brief, "来源与专业边界");
  const validationTarget = section(brief, "主验证目标");
  const candidates = hookBlocks(hooks);
  const selection = section(hooks, "选择");
  const selectedId = field(selection, "采用");
  const rehook = field(selection, "中段再钩");
  const selected = candidates.find((item) => item.id === selectedId);
  const blocks = chainBlocks(chain);
  const roles = coveredKnowledgeRoles(blocks);
  const sequentialIds = blocks.every((item, index) => item.id === `B-${String(index + 1).padStart(2, "0")}`);
  const knownReviewChecks = ["oneQuestion", "oneThesis", "hookPayoffAligned", "mechanismExplained", "exampleConcrete", "boundaryPresent", "informationGain", "genericLanguageRemoved", "factsTraceable", "swOfficialVoice", "noPersonalAttribution"];
  const evidenceKeys = ["hook", "rehook", "mechanism", "exampleOrContrast", "boundary", "takeaway"];
  const evidence = review.evidence || {};
  const informationGain = Array.isArray(review.informationGain) ? review.informationGain : [];
  const requiredInformationGain = Math.min(8, Math.max(3, Math.ceil(compact(draft) / 90)));
  const substitution = review.genericSubstitutionTest || {};
  const writer = review.writer || {};
  const reviewer = review.reviewer || {};
  const inputFingerprints = scienceScriptFingerprints(inputs);
  const questions = review.threeQuestions || {};
  const questionKeys = ["learningOutcome", "mechanism", "example"];
  const mapping = Array.isArray(review.knowledgeBeatMapping) ? review.knowledgeBeatMapping : [];
  const meaningful = (value, minimum = 8) => typeof value === "string" && compact(value) >= minimum;
  const validBeatIds = (ids) => Array.isArray(ids) && ids.length > 0 && new Set(ids).size === ids.length && ids.every((id) => blocks.some((block) => block.id === id));
  const cited = (item) => validReview(item) && evidenceAppears(draft, item.excerpt) && meaningful(item.reason, 12) && validBeatIds(item.beatIds);
  const excerpts = evidenceKeys.map((key) => evidence[key]?.excerpt);
  const sentences = draft.split(/[。！？!?\n]+/u).map(normalize).filter(Boolean);
  const allInOneSentence = sentences.some((sentence) => excerpts.every((excerpt) => typeof excerpt === "string" && normalize(excerpt).length >= 4 && sentence.includes(normalize(excerpt))));
  const checks = [];
  const add = (name, passed, detail = null, layer = "structure") => checks.push({name, passed: Boolean(passed), detail, layer});
  const addReview = (name, passed, detail = null) => add(name, passed, detail, "independent-review-record");

  add("script brief defines a concrete audience", compact(audience) >= 12 && /人群：\s*\S+/u.test(audience) && /具体处境：\s*\S+/u.test(audience), {audience});
  add("script has exactly one concrete science question", compact(uniqueQuestion) >= 10 && compact(uniqueQuestion) <= 60 && !/[\n。；;]/u.test(uniqueQuestion.replace(/[？?]\s*$/u, "")), {uniqueQuestion});
  add("core thesis directly fits one speakable sentence", compact(thesis) >= 8 && compact(thesis) <= 25 && !/[\n。；;]/u.test(thesis.replace(/[。！？!?]\s*$/u, "")), {thesis, characters: compact(thesis)});
  add("brief contains traceable sources and professional boundary", /S-\d{2}/u.test(sourceBoundary) && /可讲事实：\s*\S+/u.test(sourceBoundary) && /待专业审核：\s*\S+/u.test(sourceBoundary) && /不可外推：\s*\S+/u.test(sourceBoundary), {sourceBoundary});
  add("brief states how the thesis will be proven", compact(validationTarget) >= 12, {validationTarget});
  add("hook lab contains complete opening candidates", candidates.length >= 1 && candidates.every((item) => compact(item.spoken) >= 8 && compact(item.promise) >= 6 && compact(item.payoff) >= 6), candidates);
  add("selected hook exists and opens the draft", Boolean(selected) && evidenceAppears([...draft.replace(/\s/gu, "")].slice(0, 60).join(""), selected?.spoken), {selectedId, selectedHook: selected?.spoken, opening: [...draft.replace(/\s/gu, "")].slice(0, 60).join("")});
  add("optional mid-script rehook matches the draft when provided", !rehook || (compact(rehook) >= 6 && evidenceAppears(draft, rehook)), {rehook});
  add("knowledge chain uses dynamic sequential beats and covers the complete science logic", sequentialIds && blocks.every((item) => compact(item.type) >= 2 && compact(item.content) >= 8) && Object.values(roles).every((ids) => ids.length >= 1), {ids: blocks.map((item) => item.id), roles, blocks});
  const traceableIds = [...new Set([...roles.mechanism, ...roles.evidence])];
  add("knowledge mechanism and evidence remain source-traceable", roles.mechanism.length >= 1 && roles.evidence.length >= 1 && traceableIds.every((id) => /S-\d{2}/u.test(blocks.find((item) => item.id === id)?.source || "")), {traceableIds, blocks});
  add("draft length matches the declared short or standard format", compact(draft) >= (/^##\s+目标片长\s*\n\s*短片（20–44 秒）/mu.test(brief) ? 80 : 180) && compact(draft) <= 650, {characters: compact(draft)});
  add("review uses the independent-review schema", review.schemaVersion === 2, {schemaVersion: review.schemaVersion});
  addReview("second-pass science review explicitly passes", review.reviewerRole === "second-pass-science-editor" && review.decision === "pass", {reviewerRole: review.reviewerRole, decision: review.decision});
  addReview("writer and reviewer declare distinct identities and work contexts", meaningful(writer.id, 1) && meaningful(reviewer.id, 1) && normalize(writer.id) !== normalize(reviewer.id) && meaningful(writer.contextId, 1) && meaningful(reviewer.contextId, 1) && normalize(writer.contextId) !== normalize(reviewer.contextId) && ["new-context-agent", "separate-agent", "separate-human"].includes(reviewer.mode) && meaningful(reviewer.recordRef, 8), {writer, reviewer, verification: "declared provenance; not authenticated by this program"});
  addReview("independent review binds all current content inputs", ["brief", "hooks", "chain", "draft"].every((key) => review.inputFingerprints?.[key] === inputFingerprints[key]), {recorded: review.inputFingerprints || {}, current: Object.fromEntries(["brief", "hooks", "chain", "draft"].map((key) => [key, inputFingerprints[key]]))});
  addReview("independent reviewer checklist is complete, not machine semantic verification", knownReviewChecks.every((key) => review.checks?.[key] === true), knownReviewChecks.filter((key) => review.checks?.[key] !== true));
  add("review evidence cites current draft excerpts, reasons and knowledge beats", evidenceKeys.every((key) => cited(evidence[key])), Object.fromEntries(evidenceKeys.map((key) => [key, {value: evidence[key] || null, valid: cited(evidence[key])}])));
  add("six evidence roles cannot reuse one sentence or one repeated rationale", new Set(excerpts.map(normalize)).size > 1 && !allInOneSentence && new Set(evidenceKeys.map((key) => normalize(evidence[key]?.reason))).size > 1, {allInOneSentence, distinctExcerpts: new Set(excerpts.map(normalize)).size});
  add("review answers what is learned, why it works and what demonstrates it", questionKeys.every((key) => cited(questions[key]) && meaningful(questions[key].answer, 12)) && new Set(questionKeys.map((key) => normalize(questions[key]?.answer))).size === questionKeys.length && new Set(questionKeys.map((key) => normalize(questions[key]?.excerpt))).size === questionKeys.length, questions);
  add("every knowledge beat maps its current chain claim to the actual draft", mapping.length === blocks.length && new Set(mapping.map((item) => item?.beatId)).size === blocks.length && blocks.every((block) => mapping.some((item) => item?.beatId === block.id && evidenceAppears(block.content, item.chainExcerpt) && evidenceAppears(draft, item.draftExcerpt) && meaningful(item.reason, 12))) && new Set(mapping.map((item) => normalize(item?.draftExcerpt))).size > 1, mapping);
  add("information gain density fits a 45-90 second explainer", informationGain.length >= requiredInformationGain && new Set(informationGain.map(normalize)).size >= requiredInformationGain && informationGain.every((item) => evidenceAppears(draft, item)), {required: requiredInformationGain, actual: informationGain});
  const originalTerm = typeof substitution.originalTerm === "string" ? substitution.originalTerm : "";
  const replacement = typeof substitution.replacement === "string" ? substitution.replacement : "";
  const expectedSubstitution = originalTerm && typeof substitution.originalExcerpt === "string" ? substitution.originalExcerpt.split(originalTerm).join(replacement) : "";
  add("generic substitution test records an actual tool-name swap", meaningful(originalTerm, 2) && meaningful(replacement, 2) && normalize(originalTerm) !== normalize(replacement) && evidenceAppears(draft, substitution.originalExcerpt) && substitution.originalExcerpt.includes(originalTerm) && expectedSubstitution !== substitution.originalExcerpt && normalize(expectedSubstitution) === normalize(substitution.substitutedExcerpt), substitution);
  addReview("generic substitution review explains why the specific claim fails", substitution.stillValid === false && meaningful(substitution.reason, 20), substitution);
  add("draft uses SW official voice without personal attribution", !/王\s*善\s*平|善\s*平\s*老\s*师|善\s*平\s*笔\s*记|王\s*老\s*师|(?:wang\s*)?shan\s*ping/giu.test(draft), null);

  const structurePassed = checks.filter((check) => check.layer === "structure").every((check) => check.passed);
  const reviewRecordPassed = checks.filter((check) => check.layer === "independent-review-record").every((check) => check.passed);
  return {
    schemaVersion: 3,
    generatedAt: new Date().toISOString(),
    assurance: "structural-checks-and-recorded-independent-review-only",
    structure: {passed: structurePassed},
    independentReview: {status: structurePassed && reviewRecordPassed ? "recorded-pass" : "incomplete-or-revise", reviewerId: reviewer.id || null, mode: reviewer.mode || null, recordRef: reviewer.recordRef || null, identityVerification: "not-performed", limitation: "程序只校验结构、原文引用、指纹和独立审阅记录；不能认证审阅人身份、实际独立过程或专业语义正确性。"},
    metrics: {draftCharacters: compact(draft), hookCandidates: candidates.length, knowledgeBeats: blocks.length, knowledgeBeatRoles: roles, informationGainCount: informationGain.length, requiredInformationGain},
    fingerprints: scienceScriptFingerprints(inputs),
    checks,
    passed: checks.every((check) => check.passed),
  };
}
