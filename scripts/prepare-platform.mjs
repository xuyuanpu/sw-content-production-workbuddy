import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {exists,ensureDir,parseArgs,platformPaths,skillRoot} from './lib.mjs';
export async function preparePlatform(unit,platform) {
  if(!['xhs','wechat','video'].includes(platform))throw new Error('Unknown platform');
  const root=platformPaths(unit)[platform];
  async function copyMissing(source,target) {
    const stat=await fs.stat(source);
    if(stat.isDirectory()){
      await ensureDir(target);for(const name of await fs.readdir(source))await copyMissing(path.join(source,name),path.join(target,name));
    }else if(!await exists(target)){await ensureDir(path.dirname(target));await fs.copyFile(source,target);}
  }
  // Renderer lives in the skill, never copied into a content workspace.
  if(platform==='video') {
    for(const name of ['director-contract.example.json','alignment-evidence.example.json'])await copyMissing(path.join(skillRoot,'assets/templates/video',name),path.join(root,name));
    await ensureDir(path.join(root,'audio-inbox'));
  }else await copyMissing(path.join(skillRoot,'assets/templates',platform),root);
  await copyMissing(path.join(skillRoot,'assets/logo.png'),path.join(root,'assets/logo.png'));
  if(platform==='wechat') for(const name of ['header.gif','footer-group.png','footer-channels.webp'])await copyMissing(path.join(skillRoot,'assets/brand/wechat',name),path.join(root,'assets',`brand-${name}`));
  return root;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const args=parseArgs();if(!args.unit||!args.platform)throw new Error('prepare-platform.mjs --unit <unit> --platform xhs|wechat|video');
  console.log(JSON.stringify({prepared:await preparePlatform(args.unit,args.platform)}));
}
