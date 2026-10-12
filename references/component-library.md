# 可组合视频组件

本库描述可执行能力，不规定某个概念应该长什么样。导演先设计观众需要看到的变化，再决定组件、布局与动作。以下示例仅演示接口，不是某种语义的默认画法。

## 场景与坐标

`visual: "composition"`，使用 `components: []`。不使用旧组合的 overlayLines、objects 或 beats；标题本身也是 text 组件，模型自行排版。video、film、direction、explanations、captions 及统一构建入口不变。

默认 stage 为 `{x:64,y:190,width:952,height:1310}`，处在品牌头和字幕之间。可显式设置 stage，但需要回看是否侵入品牌或字幕区域。组件 x/y 是左上角，以 stage 或父 group 为坐标系；width/height 为本地尺寸。绘制顺序为数组顺序，后面的覆盖前面的。无自动网格、语义配色、因果箭头或文本角色映射。

## 能力清单

每个组件有唯一 `id`（字母开头，之后允许字母、数字、下划线、连字符）、`type`、`state`，可选 `keyframes`。

| type | 专用字段 | 能力 |
| --- | --- | --- |
| text | text、fontSize、fontWeight、lineHeight、align、wrap | 中文自动折行或显式换行；align=left/center/right；wrap=false 保留单行，需自行保证宽度 |
| image | asset、assetRole、fit | 本地资产，fit=contain/cover；支持同一场景多图；和旧镜头相同的来源、路径与指纹校验 |
| rect | radius | 矩形或圆角矩形，不带预设文案或含义 |
| ellipse | 无 | 宽高各自决定的椭圆；不限制所有对象都是圆 |
| path | d | SVG 路径，导演可画线条、轮廓、标记或图形；不接受脚本或外部资源 |
| connector | from、to、arrow | 显式端点，随对象和父组变换更新；arrow 默认 none，可选 start/end/both |
| group | children、clip | 组合其他组件共同变换；clip=true 将内容裁在本组宽高内，可用尺寸变化形成揭示 |

image 涉及需辨认的角色时，附 `characters:[{id,label}]` 与 `labelsInImage:true`，角色文字必须实际生成在图内；机器只能检查声明，必须看图核对。人物插图通常白底，图像不能覆盖主画布的品牌/字幕系统。

state 支持：

- x、y、width、height；默认 0、0、100、100。
- opacity（0–1）、scale（>0）、rotate（度）；默认 1、1、0，围绕组件左上角变换。
- fill、stroke：十六进制颜色或 none/transparent；默认 none。
- strokeWidth（≥0），默认 3。
- draw（0–1）：用于 path 描边及 connector 长度逐步显现，默认 1。

尺寸、位置、透明度、比例和旋转可插值；颜色在目标关键帧切换。不支持自由路径形变、3D 或任意 CSS/JS，不能仅在导演文字里声称执行了未实现的动作。需要新能力时扩展组件实现和相应测试，不再新增“某种含义只能用某种组件”的规则。

text 默认 fontSize=40、fontWeight=400、lineHeight=1.25，文字颜色默认正文色。宽高是排版区域，文本不会自动缩小以消除溢出。小字、超高和出界会形成检查线索，设计者需实际查看并修正或说明合理遮罩。

connector 的端点可为 `{component:"对象ID",u:0.5,v:0.5}`，u/v 是对象框内 0–1 比例；或 `{x:100,y:200}`，表示 stage 坐标。端点可指向嵌套组件，随整组移动/缩放/旋转更新。线不推断语义，不自动生成，不默认表示因果。箭头由导演明确选择并在 visualStory 中说明关系。

## 语音驱动关键帧

`keyframes:[{anchor,state,easing?,edge?,offset?}]`：

- anchor 为口播字符串或 `{text,occurrence}`，来自实际词级识别；重复词指定 occurrence。
- 场景边界为 `{scene:"start"}` 或 `{scene:"end"}`。
- edge 默认 start，可选 end；offset 为相对锚点的秒数，用于短入场/动作收尾，仍必须在镜头范围内。
- easing 默认 smooth，可选 linear 或 hold。easing 描述到当前帧这一段的插值。
- 编译器写入 at，作者不要填写猜测秒数。
- state 为增量，未写属性继承之前值。初始 state 在镜头 0 秒有效；关键帧按时间严格递增，可重复改变同一属性。
- 动作如果需要等到某句话才开始，要在开始锚点重复当前状态，然后在结束锚点写目标状态；否则会从上一帧提前插值。
- 没有 keyframes 的组件保持静态，静态图形与动态主体可共存。

```json
{
  "id": "experience",
  "type": "group",
  "state": {"x":70,"y":500,"width":280,"height":160,"opacity":0},
  "children": [
    {"id":"mark","type":"path","d":"M 0 70 L 35 20 L 70 70",
     "state":{"x":0,"y":0,"width":70,"height":70,"stroke":"#9E2F3F"}},
    {"id":"label","type":"text","text":"一次具体经历","fontSize":40,
     "state":{"x":90,"y":15,"width":190,"height":120}}
  ],
  "keyframes": [
    {"anchor":"经历","state":{"opacity":0}},
    {"anchor":"经历","offset":0.2,"state":{"opacity":1}},
    {"anchor":"整理","state":{"x":70}},
    {"anchor":"整理","edge":"end","state":{"x":400}}
  ]
}
```

这个例子把图形和文字一起移动；同一句话也可以通过多幅图像、对照、路径绘制或其他组合表达。不能把示例复制为每条视频的必选镜头。

## 验证与交付

调用同一个 `produce-video.mjs`。编译、资产暂存、文字检查、Remotion 渲染、预览及 BGM 都识别嵌套组件；不写内容目录专用渲染器。未知组件、状态字段、坏引用或越界时间会报错。密度、重叠、图片身份和视觉关系含义必须检查真实画面，不能以代码检查通过替代。
