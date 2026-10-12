import fs from 'node:fs/promises';
import path from 'node:path';
import {sha256, exists, readJson, writeJson, platformPaths} from './lib.mjs';

const inputNames={xhs:['content.json','caption.md','index.html','styles.css','app.js','assets'],wechat:['article.json','assets']};
const excluded=new Set(['check-report.json','contact-sheet.png','cover-master.png','.DS_Store']);
async function hashes(root,names) {
  const result={};
  async function visit(rel) {
    if(excluded.has(path.basename(rel)))return;
    const target=path.join(root,rel), stat=await fs.lstat(target);
    if(stat.isSymbolicLink()) throw new Error(`素材请使用本地文件副本：${rel}`);
    if(stat.isDirectory())for(const name of (await fs.readdir(target)).sort())await visit(path.join(rel,name));
    else result[rel.split(path.sep).join('/')]=sha256(await fs.readFile(target));
  }
  for(const name of [...names].sort())await visit(name);
  return result;
}
export async function fingerprintGraphic(platform,root,out=path.join(root,'output')) {
  if(!inputNames[platform])throw new Error('Unknown graphic platform');
  return {schemaVersion:1,platform,inputHashes:await hashes(root,inputNames[platform]),outputHashes:await hashes(out,await fs.readdir(out))};
}
async function compare(root,expected,label,reasons) {
  if(!expected || !Object.keys(expected).length){reasons.push(`${label}指纹缺失，请重新制作候选`);return;}
  for(const [rel,hash] of Object.entries(expected)) {
    const resolved=path.resolve(root,rel), local=path.relative(root,resolved);
    if(local.startsWith('..')||path.isAbsolute(local)){reasons.push(`${label}路径越界`);continue;}
    if(!await exists(resolved) || sha256(await fs.readFile(resolved))!==hash)reasons.push(`${label}已变化：${rel}`);
  }
}
export async function inspectGraphic({platform,unitRoot,sourceMode='candidate'}) {
  const paths=platformPaths(unitRoot), root=paths[platform], output=sourceMode==='final'?paths[`${platform}Final`]:path.join(root,'output');
  const reasons=[];let report=null;
  try {
    if(sourceMode==='final'){
      const state=await readJson(path.join(paths.ai,'state.json'));
      const pointer=state.graphicFinalAcceptance?.[platform];
      if(!pointer)throw new Error('成品验收快照缺失');
      const file=path.resolve(paths.unit,pointer.path), rel=path.relative(paths.unit,file);
      if(rel.startsWith('..')||path.isAbsolute(rel))throw new Error('快照路径越界');
      const raw=await fs.readFile(file);
      if(sha256(raw)!==pointer.sha256)throw new Error('成品验收快照已变化');
      report=JSON.parse(raw);
    } else report=await readJson(path.join(output,'check-report.json'));
    if(report.passed!==true)reasons.push('制作检查未通过');
    const p=report.provenance;
    if(p?.schemaVersion!==1||p.platform!==platform)throw new Error('候选来源指纹缺失或不匹配，请重新制作');
    if(sourceMode==='candidate') {
      await compare(root,p.inputHashes,'文稿或素材',reasons);
      const current=await hashes(root,inputNames[platform]);
      if(JSON.stringify(Object.keys(current).sort())!==JSON.stringify(Object.keys(p.inputHashes||{}).sort()))reasons.push('输入文件集合已变化');
    }
    await compare(output,p.outputHashes,'交付文件',reasons);
    const currentOutputs=await hashes(output,await fs.readdir(output));
    if(JSON.stringify(Object.keys(currentOutputs).sort())!==JSON.stringify(Object.keys(p.outputHashes||{}).sort()))reasons.push('交付文件集合已变化');
  }catch(error){reasons.push(error.message);}
  return {ready:reasons.length===0,reasons,report};
}
export async function createGraphicSnapshot(unitRoot,platform,report){
  const raw=JSON.stringify(report,null,2)+'\n', digest=sha256(raw);
  const relative=`AIworkspace/${platform==='xhs'?'20-xhs':'30-wechat'}/acceptance-snapshots/${digest}.json`;
  await writeJson(path.join(unitRoot,relative),report);
  // writeJson's serialization is canonical in lib.mjs; hash the exact bytes.
  return {path:relative,sha256:sha256(await fs.readFile(path.join(unitRoot,relative)))};
}
