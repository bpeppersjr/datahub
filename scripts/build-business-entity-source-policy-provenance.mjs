#!/usr/bin/env node
import { buildBusinessEntitySourcePolicyProvenance } from '../runner/business-entity-source-policy-provenance.mjs';
import { createCliCancellation } from '../runner/cli-cancellation.mjs';

if (process.argv.length > 2) throw new Error('This offline source-policy provenance build accepts no arguments.');
const cancellation = createCliCancellation();
buildBusinessEntitySourcePolicyProvenance({ signal: cancellation.signal })
  .then(result => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`))
  .catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = cancellation.signal.aborted ? 130 : 1; })
  .finally(() => cancellation.dispose());
