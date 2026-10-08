#!/usr/bin/env node
import { createCliCancellation } from '../runner/cli-cancellation.mjs';
import { preflightScChildcareInterface, writeScChildcareInterfaceReceipt } from '../runner/sc-childcare-interface-assessment.mjs';
const cancellation = createCliCancellation();
try {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') process.stdout.write('Usage: node scripts/preflight-sc-childcare-interface.mjs\nTwo fixed public GETs; assess static interface only. No search, all-results, Excel export or provider requests.\n');
  else {
    if (args.length) throw new Error('Unsupported arguments.');
    const receipt = await preflightScChildcareInterface({ signal: cancellation.signal });
    const saved = await writeScChildcareInterfaceReceipt(receipt, { signal: cancellation.signal });
    process.stdout.write(JSON.stringify({ ...saved, status: receipt.status, unresolved_gates: receipt.unresolved_gates, claims: receipt.claims }) + '\n');
  }
} catch (error) { process.stderr.write(`${error?.code ?? 'SC_CHILDCARE_INTERFACE_FAILED'}: SC static interface requires inspection; manual export contract remains unverified.\n`); process.exitCode = 1; }
finally { cancellation.dispose(); }
