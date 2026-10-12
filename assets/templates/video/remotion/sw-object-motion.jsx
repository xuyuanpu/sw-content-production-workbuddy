import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {targetState, beatAt, progressAt} from './semantic-motion.mjs';

// Objects and relationships are deterministic SVG, driven by the same target IDs
// checked in semantic-motion.mjs. No decorative textures or idle drift.
export const ObjectMotionScene = ({scene}) => {
  const second = useCurrentFrame() / useVideoConfig().fps;
  const positions = Object.fromEntries((scene.objects || []).map(o => {
    const state = targetState(scene, `object:${o.id}`, second);
    return [o.id, {...o, ...state, x: o.x + state.x, y: o.y + state.y}];
  }));
  return <AbsoluteFill style={{background: '#FBF8F4', color: '#2D1F1F', fontFamily: 'PingFang SC, sans-serif'}}>
    <div style={{position: 'absolute', top: 190, left: 64, right: 64, fontSize: 68, fontWeight: 780, lineHeight: 1.3}}>{(scene.overlayLines || []).map(line => <div key={line}>{line}</div>)}</div>
    <svg width="1080" height="1920" viewBox="0 0 1080 1920">
      {(scene.relations || []).map(r => {
        const a = positions[r.from], b = positions[r.to];
        if (!a || !b) throw new Error(`Unknown relation endpoints: ${r.id}`);
        const p = progressAt(second, beatAt(scene, `relation:${r.id}`, 0), .6);
        return <line key={r.id} x1={a.x} y1={a.y} x2={a.x + (b.x-a.x)*p} y2={a.y + (b.y-a.y)*p} stroke="#AA3042" strokeWidth="7" opacity={p * Math.min(a.opacity,b.opacity)} />;
      })}
      {Object.values(positions).map(o => <g key={o.id} transform={`translate(${o.x},${o.y})`} opacity={o.opacity}>
        <circle r="98" fill={o.accent ? '#AA3042' : '#F1E3DF'} stroke="#AA3042" strokeWidth="3" />
        <text textAnchor="middle" dominantBaseline="central" fontSize="40" fontWeight="700" fill={o.accent ? '#FFFFFF' : '#492E33'}>{o.label}</text>
      </g>)}
    </svg>
    {scene.supportingText ? <div style={{position: 'absolute', top: 1430, left: 70, right: 70, fontSize: 40, textAlign: 'center'}}>{scene.supportingText}</div> : null}
  </AbsoluteFill>;
};
