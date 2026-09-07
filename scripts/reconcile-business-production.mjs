#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { APP_ROOT } from '../runner/paths.mjs';
import { planProductionReconciliation, runProductionReconciliation, requestProductionReconciliationStop } from '../runner/production-reconciliation.mjs';

function parse(args) {
  if(args.includes('--help'))return {help:true};const mode=args.shift();if(!['plan','run','stop'].includes(mode))throw new Error('Use plan, run, or stop.');const options={mode};
  for(let index=0;index<args.length;index++){const key={'--run-id':'runId','--confirm':'confirm','--recover-benchmark-from':'recoverBenchmarkFrom','--ma-childcare':'maChildcare','--nj-childcare':'njChildcare'}[args[index]];if(!key||options[key]!==undefined)throw new Error('Unknown or repeated argument.');const value=args[++index];if(!value||value.startsWith('--'))throw new Error('Argument requires a value.');options[key]=value;}
  if(options.recoverBenchmarkFrom && mode!=='plan')throw new Error('Only plan accepts --recover-benchmark-from.');
  if(mode!=='plan'&&(options.maChildcare!==undefined||options.njChildcare!==undefined))throw new Error('Only plan accepts explicit childcare manifests; run uses its pinned plan.');
  if(options.runId&&!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(options.runId))throw new Error('Invalid run ID.');if(mode==='run'&&(!options.runId||!/^[a-f0-9]{64}$/.test(options.confirm??'')))throw new Error('run requires --run-id and --confirm <plan SHA256>.');if(mode!=='run'&&options.confirm)throw new Error('Only run accepts --confirm.');if(mode==='stop'&&!options.runId)throw new Error('stop requires --run-id.');return options;
}
async function safePlans() {
  const root=await realpath(APP_ROOT),directory=path.join(root,'data/reconciliations/production-plans');let current=directory;
  while(current!==root){try{if(path.resolve(await realpath(current))!==current)throw new Error('Plans path crosses a link or junction.');}catch(error){if(error.code!=='ENOENT')throw error;}current=path.dirname(current);}
  await mkdir(directory,{recursive:true});if(path.resolve(await realpath(directory))!==directory)throw new Error('Unsafe plans directory.');return directory;
}
try {
  const options=parse(process.argv.slice(2));
  if(options.help)process.stdout.write('Production reconciliation: plan [--run-id <id>] [--ma-childcare <immutable manifest>] [--nj-childcare <immutable manifest>] [--recover-benchmark-from <failed-run-id>] | run --run-id <id> --confirm <plan SHA256> | stop --run-id <id>\nUses 25 postal-migration production sources plus only explicitly selected, verified local childcare releases. Publishes each dataset in sequence, not atomically as one cohort. Benchmark recovery accepts only the validated historical benchmark status failure with identical childcare inputs and creates a new three-stage run; it does not pass the independent-label gate. Stop writes a durable request; controller acknowledges in receipt and finishes current stage before stopping. Do not use Windows task termination for graceful stopping. No download or staging resume.\n');
  else if(options.mode==='stop')process.stdout.write(`${JSON.stringify(await requestProductionReconciliationStop({runId:options.runId}),null,2)}\n`);
  else if(options.mode==='plan'){const plan=await planProductionReconciliation({...(options.runId?{runId:options.runId}:{}),...(options.recoverBenchmarkFrom?{recoverBenchmarkFrom:options.recoverBenchmarkFrom}:{}),...(options.maChildcare?{maChildcare:options.maChildcare}:{}),...(options.njChildcare?{njChildcare:options.njChildcare}:{})});const file=path.join(await safePlans(),`${plan.runId}.json`);await writeFile(file,`${JSON.stringify(plan,null,2)}\n`,{flag:'wx'});process.stdout.write(`${JSON.stringify({status:'PLANNED',run_id:plan.runId,plan_sha256:plan.planSha256,plan:file},null,2)}\n`);}
  else {const directory=await safePlans(),file=path.join(directory,`${options.runId}.json`);if(path.resolve(await realpath(file))!==file)throw new Error('Plan file crosses a link.');const plan=JSON.parse(await readFile(file,'utf8'));if(plan.planSha256!==options.confirm||plan.runId!==options.runId)throw new Error('Confirmation does not match production plan.');const stop=new AbortController(),request=()=>stop.abort();process.once('SIGINT',request);process.once('SIGTERM',request);try{const result=await runProductionReconciliation(plan,{signal:stop.signal});process.stdout.write(`${JSON.stringify({status:result.receipt.status,run_id:plan.runId,receipt:result.receiptPath},null,2)}\n`);process.exitCode=result.receipt.status==='SUCCEEDED'?0:1;}finally{process.removeListener('SIGINT',request);process.removeListener('SIGTERM',request);}}
} catch(error){process.stderr.write(`Production reconciliation failed: ${error.message}\n`);process.exitCode=1;}
