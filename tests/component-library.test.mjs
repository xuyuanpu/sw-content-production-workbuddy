import test from 'node:test';
import assert from 'node:assert/strict';
import {compileComposition,compositionErrors,stateAt,componentLayout,connectorPoints,compositionWarnings} from '../assets/templates/video/remotion/component-library.mjs';
import {compileDirector,verifyDirector,deriveShotbook,deriveExplanationMap,deriveKnowledgeChain,deriveTreatment} from '../scripts/director-contract-lib.mjs';
import {analyzeStoryboard} from '../scripts/storyboard-lib.mjs';
import {analyzeVideoAssetPolicy} from '../scripts/video-asset-policy-lib.mjs';
const state={x:10,y:20,width:100,height:80};
const node=(id,type='rect')=>({id,type,state:{...state}});
const scene=()=>({id:'free',visual:'composition',start:0,end:10,components:[node('a')]});
const resolver=a=>({start:a.text==='later'?6:2,end:a.text==='later'?7:3});
test('speech-keyed object supports several independent movements and fades, not one enter plus move',()=>{
 const s=scene();s.components[0].keyframes=[{anchor:{text:'first'},state:{x:10}},{anchor:{text:'later'},state:{x:210,opacity:.5}},{anchor:{scene:'end'},state:{x:30,opacity:1}}];
 const out=compileComposition(s,resolver),n=out.components[0];
 assert.equal(stateAt(n,1).x,10);assert.equal(stateAt(n,4).x,110);assert.equal(stateAt(n,6).opacity,.5);assert.equal(stateAt(n,10).x,30);
 assert.deepEqual(compileComposition(out,resolver),out);
});
test('groups and connectors share transforms; only explicit edges exist and arrows are optional',()=>{
 const s=scene();s.components=[{id:'group',type:'group',state:{...state,x:100,y:200,scale:2,rotate:90},children:[node('a')]},node('b'),{id:'edge',type:'connector',state:{...state,x:0,y:0},from:{component:'a',u:0,v:0},to:{component:'b',u:1,v:1}}];
 const layout=componentLayout(s,0),[a,b]=connectorPoints(s.components[2],layout);
 assert.ok(Math.abs(a.x-60)<1e-8);assert.ok(Math.abs(a.y-220)<1e-8);assert.deepEqual(b,{x:110,y:100});assert.equal(layout.edge.node.arrow,undefined);
});
test('rejects missing references, invalid motion and silent unsupported properties',()=>{
 for(const mutate of [s=>s.components.push({...node('bad','connector'),from:{component:'missing'},to:{x:5,y:6}}),s=>s.components[0].state.magic=1,s=>s.components[0].type='automatic-cause',s=>s.components.push(node('a')),s=>s.components[0].state.scale=0,s=>s.components[0].keyframes=[{at:12,state:{x:3}}]]){
  const s=scene();mutate(s);assert.ok(compositionErrors(s).length);
 }
 const s=scene();s.components[0].keyframes=[{anchor:{text:'later'},offset:20,state:{x:3}}];assert.throws(()=>compileComposition(s,resolver),/inside scene/);
});
test('text length and object count are not semantic limits; layout concerns are review warnings',()=>{
 const s=scene();s.components=Array.from({length:8},(_,i)=>({...node(`text${i}`,'text'),text:'同一语义可以由不同组件自由组合表达',fontSize:40}));
 assert.deepEqual(compositionErrors(s),[]);assert.ok(compositionWarnings(s).some(w=>w.includes('height')));
});
test('nested image assets cannot bypass platform screenshot checks',()=>{
 const s=scene();s.components=[{...node('g','group'),children:[{...node('img','image'),asset:'unit:AIworkspace/30-wechat/current/output/article-full.png'}]}];
 assert.equal(analyzeVideoAssetPolicy({scenes:[s]}).passed,false);
});
test('canonical director accepts the same intent with different primitives and preserves fingerprints',()=>{
 const evidence={audioSha256:'test',words:[{word:'开场',start:0,end:2},{word:'具体经历',start:3,end:5},{word:'整理起来',start:6,end:8}]};
 const direction={knowledgeBeats:['B-01'],viewerBefore:'零散材料没有被回顾',viewerAfter:'经历成为可以一起讨论的材料',visualStory:'选择几何和文字的组合表达，不预设语义模板',openingFrame:'多个经历分散在画面上',closingFrame:'经历被重新排列以便讨论',primaryVisualJob:'让观众看见材料怎样被重新组织',handoff:{fromPrevious:'承接具体经验',toNext:'继续进行讨论'}};
 const d={video:{directorVersion:1,duration:9},film:{audience:'理解施测过程的人',viewerChange:'理解整理材料的过程',throughline:'同一批经历被整理'},scenes:[{id:'cover',visual:'cover',direction,beats:[{target:'scene',action:'hold',anchor:'开场'}]},{...scene(),startAnchor:'具体经历',direction}],explanations:[{id:'B-01',sceneId:'free',operation:'重新排列材料便于一起回顾',evidence:'S-01原稿整理经历段落',visualBasis:'对象按真实语音聚集',why:'看到同一对象的前后状态',forbiddenFallback:'不能自动添加因果箭头'}],captions:evidence.words.map(w=>({text:w.word,from:w.word,to:w.word}))};
 for(const type of ['rect','ellipse','text']){
  d.scenes[1].components=[{...node('a',type),...(type==='text'?{text:'没有预设固定样式'}:{}),keyframes:[{anchor:'具体经历',state:{x:10}},{anchor:'整理起来',state:{x:300}}]}];
  const out=compileDirector(d,evidence,'test');assert.equal(verifyDirector(out,evidence,'test').passed,true);
  const inputs={scenes:out,shotbook:deriveShotbook(out),explanationMap:deriveExplanationMap(out),chain:deriveKnowledgeChain(out),treatment:deriveTreatment(out),script:'开场具体经历整理起来'};
  const r=analyzeStoryboard(inputs);assert.equal(r.passed,true,JSON.stringify(r.checks.filter(c=>!c.passed)));
  out.scenes[1].components[0].keyframes[1].at=99;assert.equal(verifyDirector(out,evidence,'test').passed,false);
 }
});
