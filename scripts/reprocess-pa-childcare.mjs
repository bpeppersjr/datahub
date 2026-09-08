#!/usr/bin/env node
import path from 'node:path';
import { createCliCancellation } from '../runner/cli-cancellation.mjs';
const cancellation=createCliCancellation();
try{
  const args=process.argv.slice(2),values=new Map();
  for(let i=0;i<args.length;i+=2){const key=args[i],value=args[i+1];if(!['--acquired','--output','--verify'].includes(key)||values.has(key)||typeof value!=='string'||!path.isAbsolute(value)||value!==path.resolve(value))throw Error('Invalid input');values.set(key,value);}
  if(values.has('--verify')?(values.size!==1):(!values.has('--acquired')||values.size>2))throw Error('Invalid mode');
  cancellation.signal.throwIfAborted();const {buildPaChildcareNormalizedRelease,readPaChildcareNormalizedRelease}=await import('../runner/pa-childcare-normalized-release.mjs');
  const result=values.has('--verify')?(await readPaChildcareNormalizedRelease(values.get('--verify'),{signal:cancellation.signal})).verification:await buildPaChildcareNormalizedRelease(values.get('--acquired'),{signal:cancellation.signal,...(values.has('--output')?{outputRoot:values.get('--output')}:{})});
  process.stdout.write(JSON.stringify(result)+'\n');
}catch{process.stderr.write('Pennsylvania local reprocessing did not finalize cleanly. Preserve and inspect retained evidence; output may exist and no source acquisition was performed.\n');process.exitCode=1;}
finally{cancellation.dispose();}
