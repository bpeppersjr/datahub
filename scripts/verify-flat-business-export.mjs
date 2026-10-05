#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { parse } from 'csv-parse';
import { APP_ROOT } from '../runner/paths.mjs';
import { createCliCancellation } from '../runner/cli-cancellation.mjs';
import { readFlatBusinessExportGovernance } from '../runner/flat-business-export-governance.mjs';
import { BUSINESS_FLATFILE_CATEGORIES } from './compose-flat-business-export.mjs';

const MAX_MANIFEST = 2_000_000, MAX_SUMMARY = 2_000_000, MAX_ARTIFACT = 8_000_000_000, MAX_LINE = 16_000_000;
const CLAIMS = Object.freeze({ cross_source_additive: false, entity_resolution_applied: false, current_operation_verified: false,
  active_business_eligible: false, unique_business_count: null, usps_validity: 'unverified' });
const JSON_FIELDS = new Set(['source_policy_provenance','lifecycle_eligibility','geography_relationship','reporting_site_qualification',
  'geocode','industry_categories','external_identifiers','source_status','source_evidence','identity_matching_eligible','governed_geographic_assignment_eligible']);
const REQUIRED_FIELDS = ['cohort_kind','source_artifact_path','source_policy_provenance','profile_id','lifecycle_eligibility','geography_relationship',
  'reporting_site_qualification','source_id','source_release_id','source_record_id','ingest_run_id','policy_id','export_policy','transformation_version',
  'dataset_id','source_dataset_release_id','site_entity_id','establishment_entity_id','organization_entity_id','source_status','source_evidence','state','zip_code','zip4','geocode'];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const check = (ok, message = 'Flat business export verification rejected.') => { if (!ok) throw new Error(message); };
function exactKeys(value, keys, label) { check(value && Object.getPrototypeOf(value) === Object.prototype && stable(Object.keys(value).sort()) === stable([...keys].sort()), `${label} schema is not exact.`); }
const stable = value => JSON.stringify(canonical(value));
function canonical(value) { return Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value; }

