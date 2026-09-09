import { runIaChildcareSchemaProbe } from '../runner/ia-childcare-schema-probe.mjs';
import { persistIaChildcareSchemaReceipt } from '../runner/ia-childcare-schema-receipt.mjs';

if (process.argv.length === 3 && process.argv[2] === '--help') {
  console.log('Usage: node scripts/probe-ia-childcare-schema.mjs\nRuns one bounded, fixed Iowa schema prerequisite. Persists an aggregate manifest under data/business-sources/ia-childcare/schema-probes; never provider records. No collection, enrollment, refresh, or retry.');
} else if (process.argv.length !== 2) {
  console.error('Invalid Iowa schema probe arguments.'); process.exitCode = 1;
} else {
  const controller = new AbortController();
  process.once('SIGINT', () => controller.abort()); process.once('SIGTERM', () => controller.abort());
  process.on('message', message => { if (message?.type === 'cancel') controller.abort(); });
  try {
    const receipt = await runIaChildcareSchemaProbe({ signal: controller.signal });
    console.log(JSON.stringify(await persistIaChildcareSchemaReceipt(receipt)));
    if (receipt.status !== 'schema-observed-not-collection-ready') process.exitCode = 1;
  } catch { console.error('Iowa schema prerequisite failed.'); process.exitCode = 1; }
  finally { if (process.connected) process.disconnect(); }
}
