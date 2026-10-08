#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import { createCliCancellation } from "../runner/cli-cancellation.mjs";
import { runMississippiBusinessReportAppJob } from "../runner/mississippi-business-report-app.mjs";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";
const cancellation=createCliCancellation();
try{const args=process.argv.slice(2);if(args.length===1&&args[0]==="--help")process.stdout.write("Usage: node scripts/run-mississippi-business-report-app.mjs --package data/imports/mississippi-business-report/packages/<package-id>\nOffline local-review processing only; no acquisition, pointer, admission, completeness, current-operation, geocode, site, or public-export claim.\n");else{if(args.length!==2||args[0]!=="--package")throw Error("Invalid arguments.");const result=await runMississippiBusinessReportAppJob({packageDirectory:assertInsideApp(path.resolve(APP_ROOT,args[1])),signal:cancellation.signal});process.stdout.write(`${JSON.stringify(result,null,2)}\n`);}}catch{process.stderr.write("Mississippi offline app operation did not finalize cleanly; inspect its durable receipt before retrying.\n");process.exitCode=1;}finally{cancellation.dispose();}
