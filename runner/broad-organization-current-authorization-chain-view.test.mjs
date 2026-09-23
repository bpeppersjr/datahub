import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Readable } from "node:stream";
import test from "node:test";

import { broadOrganizationCurrentAuthorizationChainHttp } from "./broad-organization-current-authorization-chain-http.mjs";
import { loadBroadOrganizationCurrentAuthorizationChainManagementView } from "./broad-organization-current-authorization-chain-view.mjs";

test("management view independently verifies and summarizes the exact four-wave current chain", async () => {
  const first = await loadBroadOrganizationCurrentAuthorizationChainManagementView();
  const second = await loadBroadOrganizationCurrentAuthorizationChainManagementView();
  assert.deepEqual(first, second);
  assert.equal(first.available, true);
  assert.equal(first.metadata.jurisdiction_count, 51);
  assert.deepEqual(first.metadata.broad_data_coverage, { admitted_jurisdictions: 11, denominator: 51, current_data_gaps: 40, meaning: "retained broad-layer evidence availability; not all-business completeness" });
  assert.deepEqual(first.metadata.authorization_packet_coverage, { expected_current_gaps: 40, packeted_current_gaps: 40, authorization_packet_gaps: 0 });
  assert.deepEqual(first.waves.map((wave) => [wave.wave_number, wave.selected_count, wave.remaining_count, wave.cumulative_prior_count]), [[1, 10, 30, 0], [2, 10, 20, 10], [3, 10, 10, 20], [4, 10, 0, 30]]);
  assert.equal(first.states.length, 40);
  assert.equal(new Set(first.states.map((state) => state.state_abbreviation)).size, 40);
  assert.equal(first.metadata.gate_item_count, first.states.reduce((sum, state) => sum + state.unresolved_gates.length, 0));
  assert.ok(first.states.every((state) => state.approval_status === "HOLD" && state.item_kind === "approval-only" && state.acquisition_authorized === false && state.unresolved_gates.every((gate) => gate.status === "HOLD" && gate.item_kind === "approval-only" && gate.acquisition_authorized === false)));
  assert.ok(first.waves.slice(1).every((wave, index) => wave.prior_wave.release_id === first.waves[index].release_id && wave.prior_wave.manifest_sha256 === first.waves[index].manifest_sha256 && wave.prior_wave.artifact_sha256 === first.waves[index].artifact_sha256));
  assert.equal(first.authority.approval_granted, false);
  assert.equal(first.authority.acquisition_authorized, false);
  assert.equal(first.authority.contact_authorized, false);
  assert.equal(first.authority.download_authorized, false);
  assert.equal(first.authority.payment_authorized, false);
  assert.equal(first.authority.record_request_authorized, false);
  assert.equal(first.authority.network_requests, 0);
  assert.equal(first.authority.source_actions_performed, 0);
  assert.equal(first.authority.current_pointer_changed, false);
  assert.equal(first.authority.production_change_authorized, false);
  const serialized = JSON.stringify(first);
  for (const denied of ["assessment_snapshot", "candidate", "official_urls", "strongest_bounded_next_action", "manifest.json", "authorization-wave.json", "C:\\Master Data", "https://"]) assert.equal(serialized.includes(denied), false, denied);
});

test("HTTP endpoint accepts only an authenticated-route empty GET shape and redacts verifier failures", async () => {
  let loads = 0;
  const call = async (method, suffix = "", headers = {}, requestOverride = null, loader = async () => { loads += 1; return { available: true }; }) => {
    let response;
    const request = requestOverride ?? { method, headers };
    await broadOrganizationCurrentAuthorizationChainHttp(request, {}, new URL(`http://local/api/data-operations/broad-organization-current-authorization-chain${suffix}`), loader, (_response, status, body) => { response = { status, body }; });
    return response;
  };
  assert.deepEqual(await call("GET"), { status: 200, body: { available: true } });
  assert.equal((await call("GET", "?wave=1")).status, 400);
  assert.equal((await call("POST")).status, 405);
  assert.equal((await call("OPTIONS")).status, 405);
  assert.equal((await call("GET", "", { "content-length": "1" })).status, 400);
  assert.equal((await call("GET", "", { "transfer-encoding": "chunked" })).status, 400);
  assert.equal((await call("GET", "", {}, Object.assign(Readable.from([Buffer.from("x")]), { method: "GET", headers: {} }))).status, 400);
  assert.equal(loads, 1);
  const failed = await call("GET", "", {}, null, async () => { throw new Error("private path and hash"); });
  assert.equal(failed.status, 503);
  assert.equal(JSON.stringify(failed).includes("private path"), false);
});

test("server routes the chain only after shared auth, including OPTIONS", async () => {
  const source = await readFile(new URL("./server.mjs", import.meta.url), "utf8");
  const authorize = source.indexOf("controlPlane.authorize(request)");
  const route = source.indexOf("url.pathname === '/api/data-operations/broad-organization-current-authorization-chain'");
  const optionsGate = source.indexOf("request.method === 'OPTIONS' && url.pathname !== '/api/data-operations/broad-organization-current-authorization-chain'");
  assert.ok(optionsGate >= 0 && authorize > optionsGate && route > authorize);
});
