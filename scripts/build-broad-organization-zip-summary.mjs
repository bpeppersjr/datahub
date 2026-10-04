import {writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {APP_ROOT} from '../runner/paths.mjs';
import {buildBroadOrganizationZipSummary, DATASET} from '../runner/broad-organization-zip-summary.mjs';

const built = await buildBroadOrganizationZipSummary({root: APP_ROOT});
const manifestPath = path.posix.join('data', DATASET, 'releases', built.manifest.release_id, 'manifest.json');
const manifestBytes = Buffer.from(`${JSON.stringify(built.manifest)}\n`);
const manifestSha256 = createHash('sha256').update(manifestBytes).digest('hex');
const registration = {
  schema_version: '1.0.0', dataset_id: DATASET,
  status: 'registered-pointer-free-local-review-evidence',
  runtime_pointer: null, production_enrollment: false,
  retained_release: {
    release_id: built.manifest.release_id, manifest: manifestPath,
    manifest_sha256: manifestSha256, manifest_bytes: manifestBytes.length,
    zip5_rows: built.manifest.summary.zip5_union_rows,
    artifact_bytes: built.manifest.artifacts.reduce((n, a) => n + a.bytes, 0),
    artifact_count: built.manifest.artifacts.length,
  },
  claims: {
    network_requests: 0, acquisition_performed: false,
    current_pointer_written: false, production_enrollment: false,
    current_operation_verified: false, additive_cross_industry_total: false,
  },
};
await writeFile(path.join(APP_ROOT, 'config/datasets/national-broad-organization-zip-summary.json'), `${JSON.stringify(registration, null, 2)}\n`);
console.log(JSON.stringify({release_id: built.manifest.release_id, manifest_sha256: manifestSha256, manifest_path: manifestPath, zip5_union_rows: built.manifest.summary.zip5_union_rows, address_rows: built.manifest.summary.address_rows, eligible_address_rows: built.manifest.summary.eligible_address_rows, missing_or_ineligible_address_rows: built.manifest.summary.missing_or_ineligible_address_rows, out_of_cohort_zip_rows: built.manifest.summary.out_of_cohort_zip_rows, artifact_count: built.manifest.artifacts.length}, null, 2));
