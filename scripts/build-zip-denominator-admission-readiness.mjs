#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import { APP_ROOT } from "../runner/paths.mjs";
import { buildZipDenominatorAdmissionReadiness } from "../runner/zip-denominator-admission-readiness.mjs";
const args = process.argv.slice(2); let outputRoot;
if (args.length) { if (args.length !== 2 || args[0] !== "--output" || !args[1] || args[1].startsWith("--")) throw new Error("Usage: node scripts/build-zip-denominator-admission-readiness.mjs [--output <data path>]"); outputRoot = args[1]; }
try { const result = await buildZipDenominatorAdmissionReadiness({ outputRoot: outputRoot ? path.resolve(APP_ROOT, outputRoot) : undefined }); process.stdout.write(`${JSON.stringify({ release_id: result.manifest.release_id, manifest: result.manifest_path, manifest_sha256: result.manifest_sha256, readiness_sha256: result.readiness_sha256, valid: true }, null, 2)}\n`); }
catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
