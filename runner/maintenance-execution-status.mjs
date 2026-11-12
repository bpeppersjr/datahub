import path from "node:path";
import { lstat } from "node:fs/promises";
import { APP_ROOT } from "./paths.mjs";

const INDUSTRIES = [
  "childcare", "construction", "financial-services", "health-care",
  "local-business-licenses", "retail-consumer", "sales-tax-outlets",
  "tax-exempt-organizations", "transportation",
];
const REASONS = ["AUTOMATIC_REFRESH_NOT_REVIEWED", "GOVERNED_SOURCE_HOLD", "MANUAL_SELECTION_REQUIRED"];
const OP_STATUSES = new Set(["QUEUED", "RUNNING", "UNKNOWN", "SUCCEEDED", "FAILED", "CANCELLED"]);
const SCHEDULE_STATUSES = new Set(["READY", "DISABLED", "RUNNING", "PAUSED"]);
const check = (value, message) => { if (!value) throw Object.assign(new Error(`Maintenance execution status rejected: ${message}`), { statusCode: 503 }); };
const date = (value) => typeof value === "string" && Number.isFinite(Date.parse(value));
const exact = (value, keys) => value && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).sort().join("|") === [...keys].sort().join("|");

async function prerequisiteStatus(config, sourceIds, root) {
  const declared = sourceIds.flatMap((id) => config.sources[id].prerequisites);
  let present = 0, missing = 0;
  for (const relative of declared) {
    const target = path.resolve(root, relative), inside = path.relative(path.resolve(root), target);
    check(inside !== "" && !inside.startsWith("..") && !path.isAbsolute(inside), "prerequisite path escape");
    try {
      const info = await lstat(target);
      if (info.isSymbolicLink() || (!info.isFile() && !info.isDirectory())) missing += 1;
      else present += 1;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      missing += 1;
    }
  }
  return { declared: declared.length, present, missing, status: !declared.length ? "none" : missing ? "missing" : "present-unvalidated" };
}

