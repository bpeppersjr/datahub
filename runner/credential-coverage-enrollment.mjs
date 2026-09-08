import path from 'node:path';
import { lstat } from 'node:fs/promises';
import { APP_ROOT } from './paths.mjs';
import { mnSelectionReadJson as readJson, mnSelectionReadLines as readLines } from './mn-construction-retained-selection.mjs';
import { verifyMnConstructionCredentialRelease } from './mn-construction-credential-release.mjs';
import { aggregateCredentialCoverage } from './credential-coverage.mjs';
const check=value=>{if(!value)throw Error('Credential coverage enrollment rejected.');};

/** Read-only app enrollment. No source fetching, pointer edits, or derived writes. */
export async function loadCredentialCoverageEnrollment({configPath=path.join(APP_ROOT,'config/credential-coverage-enrollment.json'),signal}={}) {
  const bindingMeter={};let binding;
  try{binding=await readJson(configPath,10000,signal,bindingMeter);}catch(error){if(error.code==='ENOENT')return {status:'not-enrolled'};throw error;}
  check(binding && Object.keys(binding).length===3 && binding.schema_version==='credential-coverage-enrollment@1.0.0'
    && typeof binding.manifest_sha256==='string' && /^[a-f0-9]{64}$/.test(binding.manifest_sha256)
    && typeof binding.manifest_path==='string' && binding.manifest_path.startsWith('data/credential-reporting/') && !binding.manifest_path.includes('\\')
    && !binding.manifest_path.split('/').some(p=>!p || p==='.' || p==='..'));
  const filename=path.resolve(APP_ROOT,binding.manifest_path);
  try{await lstat(filename);}catch(error){if(error.code==='ENOENT')return {status:'unavailable',reason:'enrolled-credential-release-not-installed'};throw error;}
  const verified=await verifyMnConstructionCredentialRelease(filename,{signal});check(verified.manifest_sha256===binding.manifest_sha256);
  const artifact=verified.manifest.artifacts[0],meter={};check(artifact.path==='credentials.jsonl');
  const coverage=await aggregateCredentialCoverage(readLines(path.join(path.dirname(filename),artifact.path),150000000,signal,meter),{signal});
  check(meter.sha256===artifact.sha256 && meter.bytes===artifact.bytes && meter.records===artifact.records
    && coverage.allAcceptedCohortRows===verified.manifest.summary.accepted_credential_rows && coverage.missingZip5Rows===verified.manifest.summary.rows_without_reported_zip5);
  const after=await verifyMnConstructionCredentialRelease(filename,{signal});check(after.manifest_sha256===verified.manifest_sha256);
  const bindingAfter={};await readJson(configPath,10000,signal,bindingAfter);check(bindingAfter.sha256===bindingMeter.sha256);
  return {status:'available',summary:verified.manifest.summary,coverage,
    evidence:{reportingReleaseId:verified.manifest.release_id,reportingManifestSha256:verified.manifest_sha256,enrollmentSha256:bindingMeter.sha256},
    publicExportAuthorized:false,nationalRegistryIntegrated:false};
}
