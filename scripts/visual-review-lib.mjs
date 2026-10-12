// Produces visual evidence; it never infers that an illustration or explanation is good.
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {sha256, writeJson} from './lib.mjs';
const run=promisify(execFile);
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function visualFramePlan({scenes, duration, fps, at, kind='proof'}) {
 if(!Number.isFinite(duration)||duration<=0||!Number.isFinite(fps)||fps<=0)throw new Error('Invalid visual review duration/fps');
 let times;
 if(at!==undefined){
  if(typeof at!=='string'||!at.trim())throw new Error('--at needs comma-separated seconds');
  times=at.split(',').map(s=>s.trim());
  if(times.some(s=>!s||!Number.isFinite(Number(s))))throw new Error('--at needs finite seconds');
  times=times.map(Number);
  if(times.some(t=>t<0||t>=duration))throw new Error('--at must be within the current audio duration');
 }else if(kind==='candidate'){
  times=[0,...Array.from({length:Math.ceil(duration/2)},(_,i)=>i*2),...scenes.map(s=>s.start+Math.min(.15,(s.end-s.start)/4)),Math.max(0,duration-1/fps)];
 }else{
  times=[0,...scenes.flatMap(s=>{const d=s.end-s.start;return[s.start+Math.min(.35,d/6),s.start+d/2,s.end-Math.min(.2,d/6)];})];
 }
 const lastFrame=Math.max(0,Math.ceil(duration*fps)-1);
 const frames=[...new Set(times.map(t=>Math.min(lastFrame,Math.round(t*fps))))].sort((a,b)=>a-b);
 if(frames.length>2000)throw new Error('Visual review exceeds 2000 frames; narrow the proof times or split the content');
 return frames.map(frame=>{
  const second=frame/fps,scene=scenes.find(s=>second>=s.start&&second<s.end);
  return {frame,second,sceneId:scene?.id??null,visualStory:scene?.direction?.visualStory??'',viewerAfter:scene?.direction?.viewerAfter??''};
 });
}

export function visualReviewHtml(report) {
 const title=report.kind==='proof'?'视觉试稿：检查真实画面':'全片审阅：连续时间轴';
 const video=report.kind==='candidate'?'<video id="film" controls preload="metadata" src="../video-candidate.mp4"></video>':'';
 return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{margin:0;background:#FBF8F4;color:#292627;font-family:system-ui,sans-serif}main{max-width:1320px;margin:auto;padding:24px}h1{font-size:24px}p{line-height:1.65}video{width:min(100%,420px);max-height:70vh;display:block;margin:20px auto}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:18px}figure{margin:0;background:white;padding:12px}img{width:100%;height:auto}figcaption{line-height:1.5;font-size:14px}b{color:#9E2F3F}small{display:block;overflow-wrap:anywhere;color:#696466}button{cursor:pointer;font:inherit;border:1px solid #cfc6c1;background:#fff;padding:4px 8px}</style><main><h1>${title}</h1><p>这些是当前渲染的画面证据，不是视觉验收结论。对照本段口播，检查画面新增了什么理解、动作是否兑现意图，以及前后是否接得上。静止或留白本身不判失败。</p><small>时间轴 ${escape(report.timelineSha256)}${report.videoSha256?' · 视频 '+escape(report.videoSha256):''}</small>${video}<section class="grid">${report.frames.map(f=>`<figure><a href="${escape(f.file)}"><img loading="lazy" src="${escape(f.file)}" alt="${escape(f.sceneId)} ${f.second.toFixed(2)} 秒"></a><figcaption><b>${f.second.toFixed(2)} 秒 · ${escape(f.sceneId)}</b> ${report.kind==='candidate'?`<button onclick="const v=document.getElementById('film');v.currentTime=${f.second};v.scrollIntoView({block:'center'});">定位播放</button>`:''}<p>${escape(f.caption)}</p><small>计划：${escape(f.visualStory)}</small><small>希望观众理解：${escape(f.viewerAfter)}</small></figcaption></figure>`).join('')}</section></main></html>`;
}

export async function writeVisualReview({outDir,kind,plan,subtitles=[],timelineSha256,sourceInputs,renderFrame,videoPath}) {
 await fs.mkdir(outDir,{recursive:true});
 // An interrupted attempt must not leave a previous successful page pretending to be current.
 await fs.rm(path.join(outDir,'index.html'),{force:true});
 const report={schemaVersion:1,kind,status:'rendering',timelineSha256,sourceInputs,frames:[],generatedAt:new Date().toISOString()};
 await writeJson(path.join(outDir,'review.json'),report);
 try {
  if(videoPath)report.videoSha256=sha256(await fs.readFile(videoPath));
  for(const [i,p] of plan.entries()){
   const file=`frame-${String(i+1).padStart(4,'0')}.jpg`,target=path.join(outDir,file);
   await renderFrame(p,target);
   const bytes=await fs.readFile(target);
   if(!bytes.length)throw new Error('Empty review frame');
   report.frames.push({...p,file,sha256:sha256(bytes),caption:subtitles.filter(s=>p.second>=s.start&&p.second<s.end).map(s=>s.text).join(' ')});
  }
  if(videoPath&&report.videoSha256!==sha256(await fs.readFile(videoPath)))throw new Error('Video changed during visual review capture');
  report.status='evidence-ready';report.completedAt=new Date().toISOString();
  await writeJson(path.join(outDir,'review.json'),report);
  await fs.writeFile(path.join(outDir,'index.html'),visualReviewHtml(report));
  return report;
 }catch(e){report.status='failed';report.error=e.message;await writeJson(path.join(outDir,'review.json'),report);throw e;}
}

export async function writeCandidateVisualReview({outDir,videoPath,scenes,subtitles,duration,fps,timelineSha256,sourceInputs}) {
 const {stdout}=await run('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=duration,nb_frames','-of','json',videoPath],{timeout:60000,maxBuffer:1024*1024});
 const stream=JSON.parse(stdout).streams?.[0],frames=Number(stream?.nb_frames);
 const encodedDuration=Number.isFinite(frames)&&frames>0?frames/fps:Number(stream?.duration);
 if(!Number.isFinite(encodedDuration)||encodedDuration<=0)throw new Error('Cannot determine encoded video length for review');
 return writeVisualReview({outDir,kind:'candidate',plan:visualFramePlan({scenes,duration:Math.min(duration,encodedDuration),fps,kind:'candidate'}),subtitles,timelineSha256,sourceInputs,videoPath,
  renderFrame:async(p,target)=>{await run('ffmpeg',['-v','error','-y','-ss',String(Math.max(0,p.second-0.25/fps)),'-i',videoPath,'-frames:v','1','-q:v','3',target],{timeout:60000,maxBuffer:1024*1024});}});
}
