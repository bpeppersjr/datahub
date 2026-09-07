import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { APP_ROOT } from './paths.mjs';
import { buildStateAccessLedger, writeStateAccessReport } from './state-access-ledger.mjs';

async function fixture(t) {
  const temp = path.join(APP_ROOT, 'data/tmp'); await mkdir(temp, { recursive: true });
  const root = await mkdtemp(path.join(temp, 'state-ledger-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const pointerPath = 'data/business-coverage-views/current.json';
  const pointer = JSON.parse(await readFile(path.join(APP_ROOT, pointerPath)));
  const manifestPath = path.join(path.dirname(pointerPath), pointer.manifest);
  const manifest = JSON.parse(await readFile(path.join(APP_ROOT, manifestPath)));
  const files = [pointerPath, manifestPath, 'config/industry-segments.json', 'config/state-access-workstreams.json', ...manifest.artifacts.filter(a => ['state-coverage-view-jsonl', 'source-coverage-view-jsonl'].includes(a.artifact_type)).map(a => path.join(path.dirname(manifestPath), a.path))];
  for (const file of files) { await mkdir(path.dirname(path.join(root, file)), { recursive: true }); await copyFile(path.join(APP_ROOT, file), path.join(root, file)); }
  return { root, manifestPath, manifest, assessmentLoader: async () => ({ assessment_catalog_id: 'fixture-assessments', coverage_release_id: manifest.release_id, states: [] }) };
}

test('state ledger has exactly one workstream per state and DC separately without inventing active agents', async (t) => {
  const f = await fixture(t); const ledger = await buildStateAccessLedger(f);
  assert.equal(ledger.jurisdictions.length, 51);
  assert.equal(new Set(ledger.jurisdictions.map(r => r.state)).size, 51);
  assert.equal(ledger.jurisdictions.filter(r => r.jurisdictionKind === 'state').length, 50);
  assert.equal(ledger.jurisdictions.find(r => r.state === 'DC').jurisdictionKind, 'district');
  assert.equal(ledger.evidence.coverageReleaseId, f.manifest.release_id);
  await assert.rejects(readdir(path.join(f.root, 'data/state-access/reports')), /ENOENT/);
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

test('state ledger does not treat a configured state connector as measured access', async (t) => {
  const f = await fixture(t); const ledger = await buildStateAccessLedger(f);
  const construction = ledger.jurisdictions.find(r => r.state === 'WA').industries.find(r => r.industry === 'construction');
  assert.notEqual(construction.accessEvidenceStatus, 'direct-state-publisher');
  assert.match(construction.accessEvidenceStatus, /not-measured|configured|unsupported/);
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

async function childcareCounts(f, value) {
  const artifact=f.manifest.artifacts.find(a=>a.artifact_type==='state-coverage-view-jsonl');
  const file=path.join(f.root,path.dirname(f.manifestPath),artifact.path);
  const rows=(await readFile(file,'utf8')).trim().split('\n').map(line=>JSON.parse(line));
  for(const row of rows){
    const source=row.postal_abbreviation==='MA'?'ma-licensed-center-based-childcare':row.postal_abbreviation==='NJ'?'nj-licensed-childcare-centers':null;
    if(!source)continue;
    row.registry_evidence??={};row.registry_evidence.source_profile_counts_by_reported_address_state??={};
    if(value===undefined)delete row.registry_evidence.source_profile_counts_by_reported_address_state[source];
    else row.registry_evidence.source_profile_counts_by_reported_address_state[source]=value;
  }
  const bytes=Buffer.from(`${rows.map(row=>JSON.stringify(row)).join('\n')}\n`);
  await writeFile(file,bytes);artifact.bytes=bytes.length;artifact.sha256=createHash('sha256').update(bytes).digest('hex');
  await writeFile(path.join(f.root,f.manifestPath),JSON.stringify(f.manifest));
}

test('state ledger keeps absent MA/NJ reporting integration unmeasured rather than measured zero',async(t)=>{
  const f=await fixture(t);await childcareCounts(f,undefined);const ledger=await buildStateAccessLedger(f);
  for(const state of ['MA','NJ']){
    const cell=ledger.jurisdictions.find(r=>r.state===state).industries.find(r=>r.industry==='childcare');
    assert.equal(cell.accessEvidenceStatus,'unsupported-evidence-not-measured');assert.equal(cell.appHandoff.status,'NOT_READY_EVIDENCE_UNMEASURED');
    assert.equal(cell.evidence.some(e=>e.recordCount!==undefined),false);assert.equal(cell.appHandoff.jobSubmitted,false);
  }
});

test('state ledger identifies positive MA/NJ counts as direct reporting evidence without submitting jobs',async(t)=>{
  const f=await fixture(t);await childcareCounts(f,7);
  const ledger=await buildStateAccessLedger({...f,assessmentLoader:async()=>({assessment_catalog_id:'historic-hold',coverage_release_id:'older-coverage',states:[{state_abbreviation:'NJ',decision:'hold',assessment_id:'unrelated-publisher-hold',strongest_bounded_next_action:'Review another state source.'}]})});
  for(const state of ['MA','NJ']){
    const cell=ledger.jurisdictions.find(r=>r.state===state).industries.find(r=>r.industry==='childcare');
    assert.equal(cell.accessEvidenceStatus,'direct-state-publisher');assert.equal(cell.appHandoff.status,'APP_PREFLIGHT_REQUIRED');
    assert.deepEqual(cell.evidence.filter(e=>e.recordCount!==undefined).map(e=>[e.type,e.recordCount]),[['published-direct-state-reporting-count',7]]);
    assert.equal(cell.appHandoff.jobSubmitted,false);assert.equal(cell.appHandoff.prerequisiteContentsValidated,false);
  }
  const nj=ledger.jurisdictions.find(r=>r.state==='NJ').industries.find(r=>r.industry==='childcare');
  assert.ok(nj.evidence.some(e=>e.type==='separate-state-publisher-assessment-hold'&&e.assessmentCoverageReleaseId==='older-coverage'));
  await assert.rejects(readdir(path.join(f.root,'data/state-access/reports')),/ENOENT/);
});

test('state ledger distinguishes measured zero and rejects malformed reporting counts',async(t)=>{
  const f=await fixture(t);await childcareCounts(f,0);const ledger=await buildStateAccessLedger(f);
  for(const state of ['MA','NJ'])assert.equal(ledger.jurisdictions.find(r=>r.state===state).industries.find(r=>r.industry==='childcare').accessEvidenceStatus,'unsupported-missing');
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
  const f = await fixture(t);
  const ledger = await buildStateAccessLedger({ ...f, assessmentLoader: async () => ({ assessment_catalog_id: 'historic-assessment', coverage_release_id: 'older-coverage', observed_at: '2026-09-01', states: [] }) });
  assert.equal(ledger.evidence.assessmentCoverageReleaseId, 'older-coverage');
  assert.equal(ledger.evidence.assessmentObservedAt, '2026-09-01');
  assert.equal(ledger.evidence.assessmentCoverageMatchesCurrent, false);
  assert.match(ledger.evidence.stateArtifactSha256, /^[a-f0-9]{64}$/);
});
