import React from 'react';
import {AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {DEFAULT_STAGE, componentLayout, connectorPoints, textLines} from './component-library.mjs';

export const CompositionScene = ({scene}) => {
 const t=useCurrentFrame()/useVideoConfig().fps,layout=componentLayout(scene,t),stage=scene.stage||DEFAULT_STAGE;
 const render=node=>{
  const {state:s}=layout[node.id],key=`${scene.id}-${node.id}`,color=s.stroke==='none'?'#9E2F3F':s.stroke;
  const common={fill:s.fill,stroke:s.stroke,strokeWidth:s.strokeWidth};
  const reveal={pathLength:1,strokeDasharray:1,strokeDashoffset:1-s.draw};
  let body;
  switch(node.type){
   case 'rect': body=<rect width={s.width} height={s.height} rx={node.radius||0} {...common}/>;break;
   case 'ellipse':body=<ellipse cx={s.width/2} cy={s.height/2} rx={s.width/2} ry={s.height/2} {...common}/>;break;
   case 'path':body=<path d={node.d} {...common} {...reveal}/>;break;
   case 'text':{const fontSize=node.fontSize??40,align=node.align||'left';body=<text fill={s.fill==='none'?'#2B2929':s.fill} fontFamily="PingFang SC, Hiragino Sans GB, sans-serif" fontSize={fontSize} fontWeight={node.fontWeight??400} textAnchor={align==='center'?'middle':align==='right'?'end':'start'}>{textLines(node,s).map((line,i)=><tspan key={i} x={align==='center'?s.width/2:align==='right'?s.width:0} y={fontSize+i*fontSize*(node.lineHeight??1.25)}>{line}</tspan>)}</text>;break;}
   case 'image':body=<foreignObject width={s.width} height={s.height}><Img src={staticFile(node.asset)} style={{display:'block',width:'100%',height:'100%',objectFit:node.fit||'contain'}}/></foreignObject>;break;
   case 'group':body=<>{node.clip?<defs><clipPath id={`${key}-clip`}><rect width={s.width} height={s.height}/></clipPath></defs>:null}<g clipPath={node.clip?`url(#${key}-clip)`:undefined}>{(node.children||[]).map(render)}</g></>;break;
   case 'connector':{
    const [a,b]=connectorPoints(node,layout),arrow=node.arrow||'none';
    body=<><defs><marker id={`${key}-arrow`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill={color}/></marker></defs><line x1={a.x} y1={a.y} x2={a.x+(b.x-a.x)*s.draw} y2={a.y+(b.y-a.y)*s.draw} stroke={color} strokeWidth={s.strokeWidth} opacity={s.draw>0?1:0} markerStart={['start','both'].includes(arrow)?`url(#${key}-arrow)`:undefined} markerEnd={['end','both'].includes(arrow)?`url(#${key}-arrow)`:undefined}/></>;break;
   }
   default:throw new Error(`Unsupported component ${node.type}`);
  }
  return <g key={node.id} data-component={node.id} opacity={s.opacity} transform={`translate(${s.x} ${s.y}) rotate(${s.rotate}) scale(${s.scale})`}>{body}</g>;
 };
 return <AbsoluteFill style={{background:scene.background||'#FBF8F4'}}><svg width="1080" height="1920" viewBox="0 0 1080 1920"><g transform={`translate(${stage.x} ${stage.y})`}>{scene.components.map(render)}</g></svg></AbsoluteFill>;
};
