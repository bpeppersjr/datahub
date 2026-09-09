import path from 'node:path';
import {APP_ROOT} from '../runner/paths.mjs';
import {runUtChildcareAppJob, verifyUtChildcareAppJob} from '../runner/ut-childcare-app.mjs';
const cancellation = new AbortController();
process.once('SIGINT', () => cancellation.abort());
process.once('SIGTERM', () => cancellation.abort());
process.once('disconnect', () => cancellation.abort());
process.on('message', message => { if (message?.type === 'cancel') cancellation.abort(); });
try {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') console.log('Usage: node scripts/build-ut-childcare-app.mjs [--output DATAHUB_FOLDER | --verify RECEIPT]. Offline adoption of pinned retained Utah evidence; no downloads or rebuild.');
  else {
    if (args.length !== 0 && !(args.length === 2 && ['--output', '--verify'].includes(args[0]) && args[1] && !args[1].startsWith('--'))) throw Error('Arguments');
    let result = args[0] === '--verify' ? await verifyUtChildcareAppJob(path.resolve(APP_ROOT, args[1]), {signal: cancellation.signal})
      : await runUtChildcareAppJob({outputRoot: args.length ? path.resolve(APP_ROOT, args[1]) : undefined,
        signal: cancellation.signal, industryRunId: process.env.INDUSTRY_SEGMENT_RUN_ID});
    if (args[0] !== '--verify') result = await verifyUtChildcareAppJob(result.receiptPath, {signal: cancellation.signal});
    console.log(JSON.stringify({status: result.receipt.status, receiptPath: result.receiptPath, receipt_sha256: result.receipt_sha256,
      run_id: result.receipt.run_id, summary: result.receipt.normalized.summary, claims: result.receipt.claims}));
  }
} catch { console.error('Utah app job did not complete; inspect retained evidence and runtime prerequisites. No source refetch was attempted.'); process.exitCode = 1; }
finally { if (process.connected) process.disconnect(); }
