# SW 全片导演与统一执行链

本文件是短视频方向、视觉选择与执行入口的唯一规则源。SKILL 入口及小黑技能引用这里；不再按每轮返工追加一套并行规则。

## 一份全片方案

配音前明确受众、唯一问题、核心判断与来源；配音后以 `scenes.json` 为唯一画面计划：

- `film.audience / viewerChange / throughline`：观众处境、理解变化与贯穿对象。
- `film.cover.subject / action / topicLink`：首页画什么、发生什么、为什么直接关联主题。生图前写清。若只能靠事后讲寓意才关联主题，重做选图方向。
- `film.visualDivision / sound`：全片图像、人物、对象动画与声音的分工。
- 每镜 `direction`：knowledgeBeats、viewerBefore/After、visualStory、openingFrame/closingFrame、primaryVisualJob、handoff.fromPrevious/toNext。选择由本句认知任务决定，不为凑模板或比例补镜头。
- `explanations`：知识拍对应的来源、理解变化、画面依据、镜头与禁止的无效替代。
- `captions`：当前确认口播的短字幕，使用真实语音 from/to 锚点。

编译器从同一计划派生 `visual-treatment.md`、`shotbook.json`、`visual-explanation-map.md` 与秒数。它们是阅读视图，不另行创作或手改。内容稿件的来源与人工确认记录仍保留，不能由分镜反向伪造。

## 视觉职责

**首页主题图**：生成无文字主题主视觉，视频层排标题及品牌；不能用小黑图、平台整页截图或泛用精致静物默认替代。先判断能否直观呈现本片问题，再决定审美。真人情境生图是编辑示意，不能称真实客户证据。

**人物情境**：`character-scene` 使用白底紧凑插图，通常 4:3，只占主画面局部；视频画布沿用项目主题。人物身份影响理解时，短标签直接生成在人物上身；`characters:[{id,label}]` 跨镜保持一致、`labelsInImage:true`。同一施测师承担教练/老师职责时不换人。T/F、E/I 仅在脚本有依据时标记偏好，不从动作推断类型。无区分需要时不强加角色标签。字错需修图或重生成，不能靠视频层悬浮标签掩盖。

**过程、关系与差异**：使用原生对象动画或对照组件。关系只能画计划中明确存在的边；因果、并列和分岔不可混用。`cause-map` 是顺序链，不适合两条独立路径；分岔采用显式 relations 的 object-motion。图像变化必须服务于理解，不能以缩放整张插图代替过程解释。

任何场景均不使用纸纹、卷边、胶带或纸片拼贴；不得把公众号/小红书排版截图作为视频素材。

## 当前可执行动作

`video.directorVersion=1`；音频 `video.audio` 与词级证据 `video.timingEvidence` 必须在当前视频工作区并绑定 SHA256。第一镜从0开始，其余镜头由 startAnchor 派生；最后一镜覆盖真实工作音频时长。

`beats:[{target,action,anchor,endAnchor?,from?,to?}]` 中 anchor 为字符串或 `{text,occurrence}`。锚点会拼接跨 token 文本；重复词必须指定全文 occurrence，不能手填猜测的 at。

| visual | target | action |
| --- | --- | --- |
| cover、statement、comparison、question-card、path、boundary-card、cta | scene | hold |
| character-scene | illustration；有 supportingText 时 detail | enter |
| object-motion | object:id / relation:id | enter、move / reveal |
| misconception-replace | old / new | strike / enter |
| cause-map | node:0… | enter；相邻项自动成链 |
| step-timeline | step:0… | enter |
| boundary-split | can / cannot；可选 cannot:0… | enter |
| evidence-focus | evidence | focus；需原始证据或实质解释图 |

object-motion 最多5对象，label最多4字，x 120–960、y 520–1430。move 需 from/to 相对位移与 endAnchor，其时长从实际音频推导；relations 只连接明确声明的对象。相机 cameraPath 与主体 subjectHandoff 缺省静止；需要移动时显式给路径。不存在的动作、对象、锚点或越界时间必须报错。

## 一个构建入口

```sh
node scripts/produce-video.mjs --unit <内容单元> --workspace <视频工作区> --check
node scripts/produce-video.mjs --unit <内容单元> --workspace <视频工作区> --preview
```

同一入口依次执行编译、内容审阅记录检查、稿音对齐、分镜校验和 build-video。`--check` 仅检查输入，不渲染。`--preview` 从正式候选复制全片；可用 `--from / --to` 从候选截取代表片段。全片预览与候选文件字节相同，片段沿用其画面与混音。为避免两套实现，当前片段预览也先构建完整候选，短片成本可接受。

旧 `render-director-preview.mjs` 只转到此入口，不再自建渲染或只混人声。禁止为“快速测试”另写 render.mjs 或复制整套组件到内容目录。低层 compile/qc/build 命令保留供诊断；不构成另一条默认生产路。

正式混音使用固定品牌 BGM：先按原规则 ducking，再固定乘一次 `postDuckGain=0.6`，人声增益不变。从母带及原始工作人声重新计算，不对上次成片反复乘0.6。参数以 bgm-policy-lib.mjs 为准；预览与候选不得各调一套。

## 检查结果与回改

- 音频/锚点/资产/字幕/渲染等技术错误：停止并记录失败步骤。
- v1.16 起以当前稿件的人工确认与机器稿检查作为制作输入，不强制独立文字审稿；真实音频、技术验收和完整视听审片仍需通过。
- 技术渲染成功但缺少全片观看/试听：`rendered-awaiting-review`，不等于可发布。静止超过2.6秒是审阅线索，不为消除报警添加装饰运动。
- 完整审片后填写绑定当前视频和时间轴的 `output/director-review.json`；未看/未听保持 false。发布仍由人确认，promote 再检查内容与导演审阅。

每次回改先定位层级：论点问题回脚本；主题关联问题回 film.cover；人物情境问题回配图；过程关系问题回对象/边/动作；声音问题回唯一混音配置。随后重跑同一入口。禁止仅修输出文件却沿用旧报告。

机器能证明输入一致、动作执行和文件有效；不能证明图片贴题、解释清楚或专业结论正确。导演仍需看真实画面、听声音，并记录具体观察。
