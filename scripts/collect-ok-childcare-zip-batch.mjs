import { createOkZipBatchPlan, runOkZipBatch, inspectOkZipBatch } from '../runner/ok-childcare-zip-batch.mjs';
import { createCliCancellation } from '../runner/cli-cancellation.mjs';

const args = process.argv.slice(2);
const usage = 'Usage: node scripts/collect-ok-childcare-zip-batch.mjs plan | inspect --output ABSOLUTE_PATH | run --output ABSOLUTE_PATH --approved-scope-sha256 SHA256\nPlan and inspect are offline. Run acquires the entire pinned material Oklahoma center-only scope, reusing linked 73102 evidence. Do not run without explicit scope approval.';
if (args.length === 1 && args[0] === '--help') console.log(usage);
else {
  const cancellation = createCliCancellation();
  try {
    if (args.length === 1 && args[0] === 'plan') console.log(JSON.stringify(await createOkZipBatchPlan({ signal: cancellation.signal }), null, 2));
    else if (args.length === 3 && args[0] === 'inspect' && args[1] === '--output') {
      const state = await inspectOkZipBatch(args[2], { signal: cancellation.signal });
      console.log(JSON.stringify({ status: state.status, completed_queries: state.completed.length, pending_queries: state.pending_zip5.length, reused_queries: state.reused.length }));
    } else if (args.length === 5 && args[0] === 'run' && args[1] === '--output' && args[3] === '--approved-scope-sha256') {
      console.log(JSON.stringify(await runOkZipBatch({ outputRoot: args[2], approvedScopeSha256: args[4], signal: cancellation.signal })));
    } else throw Error(usage);
  } catch { console.error('Oklahoma ZIP batch did not complete. Check arguments, pinned evidence, retained query intents and source exclusions before retrying.'); process.exitCode = 1; }
  finally { cancellation.dispose(); }
}
