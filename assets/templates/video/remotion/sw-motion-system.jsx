import React, {createContext, useContext} from "react";
import {AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig} from "remotion";
import {cameraStateAt, subjectStateAt} from "./director-execution.mjs";

const clamp = {extrapolateLeft: "clamp", extrapolateRight: "clamp"};
const CameraContext = createContext({scale: 1, x: 0, y: 0, rotate: 0});

export const SWCameraRig = ({scene, children}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const second = frame / fps;
  const state = cameraStateAt(scene, second);
  return (
    <CameraContext.Provider value={state}>
      <AbsoluteFill style={{transform: `translate3d(${state.x}px,${state.y}px,0) scale(${state.scale}) rotate(${state.rotate}deg)`, transformOrigin: "50% 50%", willChange: "transform"}}>
        {children}
      </AbsoluteFill>
    </CameraContext.Provider>
  );
};

// The execution contract controls the current main scene group, not arbitrary
// nodes or prose in SHOTBOOK. Independent scenes normally use action=hold.
export const DirectorSubject = ({scene, children}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const state = subjectStateAt(scene, frame / fps);
  return <AbsoluteFill data-director-subject={scene.subjectHandoff.id} data-director-action={scene.subjectHandoff.action} style={{opacity: state.opacity, transform: `translate3d(${state.x}px,${state.y}px,0) scale(${state.scale})`, transformOrigin: "50% 50%"}}>{children}</AbsoluteFill>;
};

export const DepthPlane = ({depth = 1, children, style = {}}) => {
  const camera = useContext(CameraContext);
  const x = camera.x * (depth - 1);
  const y = camera.y * (depth - 1);
  const scale = 1 + (camera.scale - 1) * (depth - 1);
  return <AbsoluteFill style={{transform: `translate3d(${x}px,${y}px,0) scale(${scale})`, transformOrigin: "50% 50%", ...style}}>{children}</AbsoluteFill>;
};

export const SWEnvironment = ({accent = "169,47,64"}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const second = frame / fps;
  const sweep = ((second % 16) / 16) * 190 - 45;
  const breath = 0.035 + (Math.sin(second * 0.62) + 1) * 0.012;
  return (
    <AbsoluteFill style={{pointerEvents: "none", opacity: 0.9}}>
      <AbsoluteFill style={{background: `radial-gradient(circle at 18% 28%,rgba(${accent},${breath}),transparent 32%),radial-gradient(circle at 82% 72%,rgba(38,35,35,.025),transparent 36%)`}} />
      <AbsoluteFill style={{background: `linear-gradient(108deg,transparent ${sweep - 20}%,rgba(${accent},.022) ${sweep}%,transparent ${sweep + 20}%)`}} />
    </AbsoluteFill>
  );
};

export const LiveSubject = ({seed = 1, enterAt = 0, retireAt, children, style = {}, idle = false}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const second = frame / fps;
  const enter = interpolate(second, [enterAt, enterAt + 0.38], [0, 1], {...clamp, easing: Easing.out(Easing.cubic)});
  const retire = Number.isFinite(retireAt) ? interpolate(second, [retireAt, retireAt + 0.48], [0, 1], {...clamp, easing: Easing.inOut(Easing.quad)}) : 0;
  const idleX = idle ? Math.sin(second * 0.73 + seed * 2.1) * 2.5 : 0;
  const idleY = idle ? Math.sin(second * 0.91 + seed * 1.3) * 3.5 : 0;
  return (
    <div style={{opacity: enter * (1 - retire * 0.68), transform: `translate3d(${(1 - enter) * 34 + idleX}px,${(1 - enter) * 24 + idleY - retire * 18}px,0) scale(${0.94 + enter * 0.06 - retire * 0.05})`, filter: retire > 0.02 ? `blur(${retire * 2.6}px)` : undefined, willChange: "transform", ...style}}>
      {children}
    </div>
  );
};

export const beatProgress = (frame, fps, beat, duration = 0.42) => interpolate(frame / fps, [beat, beat + duration], [0, 1], {...clamp, easing: Easing.out(Easing.cubic)});

export const FocusSweep = ({at = 0.8, width = 520, color = "#A92F40", style = {}}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const progress = beatProgress(frame, fps, at, 0.5);
  return <div style={{height: 7, width, background: color, borderRadius: 5, transform: `scaleX(${progress})`, transformOrigin: "left", ...style}} />;
};
