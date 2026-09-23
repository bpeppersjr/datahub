import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Readable } from "node:stream";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { nationalGeographyGoalStatusHttp } from "./national-geography-goal-status-http.mjs";
import { loadNationalGeographyGoalStatusView } from "./national-geography-goal-status-view.mjs";
import { verifyNationalGeographyGoalStatus } from "./national-geography-goal-status.mjs";

const manifest = fileURLToPath(new URL("../data/national-geography-goal-status/releases/national-geography-goal-status-20260923204343-55952349/manifest.json", import.meta.url));
const containsArray = (value) => Array.isArray(value) || Boolean(value && typeof value === "object" && Object.values(value).some(containsArray));

test("immutable aggregate status independently verifies all three evidence chains and distinct claims", async () => {
  const verified = await verifyNationalGeographyGoalStatus(manifest);
  assert.equal(verified.release_id, "national-geography-goal-status-20260923204343-55952349");
  assert.equal(verified.manifest_sha256, "5b933dcda10c3c063a5a10ce3ed83c5391eb17b80ad807a768870b1c8bf5aaad");
  assert.equal(verified.artifact_sha256, "18cb495c6215bad8948c6764b7e3f58c70f01213527bcf4f9f9d56349f75cda1");
  const item = verified.artifact;
  assert.equal(containsArray(item), false);
  assert.deepEqual(item.overlay_diagnostics, { zctas_complete_within_tolerance: 33788, zctas_partial_or_overlapping: 3, zctas_unmatched: 0, counties_without_zcta_intersection: 2, zctas_materially_crossing_state_boundaries: 184, zctas_materially_crossing_county_boundaries: 10277 });
  assert.deepEqual(item.usps_operational_denominator, { complete: false, verified: false, registry_zip5_keys: 48194, unverified_registry_zip5_keys: 48194, same_code_census_zcta: 33791, source_reported_without_same_code_zcta: 14361, denominator_only_without_same_code_zcta: 41, explicit_00000_placeholder_count: 1, limitation: "Census statistical polygons and registry ZIP5 keys do not establish a complete current USPS operational denominator." });
  assert.equal(item.temporal_vintage.aligned, false); assert.equal(item.zip4.stored_separately_from_zip5, true); assert.equal(item.zip4.geometric, false);
  assert.equal(item.network_requests, 0); assert.equal(item.production_pointer_changes, false);
  assert.equal(item.input_bindings.geography.artifact_count, 72); assert.equal(item.input_bindings.zcta_jurisdiction_crosswalk.artifact_count, 4); assert.equal(item.input_bindings.national_zip_summary.artifact_count, 1);
});

test("management view is bounded, dynamic, and fails closed on configured lineage drift", async () => {
  const view = await loadNationalGeographyGoalStatusView();
  assert.equal(view.census_polygon_completeness.zcta_2020_polygons, 33791); assert.equal(view.usps_operational_denominator.registry_zip5_keys, 48194);
  assert.deepEqual(view.execution, { network_requests: 0, production_pointer_changes: false, current_pointer_present: false, read_only: true });
  const serialized = JSON.stringify(view); for (const forbidden of ["artifact_sha256s", "source/counties", "zip_list", "records", "https://"]) assert.equal(serialized.includes(forbidden), false, forbidden);
  await assert.rejects(loadNationalGeographyGoalStatusView({ verifier: async () => ({ release_id: "wrong", manifest_sha256: "0".repeat(64), artifact_sha256: "0".repeat(64) }) }), /unavailable/);
});

test("status HTTP accepts only empty GET and redacts failures", async () => {
  let loads = 0; const call = async (method, suffix = "", headers = {}, requestOverride = null, loader = async () => { loads += 1; return { available: true }; }) => { let result; const request = requestOverride ?? { method, headers }; await nationalGeographyGoalStatusHttp(request, {}, new URL(`http://local/api/data-operations/national-geography-goal-status${suffix}`), loader, (_response, status, body) => { result = { status, body }; }); return result; };
  assert.deepEqual(await call("GET"), { status: 200, body: { available: true } }); assert.equal((await call("GET", "?detail=rows")).status, 400); assert.equal((await call("POST")).status, 405); assert.equal((await call("OPTIONS")).status, 405); assert.equal((await call("GET", "", { "content-length": "1" })).status, 400); assert.equal((await call("GET", "", { "transfer-encoding": "chunked" })).status, 400); assert.equal((await call("GET", "", {}, Object.assign(Readable.from([Buffer.from("x")]), { method: "GET", headers: {} }))).status, 400); assert.equal(loads, 1);
  const failed = await call("GET", "", {}, null, async () => { throw new Error("private input path"); }); assert.equal(failed.status, 503); assert.equal(JSON.stringify(failed).includes("private input path"), false);
});

test("server protects and dispatches the status endpoint after shared authorization", async () => { const source = await readFile(new URL("./server.mjs", import.meta.url), "utf8"); assert.ok(source.indexOf("url.pathname === '/api/data-operations/national-geography-goal-status'") > source.indexOf("controlPlane.authorize(request)")); assert.match(source, /request\.method === 'OPTIONS'.*national-geography-goal-status/); });
