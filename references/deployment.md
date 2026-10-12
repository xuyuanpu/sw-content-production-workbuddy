# 安装与维护

受控仓库：https://github.com/xuyuanpu/sw-content-production-workbuddy 。本地已验收的 ZIP 可交员工安装；GitHub 发布是另一步，不能把本地新版称为线上最新版。

## 本地安装

在解压后的 Skill 根目录运行 `node scripts/deploy.mjs`，默认安装到当前用户的 `.workbuddy/skills/sw-content-production`；Codex 使用 `--host codex`。程序先核验源包和暂存包，再备份、切换并核验安装。失败时恢复旧目录。

相同依赖锁的升级会保留已有 node_modules；依赖改变则旧依赖留在备份，制作前按需重新安装。备份位于对应宿主的 `skill-backups/sw-content-production`，内容工作空间应放在 Skill 外。

安装版发生现场修改时默认停止覆盖，先备份并审核回源。只有已处理这些差异才能使用 `--reviewed-local-changes YES`，不能用此选项掩盖未检查的补丁。

## 按阶段准备环境

| 当前任务 | 所需环境 | 检查 |
| --- | --- | --- |
| 阅读材料、写稿 | 模型及文件能力；使用初始化脚本时需 Node 18+ | 可选 `node scripts/doctor.mjs --stage writing` |
| 小红书、公众号、可视验收页 | Node、Playwright、Chromium | `node scripts/doctor.mjs --stage graphics` |
| 音频后视频制作 | 上述环境及 Remotion、ffmpeg、ffprobe、词级对齐能力 | `node scripts/doctor.mjs --stage video` |

仅进入制作阶段且依赖缺失时，在 Skill 目录执行 `npm ci` 和 `npx playwright install chromium`。包锁同时包含图文与视频依赖，但写稿不运行安装。固定 BGM 与模板随包交付；词级对齐模型、缓存、授权声线和账户不随包交付。Remotion 首次使用可能下载其浏览器运行时。

线上知识库使用员工已经授权的个人 MCP 连接，见 [查询流程](knowledge-query.md)。安装 Skill 不代表已连接或已获权限，两个宿主的连接也不自动共享。首次连接验收需要列库、一次检索及读取原文成功。

## 版本与分发

`release-manifest.json` 记录所有分发文件的 SHA256 和总指纹。维护者完成当前测试后运行 `node scripts/release-integrity.mjs --seal`，再验证、安装、制作 ZIP，并对解压包复验。禁止员工为通过检查自行重新封存。

当前测试为 `npm test`；历史工具兼容测试为 `npm run test:legacy`，分别报告结果。未实际运行 WorkBuddy 模型、线上知识库或完整视频流程，不能只凭单元测试宣称它们已通过。

历史成品保留不动。旧报告没有当前输入指纹时，只在需要新候选时按当前流程重新生成，不批量重做历史内容。发布、发送和 GitHub Release 不包含在安装动作内。

## 可选渲染运行参数

默认沿用官方 Remotion 浏览器、2 并发、medium 编码。受限环境可显式设置 SW_REMOTION_BROWSER（存在的浏览器路径）、SW_RENDER_CONCURRENCY（1–64）、SW_X264_PRESET、SW_STEP_TIMEOUT_MS（正数毫秒）。不自动扩大并发或选系统浏览器，不吞掉文件系统错误；每次构建使用独立临时目录。
