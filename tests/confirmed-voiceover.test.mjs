import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {analyzeVoiceover, extractVoiceoverBody} from '../scripts/voiceover-lib.mjs';
import {confirmedVoiceoverMatches} from '../scripts/confirmed-voiceover-lib.mjs';
const body = '会议开始前，一位技术同事把客户需要确认的事项写在纸上。讨论时，他逐项说明已有依据，遇到尚未查证的内容就记下后续处理时间。这段场景呈现的是具体任务中的准备与沟通行为。这些行为本身无法判断他的性格偏好，也无法证明一次准备必然带来良好的沟通结果。偏好和任务表现需要分别观察，结论需要相应的资料支持。';
const tts = body.replace('纸上。','纸上。<#0.4#>').replace('沟通行为。','沟通行为。<#0.5#>');
test('confirmation binds draft and machine input without legacy science files',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'sw-voice-confirm-'));
 try {
  const draft=path.join(dir,'voiceover-draft.md'), machine=path.join(dir,'tts-input.txt'), report=path.join(dir,'voiceover-report.json');
  await fs.writeFile(draft,'## 口播稿\n'+body);await fs.writeFile(machine,tts);
  const command=path.resolve('scripts/voiceover-qc.mjs'),args=[command,'--draft',draft,'--tts',machine];
  assert.throws(()=>execFileSync(process.execPath,args,{stdio:'pipe'}));
  execFileSync(process.execPath,[...args,'--confirm','YES'],{stdio:'pipe'}); // synthetic user approval fixture only
  let saved=JSON.parse(await fs.readFile(report,'utf8'));
  assert(confirmedVoiceoverMatches(saved,body,tts));
  assert.equal(confirmedVoiceoverMatches(saved,body+'新增观点。',tts),false);
  assert.equal(confirmedVoiceoverMatches(saved,body,tts.replace('无法证明','足以证明')),false);
  execFileSync(process.execPath,args,{stdio:'pipe'});
  assert(JSON.parse(await fs.readFile(report,'utf8')).passed);
  await fs.writeFile(draft,'## 口播稿\n'+body+'新增观点。');
  assert.throws(()=>execFileSync(process.execPath,args,{stdio:'pipe'}));
  saved=JSON.parse(await fs.readFile(report,'utf8'));assert.equal(saved.contentConfirmation,null);
 } finally {await fs.rm(dir,{recursive:true,force:true});}
});
test('ordinary revision heading does not include metadata in voiceover body',()=>{
 assert.equal(extractVoiceoverBody('# 标题\n## 口播稿（修订三稿）\n'+body+'\n## 来源\n说明'),body);
 assert.equal(confirmedVoiceoverMatches(analyzeVoiceover(body,tts),body,tts),false);
});
