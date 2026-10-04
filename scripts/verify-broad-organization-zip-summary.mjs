import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {APP_ROOT} from '../runner/paths.mjs';
import {verifyBroadOrganizationZipSummary} from '../runner/broad-organization-zip-summary.mjs';

const registrationPath = path.join(APP_ROOT, 'config/datasets/national-broad-organization-zip-summary.json');
const registration = JSON.parse(await readFile(registrationPath, 'utf8'));
const retained = registration.retained_release;
if (!retained?.manifest) throw new Error('Broad organization ZIP summary registration has no retained release.');
const verified = await verifyBroadOrganizationZipSummary(path.join(APP_ROOT, retained.manifest), {root: APP_ROOT});
if (verified.release_id !== retained.release_id || verified.manifest_sha256 !== retained.manifest_sha256 || verified.zip5_union_rows !== retained.zip5_rows) {
  throw new Error('Broad organization ZIP summary registration does not match the verified release.');
}
console.log(JSON.stringify(verified, null, 2));
