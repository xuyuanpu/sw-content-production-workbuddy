import {CharacterScene} from "./sw-character-scene.jsx";
import {ObjectMotionScene} from "./sw-object-motion.jsx";
import React from "react";
import {
  AbsoluteFill,
  Easing,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {DepthPlane, DirectorSubject, SWCameraRig, SWEnvironment} from "./sw-motion-system.jsx";
import {BoundarySplitScene, CauseMapScene, EvidenceFocusScene, MisconceptionReplaceScene, StepTimelineScene} from "./sw-explainer-scenes.jsx";

const colors = {
  paper: "#FBF8F4",
  paperStrong: "#FFFDFC",
  ink: "#262323",
  muted: "#756D6D",
  red: "#A92F40",
  redDark: "#7F1F2E",
  redSoft: "#F3E4E5",
  line: "#D8C4C7",
};

const font = "'PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif";
const cubic = Easing.bezier(0.22, 1, 0.36, 1);
const clamp = {extrapolateLeft: "clamp", extrapolateRight: "clamp"};

const assetUrl = (scene) => (scene.asset ? staticFile(scene.asset) : null);
const words = (value) => String(value || "").split(/([，。！？；：\s])/u).filter(Boolean);

const ImageLayer = ({scene, mode = "cover", style = {}}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  if (!scene.asset) return null;
  const drift = interpolate(frame, [0, Math.max(1, (scene.end - scene.start) * fps)], [0, 1], clamp);
  const scale = mode === "page" ? 1.02 + drift * 0.035 : 1.04 + drift * 0.045;
  const translateY = mode === "page" ? -10 - drift * 32 : -6 - drift * 18;
  return (
    <Img
      src={assetUrl(scene)}
      style={{
        width: "100%",
        height: "100%",
        objectFit: mode === "page" ? "contain" : "cover",
        objectPosition: scene.objectPosition || "50% 48%",
        transform: `translateY(${translateY}px) scale(${scale})`,
        ...style,
      }}
    />
  );
};

const RevealText = ({text, style, accentLast = false, accentFromLine = null, delay = 0}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const progress = spring({fps, frame: frame - delay, config: {damping: 18, stiffness: 110, mass: 0.9}});
  const lines = Array.isArray(text) ? text : [text];
  return (
    <div style={{opacity: progress, transform: `translateY(${(1 - progress) * 34}px)`, ...style}}>
      {lines.map((line, lineIndex) => (
        <span key={`${line}-${lineIndex}`} style={{display: "block", color: accentFromLine !== null && lineIndex >= accentFromLine ? colors.red : undefined}}>
          {words(line).map((word, index, all) => (
            <span key={`${word}-${index}`} style={accentFromLine === null && accentLast && index > all.length * 0.48 ? {color: colors.red} : undefined}>{word}</span>
          ))}
        </span>
      ))}
    </div>
  );
};

const BrandHeader = ({brand, sceneIndex, sceneCount}) => (
  <div style={{
    position: "absolute", left: 52, right: 52, top: 38, height: 92,
    display: "flex", alignItems: "center", gap: 18, zIndex: 30,
    borderBottom: `2px solid ${colors.line}`,
  }}>
    {brand.logo ? <Img src={staticFile(brand.logo)} style={{height: 58, width: 112, objectFit: "contain", objectPosition: "left center"}} /> : null}
    <div style={{fontFamily: font, fontSize: 25, fontWeight: 650, color: colors.redDark, letterSpacing: 1}}>{brand.name || "SW 编辑部 · MBTI 观察"}</div>
    <div style={{flex: 1}} />
    <div style={{fontFamily: font, fontSize: 20, color: colors.muted}}>{String(sceneIndex + 1).padStart(2, "0")} / {String(sceneCount).padStart(2, "0")}</div>
  </div>
);

import {CompositionScene} from './sw-composition.jsx';

const CoverScene = ({scene}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const lines = Array.isArray(scene.titleLines) ? scene.titleLines : [scene.overlayTitle];
  const ruleWidth = interpolate(frame, [4, 20], [0, 280], {...clamp, easing: cubic});
  const deckProgress = spring({fps, frame: frame - 10, config: {damping: 18, stiffness: 105}});
  return (
    <AbsoluteFill style={{padding: "158px 58px 264px", background: colors.paper}}>
      {scene.asset ? <div style={{height: 675, overflow: "hidden", borderRadius: 28, border: `2px solid ${colors.line}`, boxShadow: "0 24px 68px rgba(57,37,40,.16)"}}>
        <ImageLayer scene={scene} />
      </div> : null}
      <div style={{marginTop: scene.asset ? 48 : 340, paddingLeft: 14}}>
        <div style={{fontFamily: font, fontSize: 26, fontWeight: 700, color: colors.red, letterSpacing: 3}}>SW 专业编辑解读</div>
        <div style={{width: ruleWidth, height: 6, background: colors.red, borderRadius: 4, margin: "20px 0 28px"}} />
        <h1 style={{fontFamily: font, fontSize: scene.asset ? 70 : 88, lineHeight: 1.25, letterSpacing: -2, color: colors.ink, margin: 0, fontWeight: 760}}>
          {lines.map((line, index) => <span key={line} style={{display: "block", color: index === lines.length - 1 ? colors.red : colors.ink}}>{line}</span>)}
        </h1>
        {scene.deck ? <p style={{fontFamily: font, fontSize: 31, lineHeight: 1.55, color: colors.muted, opacity: deckProgress, transform: `translateY(${(1 - deckProgress) * 18}px)`, margin: "24px 0 0"}}>{scene.deck}</p> : null}
      </div>
    </AbsoluteFill>
  );
};

const StatementScene = ({scene}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const imageOpacity = interpolate(frame, [0, 10, Math.max(12, (scene.end - scene.start) * fps - 18)], [0.18, 0.34, 0.42], clamp);
  const lineWidth = interpolate(frame, [8, 30], [0, 560], {...clamp, easing: cubic});
  return (
    <AbsoluteFill style={{padding: "178px 64px 276px", background: colors.paper}}>
      {scene.asset ? <div style={{position: "absolute", inset: "145px 0 255px", opacity: imageOpacity, filter: "grayscale(.12) saturate(.8)"}}><ImageLayer scene={scene} mode="page" /></div> : null}
      <div style={{position: "absolute", inset: "145px 0 255px", background: "linear-gradient(180deg,rgba(251,248,244,.54),rgba(251,248,244,.9) 72%,#FBF8F4)"}} />
      <div style={{position: "relative", marginTop: 320}}>
        <div style={{fontFamily: font, fontSize: 24, fontWeight: 700, color: colors.red, letterSpacing: 3, marginBottom: 28}}>{scene.kicker || "关键判断"}</div>
        <RevealText text={scene.overlayLines || scene.overlayTitle || scene.name} accentLast accentFromLine={scene.accentFromLine ?? null} style={{fontFamily: font, fontSize: 76, lineHeight: 1.28, fontWeight: 760, color: colors.ink, maxWidth: 900}} />
        <div style={{width: lineWidth, height: 7, borderRadius: 4, background: colors.red, marginTop: 40}} />
        {scene.supportingText ? <RevealText text={scene.supportingText} delay={14} style={{fontFamily: font, fontSize: 35, lineHeight: 1.55, fontWeight: 450, color: colors.muted, marginTop: 34, maxWidth: 860}} /> : null}
      </div>
    </AbsoluteFill>
  );
};

const ComparisonScene = ({scene}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const divider = interpolate(frame, [5, 28], [0, 1], {...clamp, easing: cubic});
  const left = spring({fps, frame: frame - 4, config: {damping: 20, stiffness: 100}});
  const right = spring({fps, frame: frame - 14, config: {damping: 20, stiffness: 100}});
  const leftLabel = scene.leftLabel || scene.items?.[0]?.label || "常见视角";
  const rightLabel = scene.rightLabel || scene.items?.[1]?.label || "专业视角";
  const leftText = scene.leftText || scene.items?.[0]?.text || "你表现得怎么样";
  const rightText = scene.rightText || scene.items?.[1]?.text || "你是如何运作的";
  return (
    <AbsoluteFill style={{padding: "178px 60px 276px", background: colors.paper}}>
      <div style={{height: 430, borderRadius: 28, padding: "76px 64px", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 28, background: colors.paperStrong, border: `2px solid ${colors.line}`, boxShadow: "0 20px 60px rgba(47,32,34,.12)"}}>
        <div style={{fontFamily: font, fontSize: 52, lineHeight: 1.25, fontWeight: 760, color: colors.ink, opacity: left, transform: `translateX(${(1 - left) * -42}px)`}}>{leftText}</div>
        <div style={{width: 80, height: 80, borderRadius: 40, display: "flex", alignItems: "center", justifyContent: "center", background: colors.redSoft, color: colors.red, fontFamily: font, fontSize: 36, fontWeight: 840}}>≠</div>
        <div style={{fontFamily: font, fontSize: 52, lineHeight: 1.25, fontWeight: 800, color: colors.redDark, textAlign: "right", opacity: right, transform: `translateX(${(1 - right) * 42}px)`}}>{rightText}</div>
      </div>
      <div style={{fontFamily: font, fontSize: 25, fontWeight: 700, color: colors.red, letterSpacing: 3, marginTop: 46}}>{scene.kicker || "两个完全不同的问题"}</div>
      <div style={{position: "relative", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 42, marginTop: 30}}>
        <div style={{opacity: left, transform: `translateX(${(1 - left) * -46}px)`}}>
          <div style={{fontFamily: font, fontSize: 29, color: colors.muted, marginBottom: 16}}>{leftLabel}</div>
          <div style={{fontFamily: font, fontSize: 54, lineHeight: 1.25, fontWeight: 720, color: colors.ink}}>{leftText}</div>
        </div>
        <div style={{opacity: right, transform: `translateX(${(1 - right) * 46}px)`}}>
          <div style={{fontFamily: font, fontSize: 29, color: colors.red, marginBottom: 16}}>{rightLabel}</div>
          <div style={{fontFamily: font, fontSize: 54, lineHeight: 1.25, fontWeight: 760, color: colors.red}}>{rightText}</div>
        </div>
        <div style={{position: "absolute", left: "50%", top: 0, bottom: 0, width: 4, transform: `scaleY(${divider})`, transformOrigin: "top", background: colors.redSoft}} />
      </div>
    </AbsoluteFill>
  );
};

const PathScene = ({scene}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const steps = scene.steps || ["接纳自己", "找到起点", "选择方向"];
  return (
    <AbsoluteFill style={{padding: "168px 56px 270px", background: colors.paper}}>
      <div style={{position: "absolute", inset: "140px 0 255px", opacity: .25}}><ImageLayer scene={scene} /></div>
      <div style={{position: "absolute", inset: "140px 0 255px", background: "linear-gradient(180deg,rgba(251,248,244,.45),rgba(251,248,244,.96) 70%)"}} />
      <div style={{position: "relative", marginTop: 280}}>
        <RevealText text={scene.overlayLines || scene.overlayTitle || "MBTI 把你带回那个起点"} accentLast accentFromLine={scene.accentFromLine ?? null} style={{fontFamily: font, fontSize: 66, lineHeight: 1.3, fontWeight: 760, color: colors.ink}} />
        <div style={{display: "flex", alignItems: "center", marginTop: 76}}>
          {steps.map((step, index) => {
            const p = spring({fps, frame: frame - 12 - index * 12, config: {damping: 18, stiffness: 120}});
            return <React.Fragment key={step}>
              <div style={{width: 242, minHeight: 126, borderRadius: 22, border: `3px solid ${index === 1 ? colors.red : colors.line}`, background: index === 1 ? colors.redSoft : "rgba(255,253,252,.9)", display: "flex", alignItems: "center", justifyContent: "center", padding: 18, fontFamily: font, fontSize: 31, lineHeight: 1.3, textAlign: "center", fontWeight: 680, color: index === 1 ? colors.red : colors.ink, opacity: p, transform: `translateY(${(1 - p) * 30}px)`}}>{step}</div>
              {index < steps.length - 1 ? <div style={{flex: 1, height: 4, background: colors.red, transform: `scaleX(${p})`, transformOrigin: "left"}} /> : null}
            </React.Fragment>;
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const BoundaryScene = ({scene}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const items = scene.items || ["不是临床诊断", "不凭一次表现判型", "不替你下职业结论"];
  return (
    <AbsoluteFill style={{padding: "178px 64px 270px", background: colors.paper}}>
      <div style={{height: 510, overflow: "hidden", borderRadius: 28, opacity: .88}}><ImageLayer scene={scene} mode="page" /></div>
      <div style={{marginTop: 54}}>
        <div style={{fontFamily: font, fontSize: 26, fontWeight: 700, color: colors.red, letterSpacing: 3}}>专业边界</div>
        {items.map((item, index) => {
          const p = spring({fps, frame: frame - 5 - index * 11, config: {damping: 20, stiffness: 115}});
          const strike = interpolate(frame, [18 + index * 11, 34 + index * 11], [0, 1], clamp);
          return <div key={item} style={{position: "relative", width: "fit-content", fontFamily: font, fontSize: 45, lineHeight: 1.45, fontWeight: 650, color: colors.ink, marginTop: 22, opacity: p, transform: `translateX(${(1 - p) * 28}px)`}}>
            {item}<span style={{position: "absolute", left: -6, right: -6, top: "52%", height: 5, borderRadius: 4, background: colors.red, transform: `scaleX(${strike}) rotate(-2deg)`, transformOrigin: "left"}} />
          </div>;
        })}
      </div>
    </AbsoluteFill>
  );
};

const CtaScene = ({scene}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const p = spring({fps, frame: frame - 5, config: {damping: 19, stiffness: 100}});
  const pulse = 1 + Math.sin(frame / 16) * 0.025;
  return (
    <AbsoluteFill style={{padding: "176px 62px 270px", background: colors.paper}}>
      <div style={{position: "absolute", inset: "140px 0 255px", opacity: .2}}><ImageLayer scene={scene} mode="page" /></div>
      <div style={{position: "absolute", inset: "140px 0 255px", background: "linear-gradient(180deg,rgba(251,248,244,.44),#FBF8F4 72%)"}} />
      <div style={{position: "relative", marginTop: 410, opacity: p, transform: `scale(${0.94 + p * 0.06})`}}>
        <div style={{width: 108, height: 108, borderRadius: 54, display: "flex", alignItems: "center", justifyContent: "center", background: colors.redSoft, color: colors.red, fontFamily: font, fontSize: 50, transform: `scale(${pulse})`}}>？</div>
        <RevealText text={scene.overlayLines || scene.overlayTitle || scene.name} accentLast accentFromLine={scene.accentFromLine ?? null} delay={8} style={{fontFamily: font, fontSize: 62, lineHeight: 1.36, fontWeight: 760, color: colors.ink, marginTop: 38}} />
        <div style={{fontFamily: font, fontSize: 30, color: colors.muted, marginTop: 32}}>{scene.cta || "欢迎留下你的答案"}</div>
      </div>
    </AbsoluteFill>
  );
};

const SceneContent = ({scene}) => {
  if (String(scene.visual).startsWith("paper-") || scene.paperItems !== undefined) throw new Error("Removed paper visual: redesign storyboard");
  switch (scene.visual) {
    case "composition": return <CompositionScene scene={scene} />;
    case "character-scene": return <CharacterScene scene={scene} />;
    case "object-motion": return <ObjectMotionScene scene={scene} />;
    case "cover": return <CoverScene scene={scene} />;
    case "statement": return <StatementScene scene={scene} />;
    case "comparison": return <ComparisonScene scene={scene} />;
    case "question-card": return <StatementScene scene={{...scene, kicker: "一个更深的问法"}} />;
    case "path": return <PathScene scene={scene} />;
    case "boundary-card": return <BoundaryScene scene={scene} />;
    case "misconception-replace": return <MisconceptionReplaceScene scene={scene} />;
    case "cause-map": return <CauseMapScene scene={scene} />;
    case "step-timeline": return <StepTimelineScene scene={scene} />;
    case "evidence-focus": return <EvidenceFocusScene scene={scene} />;
    case "boundary-split": return <BoundarySplitScene scene={scene} />;
    case "cta": return <CtaScene scene={scene} />;
    default: return <StatementScene scene={scene} />;
  }
};

const Scene = ({scene}) => (
  <SWCameraRig scene={scene}>
    <DepthPlane depth={0.55}><SWEnvironment /></DepthPlane>
    <DepthPlane depth={1}><DirectorSubject scene={scene}><SceneContent scene={scene} /></DirectorSubject></DepthPlane>
  </SWCameraRig>
);

const SubtitleLayer = ({subtitles}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const item = subtitles.find((subtitle) => frame >= Math.floor(subtitle.start * fps) && frame < Math.ceil(subtitle.end * fps));
  if (!item) return null;
  const localFrame = frame - Math.floor(item.start * fps);
  const opacity = interpolate(localFrame, [0, 5], [0, 1], clamp);
  return (
    <div style={{position: "absolute", left: 0, right: 0, bottom: 0, height: 250, zIndex: 40, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "34px 58px 44px", borderTop: `2px solid ${colors.line}`, background: "rgba(251,248,244,.97)"}}>
      <div style={{fontFamily: font, fontSize: 54, lineHeight: 1.4, fontWeight: 520, color: colors.ink, textAlign: "center", maxWidth: 948, opacity, transform: `translateY(${(1 - opacity) * 10}px)`}}>{item.text}</div>
    </div>
  );
};

export const SWDynamicVideo = ({video, brand = {}, scenes = [], subtitles = []}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const currentIndex = Math.max(0, scenes.findIndex((scene) => frame >= Math.floor(scene.start * fps) && frame < Math.ceil(scene.end * fps)));
  return (
    <AbsoluteFill style={{background: colors.paper, fontFamily: font, overflow: "hidden"}}>
      {scenes.map((scene) => {
        const from = Math.floor(scene.start * fps);
        const durationInFrames = Math.max(1, Math.ceil((scene.end - scene.start) * fps));
        return <Sequence key={scene.id} from={from} durationInFrames={durationInFrames} premountFor={Math.round(fps * .5)}><Scene scene={scene} /></Sequence>;
      })}
      <BrandHeader brand={brand} sceneIndex={currentIndex} sceneCount={scenes.length} />
      <SubtitleLayer subtitles={subtitles} />
    </AbsoluteFill>
  );
};
