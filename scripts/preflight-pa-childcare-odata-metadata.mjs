#!/usr/bin/env node
import { createCliCancellation } from '../runner/cli-cancellation.mjs';
import { preflightPaChildcareOdataMetadata, writePaChildcareOdataMetadataReceipt } from '../runner/pa-childcare-odata-metadata.mjs';
const cancellation = createCliCancellation();
try {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') process.stdout.write('Usage: node scripts/preflight-pa-childcare-odata-metadata.mjs\nOne bounded CSDL metadata request; entity and pagination requests disabled.\n');
  else {
    if (args.length) throw new Error('Unsupported arguments.');
    const receipt = await preflightPaChildcareOdataMetadata({ signal: cancellation.signal });
    const saved = await writePaChildcareOdataMetadataReceipt(receipt, { signal: cancellation.signal });
    process.stdout.write(JSON.stringify({ ...saved, status: receipt.status, unresolved_gates: receipt.unresolved_gates, claims: receipt.claims }) + '\n');
  }
} catch (error) { process.stderr.write(`${error?.code ?? 'PA_ODATA_METADATA_FAILED'}: PA OData metadata requires inspection; no entity request, refresh, or production admission is authorized.\n`); process.exitCode = 1; }
finally { cancellation.dispose(); }
