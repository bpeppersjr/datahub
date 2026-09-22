import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { APP_ROOT } from "./paths.mjs";
import { publishOrBusinessRegistryStaging, verifyOrBusinessRegistry } from "./or-business-registry.mjs";
import { publishIllinoisBusinessRegistryStaging, verifyIllinoisBusinessRegistry } from "./il-business-registry.mjs";
import { publishWaLniActiveContractorStaging, verifyWaLniActiveContractors } from "./wa-lni-active-contractor-licenses.mjs";

const sources=[
  {slug:"or-business-registry",label:"Oregon",publish:publishOrBusinessRegistryStaging,verify:verifyOrBusinessRegistry},
  {slug:"il-business-registry",label:"Illinois",publish:publishIllinoisBusinessRegistryStaging,verify:verifyIllinoisBusinessRegistry},
  {slug:"wa-lni-active-contractor-licenses",label:"Washington L&I",publish:publishWaLniActiveContractorStaging,verify:verifyWaLniActiveContractors},
];

async function cancelledChild(script,args){
  const child=spawn(process.execPath,["--import","./runner/fixtures/business-registry-cli-stalled-read.mjs",script,...args],{cwd:APP_ROOT,windowsHide:true,stdio:["ignore","pipe","pipe","ipc"]});
  let output="",started=0,timedOut=false;child.stdout.on("data",chunk=>{output+=chunk;});child.stderr.on("data",chunk=>{output+=chunk;});
  child.on("message",message=>{if(message.type==="fixture-read-started"){started++;child.send({type:"cancel"});}});
  const deadline=setTimeout(()=>{timedOut=true;child.kill();},10000);let status;
  try{status=await new Promise((resolve,reject)=>{child.once("error",reject);child.once("exit",resolve);});}finally{clearTimeout(deadline);}
  return {output,started,timedOut,status};
}

for(const source of sources){
  test(`${source.label} verification CLI drains a stalled read on IPC cancellation`,async()=>{
    const result=await cancelledChild(`scripts/verify-${source.slug}.mjs`,["data/tmp/not-read.json"]);
    assert.equal(result.timedOut,false,result.output);assert.equal(result.started,1,result.output);assert.equal(result.status,1,result.output);assert.match(result.output,/verification cancelled/i);
  });

  test(`${source.label} staged resume cancellation preserves the prior pointer and staging ownership`,async t=>{
    const root=await mkdtemp(path.join(APP_ROOT,"data/tmp/staged-resume-cancel-"));t.after(()=>rm(root,{recursive:true,force:true}));
    const outputRoot=path.join(root,"output"),runId="00000000-0000-4000-8000-000000000000";await mkdir(path.join(outputRoot,".staging",runId),{recursive:true});
    await writeFile(path.join(outputRoot,"current.json"),"prior publication sentinel");
    const result=await cancelledChild(`scripts/build-${source.slug}.mjs`,["--output",outputRoot,"--resume-staging-run",runId]);
    assert.equal(result.timedOut,false,result.output);assert.equal(result.started,1,result.output);assert.equal(result.status,1,result.output);assert.match(result.output,/build cancelled/i);
    assert.equal(await readFile(path.join(outputRoot,"current.json"),"utf8"),"prior publication sentinel");
    assert.equal((await readFile(path.join(outputRoot,".staging",runId,"manifest.json"),"utf8").catch(error=>error.code)),"ENOENT");
  });

  test(`${source.label} runner entry points reject pre-cancelled verification and staged publication`,async()=>{
    const signal=AbortSignal.abort();await assert.rejects(source.verify("unused",{signal}),{name:"AbortError"});
    await assert.rejects(source.publish({outputRoot:"unused",stagingRunId:"00000000-0000-4000-8000-000000000000",signal}),{name:"AbortError"});
  });
}
