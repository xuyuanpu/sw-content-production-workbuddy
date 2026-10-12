import assert from "node:assert/strict";
import test from "node:test";
import {analyzeDirectorExecution, cameraStateAt, subjectStateAt} from "../assets/templates/video/remotion/director-execution.mjs";

const scene = (id, start = 0) => ({id, start, end: start + 4,
  cameraPath: [{t: 0, x: 0, y: 0, scale: 1, rotate: 0}, {t: 4, x: 0, y: 0, scale: 1, rotate: 0}],
  subjectHandoff: {id: "same-teaching-object", target: "scene-content", action: "hold", fromSceneId: null, toSceneId: null,
    path: [{t: 0, x: 0, y: 0, scale: 1, opacity: 1}, {t: 4, x: 0, y: 0, scale: 1, opacity: 1}]},
});

test("explicit static camera and subject remain still at every sampled time", () => {
  const input = scene("static");
  assert.equal(analyzeDirectorExecution([input]).passed, true);
  for (const second of [0, 0.5, 2, 3.5, 4]) {
    assert.deepEqual(cameraStateAt(input, second), {x: 0, y: 0, scale: 1, rotate: 0});
    assert.deepEqual(subjectStateAt(input, second), {x: 0, y: 0, scale: 1, opacity: 1});
  }
});

test("changing execution parameters changes runtime keyframe coordinates", () => {
  const input = scene("moving");
  input.cameraPath[1].x = 40;
  input.subjectHandoff.action = "move";
  input.subjectHandoff.path[1].x = 120;
  assert.equal(analyzeDirectorExecution([input]).passed, true);
  assert(Math.abs(cameraStateAt(input, 2).x - 20) < 1e-8);
  assert(Math.abs(subjectStateAt(input, 2).x - 60) < 1e-8);
  assert.equal(subjectStateAt(input, 4).x, 120);
});

test("same subject requires reciprocal adjacent handoffs with matching endpoints", () => {
  const first = scene("a");
  const second = scene("b", 4);
  first.subjectHandoff.toSceneId = "b";
  second.subjectHandoff.fromSceneId = "a";
  assert.equal(analyzeDirectorExecution([first, second]).passed, true);
  second.subjectHandoff.path[0].x = 5;
  assert.equal(analyzeDirectorExecution([first, second]).passed, false);
});

test("missing paths, false action labels, unsafe values and skipped handoffs fail", () => {
  for (const change of [
    (s) => { delete s.cameraPath; },
    (s) => { s.subjectHandoff.action = "move"; },
    (s) => { s.cameraPath[1].t = 0; },
    (s) => { s.subjectHandoff.path[1].opacity = 2; },
    (s) => { s.subjectHandoff.toSceneId = "unknown"; },
  ]) {
    const input = scene("invalid"); change(input);
    assert.equal(analyzeDirectorExecution([input]).passed, false);
  }
});

test("cover cannot use director parameters to hide or move its first-frame title", () => {
  const input = {...scene("cover"), visual: "cover"};
  assert.equal(analyzeDirectorExecution([input]).passed, true);
  input.subjectHandoff.path[0].opacity = 0;
  input.subjectHandoff.action = "fade";
  assert.equal(analyzeDirectorExecution([input]).passed, false);
});


