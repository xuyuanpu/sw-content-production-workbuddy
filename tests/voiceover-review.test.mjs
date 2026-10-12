import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {inspectVoiceoverReview} from '../scripts/voiceover-review-lib.mjs';
import {analyzeVoiceover} from '../scripts/voiceover-lib.mjs';
import {skillRoot} from '../scripts/lib.mjs';
const run=promisify(execFile);
const body='先看实际发生的行为，再讨论它对任务的影响。提出判断之前，也邀请对方补充我们还不知道的信息。这些问题不能替代对事实的核对，更不能保证一次沟通就改变行为。'.repeat(2);
async function fixture(t){const unit=await fs.mkdtemp(path.join(os.tmpdir(),'sw-review-'));t.after(()=>fs.rm(unit,{recursive:true,force:true}));const root=path.join(unit,'AIworkspace/40-video/current');await fs.mkdir(root,{recursive:true});await fs.writeFile(path.join(root,'voiceover-draft.md'),'## 口播稿\n'+body+'\n## 来源\n内部测试材料');return {unit,root};}
test('unconfirmed draft is reviewable; missing or invalid TTS evidence does not hide it',async t=>{
 const {root}=await fixture(t);
 let r=await inspectVoiceoverReview(root);assert.equal(r.reviewReady,true);assert.equal(r.ready,false);assert.equal(r.body,body);
 await fs.writeFile(path.join(root,'voiceover-report.json'),'{broken');r=await inspectVoiceoverReview(root);assert.equal(r.reviewReady,true);assert.equal(r.ready,false);
 await fs.writeFile(path.join(root,'voiceover-draft.md'),'');assert.equal((await inspectVoiceoverReview(root)).reviewReady,false);
});
test('machine readiness remains separately bound to confirmed current content',async t=>{
 const {root}=await fixture(t),draft=await fs.readFile(path.join(root,'voiceover-draft.md'),'utf8');
 const report=analyzeVoiceover(draft,body);report.contentConfirmation={method:'explicit-user-confirmation',draftHash:report.fingerprints.draftBody};
 await fs.writeFile(path.join(root,'tts-input.txt'),body);await fs.writeFile(path.join(root,'voiceover-report.json'),JSON.stringify(report));
 assert.equal((await inspectVoiceoverReview(root)).ready,true);
 await fs.appendFile(path.join(root,'tts-input.txt'),'一次沟通就会成功。');const r=await inspectVoiceoverReview(root);assert.equal(r.reviewReady,true);assert.equal(r.ready,false);assert.equal(r.contentConfirmed,true);
});
test('review index shows and copies a draft for both voiceover and video before TTS exists',async t=>{
 const {unit}=await fixture(t);
 for(const platform of ['voiceover','video']){
  const result=await run(process.execPath,['scripts/build-final-review.mjs','--unit',unit,'--platform',platform],{cwd:skillRoot,timeout:45000,maxBuffer:1024*1024});
  assert.equal(JSON.parse(result.stdout).status,'review-page-ready');
  const report=JSON.parse(await fs.readFile(path.join(unit,'AIworkspace/50-final-review/review-report.json')));
  assert.equal(report.pagePassed,true);assert.equal(report.components.voiceover.reviewReady,true);assert.equal(report.components.voiceover.machineReady,false);
  assert.equal(report.deliveryReady.voiceover,false);assert.equal(report.deliveryReady.video,false);assert.equal(report.allPassed,false);
  assert.equal(report.metrics.voiceover.draftTextMatches,true);assert.equal(report.metrics.voiceover.draftCopyDisabled,false);assert.equal(report.metrics.voiceover.copyDisabled,true);
 }
});
