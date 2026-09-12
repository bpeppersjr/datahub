import path from 'node:path';
import {createCliCancellation} from '../runner/cli-cancellation.mjs';
import {buildRetainedChildcareCohortSnapshot,readRetainedChildcareCohortSnapshot} from '../runner/retained-childcare-cohort-snapshot.mjs';
const cancellation=createCliCancellation();
let committedDescriptor;
try{
  const args=process.argv.slice(2);
  if(args.length===1&&args[0]==='--help')console.log('Usage: node scripts/build-retained-childcare-cohort-snapshot.mjs [--output ABSOLUTE_DIRECTORY] [--operation-id ID] [--retained-samples true]. Offline snapshot; no downloads or national promotion.');
  else{
    if(args.length%2||args.length>6)throw Error('Invalid arguments');
    const selected=new Map();
    for(let i=0;i<args.length;i+=2){if(!['--output','--operation-id','--retained-samples'].includes(args[i])||selected.has(args[i]))throw Error('Invalid arguments');selected.set(args[i],args[i+1]);}
    if(selected.has('--retained-samples')&&selected.get('--retained-samples')!=='true')throw Error('Invalid retained samples option');
    const outputRoot=selected.get('--output'),operationId=selected.get('--operation-id');
    if(outputRoot!==undefined&&(!path.isAbsolute(outputRoot)||outputRoot!==path.resolve(outputRoot)))throw Error('Invalid output');
    if(operationId!==undefined&&!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(operationId))throw Error('Invalid operation');
    if(operationId!==undefined&&process.env.INDUSTRY_SEGMENT_RUN_ID!==undefined&&operationId!==process.env.INDUSTRY_SEGMENT_RUN_ID)throw Error('Conflicting operation');
    const descriptor=await buildRetainedChildcareCohortSnapshot({...(outputRoot!==undefined?{outputRoot}:{}),...(selected.has('--retained-samples')?{includeRetainedSamples:true}:{}),industryRunId:operationId??process.env.INDUSTRY_SEGMENT_RUN_ID??null,signal:cancellation.signal});
    committedDescriptor=descriptor;
    // Published descriptors survive late cancellation so the parent can retain their identity.
    await readRetainedChildcareCohortSnapshot(descriptor.manifest_path,descriptor.manifest_sha256);
    console.log(JSON.stringify(descriptor));
  }
}catch(error){
  const retained=error.code==='RETAINED_CHILDCARE_SNAPSHOT_COMMITTED_REQUIRES_INSPECTION'?error.committed_snapshot:committedDescriptor;
  if(retained)console.log(JSON.stringify({status:'COMMITTED_REQUIRES_INSPECTION',committed_snapshot:retained,committed_snapshot_integrity_verification_required:true}));
  console.error('Retained childcare snapshot build failed. Preserve retained evidence and inspect incomplete outputs.');process.exitCode=1;
}
finally{cancellation.dispose();}
