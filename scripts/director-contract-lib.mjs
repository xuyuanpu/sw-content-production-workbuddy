import {analyzeVisualPolicy} from "./visual-policy-lib.mjs";
import {createHash} from 'node:crypto';
import {analyzeDirectorExecution} from '../assets/templates/video/remotion/director-execution.mjs';
import {actionErrors} from '../assets/templates/video/remotion/semantic-motion.mjs';
import {compileComposition, componentText, walkComponents} from '../assets/templates/video/remotion/component-library.mjs';
export const DIRECTOR_CONTRACT_VERSION = 1;
export const digest = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
export const normalizeSpeech = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[\p{P}\p{Z}\p{S}\s]/gu, '');
export function speechIndex(evidence) {
  const words = evidence.words || (evidence.segments || []).flatMap(s => s.words || []);
  if (!words.length) throw new Error('Real word timestamps required');
  let text = '', positions = [], previous = 0;
  for (const w of words) {
    if (!Number.isFinite(w.start) || !Number.isFinite(w.end) || w.start < previous - .02 || w.end < w.start) throw new Error('Invalid word timestamps');
    const token = normalizeSpeech(w.word ?? w.text);
    text += token; positions.push(...Array.from({length: token.length}, () => ({start: w.start, end: w.end})));
    previous = w.end;
  }
  return {text, positions};
}
export function resolveAnchor(index, ref) {
  const text = normalizeSpeech(typeof ref === 'string' ? ref : ref?.text);
  if (!text) throw new Error('Missing speech anchor');
  let cursor = 0, matches = [];
  while ((cursor = index.text.indexOf(text, cursor)) !== -1) {matches.push(cursor); cursor += text.length;}
  const occurrence = typeof ref === 'object' ? ref.occurrence : undefined;
  if (occurrence !== undefined && (!Number.isInteger(occurrence) || occurrence < 1)) throw new Error('occurrence must be a positive integer');
  if (matches.length > 1 && !occurrence) throw new Error(`Ambiguous anchor: ${text}; set occurrence`);
  const at = matches[(occurrence || 1) - 1];
  if (at === undefined) throw new Error(`Speech anchor not found: ${text}`);
  return {start: index.positions[at].start, end: index.positions[at + text.length - 1].end};
}
const visibleText = s => [...componentText(s), s.kicker, s.deck, s.supportingText, s.revealText, s.oldText, s.newText, ...(s.titleLines || []), ...(s.overlayLines || []), ...(s.nodes || []), ...(s.steps || []), ...(s.can || []), ...(s.cannot || []), ...(s.paperItems || []).map(x => x.text), ...(s.objects || []).map(x => x.label)].filter(Boolean);
export function compileDirector(data, evidence, audioHash) {
  if (!analyzeVisualPolicy(data).passed) throw new Error("Removed paper visuals: redesign this storyboard");
  if (data.video?.directorVersion !== DIRECTOR_CONTRACT_VERSION) throw new Error('Set video.directorVersion=1 and author the canonical scene contract');
  if (!audioHash || evidence.audioSha256 !== audioHash) throw new Error('Timing evidence must bind the current working audio');
  for (const key of ['audience', 'viewerChange', 'throughline']) if (!data.film?.[key]) throw new Error(`Missing film direction: ${key}`);
  const index = speechIndex(evidence), result = structuredClone(data);
  delete result.directorCompilation;
  const duration = result.video.duration;
  if (!Number.isFinite(duration) || duration <= 0 || index.positions.at(-1).end > duration + .08) throw new Error('Invalid audio duration');
  const scenes = result.scenes || [];
  if (!scenes.length || new Set(scenes.map(s => s.id)).size !== scenes.length) throw new Error('Unique scenes required');
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    if (!['composition','cover','statement','comparison','question-card','path','boundary-card','misconception-replace','cause-map','step-timeline','evidence-focus','boundary-split','cta','object-motion','character-scene'].includes(s.visual)) throw new Error(`Unsupported visual: ${s.visual}`);
    s.start = i === 0 ? 0 : resolveAnchor(index, s.startAnchor).start;
    s.end = i + 1 < scenes.length ? resolveAnchor(index, scenes[i + 1].startAnchor).start : duration;
    if (s.end <= s.start) throw new Error(`Scene order: ${s.id}`);
    if (!s.direction?.viewerBefore || !s.direction?.viewerAfter || !s.direction?.visualStory) throw new Error(`Missing direction: ${s.id}`);
    for (const text of visibleText(s)) if (/纸条移开后露出核心判断|按语音顺序建立|不一次性把答案摆满|TODO|待填|制作指令/u.test(text)) throw new Error(`Internal production copy on screen: ${s.id}`);
    if (s.visual === 'evidence-focus' && !s.asset) throw new Error(`Missing evidence image: ${s.id}`);
    if (s.visual === 'composition') Object.assign(s, compileComposition(s, ref => resolveAnchor(index, ref)));
    else s.beats = (s.beats || []).map(b => {
      const anchor = resolveAnchor(index, b.anchor);
      const at = anchor.start - s.start;
      return {...b, at, ...(b.action === 'move' ? {duration: resolveAnchor(index, b.endAnchor).end - anchor.start} : {})};
    });
    if (s.visual === 'character-scene' && (!s.asset || !Array.isArray(s.characters) || !s.characters.length || s.characters.some(c => !c.id || !c.label) || new Set(s.characters.map(c=>c.id)).size !== s.characters.length || s.labelsInImage !== true)) throw new Error(`Character scene needs asset and image-baked identity labels: ${s.id}`);
    if (s.visual === 'object-motion') {
      const objects = s.objects || [], ids = objects.map(o => o.id);
      if (!objects.length || objects.length > 5 || new Set(ids).size !== ids.length) throw new Error(`Invalid objects: ${s.id}`);
      for (const o of objects) if (!o.label || [...o.label].length > 4 || !Number.isFinite(o.x) || !Number.isFinite(o.y) || o.x < 120 || o.x > 960 || o.y < 520 || o.y > 1430) throw new Error(`Object outside readable stage: ${s.id}`);
      for (const r of s.relations || []) if (!ids.includes(r.from) || !ids.includes(r.to)) throw new Error(`Unknown relation endpoints: ${s.id}`);
    }
    const errors = actionErrors(s);
    if (!s.beats.length || errors.length) throw new Error(`${s.id}: ${errors.join('; ') || 'missing beats'}`);
    // Camera/group paths remain authored spatial choices; retiming requires explicit repair.
    const d = s.end - s.start;
    if (!s.cameraPath) s.cameraPath = [{t: 0, x: 0, y: 0, scale: 1, rotate: 0}, {t: d, x: 0, y: 0, scale: 1, rotate: 0}];
    if (!s.subjectHandoff) s.subjectHandoff = {id: `${s.id}-group`, target: 'scene-content', action: 'hold', fromSceneId: null, toSceneId: null, path: [{t: 0, x: 0, y: 0, scale: 1, opacity: 1}, {t: d, x: 0, y: 0, scale: 1, opacity: 1}]};
  }
  result.explanations = (result.explanations || []).map(e => {
    const direction=scenes.find(s=>s.id===e.sceneId)?.direction;
    return {...e,before:direction?.viewerBefore || '',after:direction?.viewerAfter || ''};
  });
  const execution = analyzeDirectorExecution(scenes);
  if (!execution.passed) throw new Error(`Retimed camera/handoff requires repair: ${JSON.stringify(execution.errors)}`);
  result.subtitles = (result.captions || []).map(c => {
    const start = resolveAnchor(index, c.from).start, end = resolveAnchor(index, c.to).end;
    if (!c.text || [...c.text].length > 32 || end <= start) throw new Error('Caption must be a readable short phrase (max 32 characters)');
    return {text: c.text, start, end};
  });
  if (!result.subtitles.length) throw new Error('Authored captions with real speech anchors required');
  result.subtitles.forEach((s, i) => {
    if (s.end > duration + .02 || i && s.start < result.subtitles[i - 1].end - .02) throw new Error('Caption overlap or out of bounds');
  });
  result.directorCompilation = {version: DIRECTOR_CONTRACT_VERSION, audioSha256: audioHash, evidenceSha256: digest(evidence), timelineSha256: digest(result)};
  return result;
}
export function verifyDirector(data, evidence, audioHash) {
  try {
    const compiled = compileDirector(data, evidence, audioHash);
    return {passed: digest(compiled) === digest(data), expected: compiled.directorCompilation, errors: digest(compiled) === digest(data) ? [] : ['Canonical timeline changed; compile again and recheck affected scenes']};
  } catch (e) {return {passed: false, errors: [e.message]};}
}
export function deriveShotbook(data) {
  return {schemaVersion: 3, directingMode: 'talkcraft-adapted-sw', generatedFrom: 'scenes.json', scenes: data.scenes.map(s => ({...s.direction, sceneId: s.id,
    implementation: {...s.direction.implementation, visual: s.visual, cameraPath: s.cameraPath, subjectHandoff: s.subjectHandoff},
    semanticBeats: s.beats.map(b => ({...b, anchor: typeof b.anchor === 'string' ? b.anchor : (b.anchor.text || `scene:${b.anchor.scene}`), t: s.start + b.at}))}))};
}
export function deriveExplanationMap(data) {
  const labels = {before:'观众原来以为', after:'观众看完知道', operation:'视觉任务', evidence:'证据来源', visualBasis:'画面依据', why:'为什么有帮助', sceneId:'对应镜头', forbiddenFallback:'禁止替代'};
  return '# SW 视觉解释地图\n\n> 从 scenes.json 生成，不单独编辑。\n\n' + (data.explanations || []).map(e => `## ${e.id}\n` + Object.entries(labels).map(([k,l]) => `- ${l}：${e[k] || ''}`).join('\n')).join('\n\n') + '\n';
}

