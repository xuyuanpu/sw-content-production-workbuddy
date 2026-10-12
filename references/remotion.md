# Remotion 实现说明

仅在排查或修改渲染器时读取。制作输入、视觉选择与审片要求统一见 [视频制作](video-production.md)；不在这里另设内容门槛。

## 实现位置

`scripts/build-video.mjs` 使用 `@remotion/bundler` 和 `@remotion/renderer`；版本由 package-lock.json 固定。入口与组件位于 `assets/templates/video/remotion/`，生产任务不复制一套到工作区。上游方法及许可见 NOTICE.md。

`compile-director.mjs` 从 scenes.json 与真实音频锚点编译时间；`storyboard-lib.mjs` 校验派生视图和执行动作；`semantic-motion.mjs` 定义可执行 target/action，`director-execution.mjs` 检查相机与主体交接。未实现的自然语言动作不能靠改报告声称执行。

## 渲染参数

视频 1080×1920、30fps。使用 Remotion 管理的 Headless Shell，不强行指定 Playwright Chromium。模板按帧计算确定性画面，不用 CSS 动画计时、随机值或壁钟时间驱动内容；插值须处理越界。静止、线性或缓动由动作目的决定。

构建器把已校验资产复制进临时 public/assets，拒绝越出当前内容单元的路径，记录实际文件指纹。工作区相对路径与 `unit:AIworkspace/...` 引用均经路径和素材类别检查；允许类别以 video-asset-policy-lib.mjs 为准。

Remotion 输出无声画面，再由 ffmpeg 复用视频轨并混入当前工作人声与品牌 BGM；不会重新合成 TTS。字幕、音频、镜头、派生视图和原始素材绑定到本次报告，变更后重新构建受影响候选。

## 技术结果

video-report.json 记录实际引擎、输入与产物指纹、对齐、分镜执行、首帧、混音、解码和时序检查。video-acceptance-lib.mjs 是候选和提升成品的统一技术判定；不能自行改 JSON 的 passed。

video-qc.mjs 检测黑帧、急闪与静止。主舞台静止超过 2.6 秒仅是审片线索，记录在 freezeEvents，不要求归零。人工视听结论按 video-production.md 记录，技术报告不替代它。
