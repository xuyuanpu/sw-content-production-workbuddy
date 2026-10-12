import os from 'node:os';
import path from 'node:path';
import {parseArgs, skillRoot} from './lib.mjs';
import {deployRelease} from './deploy-lib.mjs';
const args=parseArgs(), host=args.host||'workbuddy';
if(!['workbuddy','codex'].includes(host))throw new Error('host: workbuddy | codex');
const hostRoot=path.join(os.homedir(),`.${host}`);
const result=await deployRelease({source:skillRoot,target:path.join(hostRoot,'skills','sw-content-production'),backupRoot:path.join(hostRoot,'skill-backups','sw-content-production'),reviewedLocalChanges:args['reviewed-local-changes']==='YES'});
console.log(JSON.stringify({...result,next:result.runtimePreserved?'所选阶段 doctor 检查即可':'只写稿无需安装；制作图文时 npm ci 并安装 Chromium，视频制作时再检查 Remotion/ffmpeg'},null,2));
