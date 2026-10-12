import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {exists, findPlaywright, skillRoot, parseArgs} from './lib.mjs';
import {inspectBundledBrandBgm} from './bgm-policy-lib.mjs';
const stage = parseArgs().stage || 'writing';
if (!['writing','graphics','video'].includes(stage)) throw new Error('stage: writing | graphics | video');
const checks = [];
async function check(name, action) {
  try { const result=await action(); checks.push({name,passed:result!==false}); }
  catch(error) { checks.push({name,passed:false,detail:error.message}); }
}
await check('Node >=18',()=>Number(process.versions.node.split('.')[0])>=18);
if(stage!=='writing') await check('Playwright Chromium',async()=>{
  const {chromium}=await findPlaywright(); const browser=await chromium.launch({headless:true}); await browser.close();
});
if(stage==='video') {
  for(const name of ['remotion','@remotion/bundler','@remotion/renderer']) await check(name,()=>import(name));
  for(const name of ['ffmpeg','ffprobe']) await check(name,()=>execFileSync(name,['-version'],{stdio:'ignore'}));
  for(const file of ['assets/templates/video/remotion/index.jsx','scripts/compile-director.mjs','references/video-production.md','references/audio.md']) await check(file,()=>exists(path.join(skillRoot,file)));
  await check('SW BGM',async()=>(await inspectBundledBrandBgm(skillRoot)).passed);
}
const passed=checks.every(c=>c.passed);
console.log(JSON.stringify({stage,passed,checks},null,2));
if(!passed)process.exitCode=1;
