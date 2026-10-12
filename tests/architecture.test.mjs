import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fingerprintGraphic,inspectGraphic,createGraphicSnapshot} from '../scripts/graphic-integrity-lib.mjs';
import {analyzeVoiceover} from '../scripts/voiceover-lib.mjs';
import {requireConfirmedVoiceover} from '../scripts/confirmed-voiceover-lib.mjs';
import {deployRelease} from '../scripts/deploy-lib.mjs';
import {releaseSnapshot} from '../scripts/release-integrity.mjs';
import {preparePlatform} from '../scripts/prepare-platform.mjs';
import {writeJson,skillRoot} from '../scripts/lib.mjs';
const run=promisify(execFile);
async function temp(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'sw-architecture-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));return root;}
async function put(root,file,content='data'){await fs.mkdir(path.dirname(path.join(root,file)),{recursive:true});await fs.writeFile(path.join(root,file),content);}

test('single-platform writing initializes no media or unrelated current folders; preparation preserves drafts',async t=>{
  const root=await temp(t);
  const {stdout}=await run(process.execPath,['scripts/init-content-unit.mjs','--workspace',root,'--topic','观察任务','--platform','xhs'],{cwd:skillRoot});
  const {unit}=JSON.parse(stdout), ai=path.join(unit,'AIworkspace');
  assert.deepEqual(await fs.readdir(path.join(ai,'20-xhs/current')),[]);
  await assert.rejects(fs.access(path.join(ai,'30-wechat/current')));
  const manifest=JSON.parse(await fs.readFile(path.join(ai,'manifest.json')));
  assert.deepEqual(manifest.scope,{xiaohongshu:true,wechat:false,video:false});
  assert(!(await fs.readFile(path.join(ai,'content-plan.md'),'utf8')).includes('冲突'));
  await put(unit,'AIworkspace/20-xhs/current/note-draft.md','original draft');
  await preparePlatform(unit,'xhs');
  assert.equal(await fs.readFile(path.join(ai,'20-xhs/current/note-draft.md'),'utf8'),'original draft');
  await fs.access(path.join(ai,'20-xhs/current/index.html'));
});

test('writing doctor works from an isolated skill without media dependencies',async t=>{
  const root=await temp(t);
  for(const name of ['doctor.mjs','lib.mjs','bgm-policy-lib.mjs'])await put(root,'scripts/'+name,await fs.readFile(path.join(skillRoot,'scripts',name)));
  const {stdout}=await run(process.execPath,[path.join(root,'scripts/doctor.mjs'),'--stage','writing']);
  const report=JSON.parse(stdout);assert.equal(report.passed,true);assert.equal(report.checks.length,1);
});

for(const platform of ['xhs','wechat'])test(`${platform}: stale inputs or outputs fail, promoted snapshot survives next draft`,async t=>{
  const unit=await temp(t), rel=`AIworkspace/${platform==='xhs'?'20-xhs':'30-wechat'}/current`,root=path.join(unit,rel),out=path.join(root,'output');
  const inputs=platform==='xhs'?['content.json','caption.md','index.html','styles.css','app.js']:['article.json'];
  for(const name of [...inputs,'assets/cover.png'])await put(root,name,name);
  for(const name of ['article.html','page-01.png'])await put(out,name,name);
  const report={passed:true,provenance:await fingerprintGraphic(platform,root)};
  await writeJson(path.join(out,'check-report.json'),report);
  assert.equal((await inspectGraphic({platform,unitRoot:unit})).ready,true);
  await put(root,inputs[0],'changed');assert.equal((await inspectGraphic({platform,unitRoot:unit})).ready,false);
  await put(root,inputs[0],inputs[0]);
  await put(out,'page-01.png','changed');assert.equal((await inspectGraphic({platform,unitRoot:unit})).ready,false);
  await put(out,'page-01.png','page-01.png');
  await put(root,'assets/extra.png','new');assert.equal((await inspectGraphic({platform,unitRoot:unit})).ready,false);
  await fs.unlink(path.join(root,'assets/extra.png'));
  const pointer=await createGraphicSnapshot(unit,platform,report);
  const final=path.join(unit,platform==='xhs'?'小红书':'公众号');await fs.cp(out,final,{recursive:true});await fs.unlink(path.join(final,'check-report.json'));
  await writeJson(path.join(unit,'AIworkspace/state.json'),{graphicFinalAcceptance:{[platform]:pointer}});
  await put(root,inputs[0],'candidate B');
  assert.equal((await inspectGraphic({platform,unitRoot:unit,sourceMode:'final'})).ready,true);
  await put(final,'article.html','tampered');assert.equal((await inspectGraphic({platform,unitRoot:unit,sourceMode:'final'})).ready,false);
});

test('video final script must match human-confirmed voiceover even when it has other alignment evidence',async t=>{
  const root=await temp(t), body='资料应当支持当前判断。不能根据某个行为直接推断类型，也不能为使故事更有说服力补写成功结果。'.repeat(3);
  const report=analyzeVoiceover(body,body);report.contentConfirmation={method:'explicit-user-confirmation',draftHash:report.fingerprints.draftBody};
  await put(root,'voiceover-draft.md',body);await put(root,'tts-input.txt',body);await writeJson(path.join(root,'voiceover-report.json'),report);
  const final=path.join(root,'final-voiceover.md');await fs.writeFile(final,body.replaceAll('。','。\n'));
  assert((await requireConfirmedVoiceover(root,final)).report.passed);
  await fs.writeFile(final,body.replace('不能根据','可以根据'));await assert.rejects(requireConfirmedVoiceover(root,final),/最终口播稿与人工确认/);
});

async function release(root,version,dep='1'){
  await put(root,'package.json',JSON.stringify({version}));
  await put(root,'package-lock.json',JSON.stringify({version,packages:{'':{version,dependencies:{lib:dep}},'node_modules/lib':{version:dep}}}));
  await put(root,'SKILL.md','skill '+version);await writeJson(path.join(root,'release-manifest.json'),await releaseSnapshot(root));
}
test('deployment preserves compatible installed dependencies and keeps backup',async t=>{
  const root=await temp(t),source=path.join(root,'source'),target=path.join(root,'target');
  await release(source,'2');await release(target,'1');await put(target,'node_modules/lib/local','cached');
  const result=await deployRelease({source,target,backupRoot:path.join(root,'backups')});
  assert.equal(result.runtimePreserved,true);assert.equal(await fs.readFile(path.join(target,'node_modules/lib/local'),'utf8'),'cached');
  assert.equal(await fs.readFile(path.join(result.backup,'SKILL.md'),'utf8'),'skill 1');
});
test('changed dependencies are not reused; unreviewed drift blocks before replacement',async t=>{
  const root=await temp(t),source=path.join(root,'source'),target=path.join(root,'target');
  await release(source,'2','2');await release(target,'1');await put(target,'node_modules/lib/local','cached');
  await put(target,'SKILL.md','local patch');
  await assert.rejects(deployRelease({source,target,backupRoot:path.join(root,'backups')}),/现场修改/);
  assert.equal(await fs.readFile(path.join(target,'SKILL.md'),'utf8'),'local patch');
  const result=await deployRelease({source,target,backupRoot:path.join(root,'backups'),reviewedLocalChanges:true});
  assert.equal(result.runtimePreserved,false);await fs.access(path.join(result.backup,'node_modules/lib/local'));
});
