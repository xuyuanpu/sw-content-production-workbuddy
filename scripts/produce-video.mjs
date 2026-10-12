import {inspectVideoAcceptance} from './video-acceptance-lib.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {parseArgs, readJson, writeJson, sha256, skillRoot, platformPaths} from './lib.mjs';
import {requireConfirmedVoiceover} from './confirmed-voiceover-lib.mjs';
import {productionPlanErrors} from './director-contract-lib.mjs';
import {checkDirectorReview} from './director-review-lib.mjs';
import {resolveInside} from './alignment-lib.mjs';
const run=promisify(execFile), args=parseArgs();
if(!args.unit) throw new Error('Usage: produce-video.mjs --unit <unit> [--workspace <video workspace>] [--check | --proof [--at 0,8.5,16]] [--preview --from 0 --to 20 --output <preview dir>]');
const unit=path.resolve(args.unit), root=args.workspace?path.resolve(args.workspace):platformPaths(unit).video;
const rel=path.relative(unit,root);
if(rel.startsWith('..')||path.isAbsolute(rel)) throw new Error('Video workspace must be inside the content unit');
const report={status:'running',steps:[],startedAt:new Date().toISOString(),entrypoint:'produce-video.mjs'};
if(args.proof&&(args.preview||args.check))throw new Error('--proof cannot be combined with --preview or --check');
if(args.at!==undefined&&!args.proof)throw new Error('--at is only used with --proof');
const reportFile=path.join(root,args.proof?'visual-proof/pipeline-report.json':'pipeline-report.json');
const stepTimeout = Number(process.env.SW_STEP_TIMEOUT_MS || 25*60*1000);
if (!Number.isFinite(stepTimeout) || stepTimeout <= 0) throw new Error('SW_STEP_TIMEOUT_MS must be positive');
async function step(name,argv){
 report.activeStep=name;await writeJson(reportFile,report);
 await run(process.execPath,[path.join(skillRoot,'scripts',name),...argv],{cwd:skillRoot,timeout:stepTimeout,maxBuffer:4*1024*1024});
 report.steps.push({name,exitCode:0});console.log(JSON.stringify({step:name,status:'passed'}));
}
const file=name=>path.join(root,name);
try{
 const reusable=args.preview ? await inspectVideoAcceptance({artifactDir:file('output'),unitRoot:unit,sourceMode:'candidate'}) : null;
 report.activeStep='production-plan';
 const planErrors=productionPlanErrors(await readJson(file('scenes.json')));
 if(planErrors.length)throw new Error('Incomplete production plan: '+planErrors.join(', '));
 if(!reusable?.ready) await step('compile-director.mjs',['--scenes',file('scenes.json')]);
 const d=await readJson(file('scenes.json'));
 await requireConfirmedVoiceover(root, await resolveInside(root,d.video.authoritativeScript||'final-voiceover.md','最终口播稿'));
 if(!reusable?.ready) await step('alignment-qc.mjs',['--audio',await resolveInside(root,d.video.audio,'audio'),'--script',file(d.video.authoritativeScript||'final-voiceover.md'),'--scenes',file('scenes.json'),'--evidence',await resolveInside(root,d.video.timingEvidence,'evidence')]);
 if(!reusable?.ready) await step('storyboard-qc.mjs',['--chain',file('knowledge-chain.md'),'--treatment',file('visual-treatment.md'),'--map',file('visual-explanation-map.md'),'--shotbook',file('shotbook.json'),'--scenes',file('scenes.json'),'--script',file(d.video.authoritativeScript||'final-voiceover.md')]);
 if(args.proof){
  await step('build-video.mjs',['--unit',unit,'--workspace',root,'--proof',...(args.at!==undefined?['--at',String(args.at)]:[]),...(args['keep-work']?['--keep-work']:[])]);
  report.status='visual-proof-ready';report.candidateRendered=false;report.output=file('visual-proof/index.html');report.completedAt=new Date().toISOString();delete report.activeStep;await writeJson(reportFile,report);console.log(JSON.stringify(report,null,2));process.exit(0);
 }
 if(!args.check){
  if(!reusable?.ready) await step('build-video.mjs',['--unit',unit,'--workspace',root,...(args['keep-work']?['--keep-work']:[])]);
  report.reusedCandidate=Boolean(reusable?.ready);
  const source=file('output/video-candidate.mp4');
  const acceptance=reusable?.ready ? reusable : await readJson(file('output/acceptance-report.json'));
  report.acceptanceReady=acceptance.ready;report.pending=[...acceptance.reasons];
  let review=null;try{review=await readJson(file('output/director-review.json'));}catch{}
  const director=checkDirectorReview(review,await readJson(file('output/video-report.json')));
  report.directorReviewPassed=director.passed;
  if(!director.passed)report.pending.push('完整导演审片与试听尚未通过');
  report.videoSha256=sha256(await fs.readFile(source));
  if(args.preview){
   const out=path.resolve(args.output||file('output/preview'));
   const start=Number(args.from||0),end=Number(args.to||d.video.duration);
   if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||end>d.video.duration+.001)throw new Error('Invalid preview interval');
   await fs.mkdir(out,{recursive:true});const target=path.join(out,'director-preview.mp4');
   if(start===0&&end===d.video.duration)await fs.copyFile(source,target);
   else await run('ffmpeg',['-v','error','-y','-ss',String(start),'-i',source,'-t',String(end-start),'-c:v','libx264','-crf','20','-c:a','aac','-b:a','192k','-movflags','+faststart',target],{timeout:120000});
   await writeJson(path.join(out,'preview-report.json'),{status:'preview-of-production-candidate',sourceVideoSha256:report.videoSha256,previewSha256:sha256(await fs.readFile(target)),range:{start,end},sameRenderer:true,sameMix:true,acceptanceReady:acceptance.ready});
   await fs.writeFile(path.join(out,'review.html'),'<meta charset="utf-8"><title>SW 统一链路预览</title><body style="background:#FBF8F4;text-align:center"><p>取自正式候选，画面与声音共用一条构建链；仍需完整审片。</p><video controls style="height:85vh" src="director-preview.mp4"></video>');
   report.preview=target;
  }
 }
 report.status=args.check?(report.editorialPassed===false?'technical-inputs-validated-editorial-pending':'inputs-validated'):report.acceptanceReady&&report.directorReviewPassed?'candidate-accepted':'rendered-awaiting-review';
 report.completedAt=new Date().toISOString();delete report.activeStep;await writeJson(reportFile,report);console.log(JSON.stringify(report,null,2));
}catch(e){report.status='failed';report.error=String(e.stderr||e.stdout||e.message).slice(-7000);await writeJson(reportFile,report);console.error(JSON.stringify(report,null,2));process.exitCode=1;}
