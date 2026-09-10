import { buildRetainedCountyRelations, inspectRetainedCountyRelations } from '../runner/retained-childcare-county-relations.mjs';
import { createCliCancellation } from '../runner/cli-cancellation.mjs';
const args = process.argv.slice(2), cancellation = createCliCancellation();
try {
  if (args.length === 1 && args[0] === '--help') console.log('Offline county relationships: --run | inspect --manifest ABSOLUTE_PATH. Uses pinned retained registry and Census polygons. No acquisition, promotion or verified-business claim.');
  else if (args.length === 1 && args[0] === '--run') console.log(JSON.stringify(await buildRetainedCountyRelations({ signal: cancellation.signal })));
  else if (args.length === 3 && args[0] === 'inspect' && args[1] === '--manifest') console.log(JSON.stringify(await inspectRetainedCountyRelations(args[2], { signal: cancellation.signal })));
  else throw Error('Invalid arguments.');
} catch { console.error('Retained county relationships require inspection; no source retry or production promotion was attempted.'); process.exitCode = 1;
} finally { cancellation.dispose(); }
