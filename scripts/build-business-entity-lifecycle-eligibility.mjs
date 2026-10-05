#!/usr/bin/env node
import { buildBusinessEntityLifecycleEligibility } from '../runner/business-entity-lifecycle-eligibility.mjs';
import { createCliCancellation } from '../runner/cli-cancellation.mjs';

if (process.argv.length > 2) throw new Error('This governed offline lifecycle build accepts no arguments.');
const cancellation = createCliCancellation();
buildBusinessEntityLifecycleEligibility({ signal: cancellation.signal })
  .then(result => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`))
  .catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = cancellation.signal.aborted ? 130 : 1; })
  .finally(() => cancellation.dispose());
