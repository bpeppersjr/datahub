#!/usr/bin/env node
import { createCliCancellation } from '../runner/cli-cancellation.mjs';
import { resolveAppPath } from '../runner/paths.mjs';
import { buildMnConstructionCredentialRelease, verifyMnConstructionCredentialRelease } from '../runner/mn-construction-credential-release.mjs';

const cancellation=createCliCancellation();
try{
  const args=process.argv.slice(2);
  if(args.length===1 && args[0]==='--help')process.stdout.write('Usage: node scripts/build-mn-credential-reporting.mjs --receipt <retained app receipt> [--output <datahub folder>]\nOr: --verify <report manifest>\nOffline local-review credential reporting only; no downloads or national publication.\n');
  else{
    const values=new Map();
    for(let i=0;i<args.length;i+=2){const key=args[i],value=args[i+1];if(!['--receipt','--output','--verify'].includes(key)||values.has(key)||!value?.trim()||value.startsWith('--'))throw Error('Invalid options');values.set(key,value);}
    let result;
    if(values.has('--verify')){if(values.size!==1)throw Error('Invalid options');result=await verifyMnConstructionCredentialRelease(resolveAppPath(values.get('--verify')),{signal:cancellation.signal});}
    else{if(!values.has('--receipt'))throw Error('Missing receipt');result=await buildMnConstructionCredentialRelease(resolveAppPath(values.get('--receipt')),{signal:cancellation.signal,...(values.has('--output')?{outputRoot:resolveAppPath(values.get('--output'))}:{})});}
    process.stdout.write(JSON.stringify({manifest_path:result.manifest_path,manifest_sha256:result.manifest_sha256,release_id:result.manifest.release_id,credential_rows:result.manifest.artifacts[0].records,national_reporting_integrated:false})+'\n');
  }
}catch{process.stderr.write('Credential reporting did not finalize cleanly. Preserve retained source and output evidence for inspection before retry.\n');process.exitCode=1;}
finally{cancellation.dispose();}
