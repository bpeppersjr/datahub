import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Readable } from "node:stream";
import test from "node:test";

import { broadOrganizationAuthorizationProgramHttp } from "./broad-organization-authorization-program-http.mjs";
import { loadBroadOrganizationAuthorizationProgramManagementView } from "./broad-organization-authorization-program-view.mjs";

test("read-only management view re-verifies the canonical all-wave release and projects only allowlisted fields", async () => {
  const view = await loadBroadOrganizationAuthorizationProgramManagementView();
  assert.equal(view.available, true);
  assert.deepEqual([view.metadata.jurisdiction_count, view.metadata.gate_item_count, view.metadata.gate_key_count], [43, 371, 28]);
  assert.deepEqual(view.metadata.wave_state_abbreviations.map((wave) => wave.length), [10, 10, 10, 10, 3]);
  assert.equal(view.states.length, 43);
  assert.equal(view.authority.approval_granted, false);
  assert.equal(view.authority.source_actions_performed, 0);
  assert.equal(view.authority.acquisition_authorized, false);
  assert.equal(view.states.reduce((count, state) => count + state.gate_items.length, 0), 371);
  const approval = view.states.flatMap((state) => state.gate_items).filter((item) => item.gate_kind === "external-explicit-authorization");
  assert.deepEqual(approval.map((item) => item.gate_key), ["large-acquisition-authorization", "large-acquisition-authorization"]);
  assert.ok(approval.every((item) => item.document_closable === false && item.automatic_closure_permitted === false && /separate authenticated/i.test(item.closure_requires)));
  const ordinary = view.states.flatMap((state) => state.gate_items).filter((item) => item.gate_kind === "non-row-bearing-contract-evidence");
  assert.ok(ordinary.every((item) => item.row_bearing === false && item.grants_authority === false && item.required_evidence_type && item.acceptance_criterion));
  for (const state of view.states) {
    assert.ok(state.required_exclusions.length);
    assert.ok(state.status_limitations.length && state.address_limitations.length);
  }
  const encoded = JSON.stringify(view);
  for (const denied of ["assessment_snapshot", "candidate", "official_urls", "strongest_bounded_next_action", "manifest.json", "authorization-program.json", "C:\\\\Master Data", "source access", "https://"]) assert.equal(encoded.includes(denied), false, denied);
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
