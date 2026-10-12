// Deliberately small execution contract: one camera and one main scene group.
// Paths use local seconds and pixel offsets; no free-form animation language.
export const DIRECTOR_EXECUTION_VERSION = 1;
const cameraFields = ["x", "y", "scale", "rotate"];
const subjectFields = ["x", "y", "scale", "opacity"];
const close = (a, b) => Math.abs(a - b) < 0.0001;
const sameState = (a, b, fields) => fields.every((key) => close(a?.[key], b?.[key]));

export function sampleDirectorPath(path, second, fields) {
  if (!Array.isArray(path) || path.length < 2) throw new Error("Missing explicit director path");
  const right = path.findIndex((point) => point.t >= second);
  if (right <= 0) return Object.fromEntries(fields.map((key) => [key, (right === 0 ? path[0] : path.at(-1))[key]]));
  const a = path[right - 1];
  const b = path[right];
  const progress = (1 - Math.cos(Math.PI * (second - a.t) / (b.t - a.t))) / 2;
  return Object.fromEntries(fields.map((key) => [key, a[key] + (b[key] - a[key]) * progress]));
}

export const cameraStateAt = (scene, second) => sampleDirectorPath(scene.cameraPath, second, cameraFields);
export const subjectStateAt = (scene, second) => sampleDirectorPath(scene.subjectHandoff?.path, second, subjectFields);

function pathErrors(path, duration, fields, label) {
  if (!Array.isArray(path) || path.length < 2) return [`${label} needs explicit start and end states (static is allowed)`];
  const errors = [];
  if (!close(path[0]?.t, 0) || !close(path.at(-1)?.t, duration)) errors.push(`${label} must cover local 0 to scene duration`);
  for (const [index, point] of path.entries()) {
    if (!point || !["t", ...fields].every((key) => Number.isFinite(point[key]))) { errors.push(`${label}[${index}] has invalid numeric fields`); continue; }
    if (point.t < 0 || point.t > duration || (index && point.t <= path[index - 1]?.t)) errors.push(`${label} times must be strictly increasing within the scene`);
    if (point.scale < 0.5 || point.scale > 1.5 || Math.abs(point.x) > 1080 || Math.abs(point.y) > 1920) errors.push(`${label}[${index}] leaves supported scale/offset bounds`);
    if ("opacity" in point && (point.opacity < 0 || point.opacity > 1)) errors.push(`${label}[${index}] opacity must be 0–1`);
    if ("rotate" in point && Math.abs(point.rotate) > 5) errors.push(`${label}[${index}] camera rotation exceeds 5 degrees`);
  }
  return errors;
}

export function analyzeDirectorExecution(scenes = []) {
  const errors = [];
  const ids = scenes.map((scene) => scene.id);
  if (new Set(ids).size !== ids.length || ids.some((id) => typeof id !== "string" || !id.trim())) errors.push("Timeline scene ids must be present and unique");
  for (const [index, scene] of scenes.entries()) {
    const local = [];
    const duration = Number(scene.end) - Number(scene.start);
    if (!Number.isFinite(duration) || duration <= 0) local.push("Scene duration must be positive");
    local.push(...pathErrors(scene.cameraPath, duration, cameraFields, "cameraPath"));
    const handoff = scene.subjectHandoff;
    if (!handoff || typeof handoff.id !== "string" || !handoff.id.trim() || handoff.target !== "scene-content") local.push("subjectHandoff requires a stable id and target=scene-content");
    local.push(...pathErrors(handoff?.path, duration, subjectFields, "subjectHandoff.path"));
    if (!["hold", "move", "fade"].includes(handoff?.action)) local.push("subjectHandoff.action must be hold, move or fade");
    if (Array.isArray(handoff?.path) && handoff.path.length >= 2) {
      const origin = handoff.path[0];
      const moving = handoff.path.some((point) => !sameState(origin, point, ["x", "y", "scale"]));
      const fading = handoff.path.some((point) => !close(origin?.opacity, point?.opacity));
      if (handoff.action === "hold" && (moving || fading)) local.push("hold action must have identical states");
      if (handoff.action === "move" && !moving) local.push("move action needs a coordinate or scale change");
      if (handoff.action === "fade" && !fading) local.push("fade action needs an opacity change");
    }
    if (scene.visual === "cover") {
      if (!sameState(scene.cameraPath?.[0], {x: 0, y: 0, scale: 1, rotate: 0}, cameraFields) || !sameState(handoff?.path?.[0], {x: 0, y: 0, scale: 1, opacity: 1}, subjectFields)) local.push("cover must start fully visible at its authored safe-area layout");
    }
    for (const [field, neighbor, reciprocal, currentPoint, neighborPoint] of [
      ["fromSceneId", scenes[index - 1], "toSceneId", handoff?.path?.[0], scenes[index - 1]?.subjectHandoff?.path?.at(-1)],
      ["toSceneId", scenes[index + 1], "fromSceneId", handoff?.path?.at(-1), scenes[index + 1]?.subjectHandoff?.path?.[0]],
    ]) {
      if (handoff?.[field] === null) continue;
      if (!neighbor || handoff?.[field] !== neighbor.id || neighbor.subjectHandoff?.[reciprocal] !== scene.id || neighbor.subjectHandoff?.id !== handoff?.id) local.push(`${field} must name the adjacent reciprocal scene with the same subject id, or null`);
      else {
        if (!sameState(currentPoint, neighborPoint, subjectFields)) local.push(`${field} subject endpoint drifts`);
        const cameraA = field === "fromSceneId" ? scene.cameraPath?.[0] : scene.cameraPath?.at(-1);
        const cameraB = field === "fromSceneId" ? neighbor.cameraPath?.at(-1) : neighbor.cameraPath?.[0];
        if (!sameState(cameraA, cameraB, cameraFields)) local.push(`${field} camera endpoint drifts during a subject handoff`);
      }
    }
    errors.push(...local.map((error) => `${scene.id}: ${error}`));
  }
  return {version: DIRECTOR_EXECUTION_VERSION, passed: scenes.length > 0 && errors.length === 0, errors};
}
