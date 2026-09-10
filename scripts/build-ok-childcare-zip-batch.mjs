import { runOkBatchApp } from '../runner/ok-childcare-zip-batch-app.mjs';
import { createCliCancellation } from '../runner/cli-cancellation.mjs';

const args = process.argv.slice(2);
if (args.length === 1 && args[0] === '--help') console.log('Co*Tive industry worker: --output ABSOLUTE_APP_OPERATION_OUTPUT. Requires explicit source selection, app run identity and matching stored approval; never approves itself.');
else {
  const cancellation = createCliCancellation();
  try {
    if (args.length !== 2 || args[0] !== '--output') throw Error();
    const result = await runOkBatchApp({ outputRoot: args[1], industryRunId: process.env.INDUSTRY_SEGMENT_RUN_ID, signal: cancellation.signal });
    console.log(JSON.stringify(result));
  } catch { console.error('Oklahoma batch not started or incomplete: explicit scope approval and retained-output inspection are required. No automatic retry.'); process.exitCode = 1; }
  finally { cancellation.dispose(); }
}
