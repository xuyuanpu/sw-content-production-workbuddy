# WorkBuddy 部署

## GitHub 分发说明

本 Skill 的受控源仓库为：

```text
https://github.com/xuyuanpu/sw-content-production-workbuddy
```

WorkBuddy 当前官方文档明确支持“上传本地技能包”，未把“粘贴 GitHub 仓库 URL”列为正式 Skill 安装入口。因此 GitHub 用于版本托管、员工授权和 Release 分发；员工从 Release 下载 ZIP 后上传 WorkBuddy，是最简单、最稳定的方式。

## 最简方式：从 GitHub Release 上传技能包

1. 获得仓库权限后打开 GitHub 仓库的 **Releases**。
2. 下载最新版 `sw-content-production-workbuddy-v*.zip`。
3. 在 WorkBuddy 打开“技能”。
4. 选择“添加技能” -> “上传技能”。
5. 选择下载的 ZIP。
6. 安全检查通过后启用“SW 内容生产”。
7. 新建任务时选择一个员工有权限的本地工作空间，并启用本 Skill。

WorkBuddy 会读取 Skill 包，不需要保留原开发电脑路径。

## Git 克隆部署方式

适合需要维护或频繁升级的员工：

```bash
git clone https://github.com/xuyuanpu/sw-content-production-workbuddy.git
cd sw-content-production-workbuddy
node scripts/deploy.mjs
```

私有仓库要求员工的 GitHub 账号已获得访问权限。也可以在 GitHub 页面选择 **Code** -> **Download ZIP**，解压后运行部署脚本。

## 已有本地目录方式

在解压后的 Skill 根目录运行：

```bash
node scripts/deploy.mjs
```

脚本把 Skill 安装到当前用户的 WorkBuddy 技能目录。若存在旧版，先备份再升级。

## 首次环境检查

```bash
node scripts/doctor.mjs
```

必需：

- Node.js 18 或以上；
- Playwright 及 Chromium，用于小红书、公众号和验收页渲染；
- WorkBuddy 可用的图片生成能力，用于小红书 AI 位图封面。

视频完成阶段另需：

- `ffmpeg` / `ffprobe`；
- Remotion 能力或可运行的 Node.js Remotion 环境。

若 Playwright 缺失，在 Skill 目录运行：

```bash
npm install
npx playwright install chromium
```

## 推荐配套能力

- 图片生成：WorkBuddy 图片生成 Skill 或员工已配置并获授权的图片 API；
- 专业解释图：可用信息图 Skill，也可由本 Skill 生成本地 SVG/HTML 技术图；
- 视频：Remotion Skill；
- 文件与浏览器：WorkBuddy 默认本地文件/终端和 HTML 预览能力。

配套 Skill 不得覆盖本 Skill 的 SW 品牌、身份、字数、语音门和发布边界。

## 员工首次测试

用一段公开、无个人信息的短材料创建测试内容单元。验收：

1. 内容单元第一层只有四个目录；
2. 小红书和公众号候选自动生成且验收页可打开；
3. 视频停在等待人工音频；
4. 对外候选无禁用个人归属；
5. 没有自动发布或登录平台。

## 升级

重新下载并上传新版 Release 压缩包；或在仓库目录运行 `git pull` 后再次执行 `node scripts/deploy.mjs`。部署脚本保留旧版备份；不要把员工内容工作空间放进 Skill 安装目录。
