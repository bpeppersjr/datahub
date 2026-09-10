import { runWiChildcareAppJob, verifyWiChildcareAppJob } from '../runner/wi-childcare-app.mjs';
import { createCliCancellation } from '../runner/cli-cancellation.mjs';
const args = process.argv.slice(2), cancellation = createCliCancellation();
try {
  if (args.length === 1 && args[0] === '--help') console.log('Wisconsin offline app: --retained-journal ABSOLUTE_RECEIPT [--output ABSOLUTE_ROOT] | --verify ABSOLUTE_RECEIPT. Native acquisition is disabled; no automatic retry or resume.');
  else if (args.length === 2 && args[0] === '--verify') console.log(JSON.stringify(await verifyWiChildcareAppJob(args[1], { signal: cancellation.signal })));
  else if ([2, 4].includes(args.length) && args[0] === '--retained-journal' && (args.length === 2 || args[2] === '--output')) console.log(JSON.stringify(await runWiChildcareAppJob({ retainedJournalReceipt: args[1], signal: cancellation.signal, ...(args.length === 4 ? { outputRoot: args[3] } : {}) })));
  else throw Error('Invalid or disabled action.');
} catch (error) {
  console.error('Wisconsin app did not complete. No automatic retry was made; preserve retained evidence.');
  if (error?.recovery) console.error(JSON.stringify(error.recovery));
  process.exitCode = 1;
} finally { cancellation.dispose(); }
