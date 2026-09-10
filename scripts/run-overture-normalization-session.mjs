import path from 'node:path';
import { createCliCancellation } from '../runner/cli-cancellation.mjs';
import { runOvertureNormalizationSession } from '../runner/overture-normalization-session.mjs';

const args = process.argv.slice(2);
const flags = ['--output', '--operation-id', '--acquisition-operation-id', '--acquisition-receipt-sha256', '--baseline-manifest', '--baseline-sha256'];
if (args.length === 1 && args[0] === '--help') {
  console.log('Usage: node scripts/run-overture-normalization-session.mjs ' + flags.map(flag => `${flag} VALUE`).join(' ') + '\nLocal retained-input normalization only. No downloads, automatic retries or promotion.');
} else {
  let options;
  try {
    if (args.length !== flags.length * 2) throw Error();
    const fields = new Map();
    for (let i = 0; i < args.length; i += 2) {
      if (!flags.includes(args[i]) || fields.has(args[i]) || !args[i + 1] || args[i + 1].startsWith('--')) throw Error();
      fields.set(args[i], args[i + 1]);
    }
    const baseline = fields.get('--baseline-manifest');
    if (baseline !== path.resolve(baseline)) throw Error();
    options = { output: fields.get('--output'), operationId: fields.get('--operation-id'),
      acquisition: { operationId: fields.get('--acquisition-operation-id'), receiptSha256: fields.get('--acquisition-receipt-sha256') },
      baseline: { manifest: baseline, sha256: fields.get('--baseline-sha256') } };
  } catch { console.error('Invalid retained Overture normalization arguments.'); process.exitCode = 1; }
  if (options) {
    const cancellation = createCliCancellation();
    try { console.log(JSON.stringify(await runOvertureNormalizationSession({ ...options, signal: cancellation.signal }))); }
    catch (error) {
      if (error?.recovery) console.log(JSON.stringify({ recovery: error.recovery }));
      console.error('Retained Overture normalization did not complete; preserve operation outputs for inspection.'); process.exitCode = 1;
    } finally { cancellation.dispose(); }
  }
}
