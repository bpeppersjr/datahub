#!/usr/bin/env node
import path from 'node:path';
import {isDeepStrictEqual as same} from 'node:util';
import {createCliCancellation} from '../runner/cli-cancellation.mjs';
import {assertInsideApp} from '../runner/paths.mjs';
import {mnSelectionReadJson as readJson} from '../runner/mn-construction-retained-selection.mjs';

const cancellation=createCliCancellation();
try {
  const args=process.argv.slice(2);
  if(args.length===1&&args[0]==='--help') {
    process.stdout.write('Usage: node scripts/preflight-co-childcare.mjs [--verify <absolute datahub receipt>]\nMetadata and aggregate preflight only; no facility rows or provider-ID inventory. --verify is offline and read-only.\n');
  } else {
    let file;
    if(args.length!==0) {
      if(args.length!==2||args[0]!=='--verify'||!path.isAbsolute(args[1])||args[1]!==path.resolve(args[1]))throw Error('Invalid arguments');
      file=assertInsideApp(args[1]);
    }
    const {acquireCoChildcarePreflight,writeCoChildcarePreflight,validateCoChildcarePreflight,assertCoChildcarePreflightConfiguration}=await import('../runner/co-childcare-preflight.mjs');
    if(file) {
      await assertCoChildcarePreflightConfiguration({signal:cancellation.signal});
      const initial={},receipt=await readJson(file,4_000_000,cancellation.signal,initial);
      validateCoChildcarePreflight(receipt);
      const final={},again=await readJson(file,4_000_000,cancellation.signal,final);
      if(!same(receipt,again)||initial.sha256!==final.sha256||initial.identity.ino!==final.identity.ino||initial.identity.dev!==final.identity.dev||initial.identity.ctimeNs!==final.identity.ctimeNs)throw Error('Changed receipt');
      await assertCoChildcarePreflightConfiguration({signal:cancellation.signal});cancellation.signal.throwIfAborted();
      process.stdout.write(JSON.stringify({status:'verified',path:file,bytes:initial.bytes,sha256:initial.sha256,receipt})+'\n');
    } else {
      const receipt=await acquireCoChildcarePreflight({signal:cancellation.signal});
      process.stdout.write(JSON.stringify(await writeCoChildcarePreflight(receipt,{signal:cancellation.signal}))+'\n');
    }
  }
} catch(error) {
  let code;try{code=Object.getOwnPropertyDescriptor(error??{},'code')?.value;}catch{/* Do not invoke untrusted error accessors. */}
  process.stderr.write(code==='CO_CHILDCARE_PUBLICATION_INCOMPLETE'?'Colorado preflight output may exist; preserve and inspect it before retry.\n':'Colorado preflight or offline verification did not complete; no facility rows were requested.\n');
  process.exitCode=1;
} finally {cancellation.dispose();}