export function deriveTreatment(data) {
  const film = data.film || {};
  return '# 全片导演方案\n\n> 从 scenes.json 的 film 与逐镜 direction 派生，不单独编辑。\n\n' +
    Object.entries(film).map(([key,value]) => `- ${key}：${typeof value === 'string' ? value : JSON.stringify(value)}`).join('\n') +
    '\n\n' + data.scenes.map(s => `## ${s.id} · ${s.visual}\n${s.direction.visualStory}\n${s.direction.viewerBefore} → ${s.direction.viewerAfter}\n`).join('\n');
}

export function productionPlanErrors(data) {
  const errors=[];
  for(const key of ['subject','action','topicLink']) if(!String(data.film?.cover?.[key]||'').trim()) errors.push(`film.cover.${key}`);
  for(const key of ['visualDivision','sound']) if(!String(data.film?.[key]||'').trim())errors.push(`film.${key}`);
  if(data.scenes?.[0]?.visual!=='cover'||!data.scenes?.[0]?.asset)errors.push('first scene needs a theme image');
  const identities=new Map();
  for(const scene of data.scenes||[])for(const c of [...(scene.characters||[]), ...walkComponents(scene).flatMap(({node})=>node.characters||[])]){
    if(identities.has(c.id)&&identities.get(c.id)!==c.label)errors.push(`character identity changed: ${c.id}`);
    identities.set(c.id,c.label);
  }
  return errors;
}

export function deriveKnowledgeChain(data) {
  const types = {'cause-effect':'专业机制',decompose:'专业机制',process:'专业机制',case:'例子证据',evidence:'例子证据',boundary:'边界'};
  return '# 知识解释索引（由 scenes.json 自动生成）\n\n' + (data.explanations || []).map(e => `## ${e.id} · ${types[e.operation] || '内容说明'}\n\n- 解释：${e.why}\n- 依据：${e.evidence}\n- 镜头：${e.sceneId}\n`).join('\n');
}
