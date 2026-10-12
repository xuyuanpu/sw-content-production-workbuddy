import test from "node:test";
import assert from "node:assert/strict";
import {analyzeVoiceover} from "../scripts/voiceover-lib.mjs";

// Plain observation: no questions, audience pronouns or stock spoken pivots.
const body = [
  "会议开始前，一位技术同事把客户需要确认的事项写在纸上。",
  "讨论时，他逐项说明已有依据，遇到尚未查证的内容就记下后续处理时间。",
  "这段场景呈现的是具体任务中的准备与沟通行为。",
  "这些行为本身无法判断他的性格偏好，也无法证明一次准备必然带来良好的沟通结果。",
  "偏好和任务表现需要分别观察，结论需要相应的资料支持。"
].join("\n");
const tts = body.replace("纸上。", "纸上。<#0.4#>").replace("沟通行为。", "沟通行为。<#0.5#>");

test("accepts a plain spoken observation without forced questions or cue words", () => {
  const report = analyzeVoiceover(`## 口播稿\n${body}`, tts);
  assert.equal(report.passed, true, JSON.stringify(report.checks.filter((c) => !c.passed)));
  assert.deepEqual(report.metrics.spokenCues, []);
});

test("still rejects content changes in a natural-sounding machine稿", () => {
  const report = analyzeVoiceover(body, tts.replace("无法证明", "足以证明"));
  assert.equal(report.passed, false);
  assert(report.checks.some((c) => c.name.startsWith("confirmed content") && !c.passed));
});

test("rejects missing input and unsupported pause syntax", () => {
  for (const invalid of ["", tts + "<happy>", tts.replace("<#0.4#>", "<#-1#>")]) {
    assert.equal(analyzeVoiceover(body, invalid).passed, false);
  }
});


test('formatting and stylistic preferences do not block confirmed content',()=>{
  for(const input of [body.replaceAll('\n',''),body,tts.replace('<#0.4#>','<#3#>'),tts.replace('<#0.4#>','<#0.4#><#0.5#>')]) assert.equal(analyzeVoiceover(body,input).passed,true);
  const long='这段口播可以用一个较长的句子完整说明实际处境与适用范围，'.repeat(5)+'并且不能仅凭一个数字替代真人试听。';
  const checked=analyzeVoiceover(long,long);
  assert.equal(checked.passed,true);assert(checked.warnings.some(w=>w.name.includes('speakable')));
});
