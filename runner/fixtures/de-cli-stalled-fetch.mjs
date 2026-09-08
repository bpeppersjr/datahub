// Explicit Node --import fixture for the real CLI IPC test. Never opens sockets.
import fs from 'node:fs/promises';
import {syncBuiltinESMExports} from 'node:module';
if(process.env.DE_CLI_CANCEL_FIXTURE==='baseline') {
  const readFile=fs.readFile;
  fs.readFile=async(file,options)=>{
    if(String(file).replaceAll('\\','/').endsWith('/derived/zip-coverage.jsonl')) {
      if(!options?.signal)throw Error('Baseline read lacks cancellation');
      options.signal.throwIfAborted();process.send?.({type:'fixture-baseline-requested'});
      return new Promise((_resolve,reject)=>{
        const pendingIo=setInterval(()=>{},1000); // Models the native pending I/O handle.
        options.signal.addEventListener('abort',()=>{clearInterval(pendingIo);reject(options.signal.reason);},{once:true});
      });
    }
    return readFile(file,options);
  };
  syncBuiltinESMExports();
}
globalThis.fetch=async (_url,{signal})=>{
  signal.throwIfAborted();
  process.send?.({type:'fixture-source-requested'});
  return new Promise(()=>{});
};
