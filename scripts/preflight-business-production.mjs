#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { readFile, realpath } from 'node:fs/promises';
import { APP_ROOT } from '../runner/paths.mjs';
import { revalidateProductionReconciliationPlan } from '../runner/production-reconciliation.mjs';

function parse(args) {
  if(args.includes('--help'))return {help:true};
  const options={};
  for(let index=0;index<args.length;index++){
    const key={'--run-id':'runId','--expected-plan-sha256':'expectedPlanSha256'}[args[index]];
    if(!key||options[key]!==undefined)throw new Error('Unknown or repeated argument.');
    const value=args[++index];if(!value||value.startsWith('--'))throw new Error('Argument requires a value.');options[key]=value;
  }
  if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(options.runId??''))throw new Error('--run-id is required and invalid.');
  if(!/^[a-f0-9]{64}$/.test(options.expectedPlanSha256??''))throw new Error('--expected-plan-sha256 requires a 64-character lowercase SHA-256.');
  return options;
}

try {
  const options=parse(process.argv.slice(2));
  if(options.help){
    process.stdout.write('Read-only production drift and resource check.\nUsage: node scripts/preflight-business-production.mjs --run-id <id> --expected-plan-sha256 <sha256>\nThis command performs no acquisition, stage launch, approval, pointer update, or output write.\n');
  } else {
    const root=await realpath(APP_ROOT),file=path.join(root,'data/reconciliations/production-plans',`${options.runId}.json`);
    if(path.resolve(await realpath(file))!==file)throw new Error('Plan file crosses a link.');
    const plan=JSON.parse(await readFile(file,'utf8'));
    if(plan.runId!==options.runId)throw new Error('Plan identity differs from --run-id.');
    process.stdout.write(`${JSON.stringify(await revalidateProductionReconciliationPlan(plan,{root,expectedPlanSha256:options.expectedPlanSha256}),null,2)}\n`);
  }
} catch(error) { process.stderr.write(`Production preflight failed: ${error.message}\n`);process.exitCode=1; }
