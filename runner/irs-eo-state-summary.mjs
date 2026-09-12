import path from 'node:path';
import {isDeepStrictEqual as same} from 'node:util';
import {APP_ROOT} from './paths.mjs';
import {mnSelectionReadJson as readJson,mnSelectionReadLines as readLines} from './mn-construction-retained-selection.mjs';

export const IRS_ADDRESS_CODES=Object.freeze('AL AK AS AZ AR CA CO CT DE DC FL GA GU HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND MP OH OK OR PA PR RI SC SD TN TX UT VT VA VI WA WV WI WY'.split(' '));
const check=value=>{if(!value)throw Error('IRS reported-address summary is unavailable or requires inspection.');};
const integer=value=>Number.isSafeInteger(value)&&value>=0;
const sha=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const plain=value=>value&&Object.getPrototypeOf(value)===Object.prototype;
const exact=(value,keys)=>plain(value)&&same(Object.keys(value).sort(),[...keys].sort());
const sum=map=>Object.values(map).reduce((total,count)=>total+count,0);
export function validateIrsStateSummary(summary,coverage){
  check(exact(summary,['region_records','accepted_organizations','excluded_outside_supported_us_scope','quarantined_records','quarantine_reasons','observed_source_code_values','unknown_ruling_date_000000_records','unknown_accounting_period_00_records','exempt_status_codes','subsection_codes','states_and_territories']));
  const counts=summary.states_and_territories;
  check(plain(counts)&&Object.keys(counts).every(code=>IRS_ADDRESS_CODES.includes(code))&&Object.values(counts).every(integer));
  for(const [summaryKey,coverageKey]of [['accepted_organizations','accepted_current_exempt_organizations'],['excluded_outside_supported_us_scope','excluded_outside_supported_us_scope'],['quarantined_records','quarantined_records'],['unknown_ruling_date_000000_records','unknown_ruling_date_000000_records'],['unknown_accounting_period_00_records','unknown_accounting_period_00_records']])check(integer(summary[summaryKey])&&summary[summaryKey]===coverage[coverageKey]);
  check(sum(counts)===summary.accepted_organizations&&Object.keys(counts).length===coverage.states_and_territories);
  check(exact(summary.region_records,['eo1.csv','eo2.csv','eo3.csv','eo4.csv'])&&Object.values(summary.region_records).every(integer)&&sum(summary.region_records)===coverage.source_records);
  check(summary.accepted_organizations+summary.excluded_outside_supported_us_scope+summary.quarantined_records===coverage.source_records&&coverage.source_records===coverage.source_page_claimed_records);
  check(plain(summary.quarantine_reasons)&&Object.values(summary.quarantine_reasons).every(integer)&&sum(summary.quarantine_reasons)===summary.quarantined_records);
  return structuredClone(counts);
}

