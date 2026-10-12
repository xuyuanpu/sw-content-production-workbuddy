import fs from 'node:fs/promises';
import path from 'node:path';
import {analyzeVoiceover,extractVoiceoverBody} from './voiceover-lib.mjs';
import {confirmedVoiceoverMatches} from './confirmed-voiceover-lib.mjs';
async function optionalText(file) { try{return await fs.readFile(file,'utf8');}catch(e){if(e.code==='ENOENT')return '';throw e;} }
export async function inspectVoiceoverReview(root) {
  const draft=await optionalText(path.join(root,'voiceover-draft.md'));
  const body=extractVoiceoverBody(draft);
  const reviewReady=Boolean(body.trim()) && body.trim()!=='待按来源与 content-plan 生成。';
  const ttsInput=(await optionalText(path.join(root,'tts-input.txt'))).trim();
  const reasons=[];
  if(!reviewReady)reasons.push('口播内容尚未生成');
  if(!ttsInput)reasons.push('配音稿尚未生成，先审核口播正文');
  const analysis=reviewReady&&ttsInput?analyzeVoiceover(draft,ttsInput):null;
  if(analysis&&!analysis.passed)reasons.push(...analysis.checks.filter(c=>!c.passed).map(c=>c.name));
  let stored=null;
  try {const raw=await optionalText(path.join(root,'voiceover-report.json'));if(raw)stored=JSON.parse(raw);}
  catch(e){reasons.push(`配音检查记录不可用：${e.message}`);}
  if(!stored)reasons.push('配音检查尚未完成');
  const draftHash=(analysis || analyzeVoiceover(draft,'')).fingerprints.draftBody;
  const contentConfirmed=reviewReady && stored?.contentConfirmation?.method==='explicit-user-confirmation' && stored.contentConfirmation.draftHash===draftHash;
  const ready=Boolean(analysis&&confirmedVoiceoverMatches(stored,draft,ttsInput));
  if(stored&&!ready)reasons.push('配音稿未确认、未通过检查或记录已过期');
  return {reviewReady,contentConfirmed,ready,reasons,body,draft,ttsInput,analysis};
}
