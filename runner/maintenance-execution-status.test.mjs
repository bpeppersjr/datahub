import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { mkdtemp, mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { maintenanceExecutionStatusHttp, readMaintenanceExecutionStatus } from "./maintenance-execution-status.mjs";

const INDUSTRIES = ["childcare", "construction", "financial-services", "health-care", "local-business-licenses", "retail-consumer", "sales-tax-outlets", "tax-exempt-organizations", "transportation"];
const time = "2026-11-11T21:00:00.000Z";
async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "maintenance-status-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const sources = {}, industries = {}, collectionSources = [], automaticRefreshSources = [];
  for (const id of INDUSTRIES) {
    const sourceId = `source-${id}`, prerequisite = `prerequisites/${id}.json`;
    industries[id] = [sourceId];
    sources[sourceId] = { script: `scripts/${id}.mjs`, scope: "national", states: "all", state_filter_supported: false, prerequisites: [prerequisite], ...(id === "childcare" ? { manual_selection_required: true } : {}) };
    collectionSources.push({ id: sourceId, scope: "national", states: "all", industries: [id], manualSelectionRequired: id === "childcare" });
    const blocked = id === "childcare" || id === "health-care";
    automaticRefreshSources.push({ sourceId, script: `scripts/${id}.mjs`, automaticRefreshAuthorized: !blocked,
      reasonCode: id === "childcare" ? "MANUAL_SELECTION_REQUIRED" : "AUTOMATIC_REFRESH_NOT_REVIEWED", governedSourceId: null });
    if (id !== "construction") { await mkdir(path.join(root, "prerequisites"), { recursive: true }); await writeFile(path.join(root, prerequisite), "{}\n"); }
  }
  return {
    root, config: { version: 1, max_concurrency: 10, states: ["AL"], industries, sources },
    maintenance: { industries: INDUSTRIES.map((id) => ({ id, label: id })), maintainedIndustries: [...INDUSTRIES], revision: 7, semantics: "Intent only." },
    catalog: { collectionSources, automaticRefreshSources },
    schedules: [
      schedule("retail-consumer", "READY", true, "2026-11-12T00:00:00.000Z"),
      schedule("sales-tax-outlets", "DISABLED", false, null),
      schedule("tax-exempt-organizations", "PAUSED", false, null),
      schedule("local-business-licenses", "RUNNING", true, "2026-11-11T20:00:00.000Z", "RUNNING"),
    ],
    operations: [
      operation("local-business-licenses", "RUNNING", "2026-11-11T20:30:00.000Z", null),
      operation("transportation", "FAILED", "2026-11-10T20:00:00.000Z", "2026-11-10T20:01:00.000Z"),
      operation("financial-services", "SUCCEEDED", "2026-11-09T20:00:00.000Z", "2026-11-09T20:02:00.000Z"),
    ],
  };
}
function schedule(industry, status, enabled, nextDueAt, occurrenceStatus = null) {
  return { id: `${industry.padEnd(8, "0").slice(0, 8)}-0000-0000-0000-000000000000`, industries: [industry], states: ["AL"], intervalHours: 168,
    enabled, planHash: "a".repeat(64), resources: [`source:${industry}`], createdAt: "2026-11-01T00:00:00.000Z", status, nextDueAt,
    lastOccurrence: occurrenceStatus ? { operationId: `refresh-${"a".repeat(48)}`, status: occurrenceStatus, dueAt: "2026-11-11T20:00:00.000Z", createdAt: "2026-11-11T20:00:00.000Z" } : null, reason: status === "PAUSED" ? "REVIEW_REQUIRED" : null };
}
function operation(industry, status, created_at, finished_at) {
  return { operation_id: `${industry}-${created_at}`, industries: [industry], status, created_at, finished_at };
}

test("projects nine redacted per-industry execution states without widening maintenance intent", async (t) => {
  const f = await fixture(t), view = await readMaintenanceExecutionStatus({ ...f, now: () => time });
  assert.equal(view.schema_version, "industry-maintenance-execution-status@1.0.0");
  assert.equal(view.maintenance_revision, 7);
  assert.equal(view.industries.length, 9);
  assert.deepEqual(Object.fromEntries(view.industries.map((row) => [row.id, row.effective_status])), {
    childcare: "selected-manual-only", construction: "selected-blocked-prerequisite", "financial-services": "selected-intent-only",
    "health-care": "selected-blocked-automatic-refresh", "local-business-licenses": "selected-running", "retail-consumer": "selected-scheduled-enabled",
    "sales-tax-outlets": "selected-scheduled-disabled", "tax-exempt-organizations": "selected-scheduled-paused", transportation: "selected-intent-only",
  });
  assert.equal(view.industries.find((row) => row.id === "financial-services").latest_collection.status, "SUCCEEDED");
  assert.equal(view.industries.find((row) => row.id === "financial-services").effective_status, "selected-intent-only");
  assert.deepEqual(view.claims, { selection_authorizes_acquisition: false, status_starts_work: false, prerequisite_contents_validated: false, latest_success_implies_current_evidence: false, business_completeness: null });
  const serialized = JSON.stringify(view);
  assert.doesNotMatch(serialized, /prerequisites\\|scripts\\|Managed child|private/i);
});

test("not-selected is independent of configured schedules and prior receipts", async (t) => {
  const f = await fixture(t); f.maintenance.maintainedIndustries = [];
  const view = await readMaintenanceExecutionStatus({ ...f, now: () => time });
  assert.ok(view.industries.every((row) => row.effective_status === "not-selected" && row.selected_intent === false));
  assert.equal(view.industries.find((row) => row.id === "local-business-licenses").schedule.running, 1);
});

test("rejects catalog drift and malformed runtime evidence", async (t) => {
  const f = await fixture(t); f.catalog.collectionSources[0].industries = ["invented"];
  await assert.rejects(readMaintenanceExecutionStatus({ ...f, now: () => time }), /source mapping|rejected/);
  const g = await fixture(t); g.operations[0].status = "invented";
  await assert.rejects(readMaintenanceExecutionStatus({ ...g, now: () => time }), /operation row/);
});

function response() { return { status: null, body: null }; }
const json = (res, status, body) => { res.status = status; res.body = body; };
test("HTTP is authenticated upstream, bodyless GET-only, optionless, and redacts failures", async () => {
  let calls = 0;
  for (const [method, query, headers, status] of [["POST", "", {}, 405], ["GET", "?x=1", {}, 400], ["GET", "", { "content-length": "1" }, 400]]) {
    const res = response(); await maintenanceExecutionStatusHttp({ method, headers }, res, new URL(`http://local/status${query}`), async () => { calls += 1; }, json); assert.equal(res.status, status);
  }
  const failed = response(); await maintenanceExecutionStatusHttp({ method: "GET", headers: {} }, failed, new URL("http://local/status"), async () => { throw Error("private path secret"); }, json);
  assert.equal(failed.status, 503); assert.doesNotMatch(JSON.stringify(failed.body), /private path secret/); assert.equal(calls, 0);
  const server = await readFile(new URL("./server.mjs", import.meta.url), "utf8"), auth = server.indexOf("controlPlane.authorize(request)"), route = server.indexOf("/api/administration/industry-maintenance-execution-status");
  assert.ok(auth >= 0 && route > auth); assert.match(server, /maintenanceExecutionStatusHttp\(request, response, url, maintenanceExecutionStatus, json\)/);
});
