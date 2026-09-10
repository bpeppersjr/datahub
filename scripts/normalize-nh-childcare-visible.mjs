import { buildNhVisibleNormalization, inspectNhVisibleNormalization } from '../runner/nh-childcare-visible-normalization.mjs';
import { createCliCancellation } from '../runner/cli-cancellation.mjs';
const args = process.argv.slice(2);
const usage = 'Usage: node scripts/normalize-nh-childcare-visible.mjs --run | inspect --manifest ABSOLUTE_PATH\nOffline only. Reuses the pinned retained ZIP 03755 manifest; no source requests, schedule or production promotion.';
if (args.length === 1 && args[0] === '--help') console.log(usage);
else {
  const cancellation = createCliCancellation();
  try {
    if (args.length === 1 && args[0] === '--run') console.log(JSON.stringify(await buildNhVisibleNormalization({ signal: cancellation.signal })));
    else if (args.length === 3 && args[0] === 'inspect' && args[1] === '--manifest') console.log(JSON.stringify(await inspectNhVisibleNormalization(args[2], { signal: cancellation.signal })));
    else throw Error(usage);
  } catch { console.error('New Hampshire offline normalization did not complete. Inspect retained source and run artifacts; no source retry was attempted.'); process.exitCode = 1;
  } finally { cancellation.dispose(); }
}
