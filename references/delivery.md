# 候选查看、技术检查与成品交接

## 目录与状态

一个题一个 output/NN-题目，根目录保留小红书、公众号、短视频、AIworkspace 四个目录。过程与原件在 AIworkspace，人工选定的成品才进入平台目录。选用的平台记在 manifest.scope，未选平台不是未完成任务。

AIworkspace 的 00-source 保存来源；10-shared-assets 保存共享素材；20-xhs、30-wechat、40-video 保存所选平台工作；50-final-review 是预览；90-archive 保存旧版。内容计划只在 content-plan.md 维护。state.json 反映实际阶段：初始化为 initialized，交可读稿后为 draft-awaiting-review；人工确认、技术通过和发布分别记录，不从文件存在推断。

## 分平台交付

口播写完就用 build-final-review.mjs 更新 AIworkspace/50-final-review/index.html，交用户在同页审核；配音稿和音频尚未生成不阻止展示正文。需要制作时分别运行平台文档中的命令。完成一个平台就可交付，不等待其他平台。

`build-final-review.mjs --unit <单元> --platform xhs,wechat` 只检查选中平台。voiceover 显示待审核正文并允许复制；配音稿的确认与一致性检查单独显示。video 同时包含口播审核和已有成片，尚无成片时显示待生成。未选平台不读取、不显示。

报告的 passed/pagePassed 表示所选范围的审核页可用；deliveryReady 分别记录各阶段技术就绪，allPassed 记录完整范围技术状态。页面可用不代表用户已经确认或可以配音、提升、发布。scopeLabel 显示范围。无音频时不能称成片完成。`validate-content-unit.mjs --unit <单元> --platform xhs` 可分别验收。validate-content-unit 是制作检查；配音条件未满足不得作为隐藏口播正文或等待生成审核页的理由。内容质量依据 source-policy 与对应平台文档，不在这里添加写作标准。

技术检查负责文件可用、尺寸与版面、来源输入和产物是否匹配、音频字幕时间对应。源文或素材变化时重建受影响的产物与报告。图文候选通过报告绑定当前输入和输出；已提升成品保存独立快照，不随新候选变化失效。

## 人工确认与提升

员工明确确认某平台当前版本后运行 `promote.mjs --unit <单元> --platform xhs,wechat --confirm YES`。程序先检查全部选中平台，再归档和替换；不触碰未选平台。视频还需完整观看试听。提升不等于已发布，发布状态须有实际平台记录。

候选交付说明在哪里、哪些已检查、有哪些具体待补事项即可。专业确认、案例授权和发布许可各自记录，不把内部候选当公开成品。不自动登录、发送、排期或发布，不将密钥写入内容或包。
