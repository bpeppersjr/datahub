#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import { verifyMississippiBusinessReportAppJob } from "../runner/mississippi-business-report-app.mjs";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";
try{const args=process.argv.slice(2);if(args.length===1&&args[0]==="--help")process.stdout.write("Usage: node scripts/verify-mississippi-business-report-app.mjs --receipt data/imports/mississippi-business-report/operations/<operation-id>/receipt.json\n");else{if(args.length!==2||args[0]!=="--receipt")throw Error("Invalid arguments.");process.stdout.write(`${JSON.stringify(await verifyMississippiBusinessReportAppJob(assertInsideApp(path.resolve(APP_ROOT,args[1]))),null,2)}\n`);}}catch{process.stderr.write("Mississippi offline app receipt verification failed.\n");process.exitCode=1;}
