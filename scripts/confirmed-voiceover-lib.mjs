import fs from "node:fs/promises";
import path from "node:path";
import {analyzeVoiceover, extractVoiceoverBody, normalizedContent} from "./voiceover-lib.mjs";

export function confirmedVoiceoverMatches(stored, draft, tts) {
  const current = analyzeVoiceover(draft, tts);
  return current.passed && stored?.passed === true
    && stored?.contentConfirmation?.method === "explicit-user-confirmation"
    && stored.contentConfirmation.draftHash === current.fingerprints.draftBody
    && stored.fingerprints?.draftBody === current.fingerprints.draftBody
    && stored.fingerprints?.ttsInput === current.fingerprints.ttsInput;
}
export async function requireConfirmedVoiceover(root, finalScriptPath = null) {
  const files = ["voiceover-draft.md", "tts-input.txt", "voiceover-report.json"].map(name => path.join(root, name));
  const [draft, tts, raw] = await Promise.all(files.map(file => fs.readFile(file, "utf8")));
  const stored = JSON.parse(raw);
  if (!confirmedVoiceoverMatches(stored, draft, tts)) throw new Error("口播尚未人工确认，或机器稿检查未通过/已过期");
  if (finalScriptPath) {
    const final = await fs.readFile(finalScriptPath, "utf8");
    if (normalizedContent(extractVoiceoverBody(final)) !== normalizedContent(extractVoiceoverBody(draft))) throw new Error("最终口播稿与人工确认的内容不一致，停止使用该音频或字幕继续生产");
    files.push(finalScriptPath);
  }
  return {files, report: stored};
}
