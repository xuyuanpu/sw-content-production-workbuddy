import {walkComponents} from '../assets/templates/video/remotion/component-library.mjs';
const normalizePath = (value) => String(value || "").replace(/\\/gu, "/").toLowerCase();

export const NATIVE_LOGIC_VISUALS = Object.freeze([
  "composition",
  "comparison",
  "object-motion",
  "misconception-replace",
  "cause-map",
  "step-timeline",
  "evidence-focus",
  "boundary-split",
]);

const PLATFORM_LAYOUT_PATTERNS = [
  /(?:^|\/)20-xhs\/.*\/(?:page-?\d+|carousel-long|contact-sheet|comparison[^/]*)\.(?:png|jpe?g|webp)$/u,
  /(?:^|\/)30-wechat\/.*\/(?:article-full|cover-wide|cover-square|review-page|comparison[^/]*)\.(?:png|jpe?g|webp)$/u,
  /(?:^|\/)(?:小红书|公众号)\/.*\/(?:page-?\d+|carousel-long|article-full|cover-wide|cover-square)\.(?:png|jpe?g|webp)$/u,
];

export function classifyVideoAsset(reference, assetRole = "") {
  const value = normalizePath(reference);
  const role = String(assetRole || "").trim().toLowerCase();
  if (!value) return "none";
  if (role === "platform-layout-screenshot" || PLATFORM_LAYOUT_PATTERNS.some((pattern) => pattern.test(value))) return "platform-layout-screenshot";
  if (role === "technical-diagram" || /(?:^|\/)content-image\.(?:png|jpe?g|svg|webp)$/u.test(value)) return "technical-diagram";
  if (role === "original-evidence") return "original-evidence";
  if (role === "cover-visual" || /(?:^|\/)cover\.(?:png|jpe?g|webp)$/u.test(value)) return "cover-visual";
  if (role === "shared-visual" || value.includes("/10-shared-assets/")) return "shared-visual";
  if (role === "brand-logo" || /(?:^|\/)logo\.(?:png|jpe?g|svg|webp)$/u.test(value)) return "brand-logo";
  return "video-visual";
}

export function analyzeVideoAssetPolicy({scenes = []} = {}) {
  const details = scenes.flatMap(scene => [scene, ...walkComponents(scene).filter(({node})=>node.type==='image').map(({node})=>({...node,id:`${scene.id}/${node.id}`,visual:'component-image'}))]).map((scene) => ({
    id: scene.id,
    visual: scene.visual,
    asset: scene.asset || null,
    assetRole: scene.assetRole || null,
    assetClass: classifyVideoAsset(scene.asset, scene.assetRole),
  }));
  const platformLayoutScreenshots = details.filter((item) => item.assetClass === "platform-layout-screenshot");
  const articlePageScenes = details.filter((item) => item.visual === "article-page");
  const evidenceErrors = details.filter((item) => item.visual === "evidence-focus" && !["technical-diagram", "original-evidence", "shared-visual"].includes(item.assetClass));
  const nativeLogicScenes = details.filter((item) => NATIVE_LOGIC_VISUALS.includes(item.visual));
  const checks = [
    {
      name: "platform layout screenshots are not video assets",
      passed: platformLayoutScreenshots.length === 0,
      detail: platformLayoutScreenshots,
    },
    {
      name: "article-page scenes are prohibited",
      passed: articlePageScenes.length === 0,
      detail: articlePageScenes,
    },
    {
      name: "evidence scenes use original evidence or substantive diagrams",
      passed: evidenceErrors.length === 0,
      detail: evidenceErrors,
    },
    {
      name: "knowledge logic includes native Remotion explanation",
      passed: nativeLogicScenes.length > 0,
      detail: nativeLogicScenes.map(({id, visual}) => ({id, visual})),
    },
  ];
  return {
    passed: checks.every((check) => check.passed),
    platformLayoutScreenshotCount: platformLayoutScreenshots.length,
    nativeLogicSceneCount: nativeLogicScenes.length,
    details,
    checks,
    policy: "公众号和小红书的排版成品、文章长截图与轮播整页不得进入视频；知识逻辑由 Remotion 原生组件重构。仅原始证据、共享主视觉或技术解释图可按用途引用。",
  };
}
