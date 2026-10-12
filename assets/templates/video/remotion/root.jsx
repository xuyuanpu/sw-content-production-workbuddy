import React from "react";
import {Composition} from "remotion";
import {SWDynamicVideo} from "./sw-dynamic-video.jsx";

const fallback = {
  video: {width: 1080, height: 1920, fps: 30, duration: 12},
  brand: {name: "SW 编辑部 · MBTI 观察", column: "专业编辑解读"},
  scenes: [],
  subtitles: [],
  paperAssets: {},
};

export const RemotionRoot = () => (
  <Composition
    id="SWDynamicVideo"
    component={SWDynamicVideo}
    width={fallback.video.width}
    height={fallback.video.height}
    fps={fallback.video.fps}
    durationInFrames={fallback.video.duration * fallback.video.fps}
    defaultProps={fallback}
    calculateMetadata={({props}) => ({
      width: props.video.width,
      height: props.video.height,
      fps: props.video.fps,
      durationInFrames: Math.ceil(props.video.duration * props.video.fps),
      props,
    })}
  />
);
