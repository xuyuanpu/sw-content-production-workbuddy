export const WECHAT_COVER_SPECS = Object.freeze({
  master: Object.freeze({width: 1000, height: 1000}),
  wide: Object.freeze({width: 900, height: 383, file: "cover-wide.png"}),
  square: Object.freeze({width: 500, height: 500, file: "cover-square.png"}),
});

const compact = (value) => [...String(value ?? "").replace(/\s/gu, "")].length;
const normalizedTitle = (value) => String(value ?? "").replace(/[\s，。！？；：、,.!?;:'"“”‘’（）()【】\[\]]/gu, "").toLowerCase();

export function analyzeWechatCover(cover, articleTitle) {
  const config = cover && typeof cover === "object" && !Array.isArray(cover) ? cover : {};
  const titleLines = Array.isArray(config.titleLines) ? config.titleLines.map((line) => String(line).trim()).filter(Boolean) : [];
  const sourcePosition = config.position && typeof config.position === "object" ? config.position : {};
  const position = {
    x: Number.isFinite(Number(sourcePosition.x)) ? Number(sourcePosition.x) : 50,
    y: Number.isFinite(Number(sourcePosition.y)) ? Number(sourcePosition.y) : 50,
  };
  const checks = [];
  const add = (name, passed, detail = null) => checks.push({name, passed: Boolean(passed), detail});
  add("cover source is declared", typeof config.src === "string" && config.src.trim().length > 0, config.src || null);
  add("cover alt explains the topic visual", compact(config.alt) >= 6, config.alt || null);
  add("cover title uses one to three semantic lines", titleLines.length >= 1 && titleLines.length <= 3 && titleLines.every((line) => compact(line) >= 2 && compact(line) <= 14), titleLines);
  add("cover title exactly matches the article title", normalizedTitle(titleLines.join("")) === normalizedTitle(articleTitle) && normalizedTitle(articleTitle).length > 0, {articleTitle, titleLines});
  add("cover subtitle remains optional and concise", config.subtitle == null || compact(config.subtitle) <= 24, config.subtitle || "");
  add("cover emphasis belongs to the title", config.highlight == null || config.highlight === "" || titleLines.join("").includes(String(config.highlight)), config.highlight || "");
  add("cover category remains concise", config.category == null || compact(config.category) <= 28, config.category || "");
  add("cover focal position is a valid percentage", position.x >= 0 && position.x <= 100 && position.y >= 0 && position.y <= 100, position);
  return {
    passed: checks.every((check) => check.passed),
    checks,
    normalized: {
      src: String(config.src || "").trim(),
      alt: String(config.alt || "").trim(),
      titleLines,
      subtitle: String(config.subtitle || "").trim(),
      highlight: String(config.highlight || "").trim(),
      category: String(config.category || "MBTI · PROFESSIONAL VIEW").trim(),
      position,
    },
  };
}

export function analyzeWechatCoverOutputs(outputs) {
  const checks = [];
  const add = (name, passed, detail = null) => checks.push({name, passed: Boolean(passed), detail});
  for (const key of ["master", "wide", "square"]) {
    const expected = WECHAT_COVER_SPECS[key];
    const actual = outputs?.[key] || null;
    add(`${key} cover has the required dimensions`, actual?.width === expected.width && actual?.height === expected.height, {expected, actual});
  }
  return {passed: checks.every((check) => check.passed), checks};
}
