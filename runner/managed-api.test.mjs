import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { gzipSync } from "node:zlib";
import { copyFile, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { once } from "node:events";
import { pathToFileURL } from "node:url";
import { APP_ROOT } from "./paths.mjs";
import { BUSINESS_LOCATION_PROFILE_VERSION } from "./business-location-profile-contract.mjs";
import { RETAINED_BUSINESS_REFRESH_DESCRIPTORS } from "./retained-business-refresh-readiness.mjs";
import { GOVERNED_SOURCE_REFRESH_DESCRIPTORS } from "./governed-source-refresh-registry.mjs";
import {
  DC_CORPORATE_REGISTRATION_ACTIVE_STATUSES,
  DC_CORPORATE_REGISTRATION_LAYER_URL,
  DC_CORPORATE_REGISTRATION_MODEL_TYPES,
  DC_CORPORATE_REGISTRATION_QUERY_URL,
  DC_CORPORATE_REGISTRATION_SOURCE_SCHEMA,
  DC_CORPORATE_REGISTRATION_STATUS_VOCABULARY,
  preflightDcCorporateRegistration,
} from "./dc-corporate-registration.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const token = "managed-api-fixture-token-that-is-long-enough-2026";
function makeExportProfile({ id, name, street, city, state, zip, zip4 = null, geocode, sourceId, releaseId, recordId, runId, policyId, exportPolicy }) {
  const matchKey = `street|${street.toUpperCase()}||${city.toUpperCase()}|${state}|${zip}`;
  return {
    schema_version: "1.0.0", profile_version: BUSINESS_LOCATION_PROFILE_VERSION,
    profile_id: `location-profile:${id.padStart(32, "0")}`, zip_code: zip,
    site_entity_id: `site:${recordId}`, establishment_entity_id: `establishment:${recordId}`, organization_entity_id: null,
    address: { street, unit_or_additional: null, city, state, zip_code: zip, postal_code: zip, zip4, county_name: null },
    normalized_address: { kind: "street", street: street.toUpperCase(), unit: null, city: city.toUpperCase(), state, zip_code: zip, complete: true, match_key: matchKey },
    address_match_key_sha256: sha256(matchKey), names: [{ raw: name }], primary_name_match_key_sha256: null,
    geocode, external_identifiers: [], source_status: null, observed_at: "2026-09-01T00:00:00.000Z",
    source: { source_id: sourceId, source_release_id: releaseId, source_record_id: recordId, ingest_run_id: runId, transformation_version: "v1", policy_id: policyId },
    export_policy: exportPolicy,
  };
}
const timeout = (milliseconds, callback) => new Promise((resolve, reject) => {
  const timer = setTimeout(callback ? () => reject(callback()) : resolve, milliseconds);
  timer.unref();
});

async function unusedPort() {
  const socket = net.createServer();
  socket.unref();
  socket.listen(0, "127.0.0.1");
  await once(socket, "listening");
  const port = socket.address().port;
  await new Promise((resolve, reject) => socket.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function makeFixture(t) {
  const root = path.join(APP_ROOT, "data", "test-runtime", `managed-api-${randomUUID()}`);
  await mkdir(path.join(root, "scripts"), { recursive: true });
  await mkdir(path.join(root, "runner"), { recursive: true });
  await cp(path.join(APP_ROOT, "config"), path.join(root, "config"), { recursive: true });
  const iaSourceRoot = path.join(APP_ROOT, "data", "business-sources", "ia-business-registry-active-entities");
  const iaFixtureRoot = path.join(root, "data", "business-sources", "ia-business-registry-active-entities");
  const iaPointer = JSON.parse(await readFile(path.join(iaSourceRoot, "current.json"), "utf8"));
  await mkdir(path.dirname(path.join(iaFixtureRoot, ...iaPointer.manifest.split("/"))), { recursive: true });
  await copyFile(path.join(iaSourceRoot, "current.json"), path.join(iaFixtureRoot, "current.json"));
  await copyFile(path.join(iaSourceRoot, ...iaPointer.manifest.split("/")), path.join(iaFixtureRoot, ...iaPointer.manifest.split("/")));
  const orSourceRoot = path.join(APP_ROOT, "data", "business-sources", "or-business-registry-active-registrations");
  const orFixtureRoot = path.join(root, "data", "business-sources", "or-business-registry-active-registrations");
  const orPointer = JSON.parse(await readFile(path.join(orSourceRoot, "current.json"), "utf8"));
  await mkdir(path.dirname(path.join(orFixtureRoot, ...orPointer.manifest.split("/"))), { recursive: true });
  await copyFile(path.join(orSourceRoot, "current.json"), path.join(orFixtureRoot, "current.json"));
  await copyFile(path.join(orSourceRoot, ...orPointer.manifest.split("/")), path.join(orFixtureRoot, ...orPointer.manifest.split("/")));
  const nySourceRoot = path.join(APP_ROOT, "data", "business-sources", "ny-business-registry-active-entities");
  const nyFixtureRoot = path.join(root, "data", "business-sources", "ny-business-registry-active-entities");
  const nyPointer = JSON.parse(await readFile(path.join(nySourceRoot, "current.json"), "utf8"));
  await mkdir(path.dirname(path.join(nyFixtureRoot, ...nyPointer.manifest.split("/"))), { recursive: true });
  await copyFile(path.join(nySourceRoot, "current.json"), path.join(nyFixtureRoot, "current.json"));
  await copyFile(path.join(nySourceRoot, ...nyPointer.manifest.split("/")), path.join(nyFixtureRoot, ...nyPointer.manifest.split("/")));
  for (const descriptor of Object.values(RETAINED_BUSINESS_REFRESH_DESCRIPTORS)) {
    const sourceRoot = path.join(APP_ROOT, "data", "business-sources", descriptor.datasetId);
    const fixtureRoot = path.join(root, "data", "business-sources", descriptor.datasetId);
    const pointer = JSON.parse(await readFile(path.join(sourceRoot, "current.json"), "utf8"));
    await mkdir(path.dirname(path.join(fixtureRoot, ...pointer.manifest.split("/"))), { recursive: true });
    await copyFile(path.join(sourceRoot, "current.json"), path.join(fixtureRoot, "current.json"));
    await copyFile(path.join(sourceRoot, ...pointer.manifest.split("/")), path.join(fixtureRoot, ...pointer.manifest.split("/")));
  }
  for (const file of ["compose-flat-business-export.mjs", "run-dc-corporate-registration-app.mjs"]) await copyFile(path.join(APP_ROOT, "scripts", file), path.join(root, "scripts", file));
  for (const file of ["paths.mjs", "cli-cancellation.mjs", "business-location-profile-contract.mjs", "childcare-geographic-evidence.mjs", "normalized-us-postal-code.mjs",
    "tn-childcare-geographic-evidence.mjs", "tn-childcare-normalization.mjs", "tn-childcare-registry-adapter.mjs", "tn-childcare-preflight.mjs", "source-http-guards.mjs",
    "business-flatfile-compatibility.mjs", "oh-childcare-coverage-evidence.mjs", "oh-childcare-geographic-evidence.mjs", "oh-childcare-registry-adapter.mjs",
    "oh-childcare-registry-input.mjs", "oh-childcare-app.mjs", "oh-childcare-source-use.mjs", "oh-childcare-preflight.mjs", "oh-childcare-acquired-release.mjs",
    "oh-childcare-transport.mjs", "oh-childcare-acquisition.mjs", "oh-childcare-release.mjs", "oh-childcare-normalization.mjs",
    "dc-corporate-registration.mjs", "dc-corporate-registration-app.mjs"]) await copyFile(path.join(APP_ROOT, "runner", file), path.join(root, "runner", file));
  await mkdir(path.join(root, "docs/states"), { recursive: true });
  await copyFile(path.join(APP_ROOT, "docs/states/OH-CHILDCARE-USE-DECISION-2026-09-08.json"), path.join(root, "docs/states/OH-CHILDCARE-USE-DECISION-2026-09-08.json"));
  // Import the real isolated child before HTTP dispatch so missing fixture dependencies
  // are diagnosed here without weakening production stderr redaction.
  const importProbe = spawn(process.execPath, ["--input-type=module", "-e", "await import(process.argv[1])", pathToFileURL(path.join(root, 'scripts/compose-flat-business-export.mjs')).href], { cwd: root, windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
  let importDiagnostic = "";
  importProbe.stderr.on("data", chunk => { importDiagnostic += chunk; });
  const [importExit] = await once(importProbe, "close");
  if (importExit !== 0) await rm(root, { recursive: true, force: true });
  assert.equal(importExit, 0, importDiagnostic);
  const industryConfig = JSON.parse(await readFile(path.join(root, "config", "industry-segments.json"), "utf8"));
  for (const source of Object.values(industryConfig.sources)) {
    const stub = path.join(root, ...source.script.split("/"));
    await mkdir(path.dirname(stub), { recursive: true });
    await writeFile(stub, "process.exitCode = 0;\n", { flag: "wx" }).catch((error) => { if (error.code !== "EEXIST") throw error; });
  }
  for (const descriptor of Object.values(GOVERNED_SOURCE_REFRESH_DESCRIPTORS)) {
    for (const relative of [descriptor.builder, descriptor.verifier]) {
      const target = path.join(root, ...relative.split("/")); await mkdir(path.dirname(target), { recursive: true });
      await copyFile(path.join(APP_ROOT, ...relative.split("/")), target);
    }
  }

  const release = path.join(root, "data", "business-registry", "release");
  await mkdir(path.join(release, "resolution", "location-profiles"), { recursive: true });
  const rows = [
    makeExportProfile({ id: "1", name: "Review Store", street: "1 Main", city: "Austin", state: "TX", zip: "78701", zip4: "1234", geocode: { latitude: 30.27, longitude: -97.74 }, sourceId: "usda-snap-current-retailers", releaseId: "s1", recordId: "r1", runId: "i1", policyId: "p1", exportPolicy: "local-review-only" }),
    makeExportProfile({ id: "2", name: "Second Store", street: "2 Pike", city: "Seattle", state: "WA", zip: "98101", zip4: "5678", geocode: { latitude: 47.6, longitude: -122.3 }, sourceId: "texas-comptroller-active-sales-tax-permits", releaseId: "s2", recordId: "r2", runId: "i2", policyId: "p2", exportPolicy: "local-review-only" }),
  ];
  const zipped = gzipSync(`${rows.map(JSON.stringify).join("\n")}\n`);
  const artifact = "resolution/location-profiles/zip2=00.jsonl.gz";
  await writeFile(path.join(release, ...artifact.split("/")), zipped);
  const manifest = { dataset_id: "national-business-registry", release_id: "fixture-1", status: "published-partial", artifacts: [{ path: artifact, artifact_type: "entity-resolution-location-profile-jsonl-gzip", bytes: zipped.length, sha256: sha256(zipped) }] };
  await writeFile(path.join(release, "manifest.json"), JSON.stringify(manifest));
  await writeFile(path.join(root, "data", "business-registry", "current.json"), JSON.stringify({ dataset_id: manifest.dataset_id, release_id: manifest.release_id, manifest: "release/manifest.json" }));

  const port = await unusedPort();
  const child = spawn(process.execPath, [path.join(APP_ROOT, "runner", "server.mjs")], {
    cwd: APP_ROOT,
    env: { ...process.env, DATAHUB_ROOT: root, DATAHUB_CONTROL_TOKEN: token, RUNNER_HOST: "127.0.0.1", RUNNER_PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe", "ipc"], windowsHide: true,
  });
  let stderr = ""; child.stderr.on("data", (chunk) => { stderr += chunk; });
  await Promise.race([
    new Promise((resolve, reject) => { child.on("message", (message) => message?.type === "runner-ready" && resolve()); child.once("exit", (code) => reject(new Error(`runner exited ${code}: ${stderr}`))); }),
    timeout(8_000, () => new Error(`runner startup timed out: ${stderr}`)),
  ]);
  t.after(async () => {
    if (child.exitCode === null) { child.kill("SIGTERM"); await Promise.race([once(child, "exit"), timeout(3_000)]); }
    if (child.exitCode === null) child.kill("SIGKILL");
    await rm(root, { recursive: true, force: true });
  });
  return { root, child, base: `http://127.0.0.1:${port}` };
}

async function request(base, route, { method = "GET", body, authenticated = true } = {}) {
  const headers = {};
  if (authenticated) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  return fetch(`${base}${route}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(5_000) });
}

async function waitForOperation(base, id) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const response = await request(base, `/api/data-operations/operations/${id}`);
    assert.equal(response.status, 200);
    const operation = await response.json();
    if (!["QUEUED", "RUNNING"].includes(operation.status)) return operation;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("managed export did not finish");
}

async function makeDcPackage(root, packageId) {
  const observedModifiedAt = Date.now() - 3_600_000;
  const statuses = Object.fromEntries(DC_CORPORATE_REGISTRATION_STATUS_VOCABULARY.map(value => [value, value === DC_CORPORATE_REGISTRATION_ACTIVE_STATUSES[0] ? 1 : 0]));
  const models = Object.fromEntries(DC_CORPORATE_REGISTRATION_MODEL_TYPES.map(value => [value, value === "Domestic Business Corporation" ? 1 : 0]));
  const response = value => new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
  const preflight = await preflightDcCorporateRegistration({ now: () => new Date(), fetchImpl: async (url, options = {}) => {
    if (String(url) === `${DC_CORPORATE_REGISTRATION_LAYER_URL}?f=pjson`) return response({ name: "Corporate Registration", type: "Table", displayField: "BUSINESS_NAME", objectIdField: "OBJECTID", globalIdField: "GLOBALID", geometryType: null, capabilities: "Query,Extract", dateFieldsTimeReference: { timeZone: "Eastern Standard Time", timeZoneIANA: "America/New_York", respectsDaylightSaving: true }, fields: DC_CORPORATE_REGISTRATION_SOURCE_SCHEMA.map(([name, type, length]) => ({ name, type, length })) });
    assert.equal(String(url), DC_CORPORATE_REGISTRATION_QUERY_URL);
    const body = new URLSearchParams(options.body);
    if (body.get("returnCountOnly") === "true") return response({ count: 1 });
    if (body.get("groupByFieldsForStatistics") === "ENTITY_STATUS") return response({ features: Object.entries(statuses).map(([ENTITY_STATUS, ROW_COUNT]) => ({ attributes: { ENTITY_STATUS, ROW_COUNT } })) });
    if (body.get("groupByFieldsForStatistics") === "MODELTYPE") return response({ features: Object.entries(models).map(([MODELTYPE, ROW_COUNT]) => ({ attributes: { MODELTYPE, ROW_COUNT } })) });
    return response({ features: [{ attributes: { MAX_DCS_LAST_MOD_DTTM: observedModifiedAt } }] });
  } });
  const row = { FILE_NUMBER: "L00000001", ENTITY_STATUS: "Active - In Good Standing", LOCALE: "Domestic", MODELTYPE: "Domestic Business Corporation", BUSINESS_NAME: "FIXTURE HOLDINGS INC", BUSNIESS_ADDRESS_LINE1: "100 TEST AVE", BUSNIESS_ADDRESS_LINE2: null, BUSNIESS_ADDRESS_LINE3: null, BUSNIESS_ADDRESS_LINE4: null, BUSINESS_CITY: "WASHINGTON", BUSINESS_STATE: "DC", ZIPCODE: "20001-1234", BUSINESS_COUNTRY: "UNITED STATES", SUFFIX: "INC", EFFECTIVE_DATE: 1577923200000, FOREIGN_DATEOF_ORGANIZATION: null, NEXT_REPORTYEAR_DUE: "2028", DCS_LAST_MOD_DTTM: observedModifiedAt, DATE_LAST_REPORT_FILED: 1766275200000, NEXT_REPORTYEAR: null, LATESTFILED_REPORTDATE: null, LATESTREPORT_YEARFILED: null, OBJECTID: 1001, GLOBALID: "{11111111-1111-4111-8111-111111111111}" };
  const directory = path.join(root, "data", "imports", "dc-corporate-registration", "packages", packageId);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "active.jsonl"), `${JSON.stringify(row)}\n`);
  await writeFile(path.join(directory, "preflight.json"), `${JSON.stringify(preflight)}\n`);
  await writeFile(path.join(directory, "selection.json"), `${JSON.stringify({ schema_version: "dc-corporate-registration-import-selection@1.0.0", package_id: packageId, files: { active_records: "active.jsonl", preflight_receipt: "preflight.json" } })}\n`);
  return `data/imports/dc-corporate-registration/packages/${packageId}/selection.json`;
}

test('production status HTTP API is authenticated, projected and strictly read-only',{timeout:20000},async t=>{
  const f=await makeFixture(t),route='/api/data-operations/production-runs';
  assert.equal((await request(f.base,route,{authenticated:false})).status,401);
  const directory=path.join(f.root,'data/reconciliations/production-runs/test-run');await mkdir(directory,{recursive:true});
  const receipt={schemaVersion:1,mode:'production',runId:'test-run',status:'RUNNING',startedAt:'2026-09-08T09:46:24.268Z',finishedAt:null,stopRequested:false,owner:{pid:process.pid,token:'SECRET'},error:'SECRET',stages:[{id:'registry-build',status:'RUNNING',startedAt:'2026-09-08T09:46:24.268Z',finishedAt:null}],outputs:{}};
  const file=path.join(directory,'receipt.json');await writeFile(file,JSON.stringify(receipt));const before=await readFile(file);
  const response=await request(f.base,route);assert.equal(response.status,200);const payload=await response.json();assert.equal(payload.runs[0].runId,'test-run');assert.doesNotMatch(JSON.stringify(payload),/SECRET/);
  for(const suffix of ['', '/test-run/stop','/test-run/retry','/start'])assert.equal((await request(f.base,route+suffix,{method:'POST',body:{}})).status,404);
  assert.deepEqual(await readFile(file),before);
});

test("managed operation HTTP API authenticates, validates, exports, and downloads governed artifacts", { timeout: 20_000 }, async (t) => {
  const fixture = await makeFixture(t);

  const unauthorized = await request(fixture.base, "/api/data-operations/catalog", { authenticated: false });
  assert.equal(unauthorized.status, 401);
  assert.equal(unauthorized.headers.get("www-authenticate"), "Bearer");

  const catalogResponse = await request(fixture.base, "/api/data-operations/catalog");
  assert.equal(catalogResponse.status, 200);
  const catalog = await catalogResponse.json();
  assert.ok(catalog.export.policyModes.includes("local-review"));
  const iowaRefresh = catalog.governedSourceServices.find(service => service.sourceId === "ia-business-registry");
  assert.equal(iowaRefresh.readinessStatus, "HOLD");
  assert.equal(iowaRefresh.dispatchAvailable, false);
  assert.equal(catalog.collectionSources.some(source => source.id === "ia-business-registry"), false);
  const oregonRefresh = catalog.governedSourceServices.find(service => service.sourceId === "or-business-registry");
  assert.equal(oregonRefresh.readinessStatus, "HOLD");
  assert.equal(oregonRefresh.dispatchAvailable, false);
  assert.equal(oregonRefresh.retainedRelease.activeRegistrationsPublished, 559874);
  assert.equal(catalog.collectionSources.some(source => source.id === "or-business-registry"), false);
  const newYorkRefresh = catalog.governedSourceServices.find(service => service.sourceId === "ny-business-registry");
  assert.equal(newYorkRefresh.readinessStatus, "HOLD");
  assert.equal(newYorkRefresh.dispatchAvailable, false);
  assert.equal(newYorkRefresh.retainedRelease.organizationsPublished, 4273072);
  assert.equal(catalog.collectionSources.some(source => source.id === "ny-business-registry"), false);

  const refreshPlanResponse = await request(fixture.base, "/api/data-operations/source-refresh-plans", { method: "POST", body: { sourceId: "ia-business-registry" } });
  assert.equal(refreshPlanResponse.status, 200);
  const refreshPlan = await refreshPlanResponse.json();
  assert.equal(refreshPlan.operationCreated, false);
  assert.equal(refreshPlan.networkRequestCount, 0);
  assert.equal(refreshPlan.allocationCount, 0);
  const refreshStartResponse = await request(fixture.base, "/api/data-operations/source-refreshes", { method: "POST", body: { sourceId: "ia-business-registry" } });
  assert.equal(refreshStartResponse.status, 409);
  assert.match((await refreshStartResponse.json()).error, /^ACQUISITION_NOT_AUTHORIZED:/);
  assert.deepEqual(await (await request(fixture.base, "/api/data-operations/operations")).json(), []);
  const orRefreshPlanResponse = await request(fixture.base, "/api/data-operations/source-refresh-plans", { method: "POST", body: { sourceId: "or-business-registry" } });
  assert.equal(orRefreshPlanResponse.status, 200);
  const orRefreshPlan = await orRefreshPlanResponse.json();
  assert.equal(orRefreshPlan.operationCreated, false);
  assert.equal(orRefreshPlan.networkRequestCount, 0);
  assert.equal(orRefreshPlan.allocationCount, 0);
  const orRefreshStartResponse = await request(fixture.base, "/api/data-operations/source-refreshes", { method: "POST", body: { sourceId: "or-business-registry" } });
  assert.equal(orRefreshStartResponse.status, 409);
  assert.match((await orRefreshStartResponse.json()).error, /^ACQUISITION_NOT_AUTHORIZED:/);
  assert.deepEqual(await (await request(fixture.base, "/api/data-operations/operations")).json(), []);
  const nyRefreshPlanResponse = await request(fixture.base, "/api/data-operations/source-refresh-plans", { method: "POST", body: { sourceId: "ny-business-registry" } });
  assert.equal(nyRefreshPlanResponse.status, 200);
  const nyRefreshPlan = await nyRefreshPlanResponse.json();
  assert.equal(nyRefreshPlan.operationCreated, false);
  assert.equal(nyRefreshPlan.networkRequestCount, 0);
  assert.equal(nyRefreshPlan.allocationCount, 0);
  const nyRefreshStartResponse = await request(fixture.base, "/api/data-operations/source-refreshes", { method: "POST", body: { sourceId: "ny-business-registry" } });
  assert.equal(nyRefreshStartResponse.status, 409);
  assert.match((await nyRefreshStartResponse.json()).error, /^ACQUISITION_NOT_AUTHORIZED:/);
  assert.deepEqual(await (await request(fixture.base, "/api/data-operations/operations")).json(), []);

  const bad = await request(fixture.base, "/api/data-operations/exports", { method: "POST", body: { format: "xml" } });
  assert.equal(bad.status, 400);
  assert.match((await bad.json()).error, /csv, jsonl, or both/);

  const planResponse = await request(fixture.base, "/api/data-operations/plan", { method: "POST", body: { industries: [catalog.industries[0].id], states: [catalog.states[0]] } });
  assert.equal(planResponse.status, 200);
  assert.ok(Number.isInteger((await planResponse.json()).taskCount));

  const batchPlanResponse = await request(fixture.base, "/api/data-operations/plan", { method: "POST", body: {
    industries: ["childcare"], states: ["MA", "NJ", "PA"], sourceIds: ["state-ma-childcare", "state-nj-childcare"],
  } });
  assert.equal(batchPlanResponse.status, 200);
  const batchPlan = await batchPlanResponse.json();
  assert.deepEqual(batchPlan.tasks.map(task => task.sourceId).sort(), ["state-ma-childcare", "state-nj-childcare"]);
  assert.ok(batchPlan.gaps.some(gap => gap.industry === "childcare" && gap.state === "PA"));
  assert.deepEqual(await (await request(fixture.base, "/api/data-operations/operations")).json(), []);
  for (const sourceIds of [[], ["state-ma-childcare", "state-ma-childcare"]]) {
    const invalidBatch = await request(fixture.base, "/api/data-operations/plan", { method: "POST", body: {
      industries: ["childcare"], states: ["MA", "NJ"], sourceIds,
    } });
    assert.equal(invalidBatch.status, 400);
  }
  assert.deepEqual(await (await request(fixture.base, "/api/data-operations/operations")).json(), []);

  const start = await request(fixture.base, "/api/data-operations/exports", { method: "POST", body: { format: "both", policyMode: "local-review", fields: ["business_name", "state", "zip_code"], outputPrefix: "exported2" } });
  assert.equal(start.status, 202);
  const operation = await waitForOperation(fixture.base, (await start.json()).id);
  assert.equal(operation.status, "SUCCEEDED", operation.error);
  assert.equal(operation.result.rowsWritten, 2);
  assert.equal(operation.result.localReviewOnly, true);

  for (const declared of operation.artifacts) {
    const denied = await request(fixture.base, `/api/data-operations/operations/${operation.id}/artifacts/${declared.name}`, { authenticated: false });
    assert.equal(denied.status, 401);
    const response = await request(fixture.base, `/api/data-operations/operations/${operation.id}/artifacts/${declared.name}`);
    assert.equal(response.status, 200);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(bytes.length, declared.bytes);
    const disk = await readFile(path.join(fixture.root, "data", "managed-operations", operation.id, "output", "exported2", declared.name));
    assert.equal(sha256(bytes), sha256(disk));
  }

  const history = await request(fixture.base, "/api/data-operations/operations");
  assert.equal(history.status, 200);
  assert.ok((await history.json()).some((item) => item.id === operation.id && item.status === "SUCCEEDED"));
});

test("managed refresh schedule API creates disabled schedules without launching collection", { timeout: 20_000 }, async (t) => {
  const fixture = await makeFixture(t), route = "/api/data-operations/schedules";
  assert.equal((await request(fixture.base, route, { authenticated: false })).status, 401);
  const initial = await request(fixture.base, route); assert.equal(initial.status, 200); assert.deepEqual(await initial.json(), []);
  const invalid = await request(fixture.base, route, { method: "POST", body: { industries: ["retail-consumer"], states: ["TX"], intervalHours: 0 } });
  assert.equal(invalid.status, 400);
  const response = await request(fixture.base, route, { method: "POST", body: { industries: ["retail-consumer"], states: ["TX"], intervalHours: 24 } });
  assert.equal(response.status, 201); const schedule = await response.json(); assert.equal(schedule.enabled, false);
  const pause = await request(fixture.base, `${route}/${schedule.id}/enabled`, { method: "POST", body: { enabled: false } }); assert.equal(pause.status, 200);
  const invalidToggle = await request(fixture.base, `${route}/${schedule.id}/enabled`, { method: "POST", body: { enabled: false, command: "ignored" } }); assert.equal(invalidToggle.status, 400);
  const listed = await request(fixture.base, route); assert.equal((await listed.json()).length, 1);
  const operations = await request(fixture.base, "/api/data-operations/operations"); assert.deepEqual(await operations.json(), []);
  const exited = once(fixture.child, "exit"); fixture.child.send("shutdown"); await exited;
  await assert.rejects(readFile(path.join(fixture.root, "data/refresh-schedules/owner.lock")), /ENOENT/);
  assert.equal(JSON.parse(await readFile(path.join(fixture.root, "data/refresh-schedules/state.json"))).schedules[0].enabled, false);
});

test('CMS retained adoption API authenticates and rejects caller source/output overrides without dispatch',async t=>{
  const fixture=await makeFixture(t),route='/api/data-operations/source-adoptions';
  assert.equal((await request(fixture.base,route,{method:'POST',authenticated:false,body:{sourceId:'cms-hospital-general-information'}})).status,401);
  for(const body of [{},{sourceId:'other'},{sourceId:'cms-hospital-general-information',url:'https://example.com'},{sourceId:'cms-hospital-general-information',output:'data/elsewhere'},{sourceId:'cms-nursing-home-provider-information',manifestPath:'data/elsewhere'},{sourceId:'cms-nursing-home-provider-information',download:true}])assert.equal((await request(fixture.base,route,{method:'POST',body})).status,400);
  const catalog=await (await request(fixture.base,'/api/data-operations/catalog')).json();assert.ok(catalog.retainedSourceAdoptions.some(s=>s.sourceId==='cms-nursing-home-provider-information'&&s.historicalAcquisitionStatus==='FAILED'&&s.downloads===false));
  assert.deepEqual(await (await request(fixture.base,'/api/data-operations/operations')).json(),[]);
});

test('DC Corporate Registration API is authenticated, closed, app-owned, and independently replayed', { timeout: 20_000 }, async t => {
  const fixture = await makeFixture(t), route = '/api/data-operations/dc-corporate-registration';
  const selection = await makeDcPackage(fixture.root, 'managed-http-fixture');
  assert.equal((await request(fixture.base, route, { method: 'POST', authenticated: false, body: { selection } })).status, 401);
  for (const body of [{}, { selection, output: 'data/elsewhere' }, { selection, url: DC_CORPORATE_REGISTRATION_QUERY_URL }, { selection: 'config/connectors/dc-corporate-registration.json' }]) {
    assert.equal((await request(fixture.base, route, { method: 'POST', body })).status, 400);
  }
  assert.deepEqual(await (await request(fixture.base, '/api/data-operations/operations')).json(), []);
  const accepted = await request(fixture.base, route, { method: 'POST', body: { selection } });
  assert.equal(accepted.status, 202);
  const operation = await waitForOperation(fixture.base, (await accepted.json()).id);
  assert.equal(operation.status, 'SUCCEEDED', operation.error);
  assert.equal(operation.kind, 'dc-corporate-registration');
  assert.deepEqual(operation.artifacts, []);
  assert.equal(operation.result.sourceId, 'dc-corporate-registration');
  assert.equal(operation.result.receiptIntegrityVerified, true);
  assert.equal(operation.result.networkRequests, 0);
  assert.equal(operation.result.currentPointerWritten, false);
  assert.equal(operation.result.nationalAdmissionPerformed, false);
  assert.equal((await request(fixture.base, `/api/data-operations/operations/${operation.id}/artifacts/receipt.json`)).status, 404);
});

test('Illinois Business Registry API is authenticated and rejects caller-controlled execution options', { timeout: 20_000 }, async t => {
  const fixture = await makeFixture(t), route = '/api/data-operations/il-business-registry';
  const selection = 'data/imports/illinois-business-registry/packages/managed-http-fixture/selection.json';
  assert.equal((await request(fixture.base, route, { method: 'POST', authenticated: false, body: { selection } })).status, 401);
  for (const body of [{}, { selection, output: 'data/elsewhere' }, { selection, url: 'https://example.com' }, { selection: 'config/connectors/il-business-registry-app.json' }]) {
    assert.equal((await request(fixture.base, route, { method: 'POST', body })).status, 400);
  }
  assert.deepEqual(await (await request(fixture.base, '/api/data-operations/operations')).json(), []);
});

test('ten-source API is authenticated read-only and absent enrollment is pending without substituted counts',async t=>{
  const fixture=await makeFixture(t),route='/api/dataset-representation/ten';
  assert.equal((await request(fixture.base,route,{authenticated:false})).status,401);
  assert.equal((await request(fixture.base,route,{method:'POST',body:{}})).status,405);
  assert.equal((await request(fixture.base,route+'?state=MN')).status,400);
  const response=await request(fixture.base,route);assert.equal(response.status,200);const result=await response.json();assert.equal(result.available,false);assert.equal(result.reason,'production-enrollment-absent');assert.equal(result.allBusinessesPercent,null);assert.equal(result.states,undefined);
  const old=await request(fixture.base,'/api/dataset-representation');assert.equal(old.status,200);assert.notEqual((await old.json()).denominatorVersion,'national-reporting-ten@1.0.0');
  assert.deepEqual(await (await request(fixture.base,'/api/data-operations/operations')).json(),[]);
});
