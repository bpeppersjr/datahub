import { createCliCancellation } from '../runner/cli-cancellation.mjs';
import { runOkChildcareSchemaProbe } from '../runner/ok-childcare-schema-probe.mjs';
import { persistOkChildcareSchemaReceipt, validateOkSchemaManagedOptions } from '../runner/ok-childcare-schema-receipt.mjs';

const args = process.argv.slice(2);
if (args.length === 1 && args[0] === '--help') {
  console.log('Usage: node scripts/probe-ok-childcare-schema.mjs [--output ABSOLUTE_OPERATION_OUTPUT --operation-id UUID]\nOne fixed Oklahoma center/ZIP schema prerequisite; three bounded serial requests. Saves aggregate evidence inside datahub. No provider records, retries, enrollment, refresh or statewide completeness claim.');
} else {
  let managed;
  try {
    if (args.length) {
      if (args.length !== 4) throw Error('arguments');
      const fields = new Map();
      for (let index = 0; index < args.length; index += 2) {
        const flag = args[index], value = args[index + 1];
        if (!['--output', '--operation-id'].includes(flag) || fields.has(flag) || !value || value.startsWith('--')) throw Error('arguments');
        fields.set(flag, value);
      }
      if (fields.size !== 2) throw Error('arguments');
      managed = { output: fields.get('--output'), operationId: fields.get('--operation-id') };
      await validateOkSchemaManagedOptions(managed);
    }
  } catch {
    console.error('Invalid Oklahoma schema prerequisite arguments.'); process.exitCode = 1;
  }
  if (process.exitCode !== 1) {
    const cancellation = createCliCancellation();
    try {
      const receipt = await runOkChildcareSchemaProbe({ signal: cancellation.signal });
      console.log(JSON.stringify(await persistOkChildcareSchemaReceipt(receipt, { signal: cancellation.signal, ...managed })));
      if (receipt.status !== 'schema-observed-not-collection-ready') process.exitCode = 1;
    } catch (error) {
      if (error?.code === 'OK_SCHEMA_PUBLICATION_UNCERTAIN') {
        console.log(JSON.stringify({ recovery: error.recovery }));
        console.error('Published evidence needs inspection before retry.');
      } else console.error('Oklahoma schema prerequisite did not complete.');
      process.exitCode = 1;
    } finally { cancellation.dispose(); }
  }
}
