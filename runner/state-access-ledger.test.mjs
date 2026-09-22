import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFile, cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { APP_ROOT } from './paths.mjs';
import { buildStateAccessLedger, projectNhRestrictedChildcareEvidence, writeStateAccessReport } from './state-access-ledger.mjs';
import { loadStateBusinessSourceAssessmentCatalog } from './state-business-source-assessment.mjs';
import { BROAD_ORGANIZATION_SOURCES } from './broad-organization-evidence.mjs';

async function fixture(t, {retained = false} = {}) {
  const temp = path.join(APP_ROOT, 'data/tmp'); await mkdir(temp, { recursive: true });
  const root = await mkdtemp(path.join(temp, 'state-ledger-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const pointerPath = 'data/business-coverage-views/current.json';
  const pointer = JSON.parse(await readFile(path.join(APP_ROOT, pointerPath)));
  const manifestPath = path.join(path.dirname(pointerPath), pointer.manifest);
  const manifest = JSON.parse(await readFile(path.join(APP_ROOT, manifestPath)));
  const irsPointerPath = 'data/business-sources/irs-eo-bmf-organizations/current.json';
  const irsPointer = JSON.parse(await readFile(path.join(APP_ROOT, irsPointerPath)));
  const irsManifestPath = path.join(path.dirname(irsPointerPath), irsPointer.manifest);
  const irsManifest = JSON.parse(await readFile(path.join(APP_ROOT, irsManifestPath)));
  const irsSummary = irsManifest.artifacts.find(a => a.artifact_type === 'irs-eo-bmf-source-summary');
  const waPointerPath = 'data/business-sources/wa-lni-active-contractor-organizations/current.json';
  const waPointer = JSON.parse(await readFile(path.join(APP_ROOT, waPointerPath)));
  const waManifestPath = path.join(path.dirname(waPointerPath), waPointer.manifest);
  const waManifest = JSON.parse(await readFile(path.join(APP_ROOT, waManifestPath)));
  const waSummary = waManifest.artifacts.find(a => a.artifact_type === 'wa-lni-active-contractor-licenses-source-summary');
  const dePointerPath = 'data/business-sources/de-business-licenses-current/current.json';
  const dePointer = JSON.parse(await readFile(path.join(APP_ROOT, dePointerPath)));
  const deManifestPath = path.join(path.dirname(dePointerPath), dePointer.manifest);
  const deManifest = JSON.parse(await readFile(path.join(APP_ROOT, deManifestPath)));
  const deSummary = deManifest.artifacts.find(a => a.artifact_type === 'de-business-licenses-source-summary');
  const substate = [];
  for (const [key, type] of [['la-active-business-location-accounts','la-active-business-source-summary'],['chicago-active-business-license-sites','chicago-active-business-license-source-summary'],['nyc-dcwp-active-license-sites','nyc-dcwp-active-license-source-summary']]) {
    const pointerPath = `data/business-sources/${key}/current.json`, pointer = JSON.parse(await readFile(path.join(APP_ROOT, pointerPath)));
    const manifestPath = path.join(path.dirname(pointerPath), pointer.manifest), manifest = JSON.parse(await readFile(path.join(APP_ROOT, manifestPath)));
    const summary = manifest.artifacts.find(a => a.artifact_type === type); substate.push({key,pointerPath,manifestPath,manifest,summary});
  }
  const files = [pointerPath, manifestPath, irsPointerPath, irsManifestPath, path.join(path.dirname(irsManifestPath), irsSummary.path), waPointerPath, waManifestPath, path.join(path.dirname(waManifestPath), waSummary.path), dePointerPath, deManifestPath, path.join(path.dirname(deManifestPath), deSummary.path), ...substate.flatMap(item=>[item.pointerPath,item.manifestPath,path.join(path.dirname(item.manifestPath),item.summary.path)]), 'config/industry-segments.json', 'config/state-access-workstreams.json', 'config/national-reporting-sources.json', ...Object.values(BROAD_ORGANIZATION_SOURCES).map(({policy})=>path.join('config/source-policies',policy)), ...manifest.artifacts.filter(a => ['state-coverage-view-jsonl', 'source-coverage-view-jsonl'].includes(a.artifact_type)).map(a => path.join(path.dirname(manifestPath), a.path))];
  for (const file of files) { await mkdir(path.dirname(path.join(root, file)), { recursive: true }); await copyFile(path.join(APP_ROOT, file), path.join(root, file)); }
  // Existing enrollment cases explicitly exercise pre-integration coverage.
  if (!retained) {
    delete manifest.retained_childcare_reporting;
    const artifact = manifest.artifacts.find(a => a.artifact_type === 'state-coverage-view-jsonl');
    const file = path.join(root,path.dirname(manifestPath),artifact.path);
    const rows = (await readFile(file,'utf8')).trim().split('\n').map(JSON.parse);
    for (const row of rows) delete row.retained_childcare_reporting;
    const bytes = Buffer.from(rows.map(JSON.stringify).join('\n')+'\n');
    await writeFile(file,bytes); artifact.bytes=bytes.length; artifact.sha256=createHash('sha256').update(bytes).digest('hex');
    await writeFile(path.join(root,manifestPath),JSON.stringify(manifest));
  }
  return { root, manifestPath, manifest, waManifestPath, waManifest, deManifestPath, deManifest, substate, assessmentLoader: async () => ({ assessment_catalog_id: 'fixture-assessments', coverage_release_id: manifest.release_id, states: [] }),
    nhRestrictedChildcareLoader: async () => ({status:'not-enrolled'}),
    mnCredentialPublicationLoader: async () => ({status:'verified-downstream-publication',included:true,credentialRows:11456,recordUnit:'publisher-business-credential-row',exportPolicy:'local-review-only',uniqueBusinessCount:null,activeBusinessCount:null,physicalSiteCount:null,nationalCompletenessPercent:null,geographicAssignmentPerformed:false,publicExportAuthorized:false,coverageReleaseId:manifest.release_id,coverageManifestSha256:createHash('sha256').update(await readFile(path.join(root,manifestPath))).digest('hex'),productionRunId:'production-mn-credentials-20260910-01',productionReceiptSha256:'b'.repeat(64),reportingReleaseId:'fixture-reporting',reportingManifestSha256:'c'.repeat(64)}) };
}

function nhRestrictedEvidence() {
  const claims={identity_matching_eligible:false,physical_sites_verified:false,current_operations_verified:false,statewide_completeness_percent:null,national_completeness_percent:null,national_reporting_integrated:false,public_export_authorized:false,export_policy:'internal'};
  const rows=Array.from({length:6},(_,index)=>({row_ordinal:index+1,query_zip5:'03755',address:{state:'NH'}}));
  return {status:'available',enrollment:{enrollment_sha256:'a'.repeat(64),operation_id:'86c727ff-e93d-42d0-9a05-9aab9a81c365',operation_receipt_sha256:'b'.repeat(64)},samples:{claims,groups:[{state:'OK'},{state:'NH',count:6,rows,query_zip5:'03755',scope:'retained-query-sample-not-statewide',observed_at:'2026-09-10T17:57:56.067Z',normalized_at:'2026-09-10T18:01:14.356Z',source_policy:'nh-childcare-visible-internal@1.0.0'}]}};
}

test('NH retained query sample is admitted only as unmeasured evidence with no business, site, or operation claims',async t=>{
  const f=await fixture(t);f.nhRestrictedChildcareLoader=async()=>nhRestrictedEvidence();
  const ledger=await buildStateAccessLedger(f),cell=ledger.jurisdictions.find(row=>row.state==='NH').industries.find(row=>row.industry==='childcare');
  assert.equal(cell.accessEvidenceStatus,'unsupported-evidence-not-measured');
  const evidence=cell.evidence.find(item=>item.evidenceClass==='restricted-retained-childcare-query-sample');
  assert.deepEqual({recordCount:evidence.recordCount,queryZip5:evidence.queryZip5,scope:evidence.scope,statewideCompleteness:evidence.statewideCompleteness},
    {recordCount:6,queryZip5:'03755',scope:'retained-query-sample-not-statewide',statewideCompleteness:'unknown'});
  for(const key of ['identityMatchingEligible','physicalSiteVerified','currentOperationsVerified','nationalReportingIntegrated','publicExportAuthorized'])assert.equal(evidence[key],false);
  for(const key of ['uniqueBusinessCount','physicalSiteCount','activeBusinessCount','statewideCompletenessPercent','nationalCompletenessPercent'])assert.equal(evidence[key],null);
  assert.equal(cell.evidence.some(item=>item.type.startsWith('published-direct')||item.type.startsWith('published-national')),false);
  for(const jurisdiction of ledger.jurisdictions.filter(row=>row.state!=='NH'))assert.equal(jurisdiction.industries.find(row=>row.industry==='childcare').evidence.some(item=>item.evidenceClass==='restricted-retained-childcare-query-sample'),false);
});

test('NH restricted sample rejects tamper, malformed content, and non-NH leakage; missing evidence remains missing',async()=>{
  const missing=projectNhRestrictedChildcareEvidence({status:'not-enrolled'},'NH');assert.equal(missing.status,'not-enrolled');
  for(const mutate of [
    value=>{value.samples.groups[1].count=5;},
    value=>{value.samples.groups[1].query_zip5='03756';},
    value=>{value.samples.groups[1].rows[0].address.state='VT';},
    value=>{value.samples.claims.current_operations_verified=true;},
    value=>{value.samples.groups.push({...value.samples.groups[1]});},
  ]){const value=nhRestrictedEvidence();mutate(value);assert.throws(()=>projectNhRestrictedChildcareEvidence(value,'NH'),/New Hampshire restricted childcare evidence is invalid/);}
  assert.deepEqual(projectNhRestrictedChildcareEvidence(nhRestrictedEvidence(),'VT'),{status:'not-applicable'});
});

async function installVtReportingEnrollment(root) {
  const relativeConfig = 'config/vt-childcare-reporting-enrollment.json';
  const binding = JSON.parse(await readFile(path.join(APP_ROOT, relativeConfig)));
  const target = path.join(root, relativeConfig); await mkdir(path.dirname(target), { recursive: true });
  await copyFile(path.join(APP_ROOT, relativeConfig), target);
  const runRelative = binding.app_receipt_path.split('/').slice(0, 4).join('/');
  await cp(path.join(APP_ROOT, runRelative), path.join(root, runRelative), { recursive: true });
  return binding;
}

async function installIaReportingEnrollment(root) {
  const relativeConfig = 'config/ia-childcare-reporting-enrollment.json';
  const binding = JSON.parse(await readFile(path.join(APP_ROOT, relativeConfig)));
  const target = path.join(root, relativeConfig); await mkdir(path.dirname(target), { recursive: true });
  await copyFile(path.join(APP_ROOT, relativeConfig), target);
  const runRelative = binding.app_receipt_path.split('/').slice(0, 4).join('/');
  await cp(path.join(APP_ROOT, runRelative), path.join(root, runRelative), { recursive: true });
  const receipt = JSON.parse(await readFile(path.join(root, binding.app_receipt_path)));
  for (const manifestPath of [receipt.acquired.manifest_path, receipt.normalized.manifest_path]) {
    const relative = path.relative(APP_ROOT, manifestPath); const source = path.join(APP_ROOT, relative); const destination = path.join(root, relative);
    await mkdir(path.dirname(destination), { recursive: true }); await cp(path.dirname(source), path.dirname(destination), { recursive: true });
  }
  return binding;
}

test('verified IA publisher cohort is admitted as direct IA-only evidence without address-state, facility, or business claims', async () => {
  const binding = JSON.parse(await readFile(path.join(APP_ROOT, 'config/ia-childcare-reporting-enrollment.json')));
  const ledger = await buildStateAccessLedger();
  const ia = ledger.jurisdictions.find(row => row.state === 'IA').industries.find(row => row.industry === 'childcare');
  assert.equal(ia.accessEvidenceStatus, 'direct-state-publisher');
  const evidence = ia.evidence.find(item => item.evidenceClass === 'retained-iowa-publisher-scope-childcare-candidate');
  assert.deepEqual({recordCount:evidence.recordCount,rowUnit:evidence.rowUnit,stateBasis:evidence.stateBasis,publisherJurisdiction:evidence.publisherJurisdiction,reportedAddressState:evidence.reportedAddressState},
    {recordCount:1476,rowUnit:'retained-iowa-publisher-childcare-candidate',stateBasis:'publisher-jurisdiction',publisherJurisdiction:'IA',reportedAddressState:null});
  assert.equal(evidence.enrollmentSha256, '0786c71df45fb9e38310358cf167d69af77f6325d79b83b5b7acc2d40607cdce');
  assert.equal(evidence.appReceiptSha256, binding.app_receipt_sha256);
  assert.deepEqual({accepted:evidence.acceptedCohortRows,source:evidence.sourceRows,response:evidence.sourceResponseRows,excluded:evidence.excludedSourceRows,duplicates:evidence.duplicateSelectedRows,quarantined:evidence.quarantinedRows},
    {accepted:1476,source:1476,response:3201,excluded:1725,duplicates:0,quarantined:0});
  assert.equal(evidence.rowsWithReportedAddressState, 0); assert.equal(evidence.rowsWithoutReportedAddressState, 1476);
  for (const key of ['facilityCount','uniqueBusinessCount','uniqueActiveBusinessCount','nationalCompletenessPercent','reportingPeriod']) assert.equal(evidence[key], null);
  for (const key of ['identityMatchingEligible','physicalSiteVerified','currentOperationsVerified','publicExportAuthorized','nationalReportingIntegrated','reportingPeriodVerified']) assert.equal(evidence[key], false);
  assert.equal(ia.evidence.some(item => item.addressBasis === 'reported-address-state' && item.sourceId === 'ia-childcare-centers'), false);
  for (const jurisdiction of ledger.jurisdictions.filter(row => row.state !== 'IA')) {
    const cell = jurisdiction.industries.find(row => row.industry === 'childcare');
    assert.equal(cell.evidence.some(item => item.evidenceClass === 'retained-iowa-publisher-scope-childcare-candidate'), false);
  }
});

test('IA publisher-cohort admission rejects missing, tampered, and malformed enrolled evidence', async t => {
  for (const kind of ['missing-receipt','tampered-receipt','malformed-binding']) {
    const f = await fixture(t); const binding = kind === 'missing-receipt'
      ? JSON.parse(await readFile(path.join(APP_ROOT, 'config/ia-childcare-reporting-enrollment.json')))
      : await installIaReportingEnrollment(f.root);
    if (kind === 'missing-receipt') {
      await copyFile(path.join(APP_ROOT, 'config/ia-childcare-reporting-enrollment.json'), path.join(f.root, 'config/ia-childcare-reporting-enrollment.json'));
      const ledger = await buildStateAccessLedger(f), ia = ledger.jurisdictions.find(row => row.state === 'IA').industries.find(row => row.industry === 'childcare');
      assert.equal(ia.accessEvidenceStatus, 'unsupported-evidence-not-measured');
      assert.equal(ia.evidence.some(item => item.evidenceClass === 'retained-iowa-publisher-scope-childcare-candidate'), false);
      assert.equal(ia.localPublisherCohortEvidence.status, 'unavailable');
      continue;
    }
    if (kind === 'tampered-receipt') await writeFile(path.join(f.root, binding.app_receipt_path), '{}');
    else await writeFile(path.join(f.root, 'config/ia-childcare-reporting-enrollment.json'), JSON.stringify({...binding, app_receipt_sha256:'invalid'}));
    await assert.rejects(buildStateAccessLedger(f), /Iowa reporting enrollment rejected/);
  }
});

test('verified VT publisher cohort is admitted as direct VT-only evidence without address-state or business claims', async () => {
  const binding = JSON.parse(await readFile(path.join(APP_ROOT, 'config/vt-childcare-reporting-enrollment.json')));
  const ledger = await buildStateAccessLedger();
  const vt = ledger.jurisdictions.find(row => row.state === 'VT').industries.find(row => row.industry === 'childcare');
  assert.equal(vt.accessEvidenceStatus, 'direct-state-publisher');
  const evidence = vt.evidence.find(item => item.type === 'published-direct-state-publisher-cohort-count');
  assert.deepEqual({recordCount:evidence.recordCount,rowUnit:evidence.rowUnit,stateBasis:evidence.stateBasis,publisherJurisdiction:evidence.publisherJurisdiction,reportedAddressState:evidence.reportedAddressState},
    {recordCount:503,rowUnit:'retained-publisher-childcare-candidate',stateBasis:'publisher-jurisdiction',publisherJurisdiction:'VT',reportedAddressState:null});
  assert.equal(evidence.enrollmentSha256, 'f43656656ef9ebd4f6afb1ae35d9ed817aaae173dbdec647a3ea3d0cbeab64b8');
  assert.equal(evidence.appReceiptSha256, binding.app_receipt_sha256);
  for (const key of ['facilityCount','uniqueBusinessCount','uniqueActiveBusinessCount','nationalCompletenessPercent','reportingPeriod']) assert.equal(evidence[key], null);
  for (const key of ['identityMatchingEligible','physicalSiteVerified','currentOperationsVerified','publicExportAuthorized','nationalReportingIntegrated','reportingPeriodVerified']) assert.equal(evidence[key], false);
  assert.equal(vt.localPublisherCohortEvidence.publisherCohortRows, 503);
  assert.equal(vt.appHandoff.jobSubmitted, false);
  for (const jurisdiction of ledger.jurisdictions.filter(row => row.state !== 'VT')) {
    const cell = jurisdiction.industries.find(row => row.industry === 'childcare');
    assert.equal(cell.evidence.some(item => item.evidenceClass === 'retained-publisher-childcare-candidate'), false);
  }
});

test('VT direct cohort admission rejects tampered and malformed enrollment evidence', async t => {
  for (const kind of ['tampered-receipt','malformed-binding']) {
    const f = await fixture(t); const binding = await installVtReportingEnrollment(f.root);
    if (kind === 'tampered-receipt') await writeFile(path.join(f.root, binding.app_receipt_path), '{}');
    else await writeFile(path.join(f.root, 'config/vt-childcare-reporting-enrollment.json'), JSON.stringify({...binding, app_receipt_sha256:'invalid'}));
    await assert.rejects(buildStateAccessLedger(f), /Vermont reporting enrollment rejected/);
  }
});

test('WA contractor publisher cohort supplies direct WA-only construction evidence', async (t) => {
  const f = await fixture(t); const ledger = await buildStateAccessLedger(f);
  const wa = ledger.jurisdictions.find(row => row.state === 'WA').industries.find(row => row.industry === 'construction');
  assert.equal(wa.accessEvidenceStatus, 'direct-state-publisher');
  const evidence = wa.evidence.find(item => item.type === 'published-direct-state-contractor-license-organization-count');
  assert.equal(evidence.recordCount, 72819);
  assert.equal(evidence.rowUnit, 'publisher-ubi-organization-with-one-or-more-a-active-contractor-license-rows');
  assert.equal(evidence.identityMatchingEligible, false); assert.equal(evidence.physicalSiteEligible, false);
  assert.equal(evidence.currentOperationsVerified, false); assert.equal(evidence.uniqueBusinessCount, null);
  assert.match(evidence.aggregateDistribution, /pddl/); assert.equal(evidence.exportPolicy, 'local-review-only');
  for (const state of ledger.jurisdictions.filter(row => row.state !== 'WA' && row.state !== 'MN')) {
    const cell = state.industries.find(row => row.industry === 'construction');
    assert.notEqual(cell.accessEvidenceStatus, 'direct-state-publisher');
    assert.equal(cell.evidence.some(item => item.type === evidence.type), false);
  }
});

test('Delaware current-license cohort supplies direct DE-only evidence without address-state, site, operation, business, or completeness claims', async (t) => {
  const f = await fixture(t); const ledger = await buildStateAccessLedger(f);
  const de = ledger.jurisdictions.find(row => row.state === 'DE').industries.find(row => row.industry === 'local-business-licenses');
  assert.equal(de.accessEvidenceStatus, 'direct-state-publisher');
  const evidence = de.evidence.find(item => item.evidenceClass === 'delaware-publisher-current-license-organization-cohort');
  assert.deepEqual({recordCount:evidence.recordCount,rowUnit:evidence.rowUnit,stateBasis:evidence.stateBasis,publisherJurisdiction:evidence.publisherJurisdiction,reportedAddressState:evidence.reportedAddressState},
    {recordCount:66667,rowUnit:'publisher-current-license-number-organization-candidate',stateBasis:'publisher-jurisdiction',publisherJurisdiction:'DE',reportedAddressState:null});
  assert.equal(evidence.identityMatchingEligible, false); assert.equal(evidence.physicalSiteEligible, false);
  assert.equal(evidence.currentOperationsVerified, false); assert.equal(evidence.uniqueBusinessCount, null);
  assert.equal(evidence.nationalCompletenessPercent, null); assert.equal(evidence.exportPolicy, 'local-review-only');
  for (const jurisdiction of ledger.jurisdictions.filter(row => row.state !== 'DE')) {
    const cell = jurisdiction.industries.find(row => row.industry === 'local-business-licenses');
    assert.equal(cell.evidence.some(item => item.evidenceClass === evidence.evidenceClass), false);
  }
});

test('Delaware current-license admission rejects tampered, malformed, non-positive, and unconserved summaries', async (t) => {
  for (const mutate of [
    summary => { summary.distinct_licenses_published = 0; },
    summary => { summary.distinct_licenses_published = '66667'; },
    summary => { summary.distinct_licenses_published -= 1; },
    summary => { summary.quarantined_license_groups -= 1; },
  ]) {
    const f = await fixture(t); const artifact = f.deManifest.artifacts.find(a => a.artifact_type === 'de-business-licenses-source-summary');
    const file = path.join(f.root, path.dirname(f.deManifestPath), artifact.path); const summary = JSON.parse(await readFile(file)); mutate(summary);
    const bytes = Buffer.from(JSON.stringify(summary)); await writeFile(file, bytes); artifact.bytes = bytes.length; artifact.sha256 = createHash('sha256').update(bytes).digest('hex');
    await writeFile(path.join(f.root, f.deManifestPath), JSON.stringify(f.deManifest));
    await assert.rejects(buildStateAccessLedger(f), /Delaware license source summary/);
  }
  const f = await fixture(t); const artifact = f.deManifest.artifacts.find(a => a.artifact_type === 'de-business-licenses-source-summary');
  await writeFile(path.join(f.root, path.dirname(f.deManifestPath), artifact.path), '{}');
  await assert.rejects(buildStateAccessLedger(f), /integrity/);
});

test('retained LA, Chicago, and NYC cohorts are locality-scoped evidence only in CA, IL, and NY', async (t) => {
  const ledger = await buildStateAccessLedger(await fixture(t));
  const expected = {
    CA:{count:633232,locality:'City of Los Angeles',unit:'publisher-active-business-location-account'},
    IL:{count:42940,locality:'City of Chicago',unit:'publisher-active-business-license-account-site'},
    NY:{count:31163,locality:'New York City',unit:'publisher-active-premises-license-business-site'},
  };
  for (const [state, value] of Object.entries(expected)) {
    const cell = ledger.jurisdictions.find(row=>row.state===state).industries.find(row=>row.industry==='local-business-licenses');
    assert.equal(cell.accessEvidenceStatus,'local-publisher-substate-evidence'); assert.equal(cell.appHandoff.status,'NOT_READY_SUBSTATE_EVIDENCE_ONLY');
    const evidence=cell.evidence.find(item=>item.type==='published-local-publisher-substate-cohort-count');
    assert.deepEqual({count:evidence.recordCount,unit:evidence.rowUnit,basis:evidence.stateBasis,stateContext:evidence.stateContext,locality:evidence.issuingLocality,reported:evidence.reportedAddressState},
      {count:value.count,unit:value.unit,basis:'issuing-locality',stateContext:state,locality:value.locality,reported:null});
    assert.equal(evidence.statewideCoverageComplete,false); assert.equal(evidence.statewideGapRemaining,true); assert.equal(evidence.completeAllBusinesses,false);
    assert.equal(evidence.currentOperationsVerified,false); assert.equal(evidence.uniqueBusinessCount,null); assert.equal(evidence.nationalCompletenessPercent,null);
  }
  for (const jurisdiction of ledger.jurisdictions.filter(row=>!Object.hasOwn(expected,row.state))) {
    const cell=jurisdiction.industries.find(row=>row.industry==='local-business-licenses');
    assert.equal(cell.evidence.some(item=>item.type==='published-local-publisher-substate-cohort-count'),false);
  }
});

test('substate license admission rejects tampered, malformed, non-positive, and unconserved summaries', async (t) => {
  const mutations = [
    ['la-active-business-location-accounts', s=>{s.normalized_us_location_accounts=0;}],
    ['chicago-active-business-license-sites', s=>{s.normalized_licensed_sites='42940';}],
    ['nyc-dcwp-active-license-sites', s=>{s.normalized_licensed_sites-=1;}],
    ['chicago-active-business-license-sites', s=>{s.quarantined_site_groups-=1;}],
  ];
  for (const [key, mutate] of mutations) {
    const f=await fixture(t), item=f.substate.find(row=>row.key===key), file=path.join(f.root,path.dirname(item.manifestPath),item.summary.path);
    const summary=JSON.parse(await readFile(file)); mutate(summary); const bytes=Buffer.from(JSON.stringify(summary)); await writeFile(file,bytes);
    item.summary.bytes=bytes.length; item.summary.sha256=createHash('sha256').update(bytes).digest('hex'); await writeFile(path.join(f.root,item.manifestPath),JSON.stringify(item.manifest));
    await assert.rejects(buildStateAccessLedger(f),/license source summary/);
  }
  const f=await fixture(t), item=f.substate[2], file=path.join(f.root,path.dirname(item.manifestPath),item.summary.path); await writeFile(file,'{}');
  await assert.rejects(buildStateAccessLedger(f),/integrity/);
});

test('WA contractor admission rejects tampered, malformed, and non-positive summaries', async (t) => {
  for (const mutate of [
    summary => { summary.active_contractor_organizations = 0; },
    summary => { summary.active_contractor_organizations = '72819'; },
    summary => { summary.active_contractor_organizations -= 1; },
  ]) {
    const f = await fixture(t); const artifact = f.waManifest.artifacts.find(a => a.artifact_type === 'wa-lni-active-contractor-licenses-source-summary');
    const file = path.join(f.root, path.dirname(f.waManifestPath), artifact.path); const summary = JSON.parse(await readFile(file)); mutate(summary);
    const bytes = Buffer.from(JSON.stringify(summary)); await writeFile(file, bytes); artifact.bytes = bytes.length; artifact.sha256 = createHash('sha256').update(bytes).digest('hex');
    await writeFile(path.join(f.root, f.waManifestPath), JSON.stringify(f.waManifest));
    await assert.rejects(buildStateAccessLedger(f), /Washington contractor source summary/);
  }
  const f = await fixture(t); const artifact = f.waManifest.artifacts.find(a => a.artifact_type === 'wa-lni-active-contractor-licenses-source-summary');
  await writeFile(path.join(f.root, path.dirname(f.waManifestPath), artifact.path), '{}');
  await assert.rejects(buildStateAccessLedger(f), /integrity/);
});

test('IRS filing-address aggregate supplies national state evidence without profile, site, identity, or completeness claims', async (t) => {
  const f = await fixture(t); const ledger = await buildStateAccessLedger(f);
  for (const state of ledger.jurisdictions) {
    const cell = state.industries.find(item => item.industry === 'tax-exempt-organizations');
    assert.equal(cell.accessEvidenceStatus, 'national-dataset-state-evidence');
    const evidence = cell.evidence.find(item => item.type === 'published-state-reported-address-aggregate-count');
    assert.ok(evidence.recordCount > 0);
    assert.equal(evidence.evidenceClass, 'reported-filing-address-aggregate');
    assert.equal(evidence.rowUnit, 'organization-filing-address-record');
    assert.equal(evidence.addressBasis, 'reported-filing-address-state');
    assert.equal(evidence.identityMatchingEligible, false);
    assert.equal(evidence.physicalSiteEligible, false);
    assert.equal(evidence.currentOperationsVerified, false);
    assert.equal(evidence.allBusinessCompleteness, null);
  }
});

test('promoted retained childcare counts become direct candidate evidence without assigning unknown address states',async t=>{
  const f=await fixture(t,{retained:true}),ledger=await buildStateAccessLedger(f);
  for(const [state,total] of Object.entries({PA:4995,CT:1390,MD:1772,CO:1648,UT:422})){
    const cell=ledger.jurisdictions.find(r=>r.state===state).industries.find(r=>r.industry==='childcare');
    assert.equal(cell.accessEvidenceStatus,'direct-state-publisher');
    const e=cell.evidence.find(e=>e.type==='published-direct-state-candidate-count');
    assert.equal(e.recordCount,total);assert.equal(e.identityMatchingEligible,false);assert.equal(e.nationalCompletenessPercent,null);
    assert.equal(cell.appHandoff.jobSubmitted,false);
  }
  for(const state of ['VT','IA']){
    const cell=ledger.jurisdictions.find(r=>r.state===state).industries.find(r=>r.industry==='childcare');
    assert.equal(cell.accessEvidenceStatus,'unsupported-evidence-not-measured');
    assert.equal(cell.evidence.some(e=>e.type==='published-direct-state-candidate-count'),false);
  }
});

test('state ledger has exactly one workstream per state and DC separately without inventing active agents', async (t) => {
  const f = await fixture(t); const ledger = await buildStateAccessLedger(f);
  assert.equal(ledger.jurisdictions.length, 51);
  assert.equal(new Set(ledger.jurisdictions.map(r => r.state)).size, 51);
  assert.equal(ledger.jurisdictions.filter(r => r.jurisdictionKind === 'state').length, 50);
  assert.equal(ledger.jurisdictions.find(r => r.state === 'DC').jurisdictionKind, 'district');
  assert.equal(ledger.evidence.coverageReleaseId, f.manifest.release_id);
  for(const state of ledger.jurisdictions)assert.deepEqual(state.industries.find(cell=>cell.industry==='construction').localCredentialEvidence,{status:'not-enrolled'});
  for(const state of ledger.jurisdictions)assert.deepEqual(state.industries.find(cell=>cell.industry==='childcare').localFacilityEvidence,{status:'not-enrolled'});
  await assert.rejects(readdir(path.join(f.root, 'data/state-access/reports')), /ENOENT/);
});

test('PA childcare enrollment identifies app execution without fabricated coverage or submission',async t=>{
  const f=await fixture(t),config=JSON.parse(await readFile(path.join(APP_ROOT,'config/industry-segments.json'),'utf8'));
  for(const prerequisite of config.sources['state-pa-childcare-centers'].prerequisites){const target=path.join(f.root,prerequisite);await mkdir(path.dirname(target),{recursive:true});await copyFile(path.join(APP_ROOT,prerequisite),target);}
  const ledger=await buildStateAccessLedger(f),cell=ledger.jurisdictions.find(r=>r.state==='PA').industries.find(r=>r.industry==='childcare');
  assert.equal(ledger.summary.industryCells,459);assert.equal(cell.accessEvidenceStatus,'unsupported-evidence-not-measured');
  assert.equal(cell.appHandoff.status,'NOT_READY_EVIDENCE_UNMEASURED');assert.equal(cell.appHandoff.configuredSources.length,1);
  assert.equal(cell.appHandoff.configuredSources[0].sourceId,'state-pa-childcare-centers');assert.equal(cell.appHandoff.configuredSources[0].acquisitionExecutor,'cotive-app');
  assert.equal(cell.appHandoff.configuredSources[0].prerequisiteStatus,'PRESENT');assert.equal(cell.appHandoff.prerequisiteContentsValidated,false);
  assert.equal(cell.appHandoff.jobSubmitted,false);assert.equal(cell.appHandoff.recurringSchedulerImplemented,null);assert.equal(cell.evidence.some(e=>e.recordCount!==undefined),false);
});

test('OK manual-only enrollment remains unmeasured and does not manufacture a source access', async t => {
  const f = await fixture(t), sourceId = 'state-ok-childcare-spatial-batch';
  const config = JSON.parse(await readFile(path.join(APP_ROOT, 'config/industry-segments.json'), 'utf8'));
  for (const prerequisite of config.sources[sourceId].prerequisites) {
    const target = path.join(f.root, prerequisite); await mkdir(path.dirname(target), { recursive: true });
    await copyFile(path.join(APP_ROOT, prerequisite), target);
  }
  const ledger = await buildStateAccessLedger(f);
  const cell = ledger.jurisdictions.find(r => r.state === 'OK').industries.find(r => r.industry === 'childcare');
  assert.equal(cell.accessEvidenceStatus, 'unsupported-evidence-not-measured');
  assert.equal(cell.appHandoff.configuredSources[0].manualSelectionRequired, true);
  assert.equal(cell.appHandoff.configuredSources[0].prerequisiteStatus, 'PRESENT');
  assert.equal(cell.appHandoff.prerequisiteContentsValidated, false);
  assert.equal(cell.appHandoff.jobSubmitted, false);
  assert.equal(cell.evidence.some(e => e.recordCount !== undefined), false);
});

test('IA app enrollment distinguishes configured execution from measured coverage and dispatch',async t=>{
  const f=await fixture(t),config=JSON.parse(await readFile(path.join(APP_ROOT,'config/industry-segments.json'),'utf8')),sourceId='state-ia-childcare-centers';
  for(const prerequisite of config.sources[sourceId].prerequisites){const target=path.join(f.root,prerequisite);await mkdir(path.dirname(target),{recursive:true});await copyFile(path.join(APP_ROOT,prerequisite),target);}
  const ledger=await buildStateAccessLedger(f),cell=ledger.jurisdictions.find(r=>r.state==='IA').industries.find(r=>r.industry==='childcare');
  assert.equal(ledger.summary.industryCells,459);assert.equal(cell.accessEvidenceStatus,'unsupported-evidence-not-measured');
  assert.equal(cell.appHandoff.configuredSources.length,1);assert.equal(cell.appHandoff.configuredSources[0].sourceId,sourceId);
  assert.equal(cell.appHandoff.configuredSources[0].acquisitionExecutor,'cotive-app');assert.equal(cell.appHandoff.configuredSources[0].prerequisiteStatus,'PRESENT');
  assert.equal(cell.appHandoff.jobSubmitted,false);assert.equal(cell.appHandoff.prerequisiteContentsValidated,false);
  assert.equal(cell.evidence.some(e=>e.recordCount!==undefined),false);assert.deepEqual(cell.localSourceCandidateEvidence,{status:'not-enrolled'});
});

test('CT childcare app enrollment does not manufacture national coverage or dispatch',async t=>{
  const f=await fixture(t),config=JSON.parse(await readFile(path.join(APP_ROOT,'config/industry-segments.json'),'utf8'));
  for(const prerequisite of config.sources['state-ct-childcare-centers'].prerequisites){const target=path.join(f.root,prerequisite);await mkdir(path.dirname(target),{recursive:true});await copyFile(path.join(APP_ROOT,prerequisite),target);}
  const ledger=await buildStateAccessLedger(f),cell=ledger.jurisdictions.find(r=>r.state==='CT').industries.find(r=>r.industry==='childcare');
  assert.equal(cell.accessEvidenceStatus,'unsupported-evidence-not-measured');
  assert.equal(cell.appHandoff.configuredSources[0].sourceId,'state-ct-childcare-centers');
  assert.equal(cell.appHandoff.configuredSources[0].acquisitionExecutor,'cotive-app');
  assert.equal(cell.appHandoff.configuredSources[0].prerequisiteStatus,'PRESENT');
  assert.equal(cell.appHandoff.jobSubmitted,false);assert.equal(cell.appHandoff.prerequisiteContentsValidated,false);
  assert.equal(cell.evidence.some(e=>e.recordCount!==undefined),false);
});

test('MD childcare app enrollment remains separate from measured national coverage and actual dispatch',async t=>{
  const f=await fixture(t),config=JSON.parse(await readFile(path.join(APP_ROOT,'config/industry-segments.json'),'utf8'));
  for(const prerequisite of config.sources['state-md-childcare-centers'].prerequisites){const target=path.join(f.root,prerequisite);await mkdir(path.dirname(target),{recursive:true});await copyFile(path.join(APP_ROOT,prerequisite),target);}
  const ledger=await buildStateAccessLedger(f),cell=ledger.jurisdictions.find(r=>r.state==='MD').industries.find(r=>r.industry==='childcare');
  assert.equal(cell.accessEvidenceStatus,'unsupported-evidence-not-measured');
  assert.equal(cell.appHandoff.configuredSources.length,1);
  assert.equal(cell.appHandoff.configuredSources[0].sourceId,'state-md-childcare-centers');
  assert.equal(cell.appHandoff.configuredSources[0].acquisitionExecutor,'cotive-app');
  assert.equal(cell.appHandoff.configuredSources[0].prerequisiteStatus,'PRESENT');
  assert.equal(cell.appHandoff.jobSubmitted,false);assert.equal(cell.appHandoff.prerequisiteContentsValidated,false);
  assert.equal(cell.evidence.some(e=>e.recordCount!==undefined),false);
});

test('VT app enrollment is explicitly unmeasured and does not imply records or submitted jobs',async t=>{
  const f=await fixture(t),config=JSON.parse(await readFile(path.join(APP_ROOT,'config/industry-segments.json'),'utf8'));
  for(const prerequisite of config.sources['state-vt-childcare-centers'].prerequisites){const target=path.join(f.root,prerequisite);await mkdir(path.dirname(target),{recursive:true});await copyFile(path.join(APP_ROOT,prerequisite),target);}
  const ledger=await buildStateAccessLedger(f),cell=ledger.jurisdictions.find(r=>r.state==='VT').industries.find(r=>r.industry==='childcare');
  assert.equal(ledger.summary.industryCells,459);
  assert.equal(cell.accessEvidenceStatus,'unsupported-evidence-not-measured');
  assert.equal(cell.appHandoff.status,'NOT_READY_EVIDENCE_UNMEASURED');
  assert.equal(cell.appHandoff.configuredSources.length,1);
  assert.equal(cell.appHandoff.configuredSources[0].sourceId,'state-vt-childcare-centers');
  assert.equal(cell.appHandoff.configuredSources[0].acquisitionExecutor,'cotive-app');
  assert.equal(cell.appHandoff.configuredSources[0].prerequisiteStatus,'PRESENT');
  assert.equal(cell.appHandoff.jobSubmitted,false);assert.equal(cell.appHandoff.prerequisiteContentsValidated,false);
  assert.equal(cell.appHandoff.recurringSchedulerImplemented,null);
  assert.equal(cell.evidence.some(e=>e.recordCount!==undefined),false);
  assert.deepEqual(cell.localSourceCandidateEvidence,{status:'not-enrolled'});
  assert.deepEqual(cell.localPublisherCohortEvidence,{status:'not-enrolled'});
});

test('CO app enrollment does not manufacture measured records or submitted jobs',async t=>{
  const f=await fixture(t),config=JSON.parse(await readFile(path.join(APP_ROOT,'config/industry-segments.json'),'utf8'));
  for(const prerequisite of config.sources['state-co-childcare-centers'].prerequisites){const target=path.join(f.root,prerequisite);await mkdir(path.dirname(target),{recursive:true});await copyFile(path.join(APP_ROOT,prerequisite),target);}
  const ledger=await buildStateAccessLedger(f),cell=ledger.jurisdictions.find(r=>r.state==='CO').industries.find(r=>r.industry==='childcare');
  assert.equal(ledger.summary.industryCells,459);
  assert.equal(cell.accessEvidenceStatus,'unsupported-evidence-not-measured');
  assert.equal(cell.appHandoff.configuredSources.length,1);
  assert.equal(cell.appHandoff.configuredSources[0].sourceId,'state-co-childcare-centers');
  assert.equal(cell.appHandoff.configuredSources[0].acquisitionExecutor,'cotive-app');
  assert.equal(cell.appHandoff.configuredSources[0].prerequisiteStatus,'PRESENT');
  assert.equal(cell.appHandoff.jobSubmitted,false);assert.equal(cell.appHandoff.prerequisiteContentsValidated,false);
  assert.equal(cell.appHandoff.recurringSchedulerImplemented,null);
  assert.equal(cell.evidence.some(e=>e.recordCount!==undefined),false);
  assert.deepEqual(cell.localSourceCandidateEvidence,{status:'not-enrolled'});
});

test('UT offline app enrollment preserves unmeasured coverage and does not invent acquisition or dispatch',async t=>{
  const f=await fixture(t),config=JSON.parse(await readFile(path.join(APP_ROOT,'config/industry-segments.json'),'utf8'));
  const sourceId='state-ut-childcare-centers-retained';
  for(const prerequisite of config.sources[sourceId].prerequisites){const target=path.join(f.root,prerequisite);await mkdir(path.dirname(target),{recursive:true});await copyFile(path.join(APP_ROOT,prerequisite),target);}
  const ledger=await buildStateAccessLedger(f),cell=ledger.jurisdictions.find(r=>r.state==='UT').industries.find(r=>r.industry==='childcare');
  assert.equal(ledger.summary.industryCells,459);
  assert.equal(cell.accessEvidenceStatus,'unsupported-evidence-not-measured');
  assert.equal(cell.appHandoff.status,'NOT_READY_EVIDENCE_UNMEASURED');
  assert.equal(cell.appHandoff.configuredSources.length,1);
  assert.equal(cell.appHandoff.configuredSources[0].sourceId,sourceId);
  assert.equal(cell.appHandoff.configuredSources[0].prerequisiteStatus,'PRESENT');
  assert.ok(cell.appHandoff.configuredSources[0].limitations.some(note=>note.includes('No download')));
  assert.equal(cell.appHandoff.jobSubmitted,false);assert.equal(cell.appHandoff.prerequisiteContentsValidated,false);
  assert.equal(cell.evidence.some(e=>e.recordCount!==undefined),false);
  assert.deepEqual(cell.localSourceCandidateEvidence,{status:'not-enrolled'});
});

test('UT retained reporting enrollment preserves national totals and distinguishes absent installed evidence',async t=>{
  const f=await fixture(t),before=await buildStateAccessLedger(f);
  await copyFile(path.join(APP_ROOT,'config/ut-childcare-reporting-enrollment.json'),path.join(f.root,'config/ut-childcare-reporting-enrollment.json'));
  const after=await buildStateAccessLedger(f);assert.deepEqual(after.summary,before.summary);
  for(const jurisdiction of after.jurisdictions){
    const cell=jurisdiction.industries.find(r=>r.industry==='childcare'),prior=before.jurisdictions.find(r=>r.state===jurisdiction.state).industries.find(r=>r.industry==='childcare');
    assert.equal(cell.accessEvidenceStatus,prior.accessEvidenceStatus);assert.deepEqual(cell.evidence,prior.evidence);assert.deepEqual(cell.appHandoff,prior.appHandoff);
    if(jurisdiction.state==='UT')assert.deepEqual(cell.localSourceCandidateEvidence,{status:'unavailable',reason:'enrolled-receipt-not-installed'});
    else assert.deepEqual(cell.localSourceCandidateEvidence,prior.localSourceCandidateEvidence);
  }
});

test('CO retained enrollment preserves national totals and exposes absent installed data as unavailable',async t=>{
  const f=await fixture(t),before=await buildStateAccessLedger(f);
  await copyFile(path.join(APP_ROOT,'config/co-childcare-reporting-enrollment.json'),path.join(f.root,'config/co-childcare-reporting-enrollment.json'));
  const after=await buildStateAccessLedger(f);assert.deepEqual(after.summary,before.summary);
  for(const jurisdiction of after.jurisdictions){
    const cell=jurisdiction.industries.find(r=>r.industry==='childcare'),prior=before.jurisdictions.find(r=>r.state===jurisdiction.state).industries.find(r=>r.industry==='childcare');
    assert.equal(cell.accessEvidenceStatus,prior.accessEvidenceStatus);assert.deepEqual(cell.evidence,prior.evidence);assert.deepEqual(cell.appHandoff,prior.appHandoff);
    if(jurisdiction.state==='CO')assert.deepEqual(cell.localSourceCandidateEvidence,{status:'unavailable',reason:'enrolled-receipt-not-installed'});
    else assert.deepEqual(cell.localSourceCandidateEvidence,prior.localSourceCandidateEvidence);
  }
});

test('VT publisher cohort enrollment is separate from address coverage and missing data is not zero',async t=>{
  const f=await fixture(t),before=await buildStateAccessLedger(f);
  await copyFile(path.join(APP_ROOT,'config/vt-childcare-reporting-enrollment.json'),path.join(f.root,'config/vt-childcare-reporting-enrollment.json'));
  const after=await buildStateAccessLedger(f);
  assert.deepEqual(after.summary,before.summary);
  for(const jurisdiction of after.jurisdictions){
    const cell=jurisdiction.industries.find(r=>r.industry==='childcare');
    const prior=before.jurisdictions.find(r=>r.state===jurisdiction.state).industries.find(r=>r.industry==='childcare');
    assert.deepEqual(cell.evidence,prior.evidence);assert.deepEqual(cell.appHandoff,prior.appHandoff);
    assert.deepEqual(cell.localSourceCandidateEvidence,prior.localSourceCandidateEvidence);
    if(jurisdiction.state==='VT'){
      assert.equal(cell.localPublisherCohortEvidence.status,'unavailable');
      assert.equal(cell.localPublisherCohortEvidence.reason,'enrolled-receipt-not-installed');
      assert.equal(cell.localPublisherCohortEvidence.publisherCohortRows,undefined);
    }else assert.deepEqual(cell.localPublisherCohortEvidence,prior.localPublisherCohortEvidence);
  }
});

test('CT reporting enrollment without installed files is unavailable, separate from PA facility evidence',async t=>{
  const f=await fixture(t);await copyFile(path.join(APP_ROOT,'config/ct-childcare-reporting-enrollment.json'),path.join(f.root,'config/ct-childcare-reporting-enrollment.json'));
  const ledger=await buildStateAccessLedger(f),cell=ledger.jurisdictions.find(r=>r.state==='CT').industries.find(r=>r.industry==='childcare');
  assert.equal(cell.localSourceCandidateEvidence.status,'unavailable');assert.equal(cell.localSourceCandidateEvidence.reason,'enrolled-receipt-not-installed');
  assert.equal(cell.localSourceCandidateEvidence.candidateRows,undefined);assert.equal(cell.localFacilityEvidence.status,'not-enrolled');
  assert.equal(cell.accessEvidenceStatus,'unsupported-evidence-not-measured');assert.equal(cell.appHandoff.jobSubmitted,false);
});

test('PA reporting binding with uninstalled retained files is unavailable rather than zero coverage',async t=>{
  const f=await fixture(t);await copyFile(path.join(APP_ROOT,'config/pa-childcare-reporting-enrollment.json'),path.join(f.root,'config/pa-childcare-reporting-enrollment.json'));
  const ledger=await buildStateAccessLedger(f),cell=ledger.jurisdictions.find(r=>r.state==='PA').industries.find(r=>r.industry==='childcare');
  assert.equal(cell.localFacilityEvidence.status,'unavailable');assert.equal(cell.localFacilityEvidence.reason,'enrolled-receipt-not-installed');assert.equal(cell.localFacilityEvidence.facilityRows,undefined);
  assert.equal(cell.accessEvidenceStatus,'unsupported-evidence-not-measured');assert.equal(cell.appHandoff.jobSubmitted,false);
});

test('MD reporting remains local, missing retained data is not zero and CT evidence is preserved',async t=>{
  const f=await fixture(t);
  await copyFile(path.join(APP_ROOT,'config/md-childcare-reporting-enrollment.json'),path.join(f.root,'config/md-childcare-reporting-enrollment.json'));
  const ledger=await buildStateAccessLedger(f);
  const cell=ledger.jurisdictions.find(r=>r.state==='MD').industries.find(r=>r.industry==='childcare');
  assert.equal(cell.localSourceCandidateEvidence.status,'unavailable');
  assert.equal(cell.localSourceCandidateEvidence.reason,'enrolled-receipt-not-installed');
  assert.equal(cell.localSourceCandidateEvidence.candidateRows,undefined);
  assert.equal(cell.localFacilityEvidence.status,'not-enrolled');
  assert.equal(cell.accessEvidenceStatus,'unsupported-evidence-not-measured');
  assert.equal(cell.appHandoff.jobSubmitted,false);
  assert.equal(ledger.summary.industryCells,459);
  for(const jurisdiction of ledger.jurisdictions.filter(r=>r.state!=='MD')){
    assert.equal(jurisdiction.industries.find(r=>r.industry==='childcare').localSourceCandidateEvidence.status,'not-enrolled');
  }
});

test('Alaska enrollment identifies app execution without claiming a new dispatch', async (t) => {
  const f = await fixture(t); const ledger = await buildStateAccessLedger(f);
  const cell = ledger.jurisdictions.find(r => r.state === 'AK').industries.find(r => r.industry === 'local-business-licenses');
  const source = cell.appHandoff.configuredSources.find(r => r.sourceId === 'state-ak-business-licenses');
  assert.ok(source);
  assert.equal(source.acquisitionExecutor, 'cotive-app');
  assert.equal(cell.appHandoff.jobSubmitted, false);
  assert.equal(cell.appHandoff.recurringSchedulerImplemented, null);
});

test('state ledger distinguishes observed national state records from direct state access', async (t) => {
  const f = await fixture(t); const ledger = await buildStateAccessLedger(f);
  const alabama = ledger.jurisdictions.find(r => r.state === 'AL');
  const retail = alabama.industries.find(r => r.industry === 'retail-consumer');
  assert.match(JSON.stringify(retail), /national-dataset-state-evidence/);
  assert.ok(retail.evidence.some(e => e.recordCount > 0));
  assert.doesNotMatch(JSON.stringify(retail), /"status":"direct-state-publisher"/);
});

test('state ledger does not infer scheduler implementation or actual dispatch from source evidence', async (t) => {
  const f = await fixture(t); const ledger = await buildStateAccessLedger(f);
  for (const state of ledger.jurisdictions) for (const cell of state.industries) {
    assert.equal(cell.appHandoff.recurringSchedulerImplemented, null);
    assert.equal(cell.appHandoff.schedulerObservation, 'not-inspected-by-ledger');
    assert.equal(cell.appHandoff.jobSubmitted, false);
    assert.equal(cell.appHandoff.prerequisiteContentsValidated, false);
  }
});

test('Iowa local enrollment missing artifacts does not manufacture national evidence', async (t) => {
  const f = await fixture(t), before = await buildStateAccessLedger(f);
  await copyFile(path.join(APP_ROOT, 'config/ia-childcare-reporting-enrollment.json'), path.join(f.root, 'config/ia-childcare-reporting-enrollment.json'));
  const after = await buildStateAccessLedger(f);
  assert.deepEqual(after.summary, before.summary);
  const cell = ledger => ledger.jurisdictions.find(r => r.state === 'IA').industries.find(r => r.industry === 'childcare');
  assert.equal(cell(before).localPublisherCohortEvidence.status, 'not-enrolled');
  assert.equal(cell(after).localPublisherCohortEvidence.status, 'unavailable');
  assert.equal(cell(after).localPublisherCohortEvidence.publisherCohortRows, undefined);
  delete cell(before).localPublisherCohortEvidence;
  delete cell(after).localPublisherCohortEvidence;
  assert.deepEqual(after.jurisdictions, before.jurisdictions);
});

test('state ledger rejects artifact tampering before claiming access evidence', async (t) => {
  const f = await fixture(t); const artifact = f.manifest.artifacts.find(a => a.artifact_type === 'state-coverage-view-jsonl');
  await writeFile(path.join(f.root, path.dirname(f.manifestPath), artifact.path), '{}\n');
  await assert.rejects(buildStateAccessLedger(f), /hash|checksum|bytes|artifact/i);
});

test('state ledger rejects duplicate state workstreams', async (t) => {
  const f = await fixture(t); const file = path.join(f.root, 'config/state-access-workstreams.json');
  const original = await readFile(file, 'utf8');
  assert.match(original, /"AK"/);
  await writeFile(file, original.replace('"AK"', '"AL"'));
  await assert.rejects(buildStateAccessLedger(f), /unique|duplicate|state|jurisdiction|workstream/i);
});

test('state access reports are unique local artifacts and preserve their evidence', async (t) => {
  const f = await fixture(t); const first = await writeStateAccessReport(f); const before = await readFile(first.reportPath);
  const second = await writeStateAccessReport(f);
  assert.notEqual(first.reportPath, second.reportPath);
  assert.ok(path.relative(f.root, first.reportPath).replaceAll('\\', '/').startsWith('data/state-access/reports/'));
  assert.equal(createHash('sha256').update(await readFile(first.reportPath)).digest('hex'), createHash('sha256').update(before).digest('hex'));
});

test('MA childcare app enrollment does not manufacture national reporting evidence', async (t) => {
  const f = await fixture(t); await childcareCounts(f, undefined); const ledger = await buildStateAccessLedger(f);
  const cell = ledger.jurisdictions.find(r => r.state === 'MA').industries.find(r => r.industry === 'childcare');
  assert.equal(cell.accessEvidenceStatus, 'unsupported-evidence-not-measured');
  assert.equal(cell.appHandoff.status, 'NOT_READY_EVIDENCE_UNMEASURED');
  assert.equal(cell.appHandoff.configuredSources[0].sourceId, 'state-ma-childcare');
  assert.equal(cell.appHandoff.configuredSources[0].acquisitionExecutor, 'cotive-app');
  assert.equal(cell.appHandoff.configuredSources[0].prerequisiteStatus, 'PRESENT');
  assert.equal(cell.evidence.some(e => e.recordCount !== undefined), false);
  assert.equal(cell.appHandoff.jobSubmitted, false);
  const other = ledger.jurisdictions.find(r => r.state === 'NY').industries.find(r => r.industry === 'childcare');
  assert.equal(other.accessEvidenceStatus, 'unsupported-missing');
  assert.deepEqual(other.appHandoff.configuredSources, []);
});

test('TN childcare enrollment remains unmeasured until national reporting integration', async (t) => {
  const f = await fixture(t); await childcareCounts(f, undefined); const ledger = await buildStateAccessLedger(f);
  const cell = ledger.jurisdictions.find(r => r.state === 'TN').industries.find(r => r.industry === 'childcare');
  assert.equal(cell.accessEvidenceStatus, 'unsupported-evidence-not-measured');
  assert.equal(cell.appHandoff.status, 'NOT_READY_EVIDENCE_UNMEASURED');
  assert.equal(cell.appHandoff.configuredSources[0].sourceId, 'state-tn-childcare');
  assert.equal(cell.appHandoff.configuredSources[0].acquisitionExecutor, 'cotive-app');
  assert.equal(cell.evidence.some(e => e.recordCount !== undefined), false);
  assert.equal(cell.appHandoff.jobSubmitted, false);
});

test('OH published reporting count is direct evidence without implying identity matching or job submission', async (t) => {
  const f = await fixture(t);
  await copyFile(path.join(APP_ROOT, 'config/oh-childcare-app-enrollment.json'), path.join(f.root, 'config/oh-childcare-app-enrollment.json'));
  const ledger = await buildStateAccessLedger(f), cell = ledger.jurisdictions.find(r => r.state === 'OH').industries.find(r => r.industry === 'childcare');
  assert.equal(cell.accessEvidenceStatus, 'direct-state-publisher');
  assert.equal(cell.appHandoff.status, 'APP_PREFLIGHT_REQUIRED');
  assert.equal(cell.appHandoff.configuredSources[0].sourceId, 'state-oh-childcare');
  assert.equal(cell.appHandoff.configuredSources[0].prerequisiteStatus, 'PRESENT');
  assert.equal(cell.appHandoff.jobSubmitted, false);
  assert.deepEqual(cell.evidence.filter(e => e.recordCount !== undefined).map(e => [e.type, e.sourceId, e.recordCount]), [['published-direct-state-reporting-count', 'oh-dcy-publisher-open-childcare-centers', 4237]]);
});

test('MN governed credential extension is direct reporting evidence without implying businesses, sites or dispatch', async (t) => {
  const f = await fixture(t);
  await copyFile(path.join(APP_ROOT, 'config/mn-construction-app-enrollment.json'), path.join(f.root, 'config/mn-construction-app-enrollment.json'));
  const ledger = await buildStateAccessLedger(f);
  const cell = ledger.jurisdictions.find(r => r.state === 'MN').industries.find(r => r.industry === 'construction');
  assert.equal(cell.accessEvidenceStatus, 'direct-state-publisher');
  assert.equal(cell.appHandoff.status, 'APP_PREFLIGHT_REQUIRED');
  assert.deepEqual(cell.appHandoff.configuredSources.map(s => s.sourceId).sort(), ['state-mn-contractor-registrations', 'state-mn-residential-contractors']);
  for (const source of cell.appHandoff.configuredSources) assert.equal(source.prerequisiteStatus, 'PRESENT');
  assert.equal(cell.appHandoff.jobSubmitted, false);
  assert.deepEqual(cell.evidence.filter(e => e.type === 'published-direct-state-credential-count'), [{
    type: 'published-direct-state-credential-count', sourceId: 'mn-construction-credential-reporting', recordCount: 10899,
    coverageReleaseId: ledger.evidence.coverageReleaseId, artifactPath: ledger.evidence.stateArtifactPath,
    rowUnit: 'publisher-business-credential-row', addressBasis: 'reported-address-state', identityMatchingEligible: false,
    physicalSiteEligible: false, currentOperationsVerified: false, exportPolicy: 'local-review-only', nationalCompletenessPercent: null,
  }]);
});

async function mutateStateRows(f, mutate) {
  const artifact = f.manifest.artifacts.find(a => a.artifact_type === 'state-coverage-view-jsonl');
  const file = path.join(f.root, path.dirname(f.manifestPath), artifact.path);
  const rows = (await readFile(file, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  await mutate(rows);
  const bytes = Buffer.from(`${rows.map(row => JSON.stringify(row)).join('\n')}\n`);
  await writeFile(file, bytes); artifact.bytes = bytes.length; artifact.sha256 = createHash('sha256').update(bytes).digest('hex');
  await writeFile(path.join(f.root, f.manifestPath), JSON.stringify(f.manifest));
}

test('absent governed MN and OH reporting remains unmeasured despite app enrollment', async (t) => {
  const f = await fixture(t);
  await mutateStateRows(f, rows => { for (const row of rows) delete row.mn_construction_credential_reporting; const ohio = rows.find(row => row.postal_abbreviation === 'OH'); delete ohio.registry_evidence.source_profile_counts_by_reported_address_state['oh-dcy-publisher-open-childcare-centers']; });
  const ledger = await buildStateAccessLedger(f);
  for (const [state, industry] of [['MN', 'construction'], ['OH', 'childcare']]) {
    const cell = ledger.jurisdictions.find(row => row.state === state).industries.find(row => row.industry === industry);
    assert.equal(cell.accessEvidenceStatus, 'unsupported-evidence-not-measured');
    assert.equal(cell.evidence.some(item => item.recordCount !== undefined), false);
    assert.equal(cell.appHandoff.jobSubmitted, false);
  }
});

test('malformed governed MN credential semantics are rejected', async (t) => {
  const f = await fixture(t);
  await mutateStateRows(f, rows => { rows.find(row => row.postal_abbreviation === 'MN').mn_construction_credential_reporting.unique_business_count = 10899; });
  await assert.rejects(buildStateAccessLedger(f), /Minnesota credential reporting metric/);
});

test('positive out-of-state MN credential rows become national source-cohort evidence, never direct publisher access', async (t) => {
  const f = await fixture(t), ledger = await buildStateAccessLedger(f);
  const alabama = ledger.jurisdictions.find(row => row.state === 'AL').industries.find(row => row.industry === 'construction');
  const artifact = f.manifest.artifacts.find(item => item.artifact_type === 'state-coverage-view-jsonl');
  const rows = (await readFile(path.join(f.root, path.dirname(f.manifestPath), artifact.path), 'utf8')).trim().split('\n').map(JSON.parse);
  assert.ok(rows.find(row => row.postal_abbreviation === 'AL').mn_construction_credential_reporting.credential_rows > 0);
  assert.equal(alabama.accessEvidenceStatus, 'national-dataset-state-evidence');
  assert.equal(alabama.evidence.some(item => item.type === 'published-direct-state-credential-count'), false);
  const evidence=alabama.evidence.find(item=>item.type==='published-national-source-cohort-reported-address-count');
  assert.deepEqual({publisher:evidence.publisherJurisdiction,state:evidence.reportedAddressState,rows:evidence.recordCount,rowUnit:evidence.rowUnit,policy:evidence.exportPolicy},
    {publisher:'MN',state:'AL',rows:1,rowUnit:'publisher-business-credential-row',policy:'local-review-only'});
  for(const key of ['uniqueBusinessCount','activeBusinessCount','physicalSiteCount','nationalCompletenessPercent'])assert.equal(evidence[key],null);
  for(const key of ['identityMatchingEligible','physicalSiteEligible','currentOperationsVerified','geographicAssignmentPerformed','publicExportAuthorized'])assert.equal(evidence[key],false);
});

test('zero MN credential observations remain missing and do not manufacture publisher access',async(t)=>{
  const f=await fixture(t),ledger=await buildStateAccessLedger(f),cell=ledger.jurisdictions.find(r=>r.state==='AK').industries.find(r=>r.industry==='construction');
  assert.equal(cell.accessEvidenceStatus,'unsupported-missing');
  assert.equal(cell.evidence.some(e=>e.sourceId==='mn-construction-credential-reporting'),false);
});

test('MN credential admission rejects an unverified or mismatched publication receipt chain',async(t)=>{
  for(const publication of [{status:'evidence-unverified'},{status:'verified-downstream-publication',included:true,credentialRows:11456,recordUnit:'publisher-business-credential-row',exportPolicy:'local-review-only',uniqueBusinessCount:null,activeBusinessCount:null,physicalSiteCount:null,nationalCompletenessPercent:null,geographicAssignmentPerformed:false,publicExportAuthorized:false,coverageReleaseId:'wrong',coverageManifestSha256:'a'.repeat(64)}]){
    const f=await fixture(t);await assert.rejects(buildStateAccessLedger({...f,mnCredentialPublicationLoader:async()=>publication}),/verified downstream publication receipt chain/);
  }
});

test('MN credential source-cohort admission conserves positive state rows and is construction-only',async(t)=>{
  const f=await fixture(t),ledger=await buildStateAccessLedger(f);
  const admitted=ledger.jurisdictions.flatMap(j=>j.industries.filter(i=>i.industry==='construction').flatMap(i=>i.evidence.filter(e=>e.type==='published-national-source-cohort-reported-address-count')));
  assert.equal(admitted.length,33);assert.equal(admitted.reduce((sum,e)=>sum+e.recordCount,0),557);
  assert.equal(ledger.jurisdictions.find(j=>j.state==='MN').industries.find(i=>i.industry==='construction').evidence.find(e=>e.type==='published-direct-state-credential-count').recordCount,10899);
  assert.equal(557+10899,11456);
  for(const jurisdiction of ledger.jurisdictions)for(const cell of jurisdiction.industries.filter(i=>i.industry!=='construction'))assert.equal(cell.evidence.some(e=>e.sourceId==='mn-construction-credential-reporting'),false);
});

test('MN and OH reporting projections conserve the four state-access categories', async (t) => {
  const f = await fixture(t), projected = await buildStateAccessLedger(f);
  await mutateStateRows(f, rows => { for (const row of rows) delete row.mn_construction_credential_reporting; const ohio = rows.find(row => row.postal_abbreviation === 'OH'); delete ohio.registry_evidence.source_profile_counts_by_reported_address_state['oh-dcy-publisher-open-childcare-centers']; });
  const absent = await buildStateAccessLedger(f), before = absent.summary.accessEvidenceStatusCounts, after = projected.summary.accessEvidenceStatusCounts;
  assert.deepEqual(Object.keys(after).sort(), ['direct-state-publisher', 'local-publisher-substate-evidence', 'national-dataset-state-evidence', 'unsupported-evidence-not-measured', 'unsupported-missing']);
  assert.equal(after['direct-state-publisher'], before['direct-state-publisher'] + 2);
  assert.equal(after['unsupported-evidence-not-measured'], before['unsupported-evidence-not-measured'] - 2);
  assert.equal(after['national-dataset-state-evidence'], before['national-dataset-state-evidence'] + 32);
  assert.equal(after['unsupported-missing'], before['unsupported-missing'] - 32);
  assert.equal(Object.values(after).reduce((sum, count) => sum + count, 0), projected.summary.industryCells);
});

async function childcareCounts(f, value) {
  const artifact=f.manifest.artifacts.find(a=>a.artifact_type==='state-coverage-view-jsonl');
  const file=path.join(f.root,path.dirname(f.manifestPath),artifact.path);
  const rows=(await readFile(file,'utf8')).trim().split('\n').map(line=>JSON.parse(line));
  for(const row of rows){
    const source=row.postal_abbreviation==='MA'?'ma-licensed-center-based-childcare':row.postal_abbreviation==='NJ'?'nj-licensed-childcare-centers':row.postal_abbreviation==='TN'?'tn-dhs-active-childcare-centers':null;
    if(!source)continue;
    row.registry_evidence??={};row.registry_evidence.source_profile_counts_by_reported_address_state??={};
    if(value===undefined)delete row.registry_evidence.source_profile_counts_by_reported_address_state[source];
    else row.registry_evidence.source_profile_counts_by_reported_address_state[source]=value;
  }
  const bytes=Buffer.from(`${rows.map(row=>JSON.stringify(row)).join('\n')}\n`);
  await writeFile(file,bytes);artifact.bytes=bytes.length;artifact.sha256=createHash('sha256').update(bytes).digest('hex');
  await writeFile(path.join(f.root,f.manifestPath),JSON.stringify(f.manifest));
}

test('state ledger keeps absent MA/NJ/TN reporting integration unmeasured rather than measured zero',async(t)=>{
  const f=await fixture(t);await childcareCounts(f,undefined);const ledger=await buildStateAccessLedger(f);
  for(const state of ['MA','NJ','TN']){
    const cell=ledger.jurisdictions.find(r=>r.state===state).industries.find(r=>r.industry==='childcare');
    assert.equal(cell.accessEvidenceStatus,'unsupported-evidence-not-measured');assert.equal(cell.appHandoff.status,'NOT_READY_EVIDENCE_UNMEASURED');
    assert.equal(cell.evidence.some(e=>e.recordCount!==undefined),false);assert.equal(cell.appHandoff.jobSubmitted,false);
  }
});

test('state ledger identifies positive MA/NJ/TN counts as direct reporting evidence without submitting jobs',async(t)=>{
  const f=await fixture(t);await childcareCounts(f,7);
  const ledger=await buildStateAccessLedger({...f,coverageReassessmentLoader:async()=>null,assessmentLoader:async()=>({assessment_catalog_id:'historic-hold',coverage_release_id:'older-coverage',states:[{state_abbreviation:'NJ',decision:'hold',assessment_id:'unrelated-publisher-hold',strongest_bounded_next_action:'Review another state source.'}]})});
  for(const state of ['MA','NJ','TN']){
    const cell=ledger.jurisdictions.find(r=>r.state===state).industries.find(r=>r.industry==='childcare');
    assert.equal(cell.accessEvidenceStatus,'direct-state-publisher');assert.equal(cell.appHandoff.status,'APP_PREFLIGHT_REQUIRED');
    assert.deepEqual(cell.evidence.filter(e=>e.recordCount!==undefined).map(e=>[e.type,e.recordCount]),[['published-direct-state-reporting-count',7]]);
    assert.equal(cell.appHandoff.jobSubmitted,false);assert.equal(cell.appHandoff.prerequisiteContentsValidated,false);
  }
  const nj=ledger.jurisdictions.find(r=>r.state==='NJ').industries.find(r=>r.industry==='childcare');
  assert.ok(nj.evidence.some(e=>e.type==='historical-state-publisher-assessment-hold'&&e.assessmentCoverageReleaseId==='older-coverage'&&e.assessmentFreshnessStatus==='stale'&&e.evidenceClass==='assessment-context-not-coverage-evidence'));
  await assert.rejects(readdir(path.join(f.root,'data/state-access/reports')),/ENOENT/);
});

test('state ledger distinguishes measured zero and rejects malformed reporting counts',async(t)=>{
  const f=await fixture(t);await childcareCounts(f,0);const ledger=await buildStateAccessLedger(f);
  for(const state of ['MA','NJ','TN'])assert.equal(ledger.jurisdictions.find(r=>r.state===state).industries.find(r=>r.industry==='childcare').accessEvidenceStatus,'unsupported-missing');
  for(const count of [-1,1.5,'7']){await childcareCounts(f,count);await assert.rejects(buildStateAccessLedger(f),/reporting count/);}
});

test('state ledger cannot infer free agent capacity from an empty state-assignment list', async (t) => {
  const f = await fixture(t); const ledger = await buildStateAccessLedger(f);
  assert.equal(ledger.dispatch.availableDispatchSlots, null);
});

test('state report writer rejects linked output ancestry before creating output', async (t) => {
  const f = await fixture(t); const redirected = path.join(f.root, 'redirected'); await mkdir(redirected);
  await symlink(redirected, path.join(f.root, 'data/state-access'), 'junction');
  await assert.rejects(writeStateAccessReport(f), /link|junction|symlink/i);
  assert.deepEqual(await readdir(redirected), []);
});

test('state ledger rejects more reported active state agents than the entire runtime allows', async (t) => {
  const f = await fixture(t);
  await assert.rejects(buildStateAccessLedger({ ...f, activeAssignments: ['AL', 'AK', 'AZ', 'AR', 'CA'] }), /agent|capacity|concurr|assignment/i);
});

test('state ledger discloses historical assessment provenance when coverage snapshots differ', async (t) => {
  const f = { ...await fixture(t), coverageReassessmentLoader: async () => null };
  const baseline = await buildStateAccessLedger({ ...f, assessmentLoader: async () => ({ assessment_catalog_id: 'historic-assessment', coverage_release_id: 'older-coverage', observed_at: '2026-09-01', states: [] }) });
  const ledger = await buildStateAccessLedger({ ...f, assessmentLoader: async () => ({ assessment_catalog_id: 'historic-assessment', coverage_release_id: 'older-coverage', observed_at: '2026-09-01', states: [{ state_abbreviation: 'AL', assessment_id: 'al-history', decision: 'hold', strongest_bounded_next_action: 'Revalidate against the current release.' }] }) });
  assert.equal(ledger.schemaVersion, 3);
  assert.equal(ledger.evidence.assessmentCoverageReleaseId, 'older-coverage');
  assert.equal(ledger.evidence.assessmentObservedAt, '2026-09-01');
  assert.equal(ledger.evidence.assessmentCoverageMatchesCurrent, false);
  assert.deepEqual(ledger.evidence.assessmentFreshness, {
    status: 'stale',
    currentCoverageReleaseId: ledger.evidence.coverageReleaseId,
    assessmentCoverageReleaseId: 'older-coverage',
    assessedJurisdictions: 1,
    currentJurisdictions: 0,
    staleJurisdictions: 1,
    missingCoverageReleaseIdJurisdictions: 0,
    unassessedJurisdictions: 50,
  });
  const alabama = ledger.jurisdictions.find((row) => row.state === 'AL');
  assert.deepEqual(alabama.assessmentContext, {
    status: 'stale', assessmentId: 'al-history', assessmentCoverageReleaseId: 'older-coverage',
    currentCoverageReleaseId: ledger.evidence.coverageReleaseId, observedAt: '2026-09-01',
    observation: { observedAt: '2026-09-01', freshnessStatus: 'not-evaluated-no-age-policy' },
    coverageApplicability: { status: 'not-reviewed', assessmentCoverageReleaseId: 'older-coverage', currentCoverageReleaseId: ledger.evidence.coverageReleaseId, exactReleaseMatch: false, reconciliationId: null },
  });
  assert.equal(ledger.jurisdictions.find((row) => row.state === 'AK').assessmentContext.status, 'unassessed');
  assert.deepEqual(ledger.summary.accessEvidenceStatusCounts, baseline.summary.accessEvidenceStatusCounts);
  assert.match(ledger.evidence.stateArtifactSha256, /^[a-f0-9]{64}$/);
});

test('state ledger labels matching assessment holds as current context without changing coverage categories', async (t) => {
  const f = await fixture(t), currentRelease = f.manifest.release_id;
  const baseline = await buildStateAccessLedger({ ...f, assessmentLoader: async () => ({ assessment_catalog_id: 'none', coverage_release_id: currentRelease, states: [] }) });
  const ledger = await buildStateAccessLedger({ ...f, assessmentLoader: async () => ({ assessment_catalog_id: 'current-assessment', coverage_release_id: currentRelease, observed_at: '2026-09-22', states: [{ state_abbreviation: 'AL', assessment_id: 'al-current', decision: 'hold', strongest_bounded_next_action: 'Retain the governed hold.' }] }) });
  const cell = ledger.jurisdictions.find((row) => row.state === 'AL').industries[0];
  assert.ok(cell.evidence.some((item) => item.type === 'current-state-publisher-assessment-hold' && item.assessmentFreshnessStatus === 'current'));
  assert.equal(ledger.evidence.assessmentFreshness.status, 'current');
  assert.equal(ledger.evidence.assessmentFreshness.currentJurisdictions, 1);
  assert.deepEqual(ledger.summary.accessEvidenceStatusCounts, baseline.summary.accessEvidenceStatusCounts);
  assert.deepEqual(Object.keys(ledger.summary.accessEvidenceStatusCounts).sort(), ['direct-state-publisher', 'local-publisher-substate-evidence', 'national-dataset-state-evidence', 'unsupported-evidence-not-measured', 'unsupported-missing']);
});

test('authoritative catalog reports all 51 assessed without changing coverage categories', async (t) => {
  const f = await fixture(t);
  const baseline = await buildStateAccessLedger({ ...f, assessmentLoader: async () => ({ assessment_catalog_id: 'none', coverage_release_id: f.manifest.release_id, states: [] }) });
  const ledger = await buildStateAccessLedger({ ...f, assessmentLoader: loadStateBusinessSourceAssessmentCatalog,
    coverageReassessmentLoader: async () => ({ id: 'fixture-reviewed-transition', historicalRelease: 'national-business-coverage-views-20260902-115337634Z-ba689784', states: Array.from({length:51}, (_, index) => ({ state: ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'][index] })) }) });
  assert.equal(ledger.evidence.assessmentFreshness.assessedJurisdictions, 51);
  assert.equal(ledger.evidence.assessmentFreshness.unassessedJurisdictions, 0);
  assert.equal(ledger.evidence.assessmentFreshness.staleJurisdictions, 51);
  assert.equal(ledger.evidence.assessmentCoverageApplicability.status, 'reviewed-compatible');
  assert.equal(ledger.evidence.assessmentCoverageApplicability.reviewedCompatibleJurisdictions, 51);
  assert.equal(ledger.evidence.assessmentCoverageMatchesCurrent, false);
  assert.equal(ledger.evidence.assessmentObservedAt, '2026-09-22');
  assert.deepEqual(ledger.summary.accessEvidenceStatusCounts, baseline.summary.accessEvidenceStatusCounts);
  for (const state of ['CO','CT','DE','FL','IA','NY','OR','PA']) {
    const evidence = ledger.jurisdictions.find((row) => row.state === state).broadOrganizationEvidence;
    assert.equal(evidence.state, state);
    assert.equal(evidence.geocode.status, 'unmeasured-at-source-level');
    assert.equal(evidence.authorization.acquisition_authorized, false);
    assert.match(evidence.policy.sha256, /^[a-f0-9]{64}$/);
  }
});

test('coverage applicability is per-state and preserves historical observation provenance', async (t) => {
  const f = await fixture(t), assessmentLoader = async () => ({ assessment_catalog_id: 'mixed', coverage_release_id: 'older-coverage', observed_at: '2026-09-01', states: [
    { state_abbreviation: 'AL', assessment_id: 'al-old', observed_at: '2026-08-31' },
    { state_abbreviation: 'AK', assessment_id: 'ak-old', observed_at: '2026-09-01' },
  ] });
  const ledger = await buildStateAccessLedger({ ...f, assessmentLoader, coverageReassessmentLoader: async () => ({ id: 'review-one', historicalRelease: 'older-coverage', states: [{ state: 'AL' }] }) });
  assert.equal(ledger.evidence.assessmentCoverageMatchesCurrent, false);
  assert.deepEqual(ledger.summary.assessmentCoverageApplicabilityStatusCounts, { exactPin: 0, reviewedCompatible: 1, notReviewed: 1, missingCoverageReleaseId: 0, unassessed: 49 });
  const al = ledger.jurisdictions.find(row => row.state === 'AL').assessmentContext;
  const ak = ledger.jurisdictions.find(row => row.state === 'AK').assessmentContext;
  assert.deepEqual([al.coverageApplicability.status, ak.coverageApplicability.status], ['reviewed-compatible', 'not-reviewed']);
  assert.deepEqual([al.observedAt, ak.observedAt], ['2026-08-31', '2026-09-01']);
  assert.equal(al.observation.freshnessStatus, 'not-evaluated-no-age-policy');
});

test('coverage applicability fails closed for wrong-origin and tampered reassessments', async (t) => {
  const f = await fixture(t), assessmentLoader = async () => ({ assessment_catalog_id: 'old', coverage_release_id: 'older-coverage', states: [{ state_abbreviation: 'AL' }] });
  await assert.rejects(buildStateAccessLedger({ ...f, assessmentLoader, coverageReassessmentLoader: async () => ({ id: 'wrong', historicalRelease: 'different', states: [{ state: 'AL' }] }) }), /does not originate/);
  await assert.rejects(buildStateAccessLedger({ ...f, assessmentLoader, coverageReassessmentLoader: async () => { throw new Error('Reassessment manifest evidence changed.'); } }), /evidence changed/);
});
