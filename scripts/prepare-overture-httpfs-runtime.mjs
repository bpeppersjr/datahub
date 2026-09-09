import { createCliCancellation } from '../runner/cli-cancellation.mjs';
import { prepareOvertureHttpfsRuntime } from '../runner/overture-httpfs-runtime.mjs';

const args = process.argv.slice(2);
if (args.length === 1 && args[0] === '--help') {
  console.log('Usage: node scripts/prepare-overture-httpfs-runtime.mjs --output ABSOLUTE_OPERATION_OUTPUT --operation-id UUID\nFixed Windows DuckDB httpfs dependency prerequisite. One bounded official package download, core-signature check and retained receipt. No Overture place acquisition or automatic source enrollment.');
} else {
  let options;
  try {
    if (args.length !== 4) throw Error('arguments');
    const fields = new Map();
    for (let index = 0; index < args.length; index += 2) {
      const flag = args[index], value = args[index + 1];
      if (!['--output', '--operation-id'].includes(flag) || fields.has(flag) || !value || value.startsWith('--')) throw Error('arguments');
      fields.set(flag, value);
    }
    if (fields.size !== 2) throw Error('arguments');
    options = { output: fields.get('--output'), operationId: fields.get('--operation-id') };
  } catch {
    console.error('Invalid Overture runtime prerequisite arguments.');
    process.exitCode = 1;
  }
  if (options) {
    const cancellation = createCliCancellation();
    try {
      const descriptor = await prepareOvertureHttpfsRuntime({ ...options, signal: cancellation.signal });
      console.log(JSON.stringify(descriptor));
      if (descriptor.cancellation_after_publication) process.exitCode = 1;
    } catch (error) {
      if (error?.recovery) console.log(JSON.stringify({ recovery: error.recovery }));
      console.error('Overture runtime prerequisite did not complete; preserve operation output for inspection.');
      process.exitCode = 1;
    } finally { cancellation.dispose(); }
  }
}
