import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import test from "node:test";

import { broadOrganizationCurrentAuthorizationChainHttp } from "./broad-organization-current-authorization-chain-http.mjs";
import { deriveWeakestComparableDiagnosticBatch, loadBroadOrganizationCurrentAuthorizationChainManagementView, loadHistoricalBroadOrganizationDiagnosticProjection } from "./broad-organization-current-authorization-chain-view.mjs";
import { loadCurrentMatrixAuthorizationWaveChain } from "./broad-organization-current-matrix-authorization-wave.mjs";
import {readAuthorizationViewReleases,newestAuthorizationCohort} from './authorization-view-release-selection.mjs';
import { DATA_DIR } from "./paths.mjs";

async function newestProjection(){
  const rows=await readAuthorizationViewReleases(path.join(process.cwd(),'data/broad-organization-matrix-gap-projection'),'broad-organization-matrix-gap-projection','gap-projection.json');
  return newestAuthorizationCohort(rows,row=>row.manifest.release_id)[0];
}

test("management view independently verifies and summarizes the exact four-wave current chain", async () => {
  const projection=await newestProjection();
  const first = await loadBroadOrganizationCurrentAuthorizationChainManagementView();
  const second = await loadBroadOrganizationCurrentAuthorizationChainManagementView();
  assert.deepEqual(first, second);
  assert.equal(first.available, true);
  assert.equal(first.metadata.matrix_release_id, "national-goal-completion-20261112051711-1b351542");
  assert.equal(first.metadata.gap_projection_release_id, projection.manifest.release_id);
  assert.equal(first.metadata.backlog_release_id, projection.artifact.source_backlog.release_id);
  assert.equal(first.metadata.backlog_manifest_sha256, projection.artifact.source_backlog.manifest_sha256);
  assert.equal(first.metadata.backlog_artifact_sha256, projection.artifact.source_backlog.artifact_sha256);
  assert.deepEqual(first.waves.map((wave) => wave.state_abbreviations.join(" ")), [
    "CA ID IL OH KY NC NH OK HI MA", "MD ME MI MN MS ND NJ NV SC TN",
    "VA VT WI WV AZ IN KS LA MO MT", "RI SD WY AL AR GA NE NM UT WA",
  ]);
  assert.equal(first.metadata.jurisdiction_count, 51);
  assert.deepEqual(first.metadata.broad_data_coverage, { admitted_jurisdictions: 11, denominator: 51, current_data_gaps: 40, meaning: "retained broad-layer evidence availability; not all-business completeness" });
  assert.deepEqual(first.metadata.authorization_packet_coverage, { expected_current_gaps: 40, packeted_current_gaps: 40, authorization_packet_gaps: 0 });
  assert.deepEqual(first.waves.map((wave) => [wave.wave_number, wave.selected_count, wave.remaining_count, wave.cumulative_prior_count]), [[1, 10, 30, 0], [2, 10, 20, 10], [3, 10, 10, 20], [4, 10, 0, 30]]);
  assert.equal(first.states.length, 40);
  assert.equal(new Set(first.states.map((state) => state.state_abbreviation)).size, 40);
  assert.equal(first.metadata.gate_item_count, first.states.reduce((sum, state) => sum + state.unresolved_gates.length, 0));
  assert.equal(first.schema_version, "broad-organization-current-authorization-chain-management-view@1.1.0");
  assert.deepEqual(first.diagnostic_batch.states.map((row) => [row.state_abbreviation, row.reported_profiles, row.nonemployer_baseline_2023, row.diagnostic_profile_percent]), [["TN", 91467, 649168, 14.1], ["VA", 116537, 740321, 15.7], ["AZ", 99038, 598126, 16.6], ["RI", 15949, 95241, 16.7], ["NJ", 156337, 883628, 17.7], ["OH", 163604, 909227, 18], ["VT", 11833, 65028, 18.2], ["SC", 81827, 445689, 18.4], ["MA", 118917, 633439, 18.8], ["NH", 22001, 116209, 18.9]]);
  assert.equal(first.diagnostic_batch.comparable_gap_count, 31);
  assert.equal(first.diagnostic_batch.unavailable_gap_count, 9);
  assert.equal(first.diagnostic_batch.comparable_gap_count + first.diagnostic_batch.unavailable_gap_count, 40);
  assert.equal(first.diagnostic_batch.source_coverage_release_id, "national-business-coverage-views-20260902-115337634Z-ba689784");
  assert.equal(first.diagnostic_batch.source_gap_projection_release_id, "broad-organization-matrix-gap-projection-2026-10-07T05-23-37.982Z-2de794ce5041");
  assert.equal(first.diagnostic_batch.source_gap_projection_manifest_sha256, "9b444d558b837024f07dbde4a42f1212a6864d5db287e95c2f103587c95417ac");
  assert.ok(first.diagnostic_batch.states.every((row) => row.coverage_release_id === first.diagnostic_batch.source_coverage_release_id && row.diagnostic_profile_percent === Number((row.reported_profiles / row.nonemployer_baseline_2023 * 100).toFixed(1))));
  assert.deepEqual(first.diagnostic_batch.authority, { status: "HOLD", source_action_authorized: false, contact_authorized: false, payment_authorized: false, download_authorized: false, record_request_authorized: false, acquisition_authorized: false, network_request_authorized: false, pointer_change_authorized: false, production_change_authorized: false });
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

test("diagnostic derivation fails closed on arithmetic, shared-release, and conservation drift", async () => {
  const projection = (await newestProjection()).artifact;
  const historical = (await loadHistoricalBroadOrganizationDiagnosticProjection()).projection;
  assert.equal(deriveWeakestComparableDiagnosticBatch(projection, historical).states.length, 10);
  assert.throws(() => deriveWeakestComparableDiagnosticBatch(projection), /31 comparable and 9 unavailable/);
  const arithmetic = structuredClone(historical);
  arithmetic.gaps.find((row) => row.state_abbreviation === "TN").assessment_snapshot.current_coverage.diagnostic_profile_percent = 14.2;
  assert.throws(() => deriveWeakestComparableDiagnosticBatch(projection, arithmetic), /31 comparable and 9 unavailable/);
  const release = structuredClone(historical);
  release.gaps.find((row) => row.state_abbreviation === "VA").assessment_snapshot.coverage_release_id = "different-release";
  assert.throws(() => deriveWeakestComparableDiagnosticBatch(projection, release), /31 comparable and 9 unavailable/);
  const missing = structuredClone(projection); missing.gaps.pop();
  assert.throws(() => deriveWeakestComparableDiagnosticBatch(missing, historical), /exact 40 current gaps/);
});

test("an incomplete or corrupt November cohort cannot borrow an October release", async (context) => {
  const fixture = await mkdtemp(path.join(DATA_DIR, ".tmp-broad-authorization-chain-"));
  context.after(() => rm(fixture, { recursive: true, force: true }));
  const datasets = {
    backlogRoot: "broad-organization-acquisition-backlog",
    projectionRoot: "broad-organization-matrix-gap-projection",
    waveRoot: "broad-organization-current-matrix-authorization-wave",
  };
  const roots = {};
  for (const [key, dataset] of Object.entries(datasets)) {
    roots[key] = path.join(fixture, dataset);
    await cp(path.join(DATA_DIR, dataset, "releases"), path.join(roots[key], "releases"), { recursive: true });
  }
  const valid = await loadBroadOrganizationCurrentAuthorizationChainManagementView(roots);
  const cases = [
    ["backlogRoot", valid.metadata.backlog_release_id, /newest v3 backlog/],
    ["projectionRoot", valid.metadata.gap_projection_release_id, /newest projection for the current backlog/],
    ["waveRoot", valid.waves[3].release_id, /newest projection cohort is incomplete/],
  ];
  for (const [key, release, missingError] of cases) {
    const directory = path.join(roots[key], "releases", release), removed = path.join(fixture, release);
    await rename(directory, removed);
    await assert.rejects(loadBroadOrganizationCurrentAuthorizationChainManagementView(roots), missingError);
    await rename(removed, directory);

    const manifestPath = path.join(directory, "manifest.json"), original = await readFile(manifestPath);
    await writeFile(manifestPath, "corrupt manifest\n");
    await assert.rejects(loadBroadOrganizationCurrentAuthorizationChainManagementView(roots));
    await writeFile(manifestPath, original);
  }
  assert.deepEqual(await loadBroadOrganizationCurrentAuthorizationChainManagementView(roots), valid);
});

test("the historical diagnostic cannot be replaced by current assessment evidence or a rehashed mutation", async (context) => {
  const fixture = await mkdtemp(path.join(DATA_DIR, ".tmp-broad-authorization-diagnostic-"));
  context.after(() => rm(fixture, { recursive: true, force: true }));
  const { manifest, projection } = await loadHistoricalBroadOrganizationDiagnosticProjection();
  const directory = path.join(fixture, "releases", manifest.release_id);
  await assert.rejects(loadHistoricalBroadOrganizationDiagnosticProjection(fixture), { code: "ENOENT" });
  await mkdir(directory, { recursive: true });
  const changed = structuredClone(projection);
  changed.gaps.find((gap) => gap.state_abbreviation === "TN").assessment_snapshot.current_coverage.reported_profiles += 1;
  const bytes = Buffer.from(`${JSON.stringify(changed, null, 2)}\n`);
  const alteredManifest = structuredClone(manifest);
  alteredManifest.artifacts[0].bytes = bytes.length;
  alteredManifest.artifacts[0].sha256 = createHash("sha256").update(bytes).digest("hex");
  await writeFile(path.join(directory, "gap-projection.json"), bytes);
  await writeFile(path.join(directory, "manifest.json"), `${JSON.stringify(alteredManifest, null, 2)}\n`);
  await assert.rejects(loadHistoricalBroadOrganizationDiagnosticProjection(fixture), /release inventory or newest lineage is invalid/);

  const current = await loadCurrentMatrixAuthorizationWaveChain();
  assert.equal(current.projection.source_matrix.release_id, "national-goal-completion-20261112051711-1b351542");
  assert.equal(current.waves.flatMap((entry) => entry.wave.states).length, 40);
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
