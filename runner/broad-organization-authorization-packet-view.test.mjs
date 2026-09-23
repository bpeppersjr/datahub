import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { broadOrganizationAuthorizationPacketHttp } from "./broad-organization-authorization-packet-http.mjs";
import { loadBroadOrganizationAuthorizationPacketManagementView } from "./broad-organization-authorization-packet-view.mjs";

test("management view verifies and returns only the allowlisted ten-state evidence specification", async () => {
  const view = await loadBroadOrganizationAuthorizationPacketManagementView();
  assert.equal(view.available, true);
  assert.equal(view.metadata.jurisdiction_count, 10);
  assert.equal(view.states.length, 10);
  assert.deepEqual(view.metadata.first_wave_state_abbreviations, ["AK", "DC", "IL", "MS", "AR", "KY", "HI", "KS", "NV", "UT"]);
  assert.equal(view.authority.approval_granted, false);
  assert.equal(view.authority.acquisition_authorized, false);
  assert.equal(view.authority.records_requested, 0);
  assert.equal(view.states.reduce((count, state) => count + state.request_items.length, 0), view.metadata.request_item_count);
  for (const state of view.states) {
    assert.ok(state.privacy_exclusions.length > 0);
    assert.ok(state.legal_status_limitations.length > 0);
    assert.ok(state.address_limitations.length > 0);
    for (const item of state.request_items) {
      assert.equal(item.row_bearing, false);
      assert.ok(item.required_evidence_type);
      assert.ok(item.acceptance_criterion);
      assert.equal(item.action_boundary.contact_authorized, false);
      assert.equal(item.action_boundary.download_authorized, false);
      assert.equal(item.action_boundary.payment_authorized, false);
      assert.equal(item.action_boundary.record_request_authorized, false);
    }
  }
  const encoded = JSON.stringify(view);
  for (const denied of ["assessment_snapshot", "official_urls", "candidate", "manifest.json", "backlog.json", "C:\\\\Master Data"]) assert.equal(encoded.includes(denied), false, denied);
});

test("management HTTP handler is strict, read-only, and fails closed without leaking verifier errors", async () => {
  let loads = 0;
  const call = async (method, query = "", headers = {}, loader = async () => { loads += 1; return { available: true }; }) => {
    let response;
    await broadOrganizationAuthorizationPacketHttp({ method, headers }, {}, new URL(`http://local/api/data-operations/broad-organization-authorization-packet${query}`), loader, (_res, status, body) => { response = { status, body }; });
    return response;
  };
  assert.deepEqual(await call("GET"), { status: 200, body: { available: true } });
  assert.equal((await call("GET", "?state=AK")).status, 400);
  assert.equal((await call("POST")).status, 405);
  assert.equal((await call("GET", "", { "content-length": "1" })).status, 400);
  assert.equal((await call("GET", "", { "transfer-encoding": "chunked" })).status, 400);
  assert.equal(loads, 1);
  const unavailable = await call("GET", "", {}, async () => { throw new Error("sensitive filesystem path and verifier detail"); });
  assert.equal(unavailable.status, 503);
  assert.equal(JSON.stringify(unavailable).includes("sensitive filesystem"), false);
});

test("runner authenticates before dispatching the management view", async () => {
  const source = await readFile(new URL("./server.mjs", import.meta.url), "utf8");
  const authorize = source.indexOf("controlPlane.authorize(request)");
  const route = source.indexOf("url.pathname === '/api/data-operations/broad-organization-authorization-packet'");
  assert.ok(authorize >= 0 && route > authorize);
});
