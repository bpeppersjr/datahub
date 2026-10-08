import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { APP_ROOT } from './paths.mjs';
import { echoReplay as r, STATE_DC_CODES } from './national-epa-echo-naics-zip-industry-evidence.mjs';

const pin = createRequire(import.meta.url)('../config/epa-operational-industry-status-contract.json');
const DATASET = 'national-epa-echo-operational-segment-evidence';
const count = value => Number.isSafeInteger(value) && value >= 0;
const KEYS = ['source_record_count','exact_naics_assignments','records_with_multiple_naics','records_with_segment','records_with_unmapped_codes','records_partially_unmapped','segment_assignments'];
const SUMMARY_EXTRA = ['evidence_unit','state_dc_source_records','territory_source_records','state_dc_rows','territory_rows','zip5_cohort_rows','positive_source_zip5_rows','zip5_segment_cells','exact_naics_codes','out_of_cohort_source_records','missing_zip_source_records','unmapped_operational_segments'];
const check = (value, message) => { if (!value) throw new Error(`EPA supplemental status rejected: ${message}.`); };

export function validateEpaSegmentCounts(value, extra = []) {
  check(r.exact(value,['schema_version',...KEYS,'status_counts','segments',...extra]),'closed count shape');
  check(KEYS.every(key => count(value[key])) && r.exact(value.status_counts,pin.status_keys) && Object.values(value.status_counts).every(count),'integer counts');
  check(Object.values(value.status_counts).reduce((n,v) => n+v,0) === value.source_record_count,'disjoint status reconciliation');
  check(value.status_counts.mapped + value.status_counts['partially-unmapped'] + value.status_counts.multisegment === value.records_with_segment,'mapped record reconciliation');
  check(value.records_with_segment <= value.source_record_count && value.records_with_unmapped_codes <= value.source_record_count && value.records_partially_unmapped >= value.status_counts['partially-unmapped'] && value.records_partially_unmapped <= value.records_with_segment && value.records_with_multiple_naics <= value.source_record_count,'record bounds');
  check(Array.isArray(value.segments) && value.segments.length === 6 && value.segments.every((row,index) => r.exact(row,['segment','source_record_count','triggering_codes']) && row.segment === pin.segments[index] && count(row.source_record_count) && row.source_record_count <= value.records_with_segment && Array.isArray(row.triggering_codes) && row.triggering_codes.length <= 10000 && new Set(row.triggering_codes.map(item => item.naics_code)).size === row.triggering_codes.length && row.triggering_codes.every(item => r.exact(item,['naics_code','source_record_count']) && /^\d{2,6}$/.test(item.naics_code) && count(item.source_record_count) && item.source_record_count > 0 && item.source_record_count <= row.source_record_count)),'segment/code count shape');
  check(value.segments.reduce((n,row) => n+row.source_record_count,0) === value.segment_assignments && value.segment_assignments >= value.records_with_segment && value.segment_assignments <= value.records_with_segment * 6,'membership reconciliation');
  check(value.segments.every(row => row.triggering_codes.reduce((n,item) => n+item.source_record_count,0) >= row.source_record_count) && value.segments.reduce((n,row) => n+row.triggering_codes.reduce((m,item) => m+item.source_record_count,0),0) <= value.exact_naics_assignments,'triggering-code membership bounds');
  return value;
}

