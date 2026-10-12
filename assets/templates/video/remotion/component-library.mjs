// Geometry and motion only. No semantic task -> component mapping lives here.
export const COMPONENT_TYPES = Object.freeze(['text','image','rect','ellipse','path','connector','group']);
export const DEFAULT_STAGE = Object.freeze({x:64,y:190,width:952,height:1310});
const defaults = {x:0,y:0,width:100,height:100,opacity:1,scale:1,rotate:0,draw:1,strokeWidth:3,fill:'none',stroke:'none'};
const numeric = new Set(['x','y','width','height','opacity','scale','rotate','draw','strokeWidth']);
const colors = new Set(['fill','stroke']);
const colorOK = v => typeof v === 'string' && /^(?:#[\da-f]{3}(?:[\da-f]{3})?|none|transparent)$/i.test(v);
const idOK = v => typeof v === 'string' && /^[A-Za-z][A-Za-z0-9_-]*$/.test(v);
export const walkComponents = scene => {
 const out=[];
 const visit=(nodes,parent=null)=>{for(const node of nodes||[]){out.push({node,parent});if(Array.isArray(node.children))visit(node.children,node);}};
 visit(scene.components);return out;
};
export const componentText = scene => walkComponents(scene).filter(({node})=>node.type==='text').map(({node})=>node.text);
export function stateAt(node, second) {
 let previous={...defaults,...node.state}, at=0;
 for(const frame of node.keyframes||[]) {
  const next={...previous,...frame.state};
  if(second < frame.at) {
   let p=Math.max(0,Math.min(1,(second-at)/(frame.at-at)));
   p=frame.easing==='linear'?p:frame.easing==='hold'?0:p*p*(3-2*p);
   return Object.fromEntries(Object.entries(next).map(([key,value])=>[key,numeric.has(key)?previous[key]+(value-previous[key])*p:previous[key]]));
  }
  previous=next;at=frame.at;
 }
 return previous;
}
// Affine transforms also serve connectors, so endpoints follow grouped objects.
const mul=(a,b)=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
const point=(m,p)=>({x:m[0]*p.x+m[2]*p.y+m[4],y:m[1]*p.x+m[3]*p.y+m[5]});
const matrix=s=>{const a=s.rotate*Math.PI/180,c=Math.cos(a)*s.scale,n=Math.sin(a)*s.scale;return [c,n,-n,c,s.x,s.y];};
const inverse=m=>{const d=m[0]*m[3]-m[1]*m[2];return [m[3]/d,-m[1]/d,-m[2]/d,m[0]/d,(m[2]*m[5]-m[3]*m[4])/d,(m[1]*m[4]-m[0]*m[5])/d];};
export function componentLayout(scene,second) {
 const result={};
 const visit=(nodes,parentMatrix=[1,0,0,1,0,0],parentOpacity=1)=>{for(const node of nodes||[]){
  const state=stateAt(node,second),world=mul(parentMatrix,matrix(state));
  result[node.id]={node,state,world,parentMatrix,opacity:state.opacity*parentOpacity};
  if(node.children)visit(node.children,world,state.opacity*parentOpacity);
 }};
 visit(scene.components);return result;
}
export function connectorPoints(node,layout) {
 const end=ref=>{
  if(!ref.component)return ref;
  const item=layout[ref.component],s=item.state,u=ref.u??.5,v=ref.v??.5;
  return point(item.world,{x:s.width*u,y:s.height*v});
 };
 // Explicit points are in stage coordinates; all endpoints become connector-local.
 const inv=inverse(layout[node.id].world);
 return [node.from,node.to].map(ref=>point(inv,end(ref)));
}
export function textLines(node,state=stateAt(node,0)) {
 const size=node.fontSize??40,max=state.width;
 const measure=text=>[...text].reduce((n,c)=>n+(c.charCodeAt(0)<256?.56:1)*size,0);
 if(node.wrap===false)return String(node.text).split('\n');
 return String(node.text).split('\n').flatMap(paragraph=>{
  const rows=[];let row='';for(const c of paragraph){if(row&&measure(row+c)>max){rows.push(row);row='';}row+=c;}rows.push(row);return rows;
 });
}
function stateErrors(state,label) {
 const errors=[];
 if(!state||typeof state!=='object'||Array.isArray(state))return [`${label}: state object required`];
 for(const [key,value] of Object.entries(state)) {
  if(numeric.has(key)){if(!Number.isFinite(value))errors.push(`${label}: non-finite ${key}`);}
  else if(colors.has(key)){if(!colorOK(value))errors.push(`${label}: invalid ${key}`);}
  else errors.push(`${label}: unsupported state ${key}`);
 }
 for(const key of ['width','height','scale'])if(key in state&&state[key]<=0)errors.push(`${label}: ${key} must be positive`);
 for(const key of ['opacity','draw'])if(key in state&&(state[key]<0||state[key]>1))errors.push(`${label}: ${key} outside 0..1`);
 if(state.strokeWidth<0)errors.push(`${label}: negative strokeWidth`);
 return errors;
}
export function compositionErrors(scene) {
 const errors=[],rows=walkComponents(scene),ids=new Set(),duration=scene.end-scene.start;
 for(const key of ['overlayLines','titleLines','supportingText','asset','objects','relations','nodes','steps','can','cannot','oldText','newText'])if(scene[key]!==undefined)errors.push(`composition: ${key} belongs to a preset; use components`);
 if(!Array.isArray(scene.components)||!scene.components.length)return ['composition requires components'];
 const stage=scene.stage||DEFAULT_STAGE;
 if(!['x','y','width','height'].every(k=>Number.isFinite(stage[k]))||stage.width<=0||stage.height<=0)errors.push('invalid stage rectangle');
 if(scene.background!==undefined&&!colorOK(scene.background))errors.push('invalid background');
 for(const {node} of rows){
  if(!idOK(node.id)||ids.has(node.id))errors.push(`invalid or duplicate component id: ${node.id}`);ids.add(node.id);
  if(!COMPONENT_TYPES.includes(node.type))errors.push(`${node.id}: unknown component ${node.type}`);
  const allowed=new Set(['id','type','state','keyframes','children','clip','radius','text','fontSize','fontWeight','lineHeight','align','wrap','asset','assetRole','fit','d','from','to','arrow','characters','labelsInImage']);
  for(const key of Object.keys(node))if(!allowed.has(key))errors.push(`${node.id}: unsupported field ${key}`);
  const specific={text:['text','fontSize','fontWeight','lineHeight','align','wrap'],image:['asset','assetRole','fit','characters','labelsInImage'],rect:['radius'],group:['children','clip'],path:['d'],connector:['from','to','arrow'],ellipse:[]};
  for(const key of Object.keys(node))if(!['id','type','state','keyframes',...(specific[node.type]||[])].includes(key))errors.push(`${node.id}: ${key} does not apply to ${node.type}`);
  errors.push(...stateErrors(node.state, node.id));
  if(node.children!==undefined&&(node.type!=='group'||!Array.isArray(node.children)))errors.push(`${node.id}: only groups accept child arrays`);
  if(node.clip!==undefined&&(node.type!=='group'||typeof node.clip!=='boolean'))errors.push(`${node.id}: clip requires a group`);
  if(node.radius!==undefined&&(!Number.isFinite(node.radius)||node.radius<0||node.type!=='rect'))errors.push(`${node.id}: radius requires a rectangle`);
  if(node.type==='text') {
   if(typeof node.text!=='string'||!node.text.trim())errors.push(`${node.id}: text required`);
   if(node.fontSize!==undefined&&(!Number.isFinite(node.fontSize)||node.fontSize<=0))errors.push(`${node.id}: fontSize must be positive`);
   if(node.fontWeight!==undefined&&(!Number.isFinite(node.fontWeight)||node.fontWeight<100||node.fontWeight>900))errors.push(`${node.id}: invalid fontWeight`);
   if(node.lineHeight!==undefined&&(!Number.isFinite(node.lineHeight)||node.lineHeight<=0))errors.push(`${node.id}: invalid lineHeight`);
   if(node.align!==undefined&&!['left','center','right'].includes(node.align))errors.push(`${node.id}: invalid alignment`);
   if(node.wrap!==undefined&&typeof node.wrap!=='boolean')errors.push(`${node.id}: invalid wrap`);
  }
  if(node.type==='image') {
   if(typeof node.asset!=='string'||!node.asset.trim())errors.push(`${node.id}: image asset required`);
   if(node.fit!==undefined&&!['contain','cover'].includes(node.fit))errors.push(`${node.id}: invalid image fit`);
   if(node.characters?.length && (node.labelsInImage!==true||node.characters.some(c=>!c.id||!c.label)))errors.push(`${node.id}: identified characters need image-baked labels`);
  }
  if(node.type==='path'&&(typeof node.d!=='string'||!/^\s*[Mm][MmLlHhVvCcSsQqTtAaZz\d\s,.+eE-]+$/.test(node.d)))errors.push(`${node.id}: invalid SVG path`);
  if(node.type==='connector') {
   for(const ref of [node.from,node.to])if(!ref||!(typeof ref.component==='string'||Number.isFinite(ref.x)&&Number.isFinite(ref.y)))errors.push(`${node.id}: explicit endpoints required`);
   if(node.arrow!==undefined&&!['none','start','end','both'].includes(node.arrow))errors.push(`${node.id}: invalid arrow`);
  }
  if(node.keyframes!==undefined&&!Array.isArray(node.keyframes))errors.push(`${node.id}: keyframes must be an array`);
  let last=-1;
  for(const frame of Array.isArray(node.keyframes)?node.keyframes:[]) {
   for(const key of Object.keys(frame))if(!['anchor','edge','offset','state','easing','at'].includes(key))errors.push(`${node.id}: unsupported keyframe field ${key}`);
   if(!Number.isFinite(frame.at)||frame.at<0||frame.at>duration+.001||frame.at<=last)errors.push(`${node.id}: keyframes must be increasing and inside scene`);
   last=frame.at;errors.push(...stateErrors(frame.state,`${node.id} frame`));
   if(frame.easing!==undefined&&!['smooth','linear','hold'].includes(frame.easing))errors.push(`${node.id}: unsupported easing`);
  }
 }
 for(const {node} of rows)if(node.type==='connector')for(const ref of [node.from,node.to]){
  if(ref?.component&&(!ids.has(ref.component)||rows.find(r=>r.node.id===ref.component)?.node.type==='connector'))errors.push(`${node.id}: unknown or connector endpoint ${ref.component}`);
  for(const k of ['u','v'])if(ref?.[k]!==undefined&&(!Number.isFinite(ref[k])||ref[k]<0||ref[k]>1))errors.push(`${node.id}: endpoint ${k} outside 0..1`);
 }
 return errors;
}
export function compositionWarnings(scene) {
 if(compositionErrors(scene).length)return [];
 const warnings=new Set(),stage=scene.stage||DEFAULT_STAGE,duration=scene.end-scene.start;
 if(stage.x<0||stage.y<140||stage.x+stage.width>1080||stage.y+stage.height>1670)warnings.add('stage intersects brand, captions or frame edge; inspect layout');
 const times=new Set([0,duration/2,duration,...walkComponents(scene).flatMap(({node})=>(node.keyframes||[]).map(f=>f.at))]);
 for(const t of times)for(const item of Object.values(componentLayout(scene,t))) {
  const {node,state,world,opacity}=item;if(opacity<.05||node.type==='connector')continue;
  const corners=[[0,0],[state.width,0],[0,state.height],[state.width,state.height]].map(([x,y])=>point(world,{x,y}));
  if(corners.some(p=>p.x<0||p.y<0||p.x>stage.width||p.y>stage.height))warnings.add(`${node.id}: crosses stage at ${t.toFixed(2)}s; inspect intentional clipping/entry`);
  if(node.type==='text'){
   if((node.fontSize??40)*state.scale<28)warnings.add(`${node.id}: small text; inspect on phone`);
   if(textLines(node,state).length*(node.fontSize??40)*(node.lineHeight??1.25)>state.height)warnings.add(`${node.id}: text exceeds authored height`);
  }
 }
 return [...warnings];
}
export function compileComposition(scene,resolve) {
 const compiled=structuredClone(scene);
 for(const {node} of walkComponents(compiled))if(Array.isArray(node.keyframes))node.keyframes=node.keyframes.map(f=>{
  const boundary=f.anchor?.scene;
  if(boundary&&!['start','end'].includes(boundary))throw new Error('Unknown scene boundary anchor');
  if(f.edge!==undefined&&!['start','end'].includes(f.edge))throw new Error('Unknown speech anchor edge');
  if(f.offset!==undefined&&!Number.isFinite(f.offset))throw new Error('Non-finite anchor offset');
  const resolved=boundary?{start:boundary==='start'?scene.start:scene.end,end:boundary==='start'?scene.start:scene.end}:resolve(f.anchor);
  return {...f,at:resolved[f.edge||'start']-scene.start+(f.offset||0)};
 });
 const errors=compositionErrors(compiled);if(errors.length)throw new Error(errors.join('; '));
 compiled.beats=walkComponents(compiled).flatMap(({node})=>(node.keyframes||[]).map((f,i)=>({target:`component:${node.id}`,action:'animate',anchor:f.anchor,at:f.at,keyframe:i})));
 if(!compiled.beats.length)compiled.beats=[{target:'scene',action:'hold',anchor:{scene:'start'},at:0}];
 return compiled;
}
