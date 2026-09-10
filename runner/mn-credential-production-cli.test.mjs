import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {APP_ROOT} from './paths.mjs';

test('MN production CLI bounds selection to fresh planning and rejects malformed arguments',()=>{
  const run=args=>spawnSync(process.execPath,[path.join(APP_ROOT,'scripts/reconcile-business-production.mjs'),...args],{cwd:APP_ROOT,encoding:'utf8',timeout:10000});
  const help=run(['--help']);assert.equal(help.status,0,help.stderr);assert.match(help.stdout,/--mn-credential-selection/);
  for(const [args,message] of [
    [['plan','--mn-credential-selection'],/requires a value/],
    [['plan','--mn-credential-selection','--run-id','unused'],/requires a value/],
    [['plan','--mn-credential-selection','a','--mn-credential-selection','b'],/repeated/],
    [['run','--mn-credential-selection','a'],/Only plan accepts/],
    [['stop','--mn-credential-selection','a'],/Only plan accepts/],
    ...['--recover-benchmark-from','--recover-resolution-from'].map(mode=>[['plan','--mn-credential-selection','a',mode,'old-run'],/fresh plan/]),
  ]){const result=run(args);assert.equal(result.status,1,result.stderr);assert.match(result.stderr,message);assert.equal(result.stdout,'');}
});