/** Only the selected coverage->registry->IRS manifest chain authorizes this bounded read. */
export async function readSelectedIrsStateSummary({pointerPath,coverageManifest,sourceRow,root=APP_ROOT}){
  check(root===APP_ROOT||typeof root==='string'&&root===path.resolve(root)&&root.startsWith(path.join(APP_ROOT,'data/tmp')+path.sep));
  check(pointerPath===path.join(root,'data/business-coverage-views/current.json'));
  const snapshots=[];
  const read=async(file,cap,expected)=>{const meter={},value=await readJson(file,cap,undefined,meter);if(expected)check(meter.sha256===expected);snapshots.push({file,cap,meter});return value;};
  const pointer=await read(pointerPath,10000);
  const releaseId=value=>typeof value==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,159}$/.test(value);
  const selected=(manifest,id)=>{check(Array.isArray(manifest.dependencies));const rows=manifest.dependencies.filter(row=>row.dataset_id===id);check(rows.length===1&&releaseId(rows[0].release_id)&&sha(rows[0].manifest_sha256));return rows[0];};
  check(pointer.dataset_id==='national-business-coverage-views'&&releaseId(pointer.release_id)&&pointer.manifest===`releases/${pointer.release_id}/manifest.json`);
  const coverage=await read(path.join(path.dirname(pointerPath),pointer.manifest),2000000);
  check(same(coverage,coverageManifest)&&coverage.schema_version==='1.0.0'&&coverage.dataset_id===pointer.dataset_id&&coverage.release_id===pointer.release_id&&coverage.status==='published-partial-local-aggregate');
  const sourceArtifacts=coverage.artifacts?.filter(row=>row.artifact_type==='source-coverage-view-jsonl'||row.path==='views/sources.jsonl');check(sourceArtifacts?.length===1);
  const sourceArtifact=sourceArtifacts[0];check(sourceArtifact.path==='views/sources.jsonl'&&sourceArtifact.artifact_type==='source-coverage-view-jsonl'&&integer(sourceArtifact.bytes)&&sourceArtifact.bytes<=2000000&&sha(sourceArtifact.sha256));
  const sourcePath=path.join(path.dirname(pointerPath),path.dirname(pointer.manifest),sourceArtifact.path),sourceMeter={},sourceRows=[];
  for await(const row of readLines(sourcePath,2000000,undefined,sourceMeter))if(row.source_key==='irs_eo_bmf_organizations')sourceRows.push(row);
  check(sourceMeter.sha256===sourceArtifact.sha256&&sourceMeter.bytes===sourceArtifact.bytes&&sourceRows.length===1&&same(sourceRows[0],sourceRow));
  const registryPin=selected(coverage,'national-business-registry');
  const registry=await read(path.join(root,'data/business-registry/releases',registryPin.release_id,'manifest.json'),2000000,registryPin.manifest_sha256);
  check(registry.schema_version==='1.0.0'&&registry.dataset_id==='national-business-registry'&&registry.release_id===registryPin.release_id&&registry.status==='published-partial');
  const irsPin=selected(registry,'irs-eo-bmf-organizations');
  const directory=path.join(root,'data/business-sources/irs-eo-bmf-organizations/releases',irsPin.release_id);
  const manifest=await read(path.join(directory,'manifest.json'),100000,irsPin.manifest_sha256);
  check(manifest.schema_version==='1.0.0'&&manifest.connector?.id==='irs-eo-bmf'&&manifest.connector.version==='1.0.1'&&manifest.dataset_id===irsPin.dataset_id&&manifest.release_id===irsPin.release_id&&manifest.status==='published'&&manifest.complete_current_eo_bmf_snapshot===true);
  check(/^\d{4}-\d{2}-\d{2}$/.test(manifest.source_posting_date)&&Number.isFinite(Date.parse(manifest.source_posting_date))&&new Date(manifest.source_posting_date).toISOString().slice(0,10)===manifest.source_posting_date&&Number.isFinite(Date.parse(manifest.retrieved_at))&&new Date(manifest.retrieved_at).toISOString()===manifest.retrieved_at&&manifest.source_posting_date<=manifest.retrieved_at.slice(0,10));
  check(sourceRow?.source_key==='irs_eo_bmf_organizations'&&sourceRow.lineage?.registry_release_id===registry.release_id&&sourceRow.release_metadata?.source_release_id===manifest.source_release_id&&sourceRow.release_metadata?.source_posting_date===manifest.source_posting_date&&sourceRow.zip_level_counts?.organization_filing_address_count===manifest.coverage.accepted_current_exempt_organizations);
  check(Array.isArray(manifest.artifacts));const artifacts=manifest.artifacts.filter(row=>row.artifact_type==='irs-eo-bmf-source-summary'||row.path==='derived/source-summary.json');check(artifacts.length===1);
  const artifact=artifacts[0];check(exact(artifact,['path','bytes','sha256','artifact_type'])&&artifact.path==='derived/source-summary.json'&&artifact.artifact_type==='irs-eo-bmf-source-summary'&&integer(artifact.bytes)&&artifact.bytes>0&&artifact.bytes<=100000&&sha(artifact.sha256));
  const summary=await read(path.join(directory,artifact.path),100000,artifact.sha256);check(snapshots.at(-1).meter.bytes===artifact.bytes);
  const counts=validateIrsStateSummary(summary,manifest.coverage);
  // Recheck selection and all pinned bytes, not cached release IDs, after the complete chain read.
  for(const prior of snapshots){const after={};await readJson(prior.file,prior.cap,undefined,after);check(after.sha256===prior.meter.sha256&&after.identity.ino===prior.meter.identity.ino&&after.identity.dev===prior.meter.identity.dev);}
  const finalSource={};for await(const row of readLines(sourcePath,2000000,undefined,finalSource))void row;check(finalSource.sha256===sourceMeter.sha256&&finalSource.identity.ino===sourceMeter.identity.ino&&finalSource.identity.dev===sourceMeter.identity.dev);
  const finalPointer={};await readJson(pointerPath,10000,undefined,finalPointer);check(finalPointer.sha256===snapshots[0].meter.sha256);
  return {status:'available',evidenceKind:'organization-filing-address',rowUnit:'organization filing-address records',addressBasis:'reported IRS filing or headquarters address; not a verified physical operating site',counts,
    acceptedOrganizations:summary.accepted_organizations,sourcePostingDate:manifest.source_posting_date,observedAt:manifest.retrieved_at,
    sourceReleaseId:manifest.source_release_id,manifestSha256:irsPin.manifest_sha256,summarySha256:artifact.sha256,sourceReplayPerformedThisRead:false};
}
