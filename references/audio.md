# 配音交接与音频准备

仅在用户确认自然口播后读取。写稿标准只见 voiceover.md，内容与来源判断只见 source-policy.md。

## MiniMax 唯一机器稿

此时按需要记录声线、模型、语速和试听结果，可参考 assets/templates/video/tts-settings.md；写稿初始化不创建配音表。

`voiceover-draft.md` 经员工确认后，必须做一次“机器口播化”，生成唯一 `tts-input.txt`。不要再创建内容相同的“标注稿”“完整口播稿”或“干净版”。机器口播化只调整发音、标点、分段和稀疏停顿，不得悄悄改变已经确认的观点或事实。

- 根据当前稿件记录必要的声音与试听选择，不预设四段语气曲线。
- 用标点、短句和段落形成主要节奏；不能只把 `MBTI` 换成 `M B T I` 就视为机器稿完成。
- 优先用标点与分段形成节奏。只有试听需要时再加显式停顿，例如 `<#0.4#>`；不规定数量。程序拒绝非法标记；过长、密集或首尾停顿及长句作为试听提示。
- 连续停顿、每句标停顿和单句内部切断需要试听判断；不要使用未经当前配音工具验证的情绪代码。
- 英文字母需拆读时在机器稿中加空格：`MBTI` 写成 `M B T I`，`Fi` 写成 `F I`，`Fe` 写成 `F E`。公开字幕和文稿仍使用标准写法。
- 先用 1–2 句短样测试新模型或新声线，再生成全稿。
- 员工在网页端选择有授权的声音、试听并下载；Skill 不保存账号、Cookie 或密钥。

生成后必须运行：

```bash
node <SKILL_DIR>/scripts/voiceover-qc.mjs \
  --draft <内容单元>/AIworkspace/40-video/current/voiceover-draft.md \
  --tts <内容单元>/AIworkspace/40-video/current/tts-input.txt --confirm YES \
  --report <内容单元>/AIworkspace/40-video/current/voiceover-report.json
```

检查失败时不得把机器稿交给员工生成音频。机器检查只验证结构与标记，员工仍要试听自然度、重音和所选声线的实际表现。

## 音频回传与质检

把原始音频放到 `AIworkspace/40-video/current/audio-inbox/`。保留原文件，不覆盖、不先转码替代。

检查：

- `ffprobe` 可解码、时长、采样率、声道和编码；
- 首尾是否截断；
- 是否有重复句、长静音、爆音、异常女声/男声或背景人物；
- 内容是否与确认稿一致；
- 语速、重音、自然度和专业词读音是否可接受。

不通过时只返回准确时间点和修改建议，等待员工重新生成音频。

### 音频派生与唯一时间轴

原始音频始终只读保留。需要变速时使用保调处理，不通过修改采样率制造升调或降调：

```bash
node <SKILL_DIR>/scripts/prepare-audio.mjs \
  --input <视频工作区>/audio-inbox/returned-voice.wav \
  --output <视频工作区>/audio-work/voiceover-working.wav \
  --speed 1.2 \
  --report <视频工作区>/audio-transform-report.json
```

脚本会记录原始/派生音频 SHA256、时长、实际 `atempo` 链和完整解码结果。任何变速、剪切、降噪或转码都会创建新的工作音频；后续字幕、镜头、BGM 入点和成片时长只认该文件。禁止直接覆盖 `audio-inbox/`，也禁止把旧 SRT 整体除以或乘以倍速后作为最终字幕。

### 稿音匹配与词级对齐

1. 使用本地 Faster-Whisper、WhisperX 或等价的词级时间对齐器处理当前工作音频，保存原始证据 JSON。模型输出只用于时间锚点和稿音比较，不直接作为公开字幕正字。
2. 将拟采用的确认稿与 ASR 规范化比较。明显不匹配时必须停止：要么请员工重新生成匹配音频，要么经员工确认后改用与实际音频一致的口播稿。不得把计划稿强塞进字幕。
3. 在 `final-voiceover.md` 中只保留与实际音频一致的完整公开正文，不写标题、说明或审核记录。对 `外向/外相`、`判型/判刑` 等 ASR 同音错误，使用确认稿的专业正字。
4. 字幕按语义分组，通常每条 8～18 个汉字、至少 1.2 秒；静音处允许字幕留白。人工至少抽查开头、中段、结尾三个词级锚点。
5. 生成并锁定当前报告：

```bash
node <SKILL_DIR>/scripts/alignment-qc.mjs \
  --audio <视频工作区>/audio-work/voiceover-working.wav \
  --source-audio <视频工作区>/audio-inbox/returned-voice.wav \
  --transform-report <视频工作区>/audio-transform-report.json \
  --script <视频工作区>/final-voiceover.md \
  --scenes <视频工作区>/scenes.json \
  --evidence <视频工作区>/alignment-evidence.json \
  --report <视频工作区>/alignment-report.json
```

`alignment-report.json` 必须证明：当前工作音频哈希一致、稿音相似度达标、词级时间戳存在、人工锚点不少于 3 个、字幕文本与 `final-voiceover.md` 规范化后完全相等、无重叠、无越界且最短时长合格。任一输入改变后必须重跑；旧报告不能复用。


音频后最终正文如果不同于已确认正文，须明确确认变更后重新生成对应机器稿检查记录，不能只用 ASR 对齐证明内容已获确认。
