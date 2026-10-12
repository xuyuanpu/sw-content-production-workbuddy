import fs from 'node:fs/promises';
import path from 'node:path';
import {copyTree, ensureDir, exists} from './lib.mjs';
import {isReleaseFile, verifyRelease} from './release-integrity.mjs';

async function dependencySignature(root) {
  try {
    const data=JSON.parse(await fs.readFile(path.join(root,'package-lock.json'),'utf8'));
    delete data.version;
    if(data.packages?.[''])delete data.packages[''].version;
    return JSON.stringify(data);
  } catch { return null; }
}
export async function deployRelease({source,target,backupRoot,reviewedLocalChanges=false}) {
  const release=await verifyRelease(source);
  if(!release.passed)throw new Error('源包指纹不一致，停止部署');
  if(path.resolve(source)===path.resolve(target))return {status:'already-installed',target,release};
  if(await exists(path.join(target,'release-manifest.json'))){
    const previous=await verifyRelease(target);
    if(!previous.passed&&!reviewedLocalChanges)throw new Error('安装版有现场修改，先备份和审核回源');
  }
  const signature=await dependencySignature(source);
  const preserveRuntime=Boolean(signature && signature===await dependencySignature(target) && await exists(path.join(target,'node_modules')));
  await ensureDir(path.dirname(target));
  const staging=await fs.mkdtemp(path.join(path.dirname(target),'.sw-content-production-stage-'));
  let backup=null,activated=false,movedRuntime=false;
  try {
    await copyTree(source,staging,file=>{
      const rel=path.relative(source,file);return rel==='release-manifest.json'||isReleaseFile(rel);
    });
    const prepared=await verifyRelease(staging);
    if(!prepared.passed||prepared.digest!==release.digest)throw new Error('暂存包指纹不一致');
    if(await exists(target)){
      await ensureDir(backupRoot);backup=await fs.mkdtemp(path.join(backupRoot,'previous-'));
      await fs.rmdir(backup);await fs.rename(target,backup);
    }
    await fs.rename(staging,target);activated=true;
    if(preserveRuntime){await fs.rename(path.join(backup,'node_modules'),path.join(target,'node_modules'));movedRuntime=true;}
    const installed=await verifyRelease(target);
    if(!installed.passed||installed.digest!==release.digest)throw new Error('安装后指纹失效');
    return {status:'installed',target,backup,runtimePreserved:movedRuntime,release:installed};
  } catch(error) {
    if(movedRuntime)await fs.rename(path.join(target,'node_modules'),path.join(backup,'node_modules'));
    if(activated)await fs.rm(target,{recursive:true,force:true});
    if(backup)await fs.rename(backup,target);
    await fs.rm(staging,{recursive:true,force:true});throw error;
  }
}
