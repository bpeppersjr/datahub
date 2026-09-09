import { createCliCancellation } from '../runner/cli-cancellation.mjs';
import { runOkChildcareSchemaProbe } from '../runner/ok-childcare-schema-probe.mjs';
import { persistOkChildcareSchemaReceipt } from '../runner/ok-childcare-schema-receipt.mjs';

if (process.argv.length === 3 && process.argv[2] === '--help') {
  console.log('Usage: node scripts/probe-ok-childcare-schema.mjs\nOne fixed Oklahoma center/ZIP schema prerequisite; three bounded serial requests. Saves aggregate evidence inside datahub. No provider records, retries, enrollment, refresh or statewide completeness claim.');
} else if (process.argv.length !== 2) {
  console.error('Invalid Oklahoma schema prerequisite arguments.'); process.exitCode = 1;
} else {
  const cancellation = createCliCancellation();
  try {
    const receipt = await runOkChildcareSchemaProbe({ signal: cancellation.signal });
    console.log(JSON.stringify(await persistOkChildcareSchemaReceipt(receipt, { signal: cancellation.signal })));
    if (receipt.status !== 'schema-observed-not-collection-ready') process.exitCode = 1;
  } catch (error) {
    console.error(error?.code === 'OK_SCHEMA_PUBLICATION_UNCERTAIN'
      ? JSON.stringify({ error: 'Published evidence needs inspection before retry.', recovery: error.recovery })
      : 'Oklahoma schema prerequisite did not complete.');
    process.exitCode = 1;
  } finally { cancellation.dispose(); }
}