async function readBounded(file, max) {
  const stat = await lstat(file, { bigint: true }); check(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1n && stat.size <= BigInt(max), 'Export file must be a bounded single-link regular file.');
  const handle = await open(file, 'r');
  try { const opened = await handle.stat({ bigint: true }); check(opened.dev === stat.dev && opened.ino === stat.ino && opened.nlink === 1n && opened.size === stat.size);
    const bytes = await handle.readFile(); const after = await handle.stat({ bigint: true }), named = await lstat(file, { bigint: true }); check(bytes.length === Number(stat.size) && stat.size === after.size
      && stat.mtimeNs === after.mtimeNs && stat.ctimeNs === after.ctimeNs && named.dev === stat.dev && named.ino === stat.ino && named.nlink === 1n); return bytes;
  } finally { await handle.close(); }
}
async function* boundedLines(file) {
  let pending = Buffer.alloc(0);
  for await (const chunk of createReadStream(file)) {
    let start = 0;
    for (let index = 0; index < chunk.length; index++) if (chunk[index] === 10) {
      const piece = chunk.subarray(start, index); check(pending.length + piece.length <= MAX_LINE, 'Export row exceeds the bounded row size.');
      let line = pending.length ? Buffer.concat([pending, piece]) : piece; if (line.at(-1) === 13) line = line.subarray(0, line.length - 1);
      yield new TextDecoder('utf-8', { fatal: true }).decode(line); pending = Buffer.alloc(0); start = index + 1;
    }
    const tail = chunk.subarray(start); check(pending.length + tail.length <= MAX_LINE, 'Export row exceeds the bounded row size.');
    if (tail.length) pending = pending.length ? Buffer.concat([pending, tail]) : Buffer.from(tail);
  }
  if (pending.length) yield new TextDecoder('utf-8', { fatal: true }).decode(pending);
}
async function* jsonRows(file) {
  for await (const line of boundedLines(file)) { if (!line) continue; yield JSON.parse(line); }
}
async function* csvRows(file, fields) {
  const parser = createReadStream(file).pipe(parse({ columns: true, bom: false, max_record_size: MAX_LINE, relax_column_count: false }));
  for await (const row of parser) { check(Object.keys(row).length === fields.length && fields.every(field => Object.hasOwn(row, field)), 'CSV row does not match manifest field roster.');
    const value = {};
    for (const field of fields) {
      const cell = row[field];
      if (cell === '') value[field] = null;
      else if (JSON_FIELDS.has(field)) { try { value[field] = JSON.parse(cell); } catch { throw new Error(`CSV ${field} is not canonical JSON.`); } }
      else value[field] = /^['](?=[=+\-@\t\r])/.test(cell) ? cell.slice(1) : cell;
    }
    yield value;
  }
}
function validateRow(row, manifest, lineageArtifacts, governance) {
  check(row && Object.getPrototypeOf(row) === Object.prototype && stable(Object.keys(row).sort()) === stable([...manifest.fields].sort()), 'JSONL row fields differ from the closed manifest roster.');
  check(['matching-profile','reporting-only'].includes(row.cohort_kind), 'Unknown export cohort kind.');
  check(typeof row.source_id === 'string' && typeof row.source_release_id === 'string' && typeof row.source_record_id === 'string'
    && typeof row.source_artifact_path === 'string' && lineageArtifacts.has(`${row.cohort_kind}\0${row.source_artifact_path}\0${row.source_id}`), 'Row source/cohort does not match source-artifact lineage.');
  check(row.dataset_id === 'national-business-registry' && row.source_dataset_release_id === manifest.governance_lineage.registry.release_id,
    'Row does not bind the selected national registry release.');
  check(typeof row.profile_id === 'string' || row.cohort_kind === 'reporting-only' && row.profile_id === null, 'Profile identifier does not match cohort contract.');
  check(typeof row.site_entity_id === 'string' && typeof row.establishment_entity_id === 'string'
    && (row.organization_entity_id === null || typeof row.organization_entity_id === 'string'), 'Raw site/establishment identity is missing or malformed.');
  check(row.source_policy_provenance && row.source_policy_provenance.policy_id === row.policy_id
    && row.source_policy_provenance.source_id === row.source_id && row.source_policy_provenance.source_release_id === row.source_release_id
    && /^[a-f0-9]{64}$/.test(row.source_policy_provenance.policy_profile_sha256 ?? ''), 'Row lacks exact source-policy provenance.');
  const expectedPolicy = row.cohort_kind === 'matching-profile' ? governance.sourcePolicyById.get(row.source_id)
    : governance.reportingByRecord.get(row.source_record_id)?.source;
  check(expectedPolicy && stable(row.source_policy_provenance) === stable(expectedPolicy), 'Row source-policy provenance differs from its selected pinned qualification.');
  check(row.lifecycle_eligibility?.current_operation_verified === false && row.lifecycle_eligibility?.active_business_eligible === false
    && row.geography_relationship?.postal?.usps_operational_assignment === null && row.geography_relationship?.postal?.usps_deliverability === null,
  'Matching-profile lifecycle/geography claims are missing or widened.');
  if (row.cohort_kind === 'matching-profile') check(row.reporting_site_qualification === null && row.identity_matching_eligible !== false,
    'Matching-profile cohort carries reporting-only qualification or identity mismatch.');
  else check(row.profile_id === null && row.identity_matching_eligible === false && row.reporting_site_qualification?.cohort_kind === 'reporting-only'
    && row.reporting_site_qualification?.active_business_eligible === false && row.reporting_site_qualification?.current_operation_verified === false,
  'Reporting-only cohort qualification is missing or widened.');
  if (row.cohort_kind === 'reporting-only') check(stable(row.reporting_site_qualification) === stable(governance.reportingByRecord.get(row.source_record_id)),
    'Reporting-only row differs from its selected immutable qualification.');
  else check(row.lifecycle_eligibility.release?.release_id === governance.lineage.lifecycle.release_id
    && row.lifecycle_eligibility.release?.manifest_sha256 === governance.lineage.lifecycle.manifest_sha256,
  'Matching-profile lifecycle release differs from selected lineage.');
  check(row.zip_code === null || /^\d{5}$/.test(row.zip_code), 'ZIP5 must be a separate exact five-digit value or null.');
  check(row.zip4 === null || /^\d{4}$/.test(row.zip4), 'ZIP4 must be separate exact four digits or null.');
  check(row.geocode === null || row.geocode && !Array.isArray(row.geocode) && Object.keys(row.geocode).sort().join(',') === 'latitude,longitude'
    && Number.isFinite(row.geocode.latitude) && Math.abs(row.geocode.latitude) <= 90 && Number.isFinite(row.geocode.longitude) && Math.abs(row.geocode.longitude) <= 180,
  'Normalized geocode is invalid.');
  check(!Object.hasOwn(row, 'location') && !Object.hasOwn(row, 'geometry') && !Object.hasOwn(row, 'latitude') && !Object.hasOwn(row, 'longitude'), 'Raw location or geometry is forbidden.');
}
function validateFilterRow(row, filters) {
  const selectedSources = new Set([...filters.source_ids,...filters.categories.flatMap(category => BUSINESS_FLATFILE_CATEGORIES[category] ?? [])]);
  if (selectedSources.size) check(selectedSources.has(row.source_id), 'Row violates the selected source/category filter.');
  if (filters.states.length) check(filters.states.includes(row.state), 'Row violates the selected state filter.');
}
function countQualification(counts, key, value) { const label = typeof value === 'string' && value ? value : 'unmeasured-or-missing'; const entry = `${key}|${label}`; counts[entry] = (counts[entry] ?? 0) + 1; }
function qualificationSummary(row, counts) {
  const key = `${row.cohort_kind}|${row.source_id}`;
  countQualification(counts.lifecycle_evidence,key,row.lifecycle_eligibility?.lifecycle_evidence);
  countQualification(counts.temporal_review_status,key,row.lifecycle_eligibility?.review_status);
  countQualification(counts.postal_relationship,key,row.geography_relationship?.postal?.classification ?? row.geography_relationship?.geography?.postal?.classification);
  countQualification(counts.point_assignment,key,row.geography_relationship?.point_assignment?.status ?? row.geography_relationship?.geography?.point_assignment?.status);
}

export async function verifyFlatBusinessExport(manifestPath, { root = APP_ROOT, expectedManifestSha256, signal, governanceReader = readFlatBusinessExportGovernance } = {}) {
  root = path.resolve(root); check(await realpath(root) === root, 'Verifier root must be canonical.');
  const absoluteManifest = path.resolve(root, manifestPath); check(absoluteManifest.startsWith(`${root}${path.sep}`) || absoluteManifest === root, 'Manifest escapes verifier root.');
  const parent = path.dirname(absoluteManifest); check(await realpath(parent) === parent, 'Export directory alias rejected.');
  const manifestBytes = await readBounded(absoluteManifest, MAX_MANIFEST), manifestSha = sha(manifestBytes), manifest = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(manifestBytes));
  check(!expectedManifestSha256 || manifestSha === expectedManifestSha256, 'Expected export manifest hash differs.');
  check(manifest.schema_version === 'flat-business-export@1.1.0' && manifest.dataset_id === 'flat-business-export' && manifest.status === 'published-local'
    && typeof manifest.release_id === 'string' && Array.isArray(manifest.fields) && manifest.fields.length > 0 && new Set(manifest.fields).size === manifest.fields.length
    && manifest.fields.every(field => typeof field === 'string') && REQUIRED_FIELDS.every(field => manifest.fields.includes(field)) && stable(manifest.aggregation_claims) === stable(CLAIMS)
    && manifest.record_unit === 'source-profile-or-reporting-site-evidence-row', 'Unsupported or widened export manifest contract.');
  exactKeys(manifest,['schema_version','dataset_id','release_id','status','generated_at','policy_mode','export_policy','record_unit','aggregation_claims','fields','filters','governance_lineage','source_lineage','summary','summary_path','artifacts'],'Manifest');
  check(manifest.policy_mode === 'public-only' && manifest.export_policy === 'public-policy-filtered'
    || manifest.policy_mode === 'local-review' && manifest.export_policy === 'local-review-only', 'Export policy mode/label mismatch.');
  check(manifest.filters && Object.keys(manifest.filters).sort().join(',') === 'categories,source_ids,states'
    && ['categories','source_ids','states'].every(key => Array.isArray(manifest.filters[key]) && new Set(manifest.filters[key]).size === manifest.filters[key].length
      && manifest.filters[key].every(value => typeof value === 'string'))
    && manifest.filters.categories.every(value => Object.hasOwn(BUSINESS_FLATFILE_CATEGORIES, value))
    && manifest.filters.states.every(value => /^[A-Z]{2}$/.test(value)), 'Export filter contract is malformed.');
  const governance = await governanceReader({ root, signal });
  check(stable(manifest.governance_lineage) === stable(governance.lineage), 'Export lineage differs from currently selected governed evidence.');
  check(Array.isArray(manifest.source_lineage) && manifest.source_lineage.length === 1, 'Exactly one selected registry source lineage is required.');
  const expectedSourceArtifacts = governance.registryArtifacts.filter(item => (/location-profile/.test(String(item.artifact_type ?? ''))
    || item.artifact_type === 'business-reporting-location-evidence-jsonl-gzip') && String(item.path ?? '').endsWith('.jsonl.gz'))
    .map(({path,artifact_type,bytes,sha256})=>({path,artifact_type,bytes,sha256})).sort((a,b)=>a.path.localeCompare(b.path));
  const selectedSource = manifest.source_lineage[0];
  if(expectedSourceArtifacts.some(item=>item.artifact_type==='entity-resolution-location-profile-jsonl-gzip')) check(selectedSource.lifecycle_release&&selectedSource.geography_relationship_release,'Matching-profile qualification release bindings are missing.');
  if(expectedSourceArtifacts.some(item=>item.artifact_type==='business-reporting-location-evidence-jsonl-gzip')) check(selectedSource.reporting_only_site_qualification_release,'Reporting-only qualification release binding is missing.');
  check(selectedSource.manifest_path === governance.lineage.registry.manifest_path
    && (selectedSource.pointer_path === null || selectedSource.pointer_path === 'data/business-registry/current.json')
    && stable([...selectedSource.artifacts].sort((a,b)=>a.path.localeCompare(b.path))) === stable(expectedSourceArtifacts), 'Export source artifact inventory is incomplete or differs from the selected registry.');
  const lineageArtifacts = new Set();
  for (const source of manifest.source_lineage) {
    const sourceKeys=['dataset_id','release_id','manifest_path','manifest_sha256','pointer_path','artifacts','lifecycle_release','geography_relationship_release','reporting_only_site_qualification_release'];
    check(source && Object.keys(source).every(key=>sourceKeys.includes(key)) && ['dataset_id','release_id','manifest_path','manifest_sha256','pointer_path','artifacts'].every(key=>Object.hasOwn(source,key)), 'Source-lineage schema is not exact.');
    check(source.dataset_id === 'national-business-registry' && source.release_id === governance.lineage.registry.release_id
      && source.manifest_sha256 === governance.lineage.registry.manifest_sha256 && Array.isArray(source.artifacts), 'Source manifest is not the selected registry release.');
    if (source.lifecycle_release) check(source.lifecycle_release.release_id===governance.lineage.lifecycle.release_id
      && source.lifecycle_release.manifest_sha256===governance.lineage.lifecycle.manifest_sha256,'Source lifecycle lineage differs from selected qualification.');
    if (source.geography_relationship_release) check(source.geography_relationship_release.release_id===governance.lineage.entity_geography.release_id
      && source.geography_relationship_release.manifest_sha256===governance.lineage.entity_geography.manifest_sha256,'Source geography lineage differs from selected qualification.');
    if (source.reporting_only_site_qualification_release) check(source.reporting_only_site_qualification_release.release_id===governance.lineage.reporting_only_qualification.release_id
      && source.reporting_only_site_qualification_release.manifest_sha256===governance.lineage.reporting_only_qualification.manifest_sha256
      && source.reporting_only_site_qualification_release.registration_sha256===governance.lineage.reporting_only_qualification.registration_sha256
      && source.reporting_only_site_qualification_release.artifact_sha256===governance.lineage.reporting_only_qualification.artifact_sha256,
    'Source reporting-only qualification lineage differs from selected release.');
    for (const artifact of source.artifacts) {
      exactKeys(artifact,['path','artifact_type','bytes','sha256'],'Source artifact');
      check(typeof artifact.path === 'string' && typeof artifact.artifact_type === 'string' && Number.isSafeInteger(artifact.bytes)
        && /^[a-f0-9]{64}$/.test(artifact.sha256), 'Source artifact binding is malformed.');
      const registered = governance.registryArtifacts.find(item => item.path === artifact.path);
      check(registered && registered.artifact_type === artifact.artifact_type && registered.bytes === artifact.bytes && registered.sha256 === artifact.sha256,
        'Source artifact does not match the selected registry manifest inventory.');
      const cohort = artifact.artifact_type === 'entity-resolution-location-profile-jsonl-gzip' ? 'matching-profile'
        : artifact.artifact_type === 'business-reporting-location-evidence-jsonl-gzip' ? 'reporting-only' : null;
      if (cohort === 'matching-profile') for (const row of governance.lineage.source_policy_provenance.source_rows) lineageArtifacts.add(`${cohort}\0${artifact.path}\0${row.source_id}`);
      if (cohort === 'reporting-only') for (const row of Object.values(governance.lineage.reporting_only_qualification.policy_sources)) lineageArtifacts.add(`${cohort}\0${artifact.path}\0${row.source_id}`);
    }
  }
  check(Array.isArray(manifest.artifacts) && manifest.artifacts.length >= 2 && manifest.artifacts.length <= 3
    && manifest.artifacts.filter(row => row.artifact_type === 'flat-business-summary').length === 1, 'Export artifact roster is not closed.');
  const names = new Set(); let jsonFile = null, csvFile = null, summaryFile = null; const artifactDigests = {}, artifactStats = new Map();
  for (const descriptor of manifest.artifacts) {
    check(descriptor?.artifact_type==='flat-business-summary'
      ? stable(Object.keys(descriptor).sort())===stable(['path','artifact_type','bytes','sha256'].sort())
      : stable(Object.keys(descriptor??{}).sort())===stable(['path','artifact_type','records','bytes','sha256'].sort()),'Output artifact descriptor schema is not exact.');
    check(descriptor && typeof descriptor.path === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(descriptor.path)
      && !names.has(descriptor.path) && Number.isSafeInteger(descriptor.bytes) && descriptor.bytes >= 0 && descriptor.bytes <= MAX_ARTIFACT
      && /^[a-f0-9]{64}$/.test(descriptor.sha256), 'Flat export artifact descriptor rejected.'); names.add(descriptor.path);
    const file = path.join(parent, descriptor.path), actualPath = await realpath(file); check(actualPath.startsWith(`${parent}${path.sep}`), 'Artifact escapes export directory.');
    const info = await lstat(file, { bigint: true }); check(info.isFile() && !info.isSymbolicLink() && info.nlink === 1n && info.size === BigInt(descriptor.bytes), 'Artifact file type/size rejected.');
    const hash = createHash('sha256'); let bytes = 0;
    for await (const chunk of createReadStream(file)) { signal?.throwIfAborted(); bytes += chunk.length; check(bytes <= descriptor.bytes, 'Artifact exceeds declared size.'); hash.update(chunk); }
    const digest = hash.digest('hex'), after = await lstat(file, { bigint: true });
    check(bytes === descriptor.bytes && digest === descriptor.sha256 && after.dev === info.dev && after.ino === info.ino && after.nlink === 1n
      && after.size === info.size && after.mtimeNs === info.mtimeNs && after.ctimeNs === info.ctimeNs, `Artifact digest mismatch or changed during verification: ${descriptor.path}`); artifactDigests[descriptor.path] = digest;
    artifactStats.set(file, info);
    if (descriptor.artifact_type === 'flat-business-jsonl') { check(jsonFile === null && descriptor.records === manifest.summary?.counts?.rows_written, 'JSONL artifact descriptor mismatch.'); jsonFile = file; }
    else if (descriptor.artifact_type === 'flat-business-csv') { check(csvFile === null && descriptor.records === manifest.summary?.counts?.rows_written, 'CSV artifact descriptor mismatch.'); csvFile = file; }
    else if (descriptor.artifact_type === 'flat-business-summary') { check(summaryFile === null && descriptor.path === 'summary.json', 'Summary artifact descriptor mismatch.'); summaryFile = file; }
    else check(false, 'Unknown flat export artifact type.');
  }
  check(summaryFile && (jsonFile || csvFile) && manifest.summary_path === 'summary.json', 'Required export files are missing.');
  const summaryBytes = await readBounded(summaryFile, MAX_SUMMARY), summary = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(summaryBytes));
  check(sha(summaryBytes) === artifactDigests['summary.json'], 'Summary changed after artifact hashing.');
  exactKeys(summary,['schema_version','run_id','generated_at','policy_mode','local_review_only','record_unit','aggregation_claims','filters','counts','source_counts','cohort_counts','qualification_counts','encountered_export_policies'],'Summary');
  exactKeys(summary.counts,['source_rows_read','rows_written','filter_rejected','policy_rejected'],'Summary counts');
  exactKeys(summary.cohort_counts,['matching-profile','reporting-only'],'Cohort summary');
  exactKeys(summary.qualification_counts,['lifecycle_evidence','temporal_review_status','postal_relationship','point_assignment'],'Qualification summary');
  exactKeys(summary.filters,['categories','source_ids','states'],'Summary filters');
  check(Number.isSafeInteger(summary.counts.source_rows_read)&&summary.counts.source_rows_read>=0
    &&Number.isSafeInteger(summary.counts.rows_written)&&summary.counts.rows_written>=0
    &&Number.isSafeInteger(summary.counts.filter_rejected)&&summary.counts.filter_rejected>=0
    &&Number.isSafeInteger(summary.counts.policy_rejected)&&summary.counts.policy_rejected>=0,'Summary row counts are malformed.');
  for(const map of [summary.source_counts,summary.encountered_export_policies,...Object.values(summary.qualification_counts)])
    check(map&&Object.getPrototypeOf(map)===Object.prototype&&Object.entries(map).every(([key,value])=>typeof key==='string'&&Number.isSafeInteger(value)&&value>0),'Summary count map is malformed.');
  check(summary.schema_version === 'flat-business-export-summary@1.1.0' && summary.run_id === manifest.release_id
    && summary.generated_at===manifest.generated_at&&summary.policy_mode===manifest.policy_mode&&summary.local_review_only===(manifest.policy_mode==='local-review')
    &&summary.record_unit===manifest.record_unit
    && summary.counts.rows_written === (jsonFile ? manifest.artifacts.find(x => x.path === path.basename(jsonFile)).records : manifest.artifacts.find(x => x.path === path.basename(csvFile)).records)
    && summary.cohort_counts && Number.isSafeInteger(summary.cohort_counts['matching-profile'])&&summary.cohort_counts['matching-profile']>=0
    && Number.isSafeInteger(summary.cohort_counts['reporting-only'])&&summary.cohort_counts['reporting-only']>=0
    && summary.cohort_counts['matching-profile'] + summary.cohort_counts['reporting-only'] === summary.counts.rows_written,
  'Export summary conservation mismatch.');
  check(stable(summary) === stable(manifest.summary) && stable(summary.filters) === stable(manifest.filters)
    && stable(summary.aggregation_claims) === stable(CLAIMS)
    && summary.counts.source_rows_read === summary.counts.rows_written + summary.counts.filter_rejected + summary.counts.policy_rejected
    && Object.values(summary.source_counts).reduce((sum,value)=>sum+value,0) === summary.counts.rows_written
    && Object.values(summary.encountered_export_policies).reduce((sum,value)=>sum+value,0) === summary.counts.rows_written + summary.counts.policy_rejected,
  'Manifest and summary evidence differ or does not conserve.');
  const observedQualifications = { lifecycle_evidence: {}, temporal_review_status: {}, postal_relationship: {}, point_assignment: {} };
  if (jsonFile) {
    let count = 0; const observedSources = {}, observedCohorts = { 'matching-profile': 0, 'reporting-only': 0 };
    for await (const row of jsonRows(jsonFile)) { signal?.throwIfAborted(); validateRow(row, manifest, lineageArtifacts, governance); validateFilterRow(row, manifest.filters); qualificationSummary(row,observedQualifications); count++; observedSources[row.source_id] = (observedSources[row.source_id] ?? 0) + 1; observedCohorts[row.cohort_kind]++; }
    check(count === summary.counts.rows_written && stable(observedSources) === stable(summary.source_counts) && stable(observedCohorts) === stable(summary.cohort_counts), 'JSONL row summary differs from artifact contents.');
  }
  if (!jsonFile && csvFile) {
    let count = 0; const observedSources = {}, observedCohorts = { 'matching-profile': 0, 'reporting-only': 0 };
    for await (const row of csvRows(csvFile, manifest.fields)) { signal?.throwIfAborted(); validateRow(row, manifest, lineageArtifacts, governance); validateFilterRow(row, manifest.filters); qualificationSummary(row,observedQualifications); count++; observedSources[row.source_id] = (observedSources[row.source_id] ?? 0) + 1; observedCohorts[row.cohort_kind]++; }
    check(count === summary.counts.rows_written && stable(observedSources) === stable(summary.source_counts) && stable(observedCohorts) === stable(summary.cohort_counts), 'CSV row summary differs from artifact contents.');
  }
  if (jsonFile && csvFile) {
    const left = jsonRows(jsonFile)[Symbol.asyncIterator](), right = csvRows(csvFile, manifest.fields)[Symbol.asyncIterator](); let index = 0;
    while (true) { signal?.throwIfAborted(); const [a, b] = await Promise.all([left.next(), right.next()]); check(a.done === b.done, 'JSONL and CSV contain different row counts.'); if (a.done) break;
      for (const field of manifest.fields) {
        const expected = a.value[field], actual = b.value[field];
        check((expected === null || expected === '') && actual === null || stable(expected) === stable(actual), `JSONL/CSV canonical row mismatch at row ${index + 1}.`);
      if (!jsonFile && field === manifest.fields.at(-1)) qualificationSummary(a.value,observedQualifications);
      }
      index++; }
  }
  check(stable(observedQualifications) === stable(summary.qualification_counts), 'Qualification summary differs from exported row evidence.');
  for (const [file, before] of artifactStats) { const after = await lstat(file, { bigint: true });
    check(after.dev === before.dev && after.ino === before.ino && after.nlink === 1n && after.size === before.size
      && after.mtimeNs === before.mtimeNs && after.ctimeNs === before.ctimeNs, 'An export artifact changed during row verification.'); }
  const manifestAfter = await readBounded(absoluteManifest, MAX_MANIFEST);
  const governanceAfter = await governanceReader({ root, signal });
  check(sha(manifestAfter) === manifestSha && stable(governanceAfter.lineage) === stable(governance.lineage), 'Selected export lineage or manifest changed during verification.');
  return { verified: true, release_id: manifest.release_id, manifest_sha256: manifestSha, artifacts: manifest.artifacts.map(item => ({ path: item.path, bytes: item.bytes, sha256: artifactDigests[item.path] })) };
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const cancellation = createCliCancellation();
  try { const args = process.argv.slice(2), manifest = args[0]; if (!manifest) throw new Error('Provide a flat-file export manifest path.');
    const expected = args.indexOf('--expected-sha256');
    if (expected >= 0 && (expected !== 1 || args.length !== 3 || !/^[a-f0-9]{64}$/.test(args[2])) || expected < 0 && args.length !== 1) throw new Error('Verifier accepts only a manifest path and optional exact --expected-sha256.');
    const result = await verifyFlatBusinessExport(manifest, { expectedManifestSha256: expected >= 0 ? args[2] : undefined, signal: cancellation.signal });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) { process.stderr.write(`Flat-file verification failed: ${error.message}\n`); process.exitCode = 1; }
  finally { cancellation.dispose(); }
}
