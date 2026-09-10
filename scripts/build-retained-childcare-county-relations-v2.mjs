import { buildRetainedCountyRelationsV2, inspectRetainedCountyRelationsV2 } from '../runner/retained-childcare-county-relations-v2.mjs';
import { createCliCancellation } from '../runner/cli-cancellation.mjs';
const args = process.argv.slice(2), cancellation = createCliCancellation();
try {
  if (args.length === 1 && args[0] === '--help') console.log('Offline PA/MD county successor: --run | inspect --manifest ABSOLUTE_PATH. Fixed retained inputs only; no acquisition, inferred ZIP, promotion or verified-business claim.');
  else if (args.length === 1 && args[0] === '--run') console.log(JSON.stringify(await buildRetainedCountyRelationsV2({ signal: cancellation.signal })));
  else if (args.length === 3 && args[0] === 'inspect' && args[1] === '--manifest') console.log(JSON.stringify(await inspectRetainedCountyRelationsV2(args[2], { signal: cancellation.signal })));
  else throw Error('Invalid arguments.');
} catch (error) {
  if (error.recovery) console.error(JSON.stringify(error.recovery));
  console.error('Retained county successor requires inspection; preserve existing evidence. No source retry or production promotion was attempted.'); process.exitCode = 1;
} finally { cancellation.dispose(); }
