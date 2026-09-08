#!/usr/bin/env node
import { captureMnConstructionNotices, writeMnConstructionNotices } from '../runner/mn-construction-notices.mjs';
import { createCliCancellation } from '../runner/cli-cancellation.mjs';
import { relativeToApp } from '../runner/paths.mjs';
const cancellation=createCliCancellation();
try{
  if(process.argv.length!==2)throw new Error('No arguments supported; only two fixed publisher notice pages are requested.');
  const receipt=await captureMnConstructionNotices({signal:cancellation.signal});const saved=await writeMnConstructionNotices(receipt,{signal:cancellation.signal});
  process.stdout.write(JSON.stringify({...saved,path:relativeToApp(saved.path),observations:receipt.observations.map(({url,observed_at,body_bytes,body_sha256,article_sha256})=>({url,observed_at,body_bytes,body_sha256,article_sha256})),source_records_requested:0},null,2)+'\n');
}catch{process.stderr.write('Minnesota notice prerequisite failed; no acquisition was authorized.\n');process.exitCode=1;}
finally{cancellation.dispose();}
