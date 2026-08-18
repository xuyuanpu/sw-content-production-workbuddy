# SW 内容生产 WorkBuddy Skill

面向 SW（Skill&Will）员工的内容生产 Skill。输入一份有明确来源和使用边界的原始资料后：

- 自动生成工作坊教案·红 VI 的小红书图文、拼接长图和发布文案候选；
- 自动生成 500 字以内、含实质内容图的公众号 HTML、长图和发布文案候选；
- 自动生成短视频口播稿；员工在海外 MiniMax 手动生成并回传音频后，再继续完成首帧封面、分镜、字幕、Remotion 画面、BGM、音效和成片候选；
- 自动生成跨平台验收页；内容不可见时同步禁用复制按钮，避免假就绪；最终坚持“AI 生成、人审确认、人工发布”。

> 内部使用：本仓库包含 SW 品牌规范与内容生产规则，只提供给获得授权的 SW 员工。

## 员工安装

### 方式一：GitHub Release（推荐）

1. 打开仓库右侧 **Releases**，下载最新版 `sw-content-production-workbuddy-v*.zip`。
2. 在 WorkBuddy 打开“技能” → “添加技能” → “上传技能”。
3. 选择下载的 ZIP，等待安全检查完成并启用“SW 内容生产”。
4. 新建任务时选择员工自己的内容工作空间，并启用本 Skill。

WorkBuddy 当前官方说明的 Skill 安装入口是“上传本地技能包”；GitHub 在这里承担受控分发与版本更新，不冒充未被官方文档确认的仓库 URL 一键安装能力。

### 方式二：克隆仓库部署

适合需要维护或频繁升级的员工：

```bash
git clone https://github.com/xuyuanpu/sw-content-production-workbuddy.git
cd sw-content-production-workbuddy
node scripts/deploy.mjs
```

部署脚本会把旧版备份后安装到当前用户的 WorkBuddy 技能目录，并打印后续依赖安装与环境检查命令。

## 首次检查

```bash
npm install
npx playwright install chromium
node scripts/doctor.mjs
```

基础图文生产需要 Node.js 18+、Playwright 和 Chromium；完成视频阶段还需要 `ffmpeg`、`ffprobe` 与可运行的 Remotion 环境。

视频构建会同时生成与第一帧一致的 `video-cover.png`，并检查 9:16 尺寸、中央安全区和第一帧一致性。视频完成后还可单独检查时间稳定性：

```bash
node scripts/video-qc.mjs --input <video-candidate.mp4>
```

## 使用方式

在 WorkBuddy 中选择本 Skill，然后提供原始资料并说明：

```text
请按 SW 内容生产规范，把这份原始资料生成小红书、公众号和短视频口播候选。
```

详细规则与命令见：

- [Skill 主流程](SKILL.md)
- [品牌与机构口径](references/brand.md)
- [生产工作流](references/workflow.md)
- [质量验收](references/quality.md)
- [部署与升级](references/deployment.md)

## 固定边界

- 对外内容统一使用 SW / Skill&Will 官方机构身份，不出现被禁用的个人署名或归属。
- 不把个人经历机械改写成机构经历。
- 草稿、源码、素材处理和历史版本只进入 `AIworkspace`，平台目录只保留人工确认的当前成品。
- 不自动登录、发布、排期或调用未经授权的计费接口。
- 没有员工确认的真实音频，不进入最终短视频生产。
