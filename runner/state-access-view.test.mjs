import assert from "node:assert/strict";
import {
  copyFile,
  link,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import test from "node:test";
import { createHash } from "node:crypto";
import { APP_ROOT } from "./paths.mjs";
import {
  stateAccessView,
  stateAccessIndustrySummary,
  stateAccessMaintenanceBacklog,
} from "./state-access-view.mjs";

const REPORT =
  "data/state-access/reports/20261007023010-5b9c3f32-72fb-4853-80bd-5bca775f640e.json";
test("bounded state-access view exposes exact temporal, aggregate, and typed directory evidence", async () => {
  const construction = await stateAccessView({
    state: "AL",
    industry: "construction",
  });
  assert.equal(construction.temporalStatus.status, "missing-source-reference");
  assert.equal(
    construction.exactBindings.length,
    construction.temporalStatus.positiveEvidenceItems,
  );
  assert.equal(
    construction.contextTemporalEvidence.status,
    "within-review-window",
  );
  assert.equal(construction.annualAggregateContext.referenceYear, 2023);
  assert.equal(
    construction.annualAggregateContext.zipOrZctaInferencePermitted,
    false,
  );
  const childcare = await stateAccessView({
    state: "AL",
    industry: "childcare",
  });
  assert.equal(childcare.temporalStatus.status, "no-positive-count-evidence");
  assert.equal(childcare.temporalStatus.positiveEvidenceItems, 0);
  assert.equal(childcare.exactBindings.length, 0);
  assert.equal(
    childcare.contextTemporalEvidence.status,
    "within-review-window",
  );
  const iaChildcare = await stateAccessView({
    state: "IA",
    industry: "childcare",
  });
  assert.equal(
    iaChildcare.exactBindings.length,
    iaChildcare.temporalStatus.positiveEvidenceItems,
  );
  assert.ok(
    iaChildcare.exactBindings.every((row) =>
      row.temporalEvidence.binding.startsWith("exact-"),
    ),
  );
  const caChildcare = await stateAccessView({
    state: "CA",
    industry: "childcare",
  });
  assert.equal(caChildcare.publisherStatusReadiness.publisher_rows, 39184);
  assert.equal(
    caChildcare.publisherStatusReadiness.publisher_open_status_candidate_rows,
    28109,
  );
  assert.equal(
    caChildcare.publisherStatusReadiness.claims.current_operations_verified,
    false,
  );
  assert.equal(
    caChildcare.publisherStatusReadiness.claims.business_count,
    null,
  );
  const nhChildcare = await stateAccessView({
    state: "NH",
    industry: "childcare",
  });
  assert.equal(
    nhChildcare.accessEvidenceStatus,
    "unsupported-evidence-not-measured",
  );
  assert.equal(nhChildcare.temporalStatus.status, "no-positive-count-evidence");
  assert.equal(nhChildcare.temporalStatus.positiveEvidenceItems, 0);
  assert.equal(nhChildcare.exactBindings.length, 0);
  assert.equal(
    nhChildcare.contextTemporalEvidence.status,
    "within-review-window",
  );
  const health = await stateAccessView({
    state: "MN",
    industry: "health-care",
  });
  assert.equal(health.retainedDirectoryEvidence.length, 2);
  assert.ok(
    health.retainedDirectoryEvidence.some(
      (row) =>
        row.sourceId === "cms-nursing-home-provider-information" &&
        row.directoryRows === 338,
    ),
  );
  assert.equal(Object.hasOwn(health, "appHandoff"), false);
  assert.equal(Object.hasOwn(health, "evidence"), false);
});
test("state-access view fails closed on enrolled report drift and invalid selections", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "state-access-view-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const file of ["config/state-access-ui-enrollment.json", REPORT]) {
    const target = path.join(root, file);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(path.join(APP_ROOT, file), target);
  }
  await writeFile(
    path.join(root, REPORT),
    `${await readFile(path.join(root, REPORT), "utf8")} `,
  );
  await assert.rejects(
    stateAccessView({ root, state: "NY", industry: "retail-consumer" }),
    /hash changed/,
  );
  await assert.rejects(
    stateAccessView({ state: "PR", industry: "retail-consumer" }),
    /outside/,
  );
  await assert.rejects(
    stateAccessView({ state: "NY", industry: "made-up" }),
    /outside/,
  );
});
test("state-access enrollment rejects a hard-linked report", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "state-access-link-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const config = path.join(root, "config/state-access-ui-enrollment.json"),
    report = path.join(root, REPORT),
    owner = path.join(root, "owner.json");
  await mkdir(path.dirname(config), { recursive: true });
  await mkdir(path.dirname(report), { recursive: true });
  await copyFile(
    path.join(APP_ROOT, "config/state-access-ui-enrollment.json"),
    config,
  );
  await copyFile(path.join(APP_ROOT, REPORT), owner);
  await link(owner, report);
  await assert.rejects(
    stateAccessView({ root, state: "NY", industry: "retail-consumer" }),
    /independent canonical file/,
  );
  await unlink(report);
});
test("industry summary conserves exact operational 51 by 9 cells and false completeness claims", async () => {
  const view = await stateAccessIndustrySummary();
  assert.equal(view.schema_version, "state-access-industry-summary@1.3.0");
  assert.match(view.report_sha256, /^[a-f0-9]{64}$/);
  assert.equal(view.jurisdictions, 51);
  assert.equal(view.industry_cells, 459);
  assert.equal(view.industries.length, 9);
  assert.ok(view.industries.every((row) => row.jurisdictions === 51));
  for (const row of view.industries) {
    const retained =
      (row.access_status_counts["direct-state-publisher"] ?? 0) +
      (row.access_status_counts["local-publisher-substate-evidence"] ?? 0) +
      (row.access_status_counts["national-dataset-state-evidence"] ?? 0);
    assert.equal(row.jurisdictions_with_retained_access_evidence, retained);
    assert.equal(
      row.retained_access_evidence_percent,
      Number(((retained / 51) * 100).toFixed(1)),
    );
    assert.equal(
      Object.values(row.access_status_counts).reduce(
        (sum, value) => sum + value,
        0,
      ),
      51,
    );
    assert.equal(
      Object.values(row.temporal_status_counts).reduce(
        (sum, value) => sum + value,
        0,
      ),
      51,
    );
    assert.equal(row.states.length, 51);
    assert.equal(new Set(row.states.map((item) => item.state)).size, 51);
    for (const state of row.states) {
      assert.deepEqual(
        state.source_keys,
        [...new Set(state.sources.map((source) => source.source_key))].sort(),
      );
      assert.ok(
        state.sources.every(
          (source) =>
            Object.keys(source).sort().join(",") ===
            "evidence_scope,publisher_currency_basis,retained_observed_at,review_due_date,source_key,source_reference_at,source_release_id",
        ),
      );
    }
  }
  const mnConstruction = view.industries
    .find((row) => row.id === "construction")
    .states.find((row) => row.state === "MN");
  assert.equal(mnConstruction.access_status, "direct-state-publisher");
  assert.equal(mnConstruction.temporal_status, "missing-source-reference");
  assert.deepEqual(mnConstruction.source_keys, [
    "mn-construction-credential-reporting",
  ]);
  assert.equal(
    mnConstruction.sources[0].source_release_id,
    "ebfad910-440e-46bb-b42b-2fc44b6d32f3-residential",
  );
  assert.equal(mnConstruction.sources[0].source_reference_at, null);
  assert.equal(
    mnConstruction.sources[0].publisher_currency_basis,
    "unmeasured-in-retained-source-contract",
  );
  assert.equal(
    mnConstruction.sources[0].retained_observed_at,
    "2026-09-08T13:11:41.678Z",
  );
  const maChildcare = view.industries
    .find((row) => row.id === "childcare")
    .states.find((row) => row.state === "MA");
  assert.equal(maChildcare.temporal_status, "missing-source-reference");
  assert.equal(maChildcare.sources[0].source_reference_at, null);
  assert.equal(
    maChildcare.sources[0].publisher_currency_basis,
    "unmeasured-in-retained-source-contract",
  );
  assert.equal(
    maChildcare.sources[0].retained_observed_at,
    "2026-09-07T19:10:25.331Z",
  );
  assert.deepEqual(view.claims, {
    active_business_count: null,
    nationwide_industry_completeness: null,
    complete_geocodes: false,
    maintenance_selection_affects_evidence: false,
  });
});
test("industry summary rejects taxonomy and status drift even when enrollment hash is updated", async (t) => {
  for (const mutate of [
    (report) => {
      report.jurisdictions[0].industries[0].industry = "invented-industry";
    },
    (report) => {
      report.jurisdictions[0].industries[0].accessEvidenceStatus =
        "invented-status";
    },
    (report) => {
      report.jurisdictions[0].industries[0].temporalStatus.status =
        "invented-temporal";
    },
  ]) {
    const root = await mkdtemp(path.join(os.tmpdir(), "state-access-summary-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    for (const file of [
      "config/state-access-ui-enrollment.json",
      "config/industry-segments.json",
      REPORT,
    ]) {
      const target = path.join(root, file);
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(path.join(APP_ROOT, file), target);
    }
    const report = JSON.parse(await readFile(path.join(root, REPORT), "utf8"));
    mutate(report);
    const bytes = JSON.stringify(report);
    await writeFile(path.join(root, REPORT), bytes);
    const enrollment = JSON.parse(
      await readFile(
        path.join(root, "config/state-access-ui-enrollment.json"),
        "utf8",
      ),
    );
    enrollment.reportSha256 = createHash("sha256").update(bytes).digest("hex");
    await writeFile(
      path.join(root, "config/state-access-ui-enrollment.json"),
      JSON.stringify(enrollment),
    );
    const configLoader = async (file) =>
      JSON.parse(await readFile(file, "utf8"));
    await assert.rejects(
      stateAccessIndustrySummary({ root, configLoader }),
      /taxonomy|cells|vocabulary/,
    );
  }
});
test("maintenance backlog deterministically bounds selected-industry attention to ten actionable cells without authority", async () => {
  const empty = await stateAccessMaintenanceBacklog({
    maintainedIndustries: [],
    maintenanceRevision: 3,
  });
  assert.equal(empty.total_attention_cells, 0);
  assert.deepEqual(empty.next_batch, []);
  assert.equal(empty.maintenance_revision, 3);
  const view = await stateAccessMaintenanceBacklog({
    maintainedIndustries: ["childcare", "retail-consumer"],
    maintenanceRevision: 3,
  });
  assert.equal(view.schema_version, "state-access-maintenance-backlog@1.8.0");
  assert.match(view.backlog_sha256, /^[a-f0-9]{64}$/);
  assert.ok(view.total_attention_cells > 0);
  assert.equal(
    view.next_batch.length,
    Math.min(10, view.total_attention_cells),
  );
  assert.ok(
    view.next_batch.every(
      (row) =>
        ["childcare", "retail-consumer"].includes(row.industry) &&
        ["source-discovery-review", "temporal-source-review"].includes(
          row.action_kind,
        ) &&
        Array.isArray(row.source_keys) &&
        row.issue_codes.length > 0 &&
        Object.hasOwn(row, "source_discovery") &&
        Array.isArray(row.refresh_posture.applicable_collection_sources) &&
        row.refresh_posture.manual_app_plan_available ===
          Boolean(row.refresh_posture.applicable_collection_sources.length) &&
        row.refresh_posture.automatic_refresh_authorized === false &&
        row.refresh_posture.newer_publisher_release_guaranteed === false &&
        row.refresh_posture.gap_resolution_guaranteed === false,
    ),
  );
  for (const state of ["AK", "AL", "AR"]) {
    const row = view.next_batch.find(
      (item) => item.state === state && item.industry === "childcare",
    );
    assert.equal(
      row.source_discovery.status,
      "official-search-identified-bulk-interface-unverified",
    );
    assert.equal(row.source_discovery.supported_bulk_export_verified, false);
    assert.equal(row.source_discovery.record_acquisition_authorized, false);
  }
  const az = view.next_batch.find(
    (item) => item.state === "AZ" && item.industry === "childcare",
  );
  assert.equal(
    az.source_discovery.status,
    "official-monthly-table-metadata-validated-acquisition-disabled",
  );
  assert.equal(az.source_discovery.supported_bulk_export_verified, true);
  assert.equal(az.source_discovery.record_acquisition_authorized, false);
  const dc = view.next_batch.find(
    (item) => item.state === "DC" && item.industry === "childcare",
  );
  assert.equal(
    dc.source_discovery.status,
    "official-monthly-pdf-identified-offline-parser-required",
  );
  assert.equal(dc.source_discovery.supported_bulk_export_verified, false);
  const de = view.next_batch.find(
    (item) => item.state === "DE" && item.industry === "childcare",
  );
  assert.equal(
    de.source_discovery.status,
    "official-public-domain-api-metadata-validated-acquisition-disabled",
  );
  assert.equal(de.source_discovery.supported_bulk_export_verified, true);
  assert.equal(de.source_discovery.supported_api_verified, true);
  for (const [state, status] of [
    ["FL", "official-workbook-metadata-validated-acquisition-disabled"],
    ["GA", "official-csv-export-contract-metadata-validated-acquisition-disabled"],
  ]) {
    const row = view.next_batch.find(
      (item) => item.state === state && item.industry === "childcare",
    );
    assert.equal(row.source_discovery.status, status);
    assert.equal(row.source_discovery.supported_bulk_export_verified, true);
    assert.equal(row.source_discovery.record_acquisition_authorized, false);
  }
  const hi = view.next_batch.find((item) => item.state === "HI");
  assert.equal(
    hi.source_discovery.status,
    "official-search-identified-automation-prohibited-bulk-interface-unverified",
  );
  assert.equal(hi.source_discovery.supported_bulk_export_verified, false);
  const retail = await stateAccessMaintenanceBacklog({
      maintainedIndustries: ["retail-consumer"],
      maintenanceRevision: 3,
    }),
    ny = retail.next_batch.find((row) => row.state === "NY");
  assert.ok(ny);
  assert.ok(
    ny.refresh_posture.applicable_collection_sources.some(
      (source) =>
        source.source_id === "state-ny-retail-food" &&
        source.automatic_refresh_reason_code ===
          "AUTOMATIC_REFRESH_NOT_REVIEWED",
    ),
  );
  assert.deepEqual(view.claims, {
    acquisition_authorized: false,
    dispatch_performed: false,
    production_change: false,
    business_completeness: null,
  });
  assert.deepEqual(
    await stateAccessMaintenanceBacklog({
      maintainedIndustries: ["childcare", "retail-consumer"],
      maintenanceRevision: 3,
    }),
    view,
  );
  await assert.rejects(
    stateAccessMaintenanceBacklog({ maintainedIndustries: ["unknown"] }),
    /selection is invalid/,
  );
  await assert.rejects(
    stateAccessMaintenanceBacklog({
      maintainedIndustries: [],
      maintenanceRevision: -1,
    }),
    /selection is invalid/,
  );
});
