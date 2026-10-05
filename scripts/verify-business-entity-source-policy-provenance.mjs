#!/usr/bin/env node
import { readBusinessEntitySourcePolicyProvenance } from '../runner/business-entity-source-policy-provenance.mjs';
import { createCliCancellation } from '../runner/cli-cancellation.mjs';

if (process.argv.length > 2) throw new Error('This offline source-policy provenance verifier accepts no arguments.');
const cancellation = createCliCancellation();
readBusinessEntitySourcePolicyProvenance({ signal: cancellation.signal })
  .then(result => process.stdout.write(`${JSON.stringify({ release_id: result.release_id, manifest_sha256: result.manifest_sha256,
    artifact_sha256: result.artifact_sha256, source_count: result.summary.source_count, profile_count: result.summary.profile_count,
    policy_files_verified: result.rows.length, current_operation_verified: false, active_business_eligible: false,
    source_acquisition_performed: false, network_requests: 0 }, null, 2)}\n`))
  .catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = cancellation.signal.aborted ? 130 : 1; })
  .finally(() => cancellation.dispose());