export async function readMaintenanceExecutionStatus({ maintenance, catalog, schedules, operations, config, root = APP_ROOT, now = () => new Date().toISOString() } = {}) {
  check(exact(maintenance, ["industries", "maintainedIndustries", "revision", "semantics"]), "maintenance envelope");
  check(Number.isSafeInteger(maintenance.revision) && maintenance.revision >= 0 && Array.isArray(maintenance.industries)
    && maintenance.industries.length === INDUSTRIES.length && Array.isArray(maintenance.maintainedIndustries), "maintenance fields");
  const maintenanceIds = maintenance.industries.map((row) => row?.id).sort();
  check(JSON.stringify(maintenanceIds) === JSON.stringify(INDUSTRIES) && new Set(maintenance.maintainedIndustries).size === maintenance.maintainedIndustries.length
    && maintenance.maintainedIndustries.every((id) => INDUSTRIES.includes(id)), "maintenance industries");
  check(catalog && Array.isArray(catalog.collectionSources) && Array.isArray(catalog.automaticRefreshSources), "catalog unavailable");
  check(config?.sources && config?.industries && !Array.isArray(config.sources) && !Array.isArray(config.industries), "industry config unavailable");
  check(Array.isArray(schedules) && schedules.length <= 1000 && Array.isArray(operations) && operations.length <= 100000, "runtime collections");
  const sourceIds = new Set(catalog.collectionSources.map((row) => row?.id));
  check(sourceIds.size === catalog.collectionSources.length && catalog.automaticRefreshSources.length === sourceIds.size
    && Object.keys(config.sources).length === sourceIds.size, "source catalog conservation");
  const decisions = new Map(catalog.automaticRefreshSources.map((row) => [row?.sourceId, row]));
  for (const source of catalog.collectionSources) {
    check(source && exact(source, ["id", "scope", "states", "industries", "manualSelectionRequired"])
      && sourceIds.has(source.id) && decisions.has(source.id) && config.sources[source.id], "source catalog row");
    const decision = decisions.get(source.id);
    check(decision && exact(decision, ["sourceId", "script", "automaticRefreshAuthorized", "reasonCode", "governedSourceId"])
      && typeof decision.automaticRefreshAuthorized === "boolean"
      && (decision.automaticRefreshAuthorized || REASONS.includes(decision.reasonCode)), "automatic refresh row");
  }
  for (const schedule of schedules) check(schedule && Array.isArray(schedule.industries) && typeof schedule.enabled === "boolean"
    && SCHEDULE_STATUSES.has(schedule.status) && (schedule.nextDueAt === null || date(schedule.nextDueAt)), "schedule row");
  for (const operation of operations) check(operation && typeof operation.operation_id === "string" && Array.isArray(operation.industries)
    && OP_STATUSES.has(operation.status) && date(operation.created_at)
    && (operation.finished_at === null || date(operation.finished_at)), "operation row");
  const generatedAt = now(); check(date(generatedAt), "clock");
  const selected = new Set(maintenance.maintainedIndustries);
  const rows = [];
  for (const id of INDUSTRIES) {
    const sources = catalog.collectionSources.filter((row) => row.industries.includes(id));
    check(sources.length > 0 && config.industries[id] && [...config.industries[id]].sort().join("|") === sources.map((row) => row.id).sort().join("|"), `source mapping ${id}`);
    const reasonCounts = Object.fromEntries(REASONS.map((reason) => [reason, 0]));
    let authorized = 0;
    for (const source of sources) {
      const decision = decisions.get(source.id);
      if (decision.automaticRefreshAuthorized) authorized += 1;
      else reasonCounts[decision.reasonCode] += 1;
    }
    const applicableSchedules = schedules.filter((row) => row.industries.includes(id));
    const runningSchedules = applicableSchedules.filter((row) => row.status === "RUNNING").length;
    const enabledSchedules = applicableSchedules.filter((row) => row.enabled).length;
    const pausedSchedules = applicableSchedules.filter((row) => row.status === "PAUSED").length;
    const nextDue = applicableSchedules.map((row) => row.nextDueAt).filter(Boolean).sort()[0] ?? null;
    const scheduleOccurrences = applicableSchedules.map((row) => row.lastOccurrence).filter(Boolean).sort((a, b) => (b.createdAt ?? b.dueAt).localeCompare(a.createdAt ?? a.dueAt));
    const industryOperations = operations.filter((row) => row.industries.includes(id)).sort((a, b) => b.created_at.localeCompare(a.created_at));
    const latest = industryOperations[0] ?? null;
    const prerequisites = await prerequisiteStatus(config, sources.map((row) => row.id), root);
    const isSelected = selected.has(id);
    let effective = "not-selected";
    if (isSelected) {
      if (runningSchedules || industryOperations.some((row) => ["QUEUED", "RUNNING", "UNKNOWN"].includes(row.status))) effective = "selected-running";
      else if (prerequisites.missing) effective = "selected-blocked-prerequisite";
      else if (authorized === 0 && sources.every((row) => row.manualSelectionRequired)) effective = "selected-manual-only";
      else if (authorized === 0) effective = "selected-blocked-automatic-refresh";
      else if (pausedSchedules) effective = "selected-scheduled-paused";
      else if (enabledSchedules) effective = "selected-scheduled-enabled";
      else if (applicableSchedules.length) effective = "selected-scheduled-disabled";
      else effective = "selected-intent-only";
    }
    rows.push({
      id, selected_intent: isSelected,
      configured_sources: { total: sources.length, national: sources.filter((row) => row.scope === "national").length, state: sources.filter((row) => row.scope === "state").length, manual_only: sources.filter((row) => row.manualSelectionRequired).length },
      automatic_refresh: { authorized, blocked: sources.length - authorized, reason_counts: reasonCounts },
      schedule: { configured: applicableSchedules.length, enabled: enabledSchedules, running: runningSchedules, paused: pausedSchedules, next_due_at: nextDue, last_occurrence_status: scheduleOccurrences[0]?.status ?? null },
      latest_collection: latest ? { operation_id: latest.operation_id, status: latest.status, created_at: latest.created_at, finished_at: latest.finished_at } : null,
      prerequisites, effective_status: effective,
    });
  }
  return {
    schema_version: "industry-maintenance-execution-status@1.0.0", generated_at: generatedAt,
    maintenance_revision: maintenance.revision, industries: rows,
    claims: { selection_authorizes_acquisition: false, status_starts_work: false, prerequisite_contents_validated: false, latest_success_implies_current_evidence: false, business_completeness: null },
  };
}

export async function maintenanceExecutionStatusHttp(request, response, url, reader, json) {
  if (request.method !== "GET") { json(response, 405, { error: "Maintenance execution status is read-only." }); return; }
  if ([...url.searchParams.keys()].length) { json(response, 400, { error: "Maintenance execution status does not accept options." }); return; }
  if (request.headers?.["content-length"] !== undefined || request.headers?.["transfer-encoding"] !== undefined) {
    json(response, 400, { error: "Maintenance execution status does not accept a request body." }); return;
  }
  try { json(response, 200, await reader()); }
  catch { json(response, 503, { error: "Maintenance execution status is unavailable; no execution state was inferred." }); }
}
