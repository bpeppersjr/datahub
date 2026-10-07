#!/usr/bin/env node
import { createCliCancellation } from '../runner/cli-cancellation.mjs';
import { readRegisteredPaChildcareOdataMetadata } from '../runner/pa-childcare-odata-metadata.mjs';
const cancellation = createCliCancellation();
try {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') process.stdout.write('Usage: node scripts/verify-pa-childcare-odata-metadata.mjs\nOffline verification of the registered PA OData metadata receipt; no requests or writes.\n');
  else {
    if (args.length) throw new Error('Unsupported arguments.');
    const result = await readRegisteredPaChildcareOdataMetadata({ signal: cancellation.signal });
    process.stdout.write(JSON.stringify({ verified: result.verified, receipt_path: result.receipt_path, receipt_bytes: result.receipt_bytes, receipt_sha256: result.receipt_sha256, status: result.receipt.status, claims: result.receipt.claims }) + '\n');
  }
} catch { process.stderr.write('PA_ODATA_METADATA_VERIFICATION_FAILED: inspect registered receipt path, hash, byte count and schema; no requests or writes performed.\n'); process.exitCode = 1; }
finally { cancellation.dispose(); }
