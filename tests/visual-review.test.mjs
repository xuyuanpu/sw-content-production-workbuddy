import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {visualFramePlan,writeVisualReview} from '../scripts/visual-review-lib.mjs';
const scenes=[{id:'s1',start:0,end:10,direction:{visualStory:'<script>bad</script>',viewerAfter:'understand'}}];
test('continuous review includes interior of long scenes and rejects invalid proof times',()=>{
 const p=visualFramePlan({scenes,duration:10,fps:30,kind:'candidate'});
 assert.ok(p.some(f=>f.second===6));assert.equal(p.at(-1).frame,299);
 for(const at of ['','NaN','-1','10','1,'])assert.throws(()=>visualFramePlan({scenes,duration:10,fps:30,at}));
});
test('evidence is bound, escaped, and a failed rerun removes stale success page',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'sw-review-'));
 try{
 const options={outDir:dir,kind:'proof',plan:visualFramePlan({scenes,duration:10,fps:30,at:'1'}),timelineSha256:'timeline',sourceInputs:{files:[]},renderFrame:async(_,target)=>fs.writeFile(target,'frame')};
 const r=await writeVisualReview(options);assert.equal(r.status,'evidence-ready');assert.equal(r.frames[0].sha256.length,64);
 const html=await fs.readFile(path.join(dir,'index.html'),'utf8');assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>bad'));
 await assert.rejects(writeVisualReview({...options,renderFrame:async()=>{throw new Error('capture failed');}}));
 assert.equal(JSON.parse(await fs.readFile(path.join(dir,'review.json'))).status,'failed');
 await assert.rejects(fs.access(path.join(dir,'index.html')));
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('candidate changed during extraction cannot receive successful review evidence',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'sw-review-'));const videoPath=path.join(dir,'video.mp4');
 try{await fs.writeFile(videoPath,'old');await assert.rejects(writeVisualReview({outDir:path.join(dir,'review'),kind:'candidate',videoPath,plan:[{frame:0,second:0}],renderFrame:async(_,target)=>{await fs.writeFile(target,'image');await fs.writeFile(videoPath,'changed');}}),/Video changed/);}finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('encoded video shorter than planned audio still yields last-frame evidence',async(t)=>{
 const {execFileSync}=await import('node:child_process');
 try{execFileSync('ffmpeg',['-version'],{stdio:'ignore'});}catch{t.skip('ffmpeg unavailable');return;}
 const {writeCandidateVisualReview}=await import('../scripts/visual-review-lib.mjs');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'sw-review-short-'));
 try{
 const videoPath=path.join(dir,'video.mp4');
 execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=c=white:s=64x64:r=30','-frames:v','15','-c:v','libx264',videoPath]);
 const r=await writeCandidateVisualReview({outDir:path.join(dir,'review'),videoPath,scenes:[{id:'s1',start:0,end:1}],subtitles:[],duration:1,fps:30});
 assert.equal(r.status,'evidence-ready');assert.equal(r.frames.at(-1).frame,14);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
