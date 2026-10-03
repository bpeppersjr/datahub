import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import test from "node:test";

import { documentOnlyInquiryProposalRegistryHttp } from "./document-only-inquiry-proposal-registry-http.mjs";
import { loadDocumentOnlyInquiryProposalRegistryView } from "./document-only-inquiry-proposal-registry-view.mjs";
import {APP_ROOT} from './paths.mjs';
import {deriveWeakestComparableDiagnosticBatch} from './broad-organization-current-authorization-chain-view.mjs';
import {readAuthorizationViewReleases} from './authorization-view-release-selection.mjs';

// Inject the complete historical cohort only for document-contract unit tests.
// This is never a production fallback for the incomplete newest cohort.
async function completeChainFixture(){
  const projections=await readAuthorizationViewReleases(path.join(APP_ROOT,'data/broad-organization-matrix-gap-projection'),'broad-organization-matrix-gap-projection','gap-projection.json');
  const projection=projections.find(row=>row.artifact.observed_at==='2026-09-23T15:28:41.546Z');assert.ok(projection);
  const inventory=await readAuthorizationViewReleases(path.join(APP_ROOT,'data/broad-organization-current-matrix-authorization-wave'),'broad-organization-current-matrix-authorization-wave','authorization-wave.json');
  const waves=inventory.filter(row=>row.artifact.source_projection.release_id===projection.manifest.release_id).sort((a,b)=>a.artifact.scope.wave_number-b.artifact.scope.wave_number);
  assert.equal(waves.length,4);
  for(const [index,row]of waves.entries()){
    assert.equal(row.artifact.scope.wave_number,index+1);assert.equal(row.artifact.source_projection.manifest_sha256,projection.manifestSha256);
    if(index){assert.equal(row.artifact.prior_wave.release_id,waves[index-1].manifest.release_id);assert.equal(row.artifact.prior_wave.manifest_sha256,waves[index-1].manifestSha256);assert.equal(row.artifact.prior_wave.artifact_sha256,waves[index-1].manifest.artifacts[0].sha256);}
  }
  return {schema_version:'broad-organization-current-authorization-chain-management-view@1.1.0',available:true,
    metadata:{jurisdiction_count:51,current_gap_state_count:40,broad_data_coverage:{admitted_jurisdictions:11,current_data_gaps:40},authorization_packet_coverage:{expected_current_gaps:40,packeted_current_gaps:40,authorization_packet_gaps:0}},
    states:waves.flatMap(row=>row.artifact.states),diagnostic_batch:deriveWeakestComparableDiagnosticBatch(projection.artifact)};
}

const expectedHashes = ["895aecf8e1220d3772972a5e5c843bcd46a4887068df28f966268b60d2ec109b", "7af64202446dec8e328a3955cd572b6dacd94863e6797dbbe1ee4498731701dc", "7309b02db317db8667f2c9cc146f002a7d1f8935e6b1db18bab339f824e9dc18", "b18ceb51b2c2aadf912587b12ea121a6ab1c4180c4a49db0478946a4b652a9f6"];

test("registry independently verifies exactly four governed proposals and 40 unique states", async () => {
  const first = await loadDocumentOnlyInquiryProposalRegistryView(undefined,completeChainFixture); const second = await loadDocumentOnlyInquiryProposalRegistryView(undefined,completeChainFixture);
  assert.deepEqual(first, second); assert.equal(first.available, true); assert.equal(first.proposals.length, 4);
  assert.deepEqual(first.proposals.map((item) => item.document_sha256), expectedHashes);
  assert.deepEqual(first.proposals.map((item) => item.status), Array(4).fill("PROPOSED"));
  assert.ok(first.proposals.every((item) => item.approval_status === "NOT APPROVED" && item.authority_status === "NO ACTION AUTHORIZED" && item.approval_syntax === `Approve ${item.proposal_id} with document SHA-256 ${item.document_sha256}.`));
  const states = first.proposals.flatMap((item) => item.states.map((state) => state.state_abbreviation));
  assert.equal(states.length, 40); assert.equal(new Set(states).size, 40);
  assert.deepEqual(first.coverage.actual_collected_data, { admitted_jurisdictions: 11, denominator: 51, unresolved_data_gaps: 40 });
  assert.deepEqual(first.coverage.authorization_packets, { covered_current_gap_states: 40, expected_current_gap_states: 40, packet_gaps: 0 });
  assert.deepEqual(first.coverage.document_only_proposals, { covered_current_gap_states: 40, expected_current_gap_states: 40, proposal_gaps: 0 });
  assert.ok(Object.values(first.authority).every((value) => value === false));
  assert.deepEqual(first.proposals[0].supersession, { supersedes_only_prior_unapproved_document_sha256: "976369982eea4c8289acb4677a921ede6cd0fe7efacf8e0fa5de6c8afd3c2a50", prior_proposal_was_approved: false, prior_proposal_authorized_action: false });
  assert.ok(first.proposals.slice(1).every((item) => item.supersession === null));
  const serialized = JSON.stringify(first); for (const denied of ["C:\\Master Data", "docs/", ".md", "https://", "source contact"]) assert.equal(serialized.includes(denied), false, denied);
});

