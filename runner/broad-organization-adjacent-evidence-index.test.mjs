import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { buildBroadOrganizationAdjacentEvidenceIndex, findAndVerifyBroadOrganizationAdjacentEvidenceIndex, verifyBroadOrganizationAdjacentEvidenceIndex } from "./broad-organization-adjacent-evidence-index.mjs";
import { broadOrganizationAdjacentEvidenceHttp } from "./broad-organization-adjacent-evidence-http.mjs";
import { loadBroadOrganizationAdjacentEvidenceView } from "./broad-organization-adjacent-evidence-view.mjs";

test("pointer-free index preserves all 40 broad gaps and separates adjacent cohorts", async () => {
  const first = await buildBroadOrganizationAdjacentEvidenceIndex(), second = await buildBroadOrganizationAdjacentEvidenceIndex();
  assert.deepEqual(first, second);
  assert.equal(first.jurisdictions.length, 40);
  assert.equal(new Set(first.jurisdictions.map((row) => row.code)).size, 40);
  assert.deepEqual(first.summary, { broad_layer_gap_jurisdictions: 40, jurisdictions_with_retained_adjacent_evidence: 11, jurisdictions_without_retained_adjacent_evidence: 29, retained_evidence_items: 12, broad_layer_gaps_closed: 0 });
  assert.ok(first.jurisdictions.every((row) => row.broad_layer_gap === true && row.broad_layer_status === "unmeasured"));
  assert.equal(first.jurisdictions.find((row) => row.code === "CA").evidence_count, 2);
  assert.equal(first.jurisdictions.find((row) => row.code === "AL").adjacent_evidence_status, "no-retained-adjacent-evidence");
  for (const item of first.jurisdictions.flatMap((row) => row.evidence)) {
    assert.equal(item.current_operation_verified, false);
    assert.equal(item.authority.acquisition_authorized, false);
    assert.equal(item.authority.broad_layer_admission_authorized, false);
    assert.equal(item.authority.production_pointer_change_authorized, false);
    assert.match(item.provenance.manifest_sha256, /^[a-f0-9]{64}$/);
    assert.ok(item.source_reference.status === "reported" ? item.source_reference.value !== null : item.source_reference.value === null);
  }
});

test("canonical release independently replays and verifier rejects artifact tampering", async () => {
  const verified = await findAndVerifyBroadOrganizationAdjacentEvidenceIndex();
  assert.equal(verified.index.release_id, "broad-organization-adjacent-evidence-index-1b609cdc273a49212fe9fe12");
  const temporaryRoot = await mkdtemp(path.join(process.cwd(), "data", "tmp", "adjacent-index-test-"));
  try {
    await cp(verified.directory, temporaryRoot, { recursive: true });
    const indexPath = path.join(temporaryRoot, "index.json"), value = JSON.parse(await readFile(indexPath, "utf8"));
    value.jurisdictions[0].broad_layer_gap = false;
    await writeFile(indexPath, `${JSON.stringify(value, null, 2)}\n`);
    await assert.rejects(verifyBroadOrganizationAdjacentEvidenceIndex(path.join(temporaryRoot, "manifest.json")), /artifact drifted/);
  } finally { await rm(temporaryRoot, { recursive: true, force: true }); }
});

test("bounded view exposes evidence and explicit none without filesystem paths", async () => {
  const ca = await loadBroadOrganizationAdjacentEvidenceView({ state: "CA" });
  assert.equal(ca.selected.broad_layer_gap, true); assert.equal(ca.selected.evidence_count, 2);
  const al = await loadBroadOrganizationAdjacentEvidenceView({ state: "AL" });
  assert.equal(al.selected.adjacent_evidence_status, "no-retained-adjacent-evidence"); assert.deepEqual(al.selected.evidence, []);
  assert.equal(JSON.stringify(ca).includes("manifest_path"), false);
  await assert.rejects(loadBroadOrganizationAdjacentEvidenceView({ state: "AK" }), /not a current broad-layer gap/);
});

test("read-only HTTP accepts one optional state and redacts verification failures", async () => {
  const call = async (method, suffix = "", loader = async ({ state }) => ({ state })) => { let result; await broadOrganizationAdjacentEvidenceHttp({ method }, {}, new URL(`http://local/api/business-map/broad-organization-adjacent-evidence${suffix}`), (_response, status, body) => { result = { status, body }; }, loader); return result; };
  assert.deepEqual(await call("GET", "?state=CA"), { status: 200, body: { state: "CA" } });
  assert.equal((await call("POST")).status, 405);
  assert.equal((await call("GET", "?state=ca")).status, 400);
  assert.equal((await call("GET", "?state=CA&state=IL")).status, 400);
  assert.equal((await call("GET", "?path=secret")).status, 400);
  const failed = await call("GET", "?state=CA", async () => { throw new Error("C:\\private\\manifest.json"); });
  assert.deepEqual(failed, { status: 503, body: { error: "adjacent-evidence-unavailable" } });
});
