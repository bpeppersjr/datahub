import path from 'node:path';
import {APP_ROOT} from '../runner/paths.mjs';
import {buildUtChildcareNormalizedRelease, verifyUtChildcareNormalizedRelease} from '../runner/ut-childcare-normalized-release.mjs';
const controller = new AbortController();
process.once('SIGINT', () => controller.abort());
process.once('SIGTERM', () => controller.abort());
process.on('message', message => { if (message?.type === 'cancel') controller.abort(); });
try {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') {
    console.log('Usage: node scripts/build-ut-childcare-retained.mjs [--verify MANIFEST]. Replays retained source locally; never downloads.');
  } else {
    if (args.length !== 0 && !(args.length === 2 && args[0] === '--verify')) throw Error('arguments');
    const result = args.length ? await verifyUtChildcareNormalizedRelease(path.resolve(APP_ROOT, args[1]), {signal: controller.signal})
      : await buildUtChildcareNormalizedRelease({signal: controller.signal});
    console.log(JSON.stringify({status: result.status, manifest: path.relative(APP_ROOT, result.manifest_path).replaceAll('\\', '/'),
      sha256: result.manifest_sha256, run_id: result.run_id, summary: result.summary, claims: result.claims}));
  }
} catch {
  console.error(controller.signal.aborted ? 'Utah retained normalization cancelled; inspect any committed manifest before retrying.'
    : 'Utah retained normalization failed; inspect retained evidence and runtime prerequisites. No source refetch was attempted.');
  process.exitCode = 1;
} finally { if (process.connected) process.disconnect(); }
