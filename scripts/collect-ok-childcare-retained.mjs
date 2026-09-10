import { buildOkRetainedSearch, validateOkRetainedOutput } from '../runner/ok-childcare-retained-bundle.mjs';
import { createCliCancellation } from '../runner/cli-cancellation.mjs';

const args = process.argv.slice(2);
if (args.length === 1 && args[0] === '--help') {
  console.log('Usage: node scripts/collect-ok-childcare-retained.mjs --output ABSOLUTE_OPERATION_OUTPUT --operation-id UUID\nFixed Oklahoma center-only ZIP73102 retained internal collection. Three serial requests, no retry, no statewide coverage or active-business claim.');
} else {
  let input;
  try {
    if (args.length !== 4) throw Error();
    const values = new Map();
    for (let i = 0; i < args.length; i += 2) {
      if (!['--output', '--operation-id'].includes(args[i]) || values.has(args[i]) || !args[i + 1]) throw Error();
      values.set(args[i], args[i + 1]);
    }
    input = { output: values.get('--output'), operationId: values.get('--operation-id') };
    validateOkRetainedOutput(input.output, input.operationId);
  } catch { console.error('Invalid fixed Oklahoma collection arguments.'); process.exitCode = 1; }
  if (process.exitCode !== 1) {
    const cancellation = createCliCancellation();
    try {
      const descriptor = await buildOkRetainedSearch({ ...input, signal: cancellation.signal });
      console.log(JSON.stringify(descriptor));
      if (descriptor.status !== 'accepted-internal-source-candidates' || descriptor.cancellation_after_publication) process.exitCode = 1;
    } catch (error) {
      if (error?.recovery) console.log(JSON.stringify({ recovery: error.recovery }));
      console.error('Oklahoma retained collection requires inspection; no automatic retry.'); process.exitCode = 1;
    } finally { cancellation.dispose(); }
  }
}
