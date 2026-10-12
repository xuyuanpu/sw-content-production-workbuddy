import test from 'node:test';
import assert from 'node:assert/strict';
import {compileDirector, verifyDirector, resolveAnchor, speechIndex, deriveShotbook, deriveKnowledgeChain, deriveTreatment} from '../scripts/director-contract-lib.mjs';
import {targetState, beatAt, actionErrors} from '../assets/templates/video/remotion/semantic-motion.mjs';
const evidence = {audioSha256:'abc', words:[{word:'先看起点',start:0,end:2},{word:'不能替代',start:3,end:5},{word:'可以帮助',start:6,end:8},{word:'逐渐偏离',start:9,end:11}]};
const direction = {viewerBefore:'观众只看一个结果',viewerAfter:'观众理解两种功能不同',visualStory:'限制先出现，再展示能够提供的帮助'};
const data = () => ({film:{audience:'普通观众',viewerChange:'看清区别',throughline:'比较功能'},video:{directorVersion:1,duration:12},scenes:[
{id:'cover',visual:'cover',direction,beats:[{anchor:'先看起点',target:'scene',action:'hold'}]},
{id:'boundary',visual:'boundary-split',startAnchor:'不能替代',direction,can:['帮助理解'],cannot:['替你决定'],beats:[{anchor:'不能替代',target:'cannot',action:'enter'},{anchor:'可以帮助',target:'can',action:'enter'}]}
],captions:evidence.words.map(w=>({text:w.word,from:w.word,to:w.word}))});
test('real speech derives scene times and keyed boundary order, not array order',()=>{
 const out=compileDirector(data(),evidence,'abc');
 assert.equal(out.scenes[0].end,3); assert.equal(out.scenes[1].start,3);
 assert.equal(beatAt(out.scenes[1],'cannot'),0); assert.equal(beatAt(out.scenes[1],'can'),3);
 assert.equal(verifyDirector(out,evidence,'abc').passed,true);
 assert.equal(deriveShotbook(out).scenes[1].semanticBeats[0].t,3);
 out.scenes[1].beats[0].at=9;assert.equal(verifyDirector(out,evidence,'abc').passed,false);
});
test('fails closed on guessed anchors, unsupported choreography and stale audio',()=>{
 for (const mutate of [d=>d.scenes[1].startAnchor='不存在',d=>d.scenes[1].beats[0].action='写了但没实现',d=>d.scenes[1].beats[0].anchor='先看起点',d=>d.scenes[1].supportingText='箭头按语音顺序建立，不一次性把答案摆满。',d=>d.captions[0].text='长'.repeat(70)]) {
  const d=data();mutate(d);assert.throws(()=>compileDirector(d,evidence,'abc'));
 }
 assert.throws(()=>compileDirector(data(),evidence,'changed'));
});
test('ambiguous repeated anchor requires an explicit occurrence',()=>{
 const idx=speechIndex({words:[...evidence.words,{word:'先看起点',start:12,end:14}]});
 assert.throws(()=>resolveAnchor(idx,'先看起点'));
 assert.equal(resolveAnchor(idx,{text:'先看起点',occurrence:2}).start,12);
});
test('movement produces distinct before/intermediate/after positions',()=>{
 const s={visual:'object-motion',start:0,end:10,objects:[{id:'a'}],beats:[{target:'object:a',action:'move',at:2,duration:4,from:{x:0,y:0},to:{x:300,y:200}}]};
 assert.deepEqual(actionErrors(s),[]);
 assert.equal(targetState(s,'object:a',1).x,0);
 assert.equal(targetState(s,'object:a',4).x,150);
 assert.equal(targetState(s,'object:a',7).x,300);
 s.beats[0].to={x:0,y:0};assert.ok(actionErrors(s).length);
});

test('review cannot be inferred from rendering or reused after changes',async()=>{
 const {directorReviewTemplate,checkDirectorReview}=await import('../scripts/director-review-lib.mjs');
 const report={artifacts:{finalVideo:{sha256:'video'}},directorContract:{timelineSha256:'timeline',sceneIds:['one']}};
 const review=directorReviewTemplate(report);assert.equal(checkDirectorReview(review,report).passed,false);
 Object.assign(review,{reviewer:'Test fixture',reviewedAt:'2026-09-18T00:00:00Z',fullVideoWatched:true,fullAudioListened:true,narrativeFinding:'Fixture only',pacingFinding:'Fixture only',scenes:[{sceneId:'one',passed:true,finding:'Fixture only'}]});
 assert.equal(checkDirectorReview(review,report).passed,true);
 report.artifacts.finalVideo.sha256='new';assert.equal(checkDirectorReview(review,report).passed,false);
});

test('canonical direction flows into storyboard QC without duplicate handwritten timing',async()=>{
 const {analyzeStoryboard}=await import('../scripts/storyboard-lib.mjs');
 const {deriveExplanationMap}=await import('../scripts/director-contract-lib.mjs');
 const d=data();
 d.scenes.forEach((s,i)=>Object.assign(s.direction,{knowledgeBeats:['B-01','B-02','B-03'],openingFrame:'画面清晰呈现比较对象',closingFrame:'比较完成后保持阅读位置',primaryVisualJob:i?'boundary':'orient',handoff:{fromPrevious:'延续上一个问题',toNext:'将判断交给后续结论'}}));
 // data() shares its simple direction fixture, so give each scene its own job.
 d.scenes[0].direction={...d.scenes[0].direction,primaryVisualJob:'orient'};
 d.explanations=['B-01','B-02','B-03'].map((id,i)=>({id,before:'只看到一个结果',after:'能区分帮助与限制',operation:i===2?'boundary':'compare',evidence:'S-01来源',visualBasis:'左右两侧按语音出现',why:'把帮助和限制并列展示',sceneId:'boundary',forbiddenFallback:'不缩成一句泛用标语'}));
 const compiled=compileDirector(d,evidence,'abc');
 const inputs={scenes:compiled,shotbook:deriveShotbook(compiled),explanationMap:deriveExplanationMap(compiled),chain:deriveKnowledgeChain(compiled),treatment:deriveTreatment(compiled),script:'先看起点不能替代可以帮助逐渐偏离'};
 const report=analyzeStoryboard(inputs);assert.equal(report.passed,true,JSON.stringify(report.checks.filter(c=>!c.passed)));
 inputs.shotbook.scenes[1].semanticBeats[0].t=99;
 assert.equal(analyzeStoryboard(inputs).passed,false);
});

