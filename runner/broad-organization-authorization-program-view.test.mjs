import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import test from "node:test";

import { broadOrganizationAuthorizationProgramHttp } from "./broad-organization-authorization-program-http.mjs";
import { loadBroadOrganizationAuthorizationProgramManagementView } from "./broad-organization-authorization-program-view.mjs";
import {buildBroadOrganizationAuthorizationProgram,BROAD_ORGANIZATION_AUTHORIZATION_PROGRAM_DATASET_ID} from './broad-organization-authorization-program.mjs';
import {buildBroadOrganizationAcquisitionBacklog} from './broad-organization-acquisition-backlog.mjs';
import {readAuthorizationViewReleases,newestAuthorizationCohort} from './authorization-view-release-selection.mjs';
import { DATA_DIR } from "./paths.mjs";

test("read-only management view selects newest deeply verified v2 amid integrity-checked historical releases", async () => {
  const root = await mkdtemp(path.join(DATA_DIR, ".tmp-auth-program-view-"));
  try {
  const backlog = await buildBroadOrganizationAcquisitionBacklog();
  await buildBroadOrganizationAuthorizationProgram({ backlogManifestPath: path.join(backlog.releaseDirectory, "manifest.json"), outputRoot: root });
  const view = await loadBroadOrganizationAuthorizationProgramManagementView({ programRoot: root });
  const rows=await readAuthorizationViewReleases(root,BROAD_ORGANIZATION_AUTHORIZATION_PROGRAM_DATASET_ID,'authorization-program.json');
  const selected=newestAuthorizationCohort(rows.filter(row=>row.manifest.schema_version==='broad-organization-authorization-program-manifest@2.0.0'),row=>row.manifest.release_id)[0];
  assert.equal(view.metadata.release_id,selected.manifest.release_id);
  assert.equal(view.source_lineage.backlog_release_id,selected.artifact.source_backlog.release_id);
  assert.equal(view.source_lineage.assessment_catalog_id, backlog.manifest.assessment_catalog_id);
  assert.equal(view.source_lineage.assessment_catalog_sha256, backlog.manifest.assessment_catalog_sha256);
  assert.equal(view.available, true);
  assert.equal(view.schema_version, "broad-organization-authorization-program-management-view@2.0.0");
  assert.deepEqual([view.metadata.jurisdiction_count, view.metadata.gate_item_count, view.metadata.gate_key_count], [40, 371, 121]);
  assert.deepEqual(view.metadata.wave_state_abbreviations, [
    ["CA", "ID", "IL", "OH", "KY", "NC", "NH", "OK", "HI", "MA"],
    ["MD", "ME", "MI", "MN", "MS", "ND", "NJ", "NV", "SC", "TN"],
    ["VA", "VT", "WI", "WV", "AZ", "IN", "KS", "LA", "MO", "MT"],
    ["RI", "SD", "WY", "AL", "AR", "GA", "NE", "NM", "UT", "WA"],
  ]);
  assert.equal(view.states.length, 40);
  assert.equal(view.states.some((state) => ["AK", "DC"].includes(state.state_abbreviation)), false);
  assert.equal(view.authority.approval_granted, false);
  assert.equal(view.authority.source_actions_performed, 0);
  assert.equal(view.authority.network_requests, 0);
  assert.equal(view.authority.acquisition_authorized, false);
  assert.equal(view.states.reduce((count, state) => count + state.gate_items.length, 0), 371);
  for (const field of ["source_matrix_release_id", "source_matrix_manifest_sha256", "source_matrix_artifact_sha256"]) assert.ok(view.source_lineage[field]);
  const approval = view.states.flatMap((state) => state.gate_items).filter((item) => item.gate_kind === "external-explicit-authorization");
  assert.deepEqual(approval, []);
  const ordinary = view.states.flatMap((state) => state.gate_items).filter((item) => item.gate_kind === "non-row-bearing-contract-evidence");
  assert.ok(ordinary.every((item) => item.row_bearing === false && item.grants_authority === false && item.required_evidence_type && item.acceptance_criterion));
  for (const state of view.states) {
    assert.ok(state.required_exclusions.length);
    assert.ok(state.status_limitations.length && state.address_limitations.length);
  }
  const encoded = JSON.stringify(view);
  for (const denied of ["assessment_snapshot", "candidate", "official_urls", "strongest_bounded_next_action", "manifest.json", "authorization-program.json", "C:\\\\Master Data", "source access", "https://"]) assert.equal(encoded.includes(denied), false, denied);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("strict HTTP view accepts only authenticated-route empty GET semantics and redacts failures", async () => {
  let loads = 0;
  const call = async (method, suffix = "", headers = {}, requestOverride = null, loader = async () => { loads += 1; return { available: true }; }) => {
    let response;
    const request = requestOverride ?? { method, headers };
    await broadOrganizationAuthorizationProgramHttp(request, {}, new URL(`http://local/api/data-operations/broad-organization-authorization-program${suffix}`), loader, (_response, status, body) => { response = { status, body }; });
    return response;
  };
  assert.deepEqual(await call("GET"), { status: 200, body: { available: true } });
  assert.equal((await call("GET", "?wave=1")).status, 400);
  assert.equal((await call("POST")).status, 405);
  assert.equal((await call("GET", "", { "content-length": "1" })).status, 400);
  assert.equal((await call("GET", "", { "transfer-encoding": "chunked" })).status, 400);
  assert.equal((await call("GET", "", {}, Object.assign(Readable.from([Buffer.from("x")]), { method: "GET", headers: {} }))).status, 400);
  assert.equal(loads, 1);
  const failed = await call("GET", "", {}, null, async () => { throw new Error("private path, price, source URL"); });
  assert.equal(failed.status, 503);
  assert.equal(JSON.stringify(failed).includes("private path"), false);
});

test("server requires shared authentication before dispatching the route", async () => {
  const source = await readFile(new URL("./server.mjs", import.meta.url), "utf8");
  const authorize = source.indexOf("controlPlane.authorize(request)");
  const route = source.indexOf("url.pathname === '/api/data-operations/broad-organization-authorization-program'");
  assert.ok(authorize >= 0 && route > authorize);
});
