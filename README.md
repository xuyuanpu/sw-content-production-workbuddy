# SW 内容生产 Skill

本地维护版本 **1.19.0**。视频先设计并检查真实画面，提供同一渲染器的 `--proof` 视觉试稿及候选全片时间轴审阅页；支持可组合组件，导演自行选择图形、文字、图像、分组及语音关键帧，不再按语义绑定固定模板。为 SW 把有来源的材料写成所选平台的可读候选，按需制作图文，收到确认音频后制作视频。写稿先交一稿，不安装媒体依赖、不启动默认的独立审稿循环。入口见 [SKILL.md](SKILL.md)。

## 文件职责

| 文件 | 唯一职责 |
| --- | --- |
| SKILL.md | 识别当前阶段，指向所选平台 |
| references/source-policy.md | 受众、原题、来源和事实边界，内容自查与交稿 |
| references/brand.md | 品牌身份、标识和视觉常量 |
| references/xiaohongshu.md | 小红书写法、选择依据、完整示范和交稿 |
| references/wechat.md | 公众号写法、选择依据、完整示范和交稿 |
| references/voiceover.md | 口播写法、选择依据、修改实例和交稿 |
| references/knowledge-query.md | 按素材缺口检索，读取原文，最多三轮后转其他路径 |
| references/xhs-production.md、wechat-production.md | 对应平台的图文输入、渲染与技术检查 |
| references/audio.md | 确认稿到机器稿、人工音频、真实时间对齐 |
| references/video-production.md | 唯一画面计划、视觉选择、编译和完整审片 |
| references/remotion.md | 按需读取的底层渲染实现 |
| references/delivery.md | 分平台验收、候选/成品状态和交接 |
| references/deployment.md | 安装、阶段依赖、升级与分发 |
| assets/templates、assets/brand | 制作模板和固定品牌资产；不作为额外写作指令 |
| scripts、tests | 可执行技术检查及回归测试 |
| legacy | 历史规范与旧报告兼容工具；默认不读取、不执行 |

index 是持续更新的审核页面，口播初稿写完即可展示和复制，配音/成片状态分别记录。自然文稿是写作阶段的成果，不要求预先填完配音、分镜、渲染或发布文件。小红书、公众号样本标为编辑示范，不能宣称为真实用户案例或已验证爆款；口播修改实例保留适用条件。

## 维护

源目录是唯一维护点。先修改与测试源包，后封包部署：

```sh
npm test
npm run test:legacy
node scripts/release-integrity.mjs --seal
node scripts/release-integrity.mjs
node scripts/deploy.mjs --host workbuddy
```

依赖锁相同的本地升级保留 node_modules。写稿不需要 npm 安装。图文/视频阶段按部署说明安装并检查。ZIP 不含依赖、缓存、用户内容或密钥。GitHub 仓库与 Release 是分发渠道，本地版本号不代表已经发布线上版本。
