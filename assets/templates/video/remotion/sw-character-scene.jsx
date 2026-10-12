import React from 'react';
import {AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {beatAt, progressAt} from './semantic-motion.mjs';

// The illustration is an insert. Titles, timing and narration stay in the video layout.
export const CharacterScene = ({scene}) => {
  const t = useCurrentFrame()/useVideoConfig().fps;
  const enter = progressAt(t,beatAt(scene,'illustration'),.4);
  const detail = progressAt(t,beatAt(scene,'detail'),.4);
  return <AbsoluteFill style={{background:'#FBF8F4',color:'#262323',fontFamily:'PingFang SC,sans-serif'}}>
    <div style={{position:'absolute',top:190,left:64,right:64,fontSize:64,fontWeight:780,lineHeight:1.3}}>{(scene.overlayLines||[]).map((line,i)=><div key={i} style={{color:i?'#A92F40':undefined}}>{line}</div>)}</div>
    <div data-illustration-insert style={{position:'absolute',left:80,top:610,width:920,height:690,background:'#FFFFFF',opacity:enter,transform:`translateY(${(1-enter)*24}px)`}}><Img src={staticFile(scene.asset)} style={{width:'100%',height:'100%',objectFit:'contain'}}/></div>
    {scene.supportingText?<div style={{position:'absolute',top:1420,left:75,right:75,textAlign:'center',fontSize:40,color:'#A92F40',opacity:detail}}>{scene.supportingText}</div>:null}
  </AbsoluteFill>;
};
