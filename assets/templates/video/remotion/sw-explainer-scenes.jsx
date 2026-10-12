import {beatAt, beatFor, progressAt} from "./semantic-motion.mjs";
import React from "react";
import {AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig} from "remotion";
import {FocusSweep, LiveSubject, beatProgress} from "./sw-motion-system.jsx";

const C = {paper: "#FBF8F4", strong: "#FFFDFC", ink: "#262323", muted: "#756D6D", red: "#A92F40", redDark: "#7F1F2E", soft: "#F3E4E5", line: "#D8C4C7", green: "#2D6A52"};
const font = "'PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif";
const card = {background: C.strong, border: `2px solid ${C.line}`, borderRadius: 26, boxShadow: "0 22px 58px rgba(45,31,31,.12)"};

const Heading = ({scene, label}) => (
  <div style={{position: "absolute", left: 62, right: 62, top: 180}}>
    <div style={{fontFamily: font, fontSize: 24, fontWeight: 740, letterSpacing: 4, color: C.red}}>{scene.kicker || ""}</div>
    <div style={{fontFamily: font, fontSize: 62, lineHeight: 1.24, fontWeight: 820, color: C.ink, marginTop: 18, whiteSpace: "pre-line"}}>{(scene.overlayLines || [scene.overlayTitle || scene.name]).join("\n")}</div>
  </div>
);

export const MisconceptionReplaceScene = ({scene}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const strike = beatProgress(frame, fps, beatAt(scene, "old", 0.9), 0.45);
  const replacementAt = beatAt(scene, "new", 1.8);
  const oldText = scene.oldText || scene.items?.[0] || "常见理解";
  const newText = scene.newText || scene.items?.[1] || "换成更准确的判断";
  return (
    <AbsoluteFill style={{background: C.paper}}>
      <Heading scene={scene} label="先撤掉错误解释" />
      <LiveSubject seed={1} enterAt={0.25} retireAt={replacementAt} style={{position: "absolute", left: 74, right: 74, top: 650, padding: "58px 52px", ...card}}>
        <div style={{position: "relative", width: "fit-content", fontFamily: font, fontSize: 58, lineHeight: 1.35, fontWeight: 720, color: C.muted}}>
          {oldText}<span style={{position: "absolute", left: -12, right: -12, top: "52%", height: 8, background: C.red, borderRadius: 5, transform: `scaleX(${strike}) rotate(-2deg)`, transformOrigin: "left"}} />
        </div>
      </LiveSubject>
      <LiveSubject seed={2} enterAt={replacementAt} style={{position: "absolute", left: 74, right: 74, top: 960, padding: "64px 54px", background: C.soft, border: `3px solid ${C.red}`, borderRadius: 28, boxShadow: "0 24px 64px rgba(127,31,46,.16)"}}>
        <div style={{fontFamily: font, fontSize: 64, lineHeight: 1.32, fontWeight: 840, color: C.redDark}}>{newText}</div>
      </LiveSubject>
    </AbsoluteFill>
  );
};

