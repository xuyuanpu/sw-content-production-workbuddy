import {compositionWarnings} from '../assets/templates/video/remotion/component-library.mjs';
import {deriveShotbook, deriveExplanationMap, deriveKnowledgeChain, deriveTreatment} from "./director-contract-lib.mjs";
import {actionErrors} from "../assets/templates/video/remotion/semantic-motion.mjs";
import crypto from "node:crypto";
import {analyzeVideoAssetPolicy} from "./video-asset-policy-lib.mjs";
import {isDeepStrictEqual} from "node:util";
import {analyzeDirectorExecution} from "../assets/templates/video/remotion/director-execution.mjs";

export const STORYBOARD_REPORT_SCHEMA_VERSION = 4;

const fingerprint = (value) => crypto.createHash("sha256").update(String(value || "")).digest("hex");
const compact = (value) => [...String(value || "").replace(/[\s，。！？；：、,.!?;:'"“”‘’（）()\[\]【】<>《》—\-_]/gu, "")].length;
const normalize = (value) => String(value?.text ?? value ?? "")
  .replace(/[*_`~#>]/gu, "")
  .replace(/[\p{P}\p{Z}\p{S}]/gu, "")
  .toLowerCase();

const ALLOWED_OPERATIONS = new Set(["orient", "compare", "cause-effect", "decompose", "process", "sequence", "evidence", "case", "replace", "reveal", "boundary"]);
const ALLOWED_JOBS = new Set(["orient", "explain", "compare", "prove", "sequence", "reveal", "boundary"]);
const ALLOWED_QUADRANTS = new Set(["top-left", "top-right", "bottom-left", "bottom-right"]);
const GENERIC_VISUALS = new Set(["statement", "question-card"]);
const BEAT_DRIVEN_VISUALS = new Set(["misconception-replace", "cause-map", "step-timeline", "evidence-focus", "boundary-split"]);
const REQUIRED_TREATMENT_FIELDS = [
  ["核心视觉命题", 10], ["起点认知", 8], ["终点认知", 8], ["视觉母题", 8],
  ["主体接力线", 10], ["相机总策略", 10], ["运动能量曲线", 10], ["素材策略", 8],
  ["视觉元素职责", 8], ["声音策略", 6], ["克制原则", 8], ["禁止模板化", 8],
];
const REQUIRED_ACT_FIELDS = [["认知目标", 6], ["画面状态", 8], ["主要运动", 8], ["交接", 6]];
const JOB_VISUALS = new Map([
  ["orient", new Set(["cover", "object-motion"])],
  ["explain", new Set(["misconception-replace", "cause-map", "step-timeline", "path", "object-motion", "character-scene"])],
  ["compare", new Set(["comparison", "boundary-split", "object-motion"])],
  ["prove", new Set(["evidence-focus"])],
  ["sequence", new Set(["step-timeline", "path"])],
  ["reveal", new Set(["misconception-replace", "cta", "character-scene"])],
  ["boundary", new Set(["boundary-split", "boundary-card"])],
]);

function field(block, name) {
  return block.match(new RegExp(`^-\\s*${name}：\\s*(.+)$`, "mu"))?.[1]?.trim() || "";
}

function blocks(markdown, pattern) {
  const normalized = String(markdown || "").replace(/\r\n/gu, "\n");
  const matches = [...normalized.matchAll(pattern)];
  return matches.map((match, index) => {
    const start = match.index + match[0].length;
    const end = matches[index + 1]?.index ?? normalized.length;
    return {id: match[1], block: normalized.slice(start, end).trim()};
  });
}

function knowledgeEntries(markdown) {
  const normalized = String(markdown || "").replace(/\r\n/gu, "\n");
  const matches = [...normalized.matchAll(/^##\s+(B-\d{2})\s*·\s*([^\n]+)\s*$/gmu)];
  return matches.map((match) => ({id: match[1], type: match[2].trim()}));
}

const KNOWLEDGE_ROLE_PATTERNS = {
  mechanism: /专业机制|机制|原理|因果|解释/u,
  evidence: /例子|案例|对比|证据|情境/u,
  boundary: /边界|适用条件|限制|不能替代/u,
};

function idsForRole(entries, role) {
  return entries.filter((item) => KNOWLEDGE_ROLE_PATTERNS[role].test(item.type)).map((item) => item.id);
}

function explanationEntries(markdown) {
  return blocks(markdown, /^##\s+(B-\d{2})\s*$/gmu).map(({id, block}) => ({
    id,
    before: field(block, "观众原来以为"),
    after: field(block, "观众看完知道"),
    operation: field(block, "视觉任务"),
    evidence: field(block, "证据来源"),
    visualBasis: field(block, "画面依据"),
    why: field(block, "为什么有帮助"),
    sceneId: field(block, "对应镜头"),
    forbiddenFallback: field(block, "禁止替代"),
  }));
}

function treatmentData(markdown) {
  const source = String(markdown || "");
  const acts = blocks(source, /^##\s+(ACT-\d+)\s*(?:·[^\n]+)?\s*$/gmu).map(({id, block}) => ({
    id,
    values: Object.fromEntries(REQUIRED_ACT_FIELDS.map(([name]) => [name, field(block, name)])),
  }));
  return {
    values: Object.fromEntries(REQUIRED_TREATMENT_FIELDS.map(([name]) => [name, field(source, name)])),
    acts,
  };
}

function validObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

export function storyboardFingerprints(inputs) {
  return {
    chain: fingerprint(inputs.chain),
    treatment: fingerprint(inputs.treatment),
    explanationMap: fingerprint(inputs.explanationMap),
    shotbook: fingerprint(JSON.stringify(inputs.shotbook || {})),
    scenes: fingerprint(JSON.stringify(inputs.scenes || {})),
    script: fingerprint(inputs.script),
  };
}

export function reportMatchesStoryboardInputs(report, inputs) {
  const current = storyboardFingerprints(inputs);
  return report?.schemaVersion === STORYBOARD_REPORT_SCHEMA_VERSION && report?.passed === true && report?.executionPassed === true && Object.entries(current).every(([key, value]) => report.fingerprints?.[key] === value);
}

export function analyzeStoryboard(inputs) {
  if (inputs.scenes?.video?.directorVersion === 1) return analyzeCanonicalStoryboard(inputs);
  const chainEntries = knowledgeEntries(inputs.chain);
  const chainIds = chainEntries.map((item) => item.id);
  const treatment = treatmentData(inputs.treatment);
  const explanation = explanationEntries(inputs.explanationMap);
  const explanationById = new Map(explanation.map((entry) => [entry.id, entry]));
  const shotbook = validObject(inputs.shotbook) ? inputs.shotbook : {};
  const sceneData = validObject(inputs.scenes) ? inputs.scenes : {};
  const scenes = Array.isArray(sceneData.scenes) ? sceneData.scenes : [];
  const shotbookScenes = Array.isArray(shotbook.scenes) ? shotbook.scenes : [];
  const sceneById = new Map(scenes.map((scene) => [scene.id, scene]));
  const script = String(inputs.script || "");
  const subtitleText = (sceneData.subtitles || []).map((item) => item.text).join("\n");
  const searchableSpeech = normalize(`${script}\n${subtitleText}`);
  const checks = [];
  const warnings = [];
  const add = (name, passed, detail = null) => checks.push({name, passed: Boolean(passed), detail});

  const treatmentErrors = REQUIRED_TREATMENT_FIELDS.flatMap(([name, minimum]) => compact(treatment.values[name]) < minimum ? [`${name}缺失或过于空泛`] : []);
  for (const act of treatment.acts) {
    for (const [name, minimum] of REQUIRED_ACT_FIELDS) if (compact(act.values[name]) < minimum) treatmentErrors.push(`${act.id} ${name}缺失或过于空泛`);
  }
  if (!treatment.acts.length) treatmentErrors.push("至少需要一个内容驱动的视觉段落");
  if (treatment.acts.length < 3 || treatment.acts.length > 4) warnings.push("幕数由内容决定；当前非 3–4 幕，请人工复核认知推进而不为数量补幕。");
  if (!treatment.acts.every((act, index) => act.id === `ACT-${index + 1}`)) treatmentErrors.push("视觉段落必须从 ACT-1 开始连续编号");
  add("片级导演方案完整定义视觉命题、接力线与节奏", treatmentErrors.length === 0, treatmentErrors);

  const mappedIds = explanation.map((entry) => entry.id);
  const sequentialIds = chainIds.every((id, index) => id === `B-${String(index + 1).padStart(2, "0")}`);
  add("all dynamically identified knowledge beats have an explanation map", chainIds.length > 0 && sequentialIds && chainIds.length === mappedIds.length && chainIds.every((id, index) => mappedIds[index] === id), {chainIds, mappedIds});

  const explanationErrors = explanation.flatMap((entry) => {
    const errors = [];
    if (compact(entry.before) < 4) errors.push("缺少观众原认知");
    if (compact(entry.after) < 6) errors.push("缺少认知变化");
    if (!ALLOWED_OPERATIONS.has(entry.operation)) errors.push(`未知视觉任务 ${entry.operation || "空"}`);
    if (compact(entry.evidence) < 3) errors.push("缺少证据来源");
    if (compact(entry.visualBasis) < 5) errors.push("缺少可见画面依据");
    if (compact(entry.why) < 8) errors.push("没有解释画面为何帮助理解");
    if (!sceneById.has(entry.sceneId)) errors.push(`对应镜头不存在 ${entry.sceneId || "空"}`);
    if (compact(entry.forbiddenFallback) < 6) errors.push("没有写明禁止的偷懒替代");
    return errors.length ? [{id: entry.id, errors}] : [];
  });
  add("each knowledge beat states a real visual explanation job", explanation.length === chainIds.length && explanation.length > 0 && explanationErrors.length === 0, explanationErrors);

  const roleIds = Object.fromEntries(Object.keys(KNOWLEDGE_ROLE_PATTERNS).map((role) => [role, idsForRole(chainEntries, role)]));
  const roleEntries = (role) => roleIds[role].map((id) => explanationById.get(id)).filter(Boolean);
  add("mechanism uses relational explanation instead of a slogan", (!roleIds.mechanism.length) || roleEntries("mechanism").some((entry) => ["cause-effect", "decompose", "process", "compare", "evidence"].includes(entry.operation)), {ids: roleIds.mechanism, entries: roleEntries("mechanism")});
  add("example becomes a concrete case, comparison or evidence shot", (!roleIds.evidence.length) || roleEntries("evidence").some((entry) => ["case", "compare", "sequence", "evidence"].includes(entry.operation)), {ids: roleIds.evidence, entries: roleEntries("evidence")});
  add("boundary is visually differentiated", (!roleIds.boundary.length) || roleEntries("boundary").some((entry) => ["boundary", "compare"].includes(entry.operation)), {ids: roleIds.boundary, entries: roleEntries("boundary")});

  const requiredSceneIds = [...new Set(explanation.map((entry) => entry.sceneId).filter(Boolean))];
  const shotbookSceneIds = shotbookScenes.map((scene) => validObject(scene) ? scene.sceneId : null).filter(Boolean);
  const shotbookById = new Map(shotbookScenes.filter(validObject).map((scene) => [scene.sceneId, scene]));
  add("every mapped scene has a unique SHOTBOOK entry", requiredSceneIds.every((id) => shotbookById.has(id)) && new Set(shotbookSceneIds).size === shotbookSceneIds.length, {requiredSceneIds, shotbookSceneIds});
  add("SHOTBOOK uses director schema v3", shotbook.schemaVersion === 3 && shotbook.directingMode === "talkcraft-adapted-sw", {schemaVersion: shotbook.schemaVersion, directingMode: shotbook.directingMode});
  const execution = analyzeDirectorExecution(scenes);
  const executionBindings = scenes.flatMap((scene) => {
    const implementation = shotbookById.get(scene.id)?.implementation;
    return isDeepStrictEqual(implementation?.cameraPath, scene.cameraPath) && isDeepStrictEqual(implementation?.subjectHandoff, scene.subjectHandoff) ? [] : [`${scene.id}: 缺少导演执行绑定或 cameraPath/subjectHandoff 与场景漂移`];
  });
  const executionPassed = execution.passed && executionBindings.length === 0;
  add("director camera and subject handoff are executable and match every timeline scene", executionPassed, {execution, bindings: executionBindings});

  const shotbookErrors = shotbookScenes.flatMap((rawItem, itemIndex) => {
    const item = validObject(rawItem) ? rawItem : {};
    const errors = [];
    const scene = sceneById.get(item.sceneId);
    if (!scene) errors.push("镜头不存在");
    if (compact(item.viewerBefore) < 4) errors.push("缺少镜头前的观众认知");
    if (compact(item.viewerAfter) < 6) errors.push("缺少镜头后的认知变化");
    if (compact(item.intent) < 8) errors.push("intent 不是明确的一句话");
    if (compact(item.visualStory) < 12) errors.push("缺少可直接拍摄/实现的画面叙事");
    if (compact(item.openingFrame) < 8) errors.push("缺少镜头开场画面");
    if (compact(item.closingFrame) < 8) errors.push("缺少镜头结束画面");
    if (!ALLOWED_JOBS.has(item.primaryVisualJob)) errors.push("primaryVisualJob 无效");
    else if (scene && !JOB_VISUALS.get(item.primaryVisualJob)?.has(scene.visual)) errors.push(`primaryVisualJob=${item.primaryVisualJob} 与实际 visual=${scene.visual} 不一致`);
    for (const plane of ["background", "subject", "text"]) {
      const value = item.planes?.[plane];
      if (!validObject(value) || compact(value.content) < 3 || compact(value.motion) < 4 || compact(value.purpose) < 4) errors.push(`${plane} plane 必须说明 content/motion/purpose`);
    }
    if (!Array.isArray(item.subjectGroups) || item.subjectGroups.length < 1 || item.subjectGroups.length > 3) errors.push("主体组必须为 1–3 组");
    if (!ALLOWED_QUADRANTS.has(item.emptyQuadrant)) errors.push("必须保留一个明确空象限");
    for (const phase of ["enter", "hold", "retire"]) if (compact(item.subjectLifecycle?.[phase]) < 4) errors.push(`subjectLifecycle.${phase} 缺失`);
    for (const fieldName of ["path", "purpose", "continuity"]) if (compact(item.cameraPhrase?.[fieldName]) < 4) errors.push(`cameraPhrase.${fieldName} 缺失`);
    for (const direction of ["fromPrevious", "toNext"]) if (compact(item.handoff?.[direction]) < 4) errors.push(`handoff.${direction} 缺失`);
    for (const phase of ["enter", "hold", "exit"]) if (compact(item.motionPhases?.[phase]) < 4) errors.push(`motionPhases.${phase} 缺失`);
    if (!validObject(item.implementation) || item.implementation.visual !== scene?.visual || compact(item.implementation.why) < 8 || compact(item.implementation.forbiddenShortcut) < 6) {
      errors.push("实现必须绑定真实 visual 并说明选择理由和禁止简化");
    }
    const beats = Array.isArray(item.semanticBeats) ? item.semanticBeats : [];
    if (!beats.length) errors.push("缺少语义拍");
    for (const [index, beat] of beats.entries()) {
      if (!Number.isFinite(beat.t) || !scene || beat.t < scene.start || beat.t >= scene.end) errors.push(`semanticBeats[${index}] 时间不在镜头内`);
      if (compact(beat.anchor) < 2 || !searchableSpeech.includes(normalize(beat.anchor))) errors.push(`semanticBeats[${index}] 语音锚点不在当前稿件/字幕`);
      if (compact(beat.action) < 3) errors.push(`semanticBeats[${index}] 动作无意义`);
      if (compact(beat.target) < 2) errors.push(`semanticBeats[${index}] 缺少动作对象`);
      if (compact(beat.relation) < 4) errors.push(`semanticBeats[${index}] 没有说明动作与谁发生关系`);
      if (compact(beat.visualStateAfter) < 6) errors.push(`semanticBeats[${index}] 没有说明动作后的可见状态`);
    }
    if (scene && BEAT_DRIVEN_VISUALS.has(scene.visual)) {
      const renderBeats = Array.isArray(scene.beats) ? scene.beats : [];
      for (const [index, beat] of beats.entries()) {
        const localAt = Number(beat.t) - Number(scene.start);
        const rendered = renderBeats.find((candidate) => normalize(candidate.anchor) === normalize(beat.anchor));
        if (!rendered || Math.abs(Number(rendered.at) - localAt) > 0.1 || normalize(rendered.target) !== normalize(beat.target)) {
          errors.push(`semanticBeats[${index}] 未绑定到 scenes.json 的实际逐帧动作`);
        }
      }
    }
    return errors.length ? [{sceneId: item.sceneId || `index-${itemIndex}`, errors}] : [];
  });
  add("SHOTBOOK describes cognition, frames, three moving planes, subject lifecycle, camera phrase, handoff and speech beats", shotbookScenes.length > 0 && shotbookErrors.length === 0, shotbookErrors);

  const descriptionKeys = shotbookScenes.filter(validObject).map((item) => normalize(`${item.visualStory}|${item.openingFrame}|${item.closingFrame}`)).filter(Boolean);
  const duplicateDescriptions = descriptionKeys.filter((value, index) => descriptionKeys.indexOf(value) !== index);
  add("逐镜导演描述不是复制的通用模板", duplicateDescriptions.length === 0, duplicateDescriptions);

  const contentScenes = scenes.filter((scene) => !["cover", "cta"].includes(scene.visual));
  const consecutiveGeneric = contentScenes.slice(1).flatMap((scene, index) => GENERIC_VISUALS.has(scene.visual) && GENERIC_VISUALS.has(contentScenes[index].visual) ? [[contentScenes[index].id, scene.id]] : []);
  add("no consecutive generic text-only scenes", consecutiveGeneric.length === 0, consecutiveGeneric);

  const assetPolicy = analyzeVideoAssetPolicy({scenes});
  for (const check of assetPolicy.checks) add(check.name, check.passed, check.detail);

  const sceneKnowledgeIds = new Set(shotbookScenes.filter(validObject).flatMap((item) => Array.isArray(item.knowledgeBeats) ? item.knowledgeBeats : []));
  add("SHOTBOOK covers every knowledge beat", chainIds.every((id) => sceneKnowledgeIds.has(id)), {covered: [...sceneKnowledgeIds], required: chainIds});
  const unknownSceneKnowledgeIds = [...sceneKnowledgeIds].filter((id) => !chainIds.includes(id));
  add("SHOTBOOK only references identified knowledge beats", unknownSceneKnowledgeIds.length === 0, unknownSceneKnowledgeIds);

  return {
    schemaVersion: STORYBOARD_REPORT_SCHEMA_VERSION,
    executionPassed,
    execution,
    warnings,
    generatedAt: new Date().toISOString(),
    sourceMethod: {name: "video-talkcraft", repository: "https://github.com/Vincentwei1021/video-talkcraft", commit: "0e11d24efd330ed462e0d9de55915c50c9a6f443", adaptation: "SW director-first vertical red workshop explainer"},
    metrics: {knowledgeBeatsIdentified: chainIds.length, mappedKnowledgeBeats: explanation.length, directorActs: treatment.acts.length, directorScenes: shotbookScenes.length, completeDirectorScenes: shotbookScenes.length - shotbookErrors.length, timelineScenes: scenes.length, semanticBeats: shotbookScenes.filter(validObject).reduce((sum, item) => sum + (item.semanticBeats?.length || 0), 0), nativeLogicScenes: assetPolicy.nativeLogicSceneCount, platformLayoutScreenshots: assetPolicy.platformLayoutScreenshotCount},
    assetPolicy,
    fingerprints: storyboardFingerprints(inputs),
    checks,
    passed: checks.every((check) => check.passed),
  };
}


function analyzeCanonicalStoryboard(inputs) {
  const data = inputs.scenes, scenes = data.scenes || [], entries = knowledgeEntries(inputs.chain);
  const ids = entries.map(e => e.id), explanations = data.explanations || [];
  const checks = [], add = (name, passed, detail = null) => checks.push({name, passed: Boolean(passed), detail});
  add("片级导演定义观众、认知变化与贯穿对象", ["audience", "viewerChange", "throughline"].every(k => compact(data.film?.[k]) >= 3));
  const directionErrors = scenes.flatMap(s => {
    const d = s.direction || {}, errors = [];
    for (const k of ["viewerBefore", "viewerAfter", "visualStory", "openingFrame", "closingFrame"]) if (compact(d[k]) < 4) errors.push(k);
    if (!String(d.primaryVisualJob || "").trim()) errors.push("primaryVisualJob");
    if (!d.handoff?.fromPrevious || !d.handoff?.toNext) errors.push("handoff");
    if (!Array.isArray(d.knowledgeBeats) || !d.knowledgeBeats.length || d.knowledgeBeats.some(id => !ids.includes(id))) errors.push("knowledgeBeats");
    return errors.length ? [{scene:s.id,errors}] : [];
  });
  add("每镜明确认知、首尾可见状态及交接", scenes.length > 0 && directionErrors.length === 0, directionErrors);
  const covered = new Set(scenes.flatMap(s => s.direction?.knowledgeBeats || []));
  add("动态知识拍完整映射且无多余编号", ids.length > 0 && ids.every(id => covered.has(id)) && new Set(explanations.map(e=>e.id)).size === ids.length && explanations.length === ids.length && ids.every(id=>explanations.some(e=>e.id===id)));
  const sceneById = new Map(scenes.map(s=>[s.id,s]));
  add("解释映射有来源和实际镜头", explanations.every(e => sceneById.has(e.sceneId) && String(e.operation || "").trim() && [e.before,e.after,e.evidence,e.visualBasis,e.why,e.forbiddenFallback].every(v=>compact(v)>=3)));
  const derived = isDeepStrictEqual(inputs.shotbook, deriveShotbook(data)) && inputs.explanationMap === deriveExplanationMap(data) && inputs.chain === deriveKnowledgeChain(data) && inputs.treatment === deriveTreatment(data);
  add("所有导演视图仅为当前 scenes.json 的派生视图", derived);
  const execution = analyzeDirectorExecution(scenes);
  const errors = scenes.flatMap(s=>actionErrors(s).map(e=>`${s.id}: ${e}`));
  const executionPassed = execution.passed && errors.length === 0 && derived;
  add("动作目标、相机与主体交接可执行",executionPassed,{execution,errors});
  const assetPolicy = analyzeVideoAssetPolicy({scenes});
  checks.push(...assetPolicy.checks);
  const generic = scenes.slice(1).filter((s,i)=>GENERIC_VISUALS.has(s.visual)&&GENERIC_VISUALS.has(scenes[i].visual));
  // Repetition is a review signal, not a semantic-to-template constraint.
  return {schemaVersion:STORYBOARD_REPORT_SCHEMA_VERSION, directorModel:"canonical-v1", executionPassed, execution,
    passed:checks.every(c=>c.passed), checks, warnings:[...generic.map(s=>({scene:s.id,message:'连续文字镜头，请检查是否确有表达需要'})),...scenes.filter(s=>s.visual==='composition').flatMap(s=>compositionWarnings(s).map(message=>({scene:s.id,message})))], assetPolicy, fingerprints:storyboardFingerprints(inputs), generatedAt:new Date().toISOString(),
    metrics:{knowledgeBeatsIdentified:ids.length,mappedKnowledgeBeats:explanations.length,directorActs:0,directorScenes:scenes.length,completeDirectorScenes:scenes.length-directionErrors.length,semanticBeats:scenes.reduce((n,s)=>n+(s.beats?.length||0),0),nativeLogicScenes:assetPolicy.nativeLogicSceneCount,platformLayoutScreenshots:assetPolicy.platformLayoutScreenshotCount}};
}