export function reconcileEpaSegmentJurisdictions(summary, states, territories) {
  validateEpaSegmentCounts(summary,SUMMARY_EXTRA);
  check(summary.schema_version === `${DATASET}@1.0.0` && summary.state_dc_rows === 51 && summary.territory_rows === 5 && summary.zip5_cohort_rows === 48194 && summary.source_record_count === 1517826 && summary.records_with_segment === 294477 && summary.segment_assignments === 296595 && summary.zip5_segment_cells === 50277 && summary.missing_zip_source_records === 0 && summary.out_of_cohort_source_records === 0 && r.equal(summary.unmapped_operational_segments,pin.unmapped_industries),'registered national totals');
  for (const [rows,codes,kind] of [[states,STATE_DC_CODES,'state-or-dc'],[territories,r.TERRITORIES,'territory']]) {
    check(rows.length === codes.length && new Set(rows.map(row => row.code)).size === codes.length && codes.every(code => rows.some(row => row.code === code)),'closed jurisdiction roster');
    for (const row of rows) { validateEpaSegmentCounts(row,['code','jurisdiction_kind']); check(row.schema_version === `${DATASET}-jurisdiction@1.0.0` && row.jurisdiction_kind === kind,'jurisdiction identity'); }
  }
  const all = [...states,...territories];
  for (const key of KEYS) check(all.reduce((n,row) => n+row[key],0) === summary[key],`national ${key}`);
  for (const key of pin.status_keys) check(all.reduce((n,row) => n+row.status_counts[key],0) === summary.status_counts[key],`national status ${key}`);
  for (const [index,segment] of summary.segments.entries()) {
    check(all.reduce((n,row) => n+row.segments[index].source_record_count,0) === segment.source_record_count,'national segment');
    const codes = new Map();
    for (const row of all) for (const item of row.segments[index].triggering_codes) codes.set(item.naics_code,(codes.get(item.naics_code) ?? 0)+item.source_record_count);
    check(codes.size === segment.triggering_codes.length && segment.triggering_codes.every(item => codes.get(item.naics_code) === item.source_record_count),'national triggering codes');
  }
  check(states.reduce((n,row) => n+row.source_record_count,0) === summary.state_dc_source_records && territories.reduce((n,row) => n+row.source_record_count,0) === summary.territory_source_records,'separate state/territory records');
}

const compact = (row, positive = null) => ({ source_record_count:row.source_record_count, records_with_segment:row.records_with_segment, segment_memberships:row.segment_assignments, records_partially_unmapped:row.records_partially_unmapped, status_counts:{...row.status_counts}, industries:[...pin.segments,...pin.unmapped_industries].map(id => ({ id,mapping:pin.segments.includes(id) ? 'mapped' : 'no-epa-mapping',record_memberships:row.segments.find(item => item.segment === id)?.source_record_count ?? null,positive_zip5_count:pin.segments.includes(id) && positive ? positive[id] : null })) });

