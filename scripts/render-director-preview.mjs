// Compatibility entry only: never renders or mixes independently.
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {parseArgs,skillRoot} from './lib.mjs';
const args=parseArgs();
if(!args.scenes||!args.output)throw new Error('Usage: --scenes <scenes.json> --output <preview dir> [--unit <unit> --from 0 --to 20]');
const root=path.dirname(path.resolve(args.scenes));
if(path.basename(args.scenes)!=='scenes.json')throw new Error('Canonical scene file must be named scenes.json');
const unit=args.unit?path.resolve(args.unit):root.split(`${path.sep}AIworkspace${path.sep}`)[0];
if(unit===root&&!args.unit)throw new Error('Supply --unit');
execFileSync(process.execPath,[path.join(skillRoot,'scripts/produce-video.mjs'),'--unit',unit,'--workspace',root,'--preview','--output',path.resolve(args.output),...(args.from?['--from',String(args.from)]:[]),...(args.to?['--to',String(args.to)]:[])],{stdio:'inherit',timeout:30*60*1000});
