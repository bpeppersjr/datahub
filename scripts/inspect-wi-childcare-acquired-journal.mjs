import { inspectWiChildcareAcquiredJournal } from '../runner/wi-childcare-acquired-journal.mjs';
import { createCliCancellation } from '../runner/cli-cancellation.mjs';
const args = process.argv.slice(2), cancellation = createCliCancellation();
try {
  if (args.length === 1 && args[0] === '--help') console.log('Offline Wisconsin injected journal inspection: --receipt ABSOLUTE_PATH. No acquisition, resume, retry or promotion.');
  else if (args.length === 2 && args[0] === '--receipt') console.log(JSON.stringify(await inspectWiChildcareAcquiredJournal(args[1], { signal: cancellation.signal })));
  else throw Error('Invalid arguments.');
} catch { console.error('Wisconsin journal requires inspection; preserve evidence. No source request or retry was made.'); process.exitCode = 1; }
finally { cancellation.dispose(); }
