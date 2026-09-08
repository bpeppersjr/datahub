import assert from "node:assert/strict";
import test from "node:test";
import { MN_CONSTRUCTION_COLUMNS } from "./mn-construction-preflight.mjs";
import { normalizeMnConstructionRecord } from "./mn-construction-normalization.mjs";
import { projectMnConstructionCredential } from "./mn-construction-credential-reporting.mjs";
import { aggregateCredentialCoverage } from "./credential-coverage.mjs";

function report(index, { state = "MN", zip = "55101", prefix = "BC" } = {}) {
  return projectMnConstructionCredential(normalizeMnConstructionRecord({
    ...Object.fromEntries(MN_CONSTRUCTION_COLUMNS.map((key) => [key, ""])),
    Bus_Pers: "Business", Lic_Number: `${prefix}123456`, Status: "Issued", Name: "Synthetic Builder LLC", Addr1: "PO Box 12", City: "Fixture City", St: state, Zip: zip,
  }, { runId: "coverage-fixture", sourceReleaseId: "fixture-source", observedAt: "2026-09-08T12:00:00.000Z", cohort: prefix === "IR" ? "registrations" : "residential", sourceFileSha256: "a".repeat(64), rowNumber: index }));
}

test("credential coverage rejects duplicate report IDs and widened claims", async () => {
  const row = report(1);
  await assert.rejects(aggregateCredentialCoverage([row, structuredClone(row)]));
  const invalid = structuredClone(row); invalid.claims.unique_business_identity_verified = true;
  await assert.rejects(aggregateCredentialCoverage([invalid]));
});

test("credential coverage honors pre-aborted cancellation", async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(aggregateCredentialCoverage([report(1)], { signal: controller.signal }), { name: "AbortError" });
});

test('credential coverage exposes exactly 51 jurisdictions and joint category denominators',async()=>{
  const result=await aggregateCredentialCoverage([report(1),report(2,{prefix:'CR'}),report(3,{state:'WI'}),report(4,{state:'PR'}),report(5,{state:'ON',zip:''}),report(6,{state:'',zip:''})]);
  assert.equal(result.states.length,51);assert.equal(new Set(result.states.map(r=>r.state)).size,51);assert.ok(result.states.some(r=>r.state==='DC'));
  assert.equal(result.allAcceptedCohortRows,6);assert.equal(result.national50DcRows,3);assert.equal(result.outside50DcOrUnresolvedRows,3);
  assert.equal(result.missingZip5Rows,2);assert.equal(result.nationalMissingZip5Rows,0);assert.equal(result.outsideMissingZip5Rows,2);
  const mn=result.states.find(r=>r.state==='MN'),wi=result.states.find(r=>r.state==='WI'),al=result.states.find(r=>r.state==='AL');
  assert.equal(mn.credentialRows,2);assert.equal(wi.credentialRows,1);assert.equal(mn.stateShareOfNationalCohort,2/3*100);
  const building=mn.categories.find(c=>c.category==='residential-building-contractor');assert.equal(building.categoryWithinState,50);assert.equal(building.stateShareOfCategory,50);
  assert.equal(wi.categories.find(c=>c.category==='residential-building-contractor').categoryWithinState,100);
  assert.equal(mn.categories.find(c=>c.category==='residential-remodeler').stateShareOfCategory,100);
  assert.equal(al.cohortObservation,'observed-zero');assert.equal(al.businessCoverage,'unknown');assert.ok(al.categories.every(c=>c.categoryWithinState===null));
  assert.equal(result.uniqueBusinessCount,null);assert.equal(result.nationalCompletenessPercent,null);assert.equal(result.physicalSiteCount,null);
  assert.equal(result.states.reduce((n,r)=>n+r.credentialRows,0)+result.outside50DcOrUnresolved.credentialRows,6);
  assert.equal(result.categories.reduce((n,r)=>n+r.credentialRows,0),3);assert.equal(result.outside50DcOrUnresolved.categories.reduce((n,r)=>n+r.credentialRows,0),3);
});

test('credential coverage preserves same-license distinct rows and missing ZIP without inventing geography',async()=>{
  const a=report(1,{state:'WI',zip:''}),b=report(2,{state:'WI',zip:''});
  assert.equal(a.record.external_identifiers[0].value,b.record.external_identifiers[0].value);
  const result=await aggregateCredentialCoverage([a,b]);assert.equal(result.states.find(r=>r.state==='WI').credentialRows,2);
  assert.equal(result.states.find(r=>r.state==='MN').credentialRows,0);assert.equal(result.nationalMissingZip5Rows,2);assert.equal(result.geographicAssignmentInferred,false);
});

test('credential coverage zero denominators and mid-stream cancellation stay explicit',async()=>{
  const empty=await aggregateCredentialCoverage([]);assert.equal(empty.allAcceptedCohortRows,0);
  assert.ok(empty.states.every(s=>s.stateShareOfNationalCohort===null&&s.categories.every(c=>c.categoryWithinState===null&&c.stateShareOfCategory===null)));
  const controller=new AbortController();async function* records(){yield report(1);controller.abort();yield report(2);}
  await assert.rejects(aggregateCredentialCoverage(records(),{signal:controller.signal}),{name:'AbortError'});
  await assert.rejects(aggregateCredentialCoverage([],{fetchImpl:()=>{}}));
});