test('rejects objects that the renderer would silently truncate',()=>{
 const s={visual:'cause-map',start:0,end:10,nodes:['a','b','c','d','e'],beats:Array.from({length:5},(_,i)=>({target:`node:${i}`,action:'enter',at:i}))};
 assert.ok(actionErrors(s).some(e=>e.includes('1–4')));
 s.nodes=s.nodes.slice(0,4);s.beats=s.beats.slice(0,4);assert.deepEqual(actionErrors(s),[]);
});

test('removed paper styles and stale item payloads cannot compile', () => {
 for (const mutate of [d=>d.video.visualStyle='paper-collage', ...['paper-stack','paper-contrast','paper-reveal'].map(v=>d=>d.scenes[0].visual=v),d=>d.scenes[0].paperItems=[]]) {
  const d=data();mutate(d);assert.throws(()=>compileDirector(d,evidence,'abc'),/Removed paper/);
 }
});

test('character insert binds speech and rejects ambiguous identity ownership',()=>{
 const d=data(),s=d.scenes[1];
 Object.assign(s,{visual:'character-scene',asset:'assets/people.png',labelsInImage:true,characters:[{id:'guide',label:'施测师'},{id:'client',label:'客户'}],supportingText:'引导参与者表达经验',beats:[{target:'illustration',action:'enter',anchor:'不能替代'},{target:'detail',action:'enter',anchor:'可以帮助'}]});
 assert.equal(beatAt(compileDirector(d,evidence,'abc').scenes[1],'detail'),3);
 s.labelsInImage=false;assert.throws(()=>compileDirector(d,evidence,'abc'),/identity labels/);
 s.labelsInImage=true;s.characters[1].id='guide';assert.throws(()=>compileDirector(d,evidence,'abc'),/identity labels/);
});
test('boundary items bind individual speech and reject nonexistent items',()=>{
 const d=data(),s=d.scenes[1];s.cannot=['替你判断','替你决定'];s.beats.push({target:'cannot:0',action:'enter',anchor:'不能替代'},{target:'cannot:1',action:'enter',anchor:'逐渐偏离'});
 assert.equal(beatAt(compileDirector(d,evidence,'abc').scenes[1],'cannot:1'),6);
 s.beats.push({target:'cannot:9',action:'enter',anchor:'逐渐偏离'});assert.throws(()=>compileDirector(d,evidence,'abc'),/unsupported/);
});

test('production entry requires a cover decision and keeps character identities consistent',async()=>{
 const {productionPlanErrors}=await import('../scripts/director-contract-lib.mjs');
 const d=data();assert.ok(productionPlanErrors(d).includes('film.cover.topicLink'));
 d.film.cover={subject:'参与者与施测师',action:'面对面交流',topicLink:'展示问卷以外的理解活动'};d.film.visualDivision='人物情境与对象关系分工';d.film.sound='固定品牌混音';d.scenes[0].asset='assets/cover.png';assert.deepEqual(productionPlanErrors(d),[]);
 d.scenes[0].characters=[{id:'same',label:'施测师'}];d.scenes[1].characters=[{id:'same',label:'客户'}];assert.ok(productionPlanErrors(d).some(x=>x.includes('identity changed')));
});


test('one genuine explanation needs no invented case or boundary and views stay derived',async()=>{
 const {analyzeStoryboard}=await import('../scripts/storyboard-lib.mjs');
 const {deriveExplanationMap}=await import('../scripts/director-contract-lib.mjs');
 const d=data();
 d.scenes.forEach((s,i)=>s.direction={...s.direction,knowledgeBeats:['B-01'],openingFrame:'画面呈现当前比较对象',closingFrame:'画面保留完整比较结果',primaryVisualJob:i?'boundary':'orient',handoff:{fromPrevious:'沿用当前比较任务',toNext:'展示下一步的区分'}});
 d.explanations=[{id:'B-01',before:'读者还未区分两种功能',after:'读者能够区分两种功能',operation:'compare',evidence:'给定材料的功能定义',visualBasis:'左右显示两种不同功能',why:'直接呈现功能区别',sceneId:'boundary',forbiddenFallback:'不制造案例来凑镜头'}];
 const compiled=compileDirector(d,evidence,'abc');
 const inputs={scenes:compiled,shotbook:deriveShotbook(compiled),explanationMap:deriveExplanationMap(compiled),chain:deriveKnowledgeChain(compiled),treatment:deriveTreatment(compiled),script:'先看起点不能替代可以帮助逐渐偏离'};
 assert.equal(analyzeStoryboard(inputs).passed,true,JSON.stringify(analyzeStoryboard(inputs).checks.filter(c=>!c.passed)));
 inputs.chain+='\n## B-02 · 具体例子\n';assert.equal(analyzeStoryboard(inputs).passed,false);
});
