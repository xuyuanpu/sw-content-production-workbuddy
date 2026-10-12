---
name: sw-content-production
description: 为 SW 员工规划内容、查询已授权的线上知识库，并把有来源的资料生产为小红书、公众号候选和短视频口播；收到人工生成音频后制作 Remotion 视频。用于新建内容单元、修改、跨平台验收、归档和人工发布交接，保持 SW 官方机构口径、工作坊教案红及固定原创 BGM。
---

# SW 内容生产

先明确用户要写稿、图文制作还是音频后的视频；只做所选平台和当前阶段。默认先交可读候选，再按用户反馈改进。

## 按任务读一条路径

所有创作先读 [来源与编辑判断](references/source-policy.md) 和 [品牌](references/brand.md)，然后只读所选平台：

| 请求 | 唯一写作依据 | 需要制作时再读 |
| --- | --- | --- |
| 小红书 | [写法、完整样本与交稿](references/xiaohongshu.md) | [图文制作](references/xhs-production.md) |
| 公众号 | [写法、完整样本与交稿](references/wechat.md) | [图文制作](references/wechat-production.md) |
| 短视频口播 | [写法、修改实例与交稿](references/voiceover.md) | 确认后读[配音](references/audio.md)，收到音频后读[视频制作](references/video-production.md) |

材料不足时按 [知识查询](references/knowledge-query.md) 补缺口；已有素材够用直接创作。不要把制作细则、历史规范或全部参考文件一并加载来写稿。

视频先设计可见情境和对象变化、检查真实配图，再按表达需要组合组件，并使用同一渲染器试稿与完整视听审阅；能力接口见 [组件库](references/component-library.md)，不按语义套固定镜头。只写稿时不加载此接口。

## 工作路线

1. 按 source-policy 做简短内容判断；进入内容工作目录时运行 `init-content-unit.mjs --workspace <目录> --topic <原题> --source <原件> --platform <xhs|wechat|video，可逗号组合>`。只写稿不需要运行 doctor 或安装媒体依赖。
2. 按所选平台文档直接创作，完成内容检查后交用户；口播初稿写完就更新 index 审核页，不等待配音稿或内容确认；没有默认的多份论证表或循环送审。
3. 用户需要图文制作时，先运行 `doctor.mjs --stage graphics`，按平台制作文档生成。需要视频制作时用 `--stage video`；缺视频依赖不阻止图文或写稿。
4. 候选查看、分平台技术检查、归档和人工确认后提升，统一按 [交付](references/delivery.md) 执行。

安装维护只读 [部署](references/deployment.md)。legacy/ 是历史兼容区，除非用户要求核查旧产物，不读取、不执行、不复制到新任务。
