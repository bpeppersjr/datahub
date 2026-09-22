#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import { verifyCityStateAdmission } from "../runner/usps-city-state-admission.mjs";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";
try { process.stdout.write(`${JSON.stringify(await verifyCityStateAdmission(assertInsideApp(path.resolve(APP_ROOT, process.argv[2] ?? ""))), null, 2)}\n`); }
catch (error) { process.stderr.write(`USPS City State verification failed: ${error.message}\n`); process.exitCode = 1; }
