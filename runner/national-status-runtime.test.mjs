import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import pin from '../config/national-status-contract.json' with {type:'json'};
import { APP_ROOT } from './paths.mjs';

test('actual runtime enforces bearer/origin/query/method boundaries and serves bounded National Status',async()=>{
  const root=await fs.mkdtemp(path.join(APP_ROOT,'data','.test-national-status-runtime-'));
  const probe=net.createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');const port=probe.address().port;await new Promise(done=>probe.close(done));
  const token=randomBytes(32).toString('hex');let child;
  try{
    const file=path.join(root,'config/datasets/national-goal-evidence-federation.json');await fs.mkdir(path.dirname(file),{recursive:true});await fs.copyFile(path.join(APP_ROOT,'config/datasets/national-goal-evidence-federation.json'),file);await fs.cp(path.dirname(path.join(APP_ROOT,pin.manifest)),path.dirname(path.join(root,pin.manifest)),{recursive:true});
    const q=pin.geography_relationship_quality,qr=path.join(root,q.registration_path),qm=path.join(root,q.manifest_path);await fs.mkdir(path.dirname(qr),{recursive:true});await fs.copyFile(path.join(APP_ROOT,q.registration_path),qr);await fs.mkdir(path.dirname(qm),{recursive:true});await fs.copyFile(path.join(APP_ROOT,q.manifest_path),qm);
    const sp=pin.source_policy_provenance,pr=pin.publisher_membership_reconciliation;
    for(const relative of [sp.registration_path,sp.manifest_path,pr.registration_path,pr.la_manifest_path]){const target=path.join(root,relative);await fs.mkdir(path.dirname(target),{recursive:true});await fs.copyFile(path.join(APP_ROOT,relative),target)}
    child=spawn(process.execPath,['runner/server.mjs'],{cwd:APP_ROOT,env:{...process.env,DATAHUB_ROOT:root,RUNNER_HOST:'127.0.0.1',RUNNER_PORT:String(port),DATAHUB_CONTROL_TOKEN:token},stdio:['ignore','ignore','ignore','ipc'],windowsHide:true});
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Runtime readiness timeout.')),20000);child.once('exit',code=>{clearTimeout(timer);reject(Error(`Runtime exited ${code}.`))});child.on('message',message=>{if(message?.type==='runner-ready'){clearTimeout(timer);resolve()}})});
    const base=`http://127.0.0.1:${port}/api/business-map/national-status-`,headers={Authorization:`Bearer ${token}`};
    for(const route of ['summary','state?state=DC','zip?zip=00000']){
      assert.equal((await fetch(base+route)).status,401);const response=await fetch(base+route,{headers});assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');const body=await response.text();assert.ok(Buffer.byteLength(body)<128000);assert.equal(JSON.parse(body).schema_version,'national-status-view@1.0.0');
    }
    for(const route of ['summary?state=NJ','state?state=PR','state?state=NJ&state=NJ','zip?zip=10001-1234'])assert.equal((await fetch(base+route,{headers})).status,400);
    assert.equal((await fetch(base+'summary',{method:'POST',headers})).status,405);
    assert.equal((await fetch(base+'summary',{headers:{...headers,Origin:'https://untrusted.example'}})).status,403);
    assert.equal((await fetch(base+'summary',{method:'OPTIONS',headers:{Origin:'http://127.0.0.1:3000','Access-Control-Request-Method':'GET','Access-Control-Request-Headers':'authorization'}})).status,204);
    assert.equal((await fetch(base+'summary',{method:'OPTIONS'})).status,400);
    await fs.appendFile(path.join(root,pin.manifest),' ');const failed=await fetch(base+'summary',{headers});assert.equal(failed.status,503);assert.doesNotMatch(await failed.text(),/test-national|manifest.json|[a-f0-9]{64}/);
  }finally{
    if(child?.exitCode===null){const exit=once(child,'exit');child.send('shutdown');const timer=setTimeout(()=>child.kill(),10000);await exit;clearTimeout(timer)}
    assert.ok(path.resolve(root).startsWith(path.join(APP_ROOT,'data')+path.sep));await fs.rm(root,{recursive:true,force:true});
  }
});