test("registry fails closed if a governed document changes or an extra proposal appears", async (context) => {
  await mkdir(path.join(APP_ROOT,'data/tmp'),{recursive:true});
  const temp = await mkdtemp(path.join(APP_ROOT,'data/tmp/cotive-proposals-')); context.after(() => rm(temp, { recursive: true, force: true }));
  for (let wave = 1; wave <= 4; wave += 1) await cp(new URL(`../docs/WAVE-${wave}-DOCUMENT-ONLY-INQUIRY-20260923-01.md`, import.meta.url), path.join(temp, `WAVE-${wave}-DOCUMENT-ONLY-INQUIRY-20260923-01.md`));
  const wave2 = path.join(temp, "WAVE-2-DOCUMENT-ONLY-INQUIRY-20260923-01.md"); await writeFile(wave2, `${await readFile(wave2, "utf8")}\nchanged\n`);
  await assert.rejects(loadDocumentOnlyInquiryProposalRegistryView(temp,completeChainFixture), /hash does not match/);
  await cp(new URL("../docs/WAVE-2-DOCUMENT-ONLY-INQUIRY-20260923-01.md", import.meta.url), wave2);
  await writeFile(path.join(temp, "WAVE-5-DOCUMENT-ONLY-INQUIRY-20260923-01.md"), "unexpected");
  await assert.rejects(loadDocumentOnlyInquiryProposalRegistryView(temp,completeChainFixture), /exactly four/);
});

test("registry fails closed when proposals and the verified current-gap state set differ", async () => {
  const chain = await completeChainFixture();
  const mismatched = structuredClone(chain);
  mismatched.states[0].state_abbreviation = "TX";
  await assert.rejects(loadDocumentOnlyInquiryProposalRegistryView(undefined, async () => mismatched), /does not exactly match verified current-gap states/);
});

test("registry requires the verified diagnostic batch without treating it as proposal authority", async () => {
  const chain = await completeChainFixture();
  for (const mutate of [
    (value) => { value.schema_version = "broad-organization-current-authorization-chain-management-view@1.0.0"; },
    (value) => { value.diagnostic_batch.comparable_gap_count = 30; },
    (value) => { value.diagnostic_batch.authority.acquisition_authorized = true; },
  ]) {
    const changed = structuredClone(chain); mutate(changed);
    await assert.rejects(loadDocumentOnlyInquiryProposalRegistryView(undefined, async () => changed), /invalid projection/);
  }
});

test('native registry uses the complete newest four-wave lineage without converting proposals into approval',async()=>{
  const view=await loadDocumentOnlyInquiryProposalRegistryView();
  assert.equal(view.available,true);assert.equal(view.coverage.authorization_packets.covered_current_gap_states,40);
  assert.ok(Object.values(view.authority).every(value=>value===false));
  let reply;await documentOnlyInquiryProposalRegistryHttp({method:'GET',headers:{}},{},new URL('http://local/'),loadDocumentOnlyInquiryProposalRegistryView,(_res,status,body)=>{reply={status,body};});
  assert.equal(reply.status,200);assert.equal(reply.body.available,true);assert.ok(Object.values(reply.body.authority).every(value=>value===false));
});

test("proposal HTTP accepts only empty GET and redacts verifier failures", async () => {
  let loads = 0;
  const call = async (method, suffix = "", headers = {}, requestOverride = null, loader = async () => { loads += 1; return { available: true }; }) => { let result; const request = requestOverride ?? { method, headers }; await documentOnlyInquiryProposalRegistryHttp(request, {}, new URL(`http://local/api/data-operations/document-only-inquiry-proposals${suffix}`), loader, (_response, status, body) => { result = { status, body }; }); return result; };
  assert.deepEqual(await call("GET"), { status: 200, body: { available: true } });
  assert.equal((await call("GET", "?wave=1")).status, 400); assert.equal((await call("POST")).status, 405); assert.equal((await call("OPTIONS")).status, 405);
  assert.equal((await call("GET", "", { "content-length": "1" })).status, 400); assert.equal((await call("GET", "", { "transfer-encoding": "chunked" })).status, 400);
  assert.equal((await call("GET", "", {}, Object.assign(Readable.from([Buffer.from("x")]), { method: "GET", headers: {} }))).status, 400); assert.equal(loads, 1);
  const failed = await call("GET", "", {}, null, async () => { throw new Error("private proposal path"); }); assert.equal(failed.status, 503); assert.equal(JSON.stringify(failed).includes("private proposal path"), false);
});

test("server protects and routes the proposal endpoint after shared authorization", async () => {
  const source = await readFile(new URL("./server.mjs", import.meta.url), "utf8"); const authorize = source.indexOf("controlPlane.authorize(request)"); const route = source.indexOf("url.pathname === '/api/data-operations/document-only-inquiry-proposals'");
  assert.ok(authorize >= 0 && route > authorize); assert.match(source, /request\.method === 'OPTIONS'.*url\.pathname !== '\/api\/data-operations\/document-only-inquiry-proposals'/);
});
