import crypto from "node:crypto";

const pausePattern = /<#(\d+(?:\.\d+)?)#>/gu;
const fingerprint = (value) => crypto.createHash("sha256").update(String(value || "")).digest("hex");

export function extractVoiceoverBody(markdown) {
  const normalized = String(markdown || "").replace(/\r\n/gu, "\n");
  const heading = normalized.match(/^##\s+口播稿\s*$/mu);
  if (!heading) return normalized.trim();
  const start = heading.index + heading[0].length;
  const tail = normalized.slice(start);
  const next = tail.search(/^##\s+/mu);
  return tail.slice(0, next < 0 ? tail.length : next).trim();
}

function normalizedContent(value) {
  return String(value || "")
    .replace(pausePattern, "")
    .replace(/M\s+B\s+T\s+I/giu, "MBTI")
    .replace(/F\s+I/gu, "Fi")
    .replace(/F\s+E/gu, "Fe")
    .replace(/[*_`~#>]/gu, "")
    .replace(/[\p{P}\p{Z}\p{S}]/gu, "")
    .toLowerCase();
}

function compact(value) {
  return [...String(value || "").replace(/\s/gu, "")].length;
}

function pauseBudget(characterCount) {
  if (characterCount < 120) return {min: 1, max: 3};
  if (characterCount < 250) return {min: 2, max: 4};
  if (characterCount <= 650) return {min: 3, max: 6};
  return {min: 5, max: 9};
}

export function analyzeVoiceover(draftMarkdown, ttsInput) {
  const draftBody = extractVoiceoverBody(draftMarkdown);
  const tts = String(ttsInput || "").trim();
  const pauses = [...tts.matchAll(pausePattern)].map((match) => ({raw: match[0], seconds: Number(match[1]), index: match.index}));
  const ttsWithoutPauses = tts.replace(pausePattern, "");
  const characterCount = compact(ttsWithoutPauses);
  const budget = pauseBudget(characterCount);
  const unsupportedTags = [...ttsWithoutPauses.matchAll(/<[^>]+>/gu)].map((match) => match[0]);
  const cuePatterns = [
    ["其实", /其实/gu], ["你看", /你看/gu], ["你想一下", /你想一下/gu], ["比如", /比如/gu],
    ["但问题是", /但问题是/gu], ["那问题来了", /那问题来了/gu], ["所以", /所以/gu],
    ["当然", /当然/gu], ["先别急", /先别急/gu], ["换句话说", /换句话说/gu]
  ];
  const spokenCues = cuePatterns.filter(([, pattern]) => pattern.test(draftBody)).map(([name]) => name);
  const sentences = draftBody.split(/[。！？!?；;\n]+/gu).map((sentence) => sentence.trim()).filter(Boolean);
  const sentenceLengths = sentences.map(compact);
  const longestSentence = sentenceLengths.length ? Math.max(...sentenceLengths) : 0;
  const opening = [...draftBody.replace(/\s/gu, "")].slice(0, 80).join("");
  const checks = [];
  const add = (name, passed, detail) => checks.push({name, passed: Boolean(passed), detail});

  add("voiceover draft body is present", compact(draftBody) >= 80, {characters: compact(draftBody)});
  add("tts input is present", characterCount >= 80, {characters: characterCount});
  add("confirmed content is unchanged after pronunciation and pause normalization", normalizedContent(draftBody) === normalizedContent(tts), {draftFingerprint: normalizedContent(draftBody), ttsFingerprint: normalizedContent(tts)});
  add("opening enters a question or conflict within 80 characters", /[？?]|不是|不等于|别急|误解|错|无效|没用|问题|为什么/gu.test(opening), {opening});
  add("draft has direct audience address", /你|我们|大家/gu.test(draftBody), null);
  add("draft uses at least two distinct spoken pivots", spokenCues.length >= 2, {spokenCues});
  add("draft contains at least one question", /[？?]/gu.test(draftBody), null);
  add("sentences remain speakable", longestSentence <= 65, {longestSentence, sentenceLengths});
  add("explicit pauses stay within sparse budget", pauses.length >= budget.min && pauses.length <= budget.max, {pauseCount: pauses.length, budget, characterCount});
  add("pause values are 0.3 to 0.6 seconds", pauses.every((pause) => pause.seconds >= 0.3 && pause.seconds <= 0.6), pauses);
  add("pause markers are not consecutive or placed at text edges", !/^<#/u.test(tts) && !/<#[^>]+#>\s*$/u.test(tts) && !/<#[^>]+#>\s*<#[^>]+#>/u.test(tts), null);
  add("no unsupported MiniMax tags are present", unsupportedTags.length === 0, unsupportedTags);
  add("English abbreviations use machine pronunciation spacing", !/\bMBTI\b/giu.test(tts) && !/\bFi\b/gu.test(tts) && !/\bFe\b/gu.test(tts), null);
  add("machine input contains no Markdown headings", !/^#{1,6}\s+/mu.test(tts), null);

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    metrics: {characterCount, pauseCount: pauses.length, pauseBudget: budget, spokenCues, longestSentence},
    fingerprints: {draftBody: fingerprint(draftBody), ttsInput: fingerprint(tts)},
    checks,
    passed: checks.every((check) => check.passed)
  };
}
