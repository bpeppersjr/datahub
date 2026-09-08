#!/usr/bin/env node
import { verifyMnConstructionAcquisitionReceipt } from '../runner/mn-construction-acquisition-receipt.mjs';
import { createCliCancellation } from '../runner/cli-cancellation.mjs';
import { resolveAppPath, relativeToApp } from '../runner/paths.mjs';
const cancellation = createCliCancellation();
try {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--receipt' || !args[1]) throw new Error('Exact receipt argument required.');
  const result = await verifyMnConstructionAcquisitionReceipt(resolveAppPath(args[1]), { signal: cancellation.signal });
  const summary = { ...result }; delete summary.receipt;
  process.stdout.write(JSON.stringify({ ...summary, receipt_path: relativeToApp(result.receipt_path) }, null, 2) + '\n');
} catch { process.stderr.write('Minnesota acquisition receipt verification failed; no network request or acquisition was performed.\n'); process.exitCode = 1; }
finally { cancellation.dispose(); }
