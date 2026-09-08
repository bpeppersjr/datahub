import assert from 'node:assert/strict';
import test from 'node:test';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,mkdir,writeFile,readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {APP_ROOT} from './paths.mjs';

for(const phase of ['source','baseline'])test(`Delaware real build CLI honors parent IPC cancellation during stalled ${phase}`,async()=>{
  const root=await mkdtemp(path.join(APP_ROOT,'data/tmp/de-cli-cancel-'));
  const baseline=path.join(root,'baseline'),release=path.join(baseline,'releases/fixture');
  await mkdir(path.join(release,'derived'),{recursive:true});
  const bytes=Buffer.from(JSON.stringify({zip_code:'19801',geography:{status:'2020-zcta-polygon-available',geo_id:'zcta:19801'},current_usps_validity:{status:'unverified'}})+'\n');
  await writeFile(path.join(release,'derived/zip-coverage.jsonl'),bytes);
  await writeFile(path.join(release,'manifest.json'),JSON.stringify({dataset_id:'census-zbp-baseline',release_id:'fixture',complete_national_release:true,geography_dependency:{dataset_id:'us-census-geography',release_id:'fixture'},artifacts:[{path:'derived/zip-coverage.jsonl',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}]}));
  await writeFile(path.join(baseline,'current.json'),JSON.stringify({manifest:'releases/fixture/manifest.json'}));
  const output=path.join(root,'output');await mkdir(output);await writeFile(path.join(output,'current.json'),'prior publication sentinel');
  await mkdir(path.join(output,'.staging/sibling'),{recursive:true});await writeFile(path.join(output,'.staging/sibling/keep.txt'),'keep');
  const child=spawn(process.execPath,['--import','./runner/fixtures/de-cli-stalled-fetch.mjs','scripts/build-de-business-licenses.mjs','--output',output,'--zbp',path.join(baseline,'current.json')],{cwd:APP_ROOT,windowsHide:true,stdio:['ignore','pipe','pipe','ipc'],env:{...process.env,TEMP:root,TMP:root,DE_CLI_CANCEL_FIXTURE:phase}});
  let text='',requested=0,timedOut=false;
  child.stdout.on('data',chunk=>{text+=chunk;});child.stderr.on('data',chunk=>{text+=chunk;});
  child.on('message',message=>{if(message.type===`fixture-${phase}-requested`){requested++;child.send({type:'cancel'});}});
  const deadline=setTimeout(()=>{timedOut=true;child.kill();},15000);
  let status;
  try{status=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});}finally{clearTimeout(deadline);}
  assert.equal(timedOut,false,text);assert.equal(requested,1,text);assert.equal(status,1,text);assert.match(text,/build cancelled/);
  assert.equal(await readFile(path.join(output,'current.json'),'utf8'),'prior publication sentinel');
  assert.equal(await readFile(path.join(output,'.staging/sibling/keep.txt'),'utf8'),'keep');
  assert.deepEqual(await readdir(path.join(output,'.staging')),['sibling']);
});

test('Delaware CLIs forward and dispose cancellation; malformed flags fail before build',async()=>{
  const build=await readFile(new URL('../scripts/build-de-business-licenses.mjs',import.meta.url),'utf8');
  const verify=await readFile(new URL('../scripts/verify-de-business-licenses.mjs',import.meta.url),'utf8');
  for(const source of [build,verify]){assert.match(source,/createCliCancellation/);assert.match(source,/signal:\s*cancellation.signal/);assert.match(source,/finally\s*\{\s*cancellation.dispose/);}
  assert.match(build,/if \(error.code === 'DE_PUBLICATION_INCOMPLETE'\)/);
  assert.ok(build.indexOf("error.code === 'DE_PUBLICATION_INCOMPLETE'")<build.indexOf("cancellation.signal.aborted ?"));
  assert.match(build,/a release or pointer may already exist/);
  const exec=promisify(execFile);
  for(const args of [['--output','--zbp'],['--output','data/tmp/unused','--output','data/tmp/unused2']])await assert.rejects(exec(process.execPath,['scripts/build-de-business-licenses.mjs',...args],{cwd:APP_ROOT}),error=>error.code===1 && /requires a value|only be supplied once/.test(error.stderr));
  const result=await exec(process.execPath,['scripts/build-de-business-licenses.mjs','--help'],{cwd:APP_ROOT});assert.match(result.stdout,/resume-staging-run/);
});

test('Delaware real CLI refuses a low-heap process before baseline or network acquisition',async()=>{
  const root=await mkdtemp(path.join(APP_ROOT,'data/tmp/de-cli-resource-'));
  const output=path.join(root,'output');
  const exec=promisify(execFile);
  await assert.rejects(exec(process.execPath,['--max-old-space-size=128','--import','./runner/fixtures/de-cli-stalled-fetch.mjs','scripts/build-de-business-licenses.mjs','--output',output,'--zbp',path.join(root,'missing.json')],{cwd:APP_ROOT,timeout:5000,windowsHide:true}),error=>error.code===1 && /resource prerequisite failed/.test(error.stderr));
  assert.deepEqual(await readdir(output),[]);
});
