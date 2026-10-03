#!/usr/bin/env node
import process from "node:process";
import { verifyZipDenominatorAdmissionReadiness } from "../runner/zip-denominator-admission-readiness.mjs";
if (process.argv.length !== 3) { process.stderr.write("Usage: node scripts/verify-zip-denominator-admission-readiness.mjs <manifest.json>\n"); process.exitCode = 1; }
else try { const result = await verifyZipDenominatorAdmissionReadiness(process.argv[2]); process.stdout.write(`${JSON.stringify({ release_id: result.manifest.release_id, manifest_sha256: result.manifest_sha256, readiness_sha256: result.readiness_sha256, retained_zip_rows: result.readiness.retained_zip_evidence.rows, authoritative_current_usps_zip_denominator: null, valid: true }, null, 2)}\n`); }
catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
