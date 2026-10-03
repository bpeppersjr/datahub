#!/usr/bin/env node
import path from "node:path";import process from "node:process";
import {verifyZctaEconomicModelReadiness} from "../runner/zcta-economic-model-readiness.mjs";
import {APP_ROOT,assertInsideApp} from "../runner/paths.mjs";
function parse(args){
  if(args.length===1&&args[0]==="--help")return {help:true};
  if(args.length===1&&!args[0].startsWith("--"))return {manifest:args[0]};
  if(args.length===2&&args[0]==="--manifest"&&!args[1].startsWith("--"))return {manifest:args[1]};
  throw new Error("Provide exactly one immutable release manifest path, optionally as --manifest PATH; there is intentionally no current pointer.");
}
try{const options=parse(process.argv.slice(2));if(options.help){process.stdout.write("Verify a pointer-free ZCTA economic-model readiness release. Usage: verify-zcta-economic-model-readiness.mjs [--manifest] PATH\n");}else{const result=await verifyZctaEconomicModelReadiness(assertInsideApp(path.resolve(APP_ROOT,options.manifest)));process.stdout.write(`${JSON.stringify(result,null,2)}\n`);}}catch(error){process.stderr.write(`ZCTA economic-model readiness verification failed: ${error.message}\n`);process.exitCode=1;}
