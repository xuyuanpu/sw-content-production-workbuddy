import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import {analyzeVisualPolicy} from '../scripts/visual-policy-lib.mjs';
test('supported visuals pass and retired visuals fail before rendering',()=>{
 assert.equal(analyzeVisualPolicy({scenes:[{visual:'cause-map'}]}).passed,true);
 for(const visual of ['paper-stack','paper-contrast','paper-reveal']) assert.equal(analyzeVisualPolicy({scenes:[{visual}]}).passed,false);
 assert.equal(analyzeVisualPolicy({video:{visualStyle:'paper-collage'}}).passed,false);
});
test('shipped templates contain no paper renderer or texture bundle',async()=>{
 const root=new URL('../assets/templates/video/',import.meta.url);
 const source=await fs.readFile(new URL('remotion/sw-dynamic-video.jsx',root),'utf8');
 assert.doesNotMatch(source,/PaperSlip|PaperBackdrop|PaperStackScene|PaperContrastScene|PaperRevealScene|paperAssets/);
 await assert.rejects(fs.access(new URL('assets/paper-collage',root)));
 await assert.rejects(fs.access(new URL('scenes.example.json',root)));
});
