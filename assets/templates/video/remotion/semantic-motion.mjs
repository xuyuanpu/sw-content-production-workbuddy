import {compositionErrors} from './component-library.mjs';
// Shared by validation and rendering: target IDs, not array order, select motion.
export const beatFor = (scene, target, action) => (scene.beats || []).find(b => b.target === target && (!action || b.action === action));
export const beatAt = (scene, target, fallback = 0, action) => beatFor(scene, target, action)?.at ?? fallback;
export const progressAt = (second, at, duration = .45) => {
  const t = Math.max(0, Math.min(1, (second - at) / duration));
  return t * t * (3 - 2 * t);
};
export function targetState(scene, target, second) {
  const enter = beatFor(scene, target, 'enter');
  const move = beatFor(scene, target, 'move');
  const p = move ? progressAt(second, move.at, move.duration) : 0;
  const from = move?.from || {x: 0, y: 0};
  const to = move?.to || from;
  return {opacity: enter ? progressAt(second, enter.at, .4) : 1,
    x: from.x + (to.x - from.x) * p, y: from.y + (to.y - from.y) * p};
}
export function supportedActions(scene) {
  const result = {'scene': ['hold']};
  const add = (id, actions) => {result[id] = actions;};
  switch (scene.visual) {
    case 'character-scene': add('illustration', ['enter']); if(scene.supportingText) add('detail', ['enter']); break;
    case 'misconception-replace': add('old', ['strike']); add('new', ['enter']); break;
    case 'cause-map': (scene.nodes || []).forEach((_, i) => add(`node:${i}`, ['enter'])); break;
    case 'step-timeline': (scene.steps || []).forEach((_, i) => add(`step:${i}`, ['enter'])); break;
    case 'boundary-split':
      add('can', ['enter']); add('cannot', ['enter']);
      (scene.cannot||[]).forEach((_,i)=>{if((scene.beats||[]).some(b=>b.target===`cannot:${i}`)) add(`cannot:${i}`,['enter']);});
      break;
    case 'evidence-focus': add('evidence', ['focus']); break;
    case 'object-motion':
      (scene.objects || []).forEach(o => add(`object:${o.id}`, ['enter', 'move']));
      (scene.relations || []).forEach(o => add(`relation:${o.id}`, ['reveal'])); break;
  }
  return result;
}
export function actionErrors(scene) {
  if (scene.visual === 'composition') return compositionErrors(scene);
  const supported = supportedActions(scene), seen = new Set(), errors = [];
  const boundedStrings = (items, max) => Array.isArray(items) && items.length > 0 && items.length <= max && items.every(x => typeof x === 'string' && x.trim());
  if (scene.visual === 'cause-map' && !boundedStrings(scene.nodes, 4)) errors.push('cause-map needs 1–4 string nodes; extra nodes would not render');
  if (scene.visual === 'step-timeline' && !boundedStrings(scene.steps, 5)) errors.push('step-timeline needs 1–5 string steps');
  if (scene.visual === 'boundary-split' && (!boundedStrings(scene.can, 3) || !boundedStrings(scene.cannot, 3))) errors.push('boundary-split needs 1–3 items on each side');
  if (scene.visual === 'misconception-replace' && (!scene.oldText || !scene.newText)) errors.push('replacement requires both visible claims');
  if (scene.visual === 'object-motion' && new Set((scene.relations || []).map(r => r.id)).size !== (scene.relations || []).length) errors.push('duplicate relation IDs');
  for (const b of scene.beats || []) {
    const key = `${b.target}/${b.action}`;
    if (!supported[b.target]?.includes(b.action)) errors.push(`unsupported ${key}`);
    if (seen.has(key)) errors.push(`duplicate ${key}`); seen.add(key);
    if (!Number.isFinite(b.at) || b.at < 0 || b.at >= scene.end - scene.start) errors.push(`out of range ${key}`);
    if (b.duration !== undefined && (!['move','reveal'].includes(b.action) || !Number.isFinite(b.duration) || b.duration <= 0 || b.at + b.duration > scene.end - scene.start + .001)) errors.push(`unsupported duration ${key}`);
    if (b.endAnchor && b.action !== 'move') errors.push(`endAnchor only applies to move ${key}`);
    if (b.action === 'move') {
      if (!Number.isFinite(b.duration) || b.duration <= 0 || b.at + b.duration > scene.end - scene.start + .001) errors.push(`invalid move duration ${key}`);
      for (const point of [b.from, b.to]) if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) errors.push(`missing move coordinates ${key}`);
      if (b.from?.x === b.to?.x && b.from?.y === b.to?.y) errors.push(`move has no displacement ${key}`);
    }
  }
  // No silent fallback choreography in production contracts.
  for (const [target, actions] of Object.entries(supported)) {
    if (target !== 'scene' && !actions.some(action => seen.has(`${target}/${action}`))) errors.push(`unbound ${target}`);
  }
  return errors;
}
