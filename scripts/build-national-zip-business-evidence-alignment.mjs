#!/usr/bin/env node
import process from "node:process";
import { publishNationalZipBusinessEvidenceAlignment, verifyNationalZipBusinessEvidenceAlignment } from "../runner/national-zip-business-evidence-alignment.mjs";

try {
  if (process.argv.includes("--help")) process.stdout.write("Build and verify a local immutable ZIP/business evidence alignment from explicitly enrolled retained artifacts. No downloads or production pointer changes.\n");
  else {
    const result = await publishNationalZipBusinessEvidenceAlignment();
    const verified = await verifyNationalZipBusinessEvidenceAlignment(`${result.directory}/manifest.json`);
    process.stdout.write(`${JSON.stringify(verified, null, 2)}\n`);
  }
} catch (error) {
  process.stderr.write(`ZIP/business evidence alignment failed: ${error.message}\n`); process.exitCode = 1;
}