// Fixed registration and immutable manifest pin; no runtime production pointer,
// source replay, acquisition, filesystem writes, or cross-source entity sums.
export async function readEpaOperationalIndustryStatus({ root=APP_ROOT,state=null }={}) {
  check(state === null || STATE_DC_CODES.includes(state),'state/DC selector');
  root = await fs.realpath(path.resolve(root));
  const registrationFile = r.contained(root,`config/datasets/${DATASET}.json`);
  const registration = JSON.parse((await r.secureBuffer(root,registrationFile,100000)).raw);
  check(registration.dataset_id === DATASET && registration.schema_version === '1.0.0' && registration.runtime_pointer === null && registration.production_enrollment === false && registration.additive_to_generic_business_totals === false && registration.source_edition_inferred === false && registration.operational_segments_mapped === true && registration.retained_release?.release_id === pin.release_id && registration.retained_release?.manifest === pin.manifest && registration.retained_release?.manifest_sha256 === pin.manifest_sha256,'exact registered release');
  const manifestFile = r.contained(root,pin.manifest), proof = await r.secureBuffer(root,manifestFile,200000), manifest = JSON.parse(proof.raw);
  check(proof.sha256 === pin.manifest_sha256 && manifest.release_id === pin.release_id && manifest.schema_version === `${DATASET}@1.0.0` && manifest.publication_mode === 'pointer-free','immutable manifest pin');
  const directory = path.dirname(manifestFile), expected = ['summary.json','states.jsonl','territories.jsonl','zip5-evidence.jsonl.gz','code-validation.jsonl','out-of-cohort.jsonl','missing-zip.jsonl',...Array.from({length:10},(_,i) => `zip-segments/prefix=${i}.jsonl.gz`)];
  check(manifest.artifacts.length === expected.length && expected.every(name => manifest.artifacts.some(item => item.path === name)),'artifact roster');
  const contents = new Map();
  for (const item of manifest.artifacts) {
    check(r.exact(item,['path','artifact_type','bytes','decoded_bytes','record_count','sha256']) && item.bytes <= 3000000 && item.decoded_bytes <= 50000000,'artifact bounds');
    const value = await r.secureBuffer(root,r.contained(directory,item.path),3000000);
    check(value.bytes === item.bytes && value.sha256 === item.sha256,`artifact pin ${item.path}`);
    if (['summary.json','states.jsonl','territories.jsonl'].includes(item.path)) contents.set(item.path,value.raw.toString('utf8').trim().split('\n').map(line => JSON.parse(line)));
  }
  const summary = contents.get('summary.json')?.[0], states = contents.get('states.jsonl'), territories = contents.get('territories.jsonl');
  check(contents.get('summary.json')?.length === 1 && r.equal(summary,manifest.summary),'summary manifest binding');
  reconcileEpaSegmentJurisdictions(summary,states,territories);
  check(r.equal(registration.retained_release,{release_id:pin.release_id,manifest:pin.manifest,manifest_sha256:pin.manifest_sha256,source_record_count:summary.source_record_count,records_with_segment:summary.records_with_segment,segment_assignments:summary.segment_assignments,multisegment_records:summary.status_counts.multisegment,records_partially_unmapped:summary.records_partially_unmapped,state_dc_rows:summary.state_dc_rows,territory_rows:summary.territory_rows,zip5_cohort_rows:summary.zip5_cohort_rows,zip5_segment_cells:summary.zip5_segment_cells,segments:Object.fromEntries(summary.segments.map(row=>[row.segment,row.source_record_count]))}),'registered count reconciliation');
  const positive = Object.fromEntries(pin.segments.map(id => [id,0])), sums = Object.fromEntries(pin.segments.map(id => [id,0]));
  for (let i=0;i<10;i++) {
    const item = manifest.artifacts.find(value => value.path === `zip-segments/prefix=${i}.jsonl.gz`), seen = new Set();
    await r.streamArtifact(root,directory,item,undefined,row => {
      check(r.exact(row,['schema_version','zip5','denominator_classification','zcta_geoid','segment','source_record_count','triggering_codes']) && row.schema_version === `${DATASET}-zip-segment@1.0.0` && /^\d{5}$/.test(row.zip5) && row.zip5.startsWith(String(i)) && pin.segments.includes(row.segment) && count(row.source_record_count) && row.source_record_count > 0 && !seen.has(`${row.zip5}:${row.segment}`),'ZIP segment identity/count');
      seen.add(`${row.zip5}:${row.segment}`); positive[row.segment]++; sums[row.segment] += row.source_record_count;
    },2000000);
  }
  check(Object.values(positive).reduce((n,v) => n+v,0) === summary.zip5_segment_cells && summary.segments.every(row => sums[row.segment] === row.source_record_count),'ZIP membership conservation');
  check((await r.secureBuffer(root,manifestFile,200000)).sha256 === proof.sha256,'manifest stable read');
  return { schema_version:pin.schema_version,selected_state:state,national:compact(summary,positive),selected_state_evidence:state ? {code:state,jurisdiction_kind:'state-or-dc',...compact(states.find(row => row.code === state))} : null,territories:territories.map(row => ({code:row.code,jurisdiction_kind:'territory',...compact(row)})),claims:{...pin.claims},provenance:{release_id:pin.release_id,manifest_sha256:pin.manifest_sha256,source_release_id:manifest.inputs.echo.release_id,source_manifest_sha256:manifest.inputs.echo.manifest_sha256,source_as_of:manifest.claims.source_defined_active_program_facility_as_of,crosswalk_sha256:manifest.crosswalk.sha256,naics_reference_release_id:manifest.inputs.naics_reference.release_id,reference_editions:manifest.reference_editions,verification_scope:'Pinned retained artifact checksums, closed jurisdiction counts and ZIP membership conservation; original source replay was verified at release publication.'} };
}
