import path from 'node:path';
import { APP_ROOT } from '../runner/paths.mjs';
import { createCliCancellation } from '../runner/cli-cancellation.mjs';
import { summarizeMnConstructionAppJob } from '../runner/mn-construction-reporting.mjs';
const cancellation=createCliCancellation();
try{
  const args=process.argv.slice(2);
  if(args.length===1 && args[0]==='--help')process.stdout.write('Usage: node scripts/summarize-mn-construction.mjs --receipt <app receipt>\nOffline credential/state/ZIP summary; no source requests.\n');
  else{if(args.length!==2 || args[0]!=='--receipt' || !args[1] || args[1].startsWith('--'))throw Error('Invalid arguments.');
    process.stdout.write(JSON.stringify(await summarizeMnConstructionAppJob(path.resolve(APP_ROOT,args[1]),{signal:cancellation.signal}),null,2)+'\n');}
}catch{process.stderr.write('Minnesota reporting summary failed; no source requests or data promotion performed.\n');process.exitCode=1;}
finally{cancellation.dispose();}