export const CauseMapScene = ({scene}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const nodes = (scene.nodes || scene.steps || ["触发", "解释方式", "情绪结果"]).slice(0, 4);
  return (
    <AbsoluteFill style={{background: C.paper}}>
      <Heading scene={scene} label="把机制拆成看得见的因果" />
      <div style={{position: "absolute", left: 56, right: 56, top: 670, display: "flex", alignItems: "center", justifyContent: "space-between"}}>
        {nodes.map((node, index) => {
          const at = beatAt(scene, `node:${index}`, 0.45 + index * 0.72);
          const nextAt = beatAt(scene, `node:${index + 1}`, at + 0.72);
          const progress = beatProgress(frame, fps, at, 0.42);
          const linkProgress = beatProgress(frame, fps, nextAt, 0.32);
          return <React.Fragment key={`${node}-${index}`}>
            <LiveSubject seed={index + 3} enterAt={at} style={{width: 250, minHeight: 240, padding: "38px 24px", display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", fontFamily: font, fontSize: 42, lineHeight: 1.3, fontWeight: 760, color: index === nodes.length - 1 ? C.redDark : C.ink, background: index === nodes.length - 1 ? C.soft : C.strong, border: `3px solid ${index === nodes.length - 1 ? C.red : C.line}`, borderRadius: 30, boxShadow: "0 20px 54px rgba(45,31,31,.12)"}}>{node}</LiveSubject>
            {index < nodes.length - 1 ? <div style={{position: "relative", width: 74, height: 6, background: C.red, borderRadius: 4, transform: `scaleX(${linkProgress})`, transformOrigin: "left"}}><div style={{position: "absolute", right: -2, top: -8, width: 0, height: 0, borderTop: "11px solid transparent", borderBottom: "11px solid transparent", borderLeft: `17px solid ${C.red}`}} /></div> : null}
          </React.Fragment>;
        })}
      </div>
      {scene.supportingText ? <div style={{position: "absolute", left: 92, right: 92, top: 1110, fontFamily: font, fontSize: 36, lineHeight: 1.55, color: C.muted, textAlign: "center"}}>{scene.supportingText}</div> : null}
    </AbsoluteFill>
  );
};

export const StepTimelineScene = ({scene}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const steps = (scene.steps || []).slice(0, 5);
  const line = beatProgress(frame, fps, beatAt(scene, "step:0", 0.45), Math.max(0.8, steps.length * 0.5));
  return (
    <AbsoluteFill style={{background: C.paper}}>
      <Heading scene={scene} label="按顺序看变化如何发生" />
      <div style={{position: "absolute", left: 100, top: 610, width: 8, height: 720, background: C.soft, borderRadius: 6}}><div style={{width: "100%", height: `${line * 100}%`, background: C.red, borderRadius: 6}} /></div>
      <div style={{position: "absolute", left: 76, right: 70, top: 590}}>
        {steps.map((step, index) => {
          const at = beatAt(scene, `step:${index}`, 0.55 + index * 0.65);
          return <LiveSubject key={`${step}-${index}`} seed={index + 7} enterAt={at} style={{display: "grid", gridTemplateColumns: "72px 1fr", alignItems: "center", minHeight: 138, marginBottom: 20}}>
            <div style={{width: 58, height: 58, borderRadius: 29, display: "flex", alignItems: "center", justifyContent: "center", background: C.red, color: "white", fontFamily: font, fontSize: 28, fontWeight: 800}}>{index + 1}</div>
            <div style={{padding: "30px 38px", fontFamily: font, fontSize: 42, lineHeight: 1.35, fontWeight: 690, color: C.ink, ...card}}>{step}</div>
          </LiveSubject>;
        })}
      </div>
    </AbsoluteFill>
  );
};

export const EvidenceFocusScene = ({scene}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const at = beatAt(scene, "evidence", 0.8);
  const focus = beatProgress(frame, fps, at, 0.6);
  const focusBox = scene.focusBox || {x: 180, y: 730, width: 720, height: 300};
  return (
    <AbsoluteFill style={{background: C.paper}}>
      <Heading scene={scene} label="让真实材料承担证据" />
      <div style={{position: "absolute", left: 74, right: 74, top: 555, height: 820, overflow: "hidden", ...card}}>
        {scene.asset ? <Img src={staticFile(scene.asset)} style={{width: "100%", height: "100%", objectFit: "contain", transform: `scale(${1 + focus * 0.035})`, filter: `saturate(${0.82 + focus * 0.18})`}} /> : <div style={{height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: 56, textAlign: "center", fontFamily: font, fontSize: 38, lineHeight: 1.5, color: C.muted}}>需要原始证据或技术解释图，不能使用公众号/小红书页面截图</div>}
      </div>
      <div style={{position: "absolute", left: focusBox.x, top: focusBox.y, width: focusBox.width, height: focusBox.height, border: `6px solid ${C.red}`, borderRadius: 24, opacity: focus, boxShadow: "0 0 0 999px rgba(251,248,244,.34)", transform: `scale(${0.94 + focus * 0.06})`}} />
      <FocusSweep at={at + 0.15} width={Math.min(620, focusBox.width)} style={{position: "absolute", left: focusBox.x, top: focusBox.y + focusBox.height + 28}} />
    </AbsoluteFill>
  );
};

export const BoundarySplitScene = ({scene}) => {
  const second = useCurrentFrame()/useVideoConfig().fps;
  const can = (scene.can || scene.items?.filter((item) => item.kind === "can").map((item) => item.text) || []).slice(0, 3);
  const cannot = (scene.cannot || scene.items?.filter((item) => item.kind === "cannot").map((item) => item.text) || []).slice(0, 3);
  const leftAt = beatAt(scene, "can", 0.4);
  const rightAt = beatAt(scene, "cannot", 1.3);
  return (
    <AbsoluteFill style={{background: C.paper}}>
      <Heading scene={scene} label="把能做与不能做分开" />
      <div style={{position: "absolute", left: 56, right: 56, top: 620, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28}}>
        {[["可以帮助", can, C.green, "#E8F1EC"], ["不能替代", cannot, C.redDark, C.soft]].map(([title, items, accent, background], column) => <LiveSubject key={title} seed={column + 13} enterAt={column ? rightAt : leftAt} style={{minHeight: 710, padding: "42px 34px", background, border: `3px solid ${accent}`, borderRadius: 30}}>
          <div style={{fontFamily: font, fontSize: 38, fontWeight: 840, color: accent}}>{title}</div>
          <div style={{marginTop: 34}}>{items.map((item, index) => <div key={item} style={{opacity: column && beatFor(scene, `cannot:${index}`) ? progressAt(second, beatAt(scene, `cannot:${index}`), .35) : 1, display: "grid", gridTemplateColumns: "34px 1fr", gap: 16, marginTop: index ? 28 : 0, fontFamily: font, fontSize: 35, lineHeight: 1.45, color: C.ink}}><span style={{color: accent, fontWeight: 900}}>{column ? "×" : "✓"}</span><span>{item}</span></div>)}</div>
        </LiveSubject>)}
      </div>
    </AbsoluteFill>
  );
};
