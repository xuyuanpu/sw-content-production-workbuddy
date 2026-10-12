import fs from 'node:fs/promises';
import path from 'node:path';
import {parseArgs, readJson, sha256, writeJson} from './lib.mjs';
import {resolveInside, probeAudio} from './alignment-lib.mjs';
import {compileDirector, deriveShotbook, deriveExplanationMap, deriveTreatment, deriveKnowledgeChain} from './director-contract-lib.mjs';
const args = parseArgs();
if (!args.scenes) throw new Error('Usage: node compile-director.mjs --scenes <scenes.json> [--check]');
const file = path.resolve(args.scenes), root = path.dirname(file), data = await readJson(file);
const audio = await resolveInside(root, data.video.audio, 'audio');
const evidenceFile = await resolveInside(root, data.video.timingEvidence, 'timing evidence');
const evidence = await readJson(evidenceFile), audioHash = sha256(await fs.readFile(audio));
const probe = await probeAudio(audio);
if (Math.abs(probe.durationSeconds - data.video.duration) > .08) throw new Error('video.duration must match actual working audio');
const compiled = compileDirector(data, evidence, audioHash);
if (!args.check) {
  await writeJson(file, compiled);
  await fs.writeFile(path.join(root, 'knowledge-chain.md'), deriveKnowledgeChain(compiled));
  await fs.writeFile(path.join(root, 'visual-treatment.md'), deriveTreatment(compiled));
  await writeJson(path.join(root, 'shotbook.json'), deriveShotbook(compiled));
  await fs.writeFile(path.join(root, 'visual-explanation-map.md'), deriveExplanationMap(compiled));
}
console.log(JSON.stringify({passed:true, written:!args.check, scenes:compiled.scenes.length, subtitles:compiled.subtitles.length, compilation:compiled.directorCompilation},null,2));
