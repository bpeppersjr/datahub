import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { APP_ROOT } from "./paths.mjs";
import {
  nativeStatusEvidence,
  readExactZipIndustryEvidence,
  verifyExactZipIndustryEvidenceMatrix,
  projectOutOfCohortSourceZipGaps,
  validateRetainedChildcareReportingContract,
  projectWaLniExactZipDimension,
  WA_LNI_EXACT_ZIP_DIMENSION,
} from "./national-exact-zip-industry-evidence-matrix.mjs";
import fs from "node:fs/promises";
test("WA L&I candidate dimension is exactly pinned, conserved, and preserves non-claims",async()=>{
  const value=await projectWaLniExactZipDimension({root:APP_ROOT});
  assert.equal(value.dimension_id,"wa_lni_active_contractor_organization_mailing_addresses");assert.equal(value.rows.length,3113);assert.equal(value.summary.eligible_mailing_address_rows,74030);assert.equal(value.summary.missing_or_ineligible_mailing_address_rows,111);
  assert.ok(value.rows.every(row=>/^\d{5}$/.test(row.zip5)&&row.zip4===null&&row.count>0&&row.status==='positive'));
  assert.deepEqual(value.claims,{wa_broad_jurisdiction_gap_complete:false,physical_site_inference_permitted:false,establishment_inference_permitted:false,current_operations_verified:false,all_business_completeness_percent:null,nonadditive:true,record_level_export_policy:'local-review-only',aggregate_export_policy:'public-under-pddl-with-attribution-and-semantic-limitations',zip4_joined_to_zip5:false,production_enrollment:false,network_requests:0});
  assert.equal(value.bindings.manifest_sha256,WA_LNI_EXACT_ZIP_DIMENSION.manifest_sha256);
});
test("bounded MA/NJ/TN/OH reporting contract replays only the four pinned manifests and ten ZIP2 artifacts", async () => {
  const fixture = await validateRetainedChildcareReportingContract(APP_ROOT);
  assert.equal(fixture.summary.reported_center_rows, 13182);
  assert.equal(fixture.summary.zip_bearing_center_rows, 13010);
  assert.equal(fixture.summary.zip_union, 1964);
  assert.equal(fixture.summary.out_of_cohort_zip_rows, 0);
  assert.equal(fixture.artifacts.length, 10);
  assert.deepEqual(
    fixture.quality_gaps.map(({ reason, reported_center_rows }) => [
      reason,
      reported_center_rows,
    ]),
    [
      ["missing-source-zip", 27],
      ["invalid-source-zip-placeholder", 145],
    ],
  );
  assert.deepEqual(
    fixture.dimensions.map(({ publisher_scope, accepted_rows, zip_count }) => [
      publisher_scope,
      accepted_rows,
      zip_count,
    ]),
    [
      ["MA", 3007, 438],
      ["NJ", 4075, 525],
      ["TN", 1863, 327],
      ["OH", 4237, 674],
    ],
  );
  assert.deepEqual(
    fixture.dimensions.find((dimension) => dimension.publisher_scope === "MA")
      .source_status_counts,
    {
      Current: 2561,
      "Renewal in progress": 431,
      Expired: 13,
      "Regional Enrollment Freeze": 2,
    },
  );
  assert.deepEqual(
    fixture.dimensions.find((dimension) => dimension.publisher_scope === "NJ")
      .source_status_counts,
    { null: 4075 },
  );
  const ohio = fixture.dimensions.find(
    (dimension) => dimension.publisher_scope === "OH",
  );
  assert.equal(ohio.coordinate_ineligible_rows, 4237);
  assert.equal(ohio.source_observed_at, null);
  assert.equal(ohio.earliest_observed_at, "2026-09-08T08:30:15.824Z");
  assert.equal(ohio.latest_observed_at, "2026-09-08T08:31:02.735Z");
});
test("reporting registry lineage tampering fails before publisher artifacts are read", async () => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "reporting-childcare-pin-"),
  );
  try {
    const registrationPath = "config/datasets/zip-denominator-gap-cohort.json",
      registration = JSON.parse(
        await fs.readFile(path.join(APP_ROOT, registrationPath)),
      ),
      retained = registration.retained_release,
      manifest = JSON.parse(
        await fs.readFile(path.join(APP_ROOT, retained.manifest)),
      ),
      artifact = manifest.artifacts.find(
        (item) => item.path === "cohort.jsonl",
      ),
      cohortPath = path.posix.join(
        path.posix.dirname(retained.manifest),
        artifact.path,
      );
    for (const relative of [registrationPath, retained.manifest, cohortPath]) {
      const destination = path.join(root, relative);
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.copyFile(path.join(APP_ROOT, relative), destination);
    }
    const reportingManifest =
        "data/business-registry/releases/national-business-registry-20260911-022652067Z-1ec656c3/manifest.json",
      destination = path.join(root, reportingManifest);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(
      destination,
      JSON.stringify({
        ...JSON.parse(
          await fs.readFile(path.join(APP_ROOT, reportingManifest)),
        ),
        status: "tampered",
      }),
    );
    await assert.rejects(
      validateRetainedChildcareReportingContract(root),
      /input digest/,
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
test("registered v1.8 exact-ZIP matrix replays all retained dimensions and conserves source units", async () => {
  const registration = JSON.parse(
      await fs.readFile(
        path.join(
          APP_ROOT,
          "config/datasets/national-exact-zip-industry-evidence-matrix.json",
        ),
      ),
    ),
    manifestPath = path.join(APP_ROOT, registration.retained_release.manifest),
    m = JSON.parse(await fs.readFile(manifestPath)),
    v = await verifyExactZipIndustryEvidenceMatrix(manifestPath);
  assert.equal(v.verified, true);
  assert.equal(v.zip5_rows, 48194);
  assert.equal(v.industry_cells, 1879566);
  assert.ok(v.max_prefix_artifact_bytes <= 16_000_000);
  assert.equal(
    v.max_prefix_artifact_bytes,
    registration.retained_release.max_prefix_artifact_bytes,
  );
  assert.equal(
    m.summary.max_prefix_artifact_bytes,
    registration.retained_release.max_prefix_artifact_bytes,
  );
  assert.equal(m.summary.registry_location_profile_rows, 1850619);
  assert.equal(m.summary.registry_location_status_input_profile_rows, 8011835);
  assert.equal(
    m.bindings.registry_location_profiles.input_profile_count,
    8011835,
  );
  assert.equal(m.summary.registry_location_profile_zip_union, 12454);
  assert.equal(m.summary.registry_location_profile_out_of_cohort_zip_rows, 0);
  assert.equal(m.summary.childcare_reporting_rows, 13182);
  assert.equal(m.summary.childcare_reporting_zip_bearing_rows, 13010);
  assert.equal(m.summary.childcare_reporting_zip_union, 1964);
  assert.equal(m.summary.childcare_reporting_out_of_cohort_zip_rows, 0);
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(m.summary.childcare_reporting_by_dimension).map(
        ([id, value]) => [id, [value.accepted_rows, value.zip_count]],
      ),
    ),
    {
      childcare_ma_reporting_centers: [3007, 438],
      childcare_nj_reporting_centers: [4075, 525],
      childcare_tn_reporting_centers: [1863, 327],
      childcare_oh_reporting_centers: [4237, 674],
    },
  );
  assert.deepEqual(
    m.summary.childcare_reporting_by_dimension.childcare_ma_reporting_centers
      .source_status_counts,
    {
      Current: 2561,
      "Renewal in progress": 431,
      Expired: 13,
      "Regional Enrollment Freeze": 2,
    },
  );
  assert.deepEqual(
    m.summary.childcare_reporting_by_dimension.childcare_nj_reporting_centers
      .source_status_counts,
    { null: 4075 },
  );
  assert.equal(
    m.summary.childcare_reporting_by_dimension.childcare_oh_reporting_centers
      .coordinate_ineligible_rows,
    4237,
  );
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(m.summary.registry_location_profiles_by_dimension).map(
        ([id, value]) => [id, value.count],
      ),
    ),
    {
      ak_license_location_profiles: 94550,
      ca_abc_license_location_profiles: 84497,
      chicago_license_location_profiles: 42940,
      dc_basic_license_location_profiles: 54910,
      la_registered_location_profiles: 633232,
      ny_retail_food_location_profiles: 24230,
      nyc_dcwp_license_location_profiles: 31163,
      tx_sales_tax_outlet_profiles: 885097,
    },
  );
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(m.summary.registry_location_profiles_by_dimension).map(
        ([id, value]) => [id, value.zip_count],
      ),
    ),
    {
      ak_license_location_profiles: 4383,
      ca_abc_license_location_profiles: 2920,
      chicago_license_location_profiles: 1033,
      dc_basic_license_location_profiles: 3125,
      la_registered_location_profiles: 5371,
      ny_retail_food_location_profiles: 1498,
      nyc_dcwp_license_location_profiles: 1550,
      tx_sales_tax_outlet_profiles: 2156,
    },
  );
  assert.equal(
    m.summary.registry_location_profiles_by_dimension
      .ny_retail_food_location_profiles.source_reference_date,
    "2025-09-30",
  );
  assert.deepEqual(
    m.summary.registry_location_profiles_by_dimension
      .la_registered_location_profiles.status_counts,
    { present: 0, "empty-object": 0, missing: 0, null: 633232 },
  );
  assert.equal(m.summary.out_of_cohort_source_zip_gaps.record_count, 3);
  assert.equal(m.summary.source_address_row_gaps.record_count, 9);
  assert.equal(m.summary.source_address_row_gaps.address_rows, 4399806);
  assert.deepEqual(m.summary.broad_organization_eligible_rows_by_dimension, {
    broad_org_co_organization_addresses: 2150360,
    broad_org_ct_organization_addresses: 448166,
    broad_org_de_license_addresses: 66502,
    broad_org_fl_organization_addresses: 3928280,
    broad_org_ia_organization_addresses: 334176,
    broad_org_ny_organization_addresses: 350933,
    broad_org_or_legal_registration_addresses: 443123,
    broad_org_or_brand_registration_addresses: 116407,
    broad_org_pa_organization_addresses: 2102830,
  });
  assert.deepEqual(
    v.out_of_cohort_source_zip_gaps.map((g) => [
      g.zip5,
      g.source_id,
      g.publisher_scope ?? null,
    ]),
    [
      ["21708", "childcare_md_candidates", "MD"],
      ["35999", "cms_nursing_home_directory", null],
      ["73706", "cms_nursing_home_directory", null],
    ],
  );
  assert.deepEqual(v.source_quality_gaps, [
    {
      zip5: null,
      quality_dimension: "source-zip",
      publisher_scope: "MD",
      source_id: "md-msde-childcare-centers",
      reason: "invalid-source-zip-range",
      candidate_rows: 1,
      source_release_id:
        "retained-childcare-zip-evidence-6a696d16df9ccec8836e7bd38872feda3942293d9ff19ad5f528ac41a088fada",
      source_reference_date: "2026-05-27T19:48:49.000Z",
    },
    {
      zip5: null,
      quality_dimension: "source-zip",
      publisher_scope: "TN",
      source_id: "tn-dhs-active-childcare-centers",
      reason: "missing-source-zip",
      reported_center_rows: 27,
      source_release_id:
        "tn-childcare-a142397a0b6418ee017226d981d89314c54f17cd2ee03decd3337065260bb2c7",
      source_observed_at: "2026-09-08T00:36:36.628Z",
    },
    {
      zip5: null,
      quality_dimension: "source-zip",
      publisher_scope: "TN",
      source_id: "tn-dhs-active-childcare-centers",
      reason: "invalid-source-zip-placeholder",
      reported_center_rows: 145,
      source_release_id:
        "tn-childcare-a142397a0b6418ee017226d981d89314c54f17cd2ee03decd3337065260bb2c7",
      source_observed_at: "2026-09-08T00:36:36.628Z",
    },
  ]);
  assert.equal(
    v.source_address_row_gaps.reduce((n, g) => n + g.address_rows, 0),
    4399806,
  );
  assert.ok(
    v.source_address_row_gaps.every(
      (g) =>
        g.zip5 === null &&
        g.gap_type === "source-address-row-without-eligible-zip5",
    ),
  );
});
test("bounded lookup preserves registry status categories and both source clocks", async () => {
  const v = await readExactZipIndustryEvidence({ zip5: "00000" });
  assert.equal(
    v.schema_version,
    "national-exact-zip-industry-evidence-matrix@1.8.0",
  );
  assert.equal(v.full_matrix_replay_performed, false);
  assert.equal(v.row.zip5, "00000");
  assert.equal(v.row.zip4, null);
  assert.equal(v.row.usps_validity, null);
  assert.equal(v.claims.additive_cross_industry_total, false);
  assert.equal(Object.keys(v.row.cells).length, 39);
  assert.equal(v.row.cells.regulated_facilities.status, "outside-source-denominator");
  assert.equal(v.row.cells.pharmacy.status, "measured-zero");
  assert.equal(v.row.cells.healthcare_organizations.status, "positive");
  assert.equal(v.row.cells.childcare_pa_candidates.status, "absent-from-retained-source-rows");
  assert.equal(v.row.cells.childcare_pa_candidates.count, null);
  assert.equal(v.serialized_status_value_counts["absent-from-retained-source-rows"].numeric_cells, 0);
  assert.equal(v.serialized_status_value_counts["absent-from-retained-source-rows"].null_cells, 1237187);
  assert.equal(v.serialized_status_value_counts["measured-zero"].numeric_cells, 248869);
  assert.equal(v.serialized_status_value_counts["outside-source-denominator"].null_cells, 57452);
  assert.equal(v.source_metadata.childcare_pa_candidates.zero_evidence_semantics.exact_zip_denominator, false);
  assert.equal(v.source_metadata.pharmacy.zero_evidence_semantics.exact_zip_denominator, true);
  assert.equal(v.status_counts["absent-from-retained-source-rows"], 1237187);
  assert.equal(v.status_counts["measured-zero"], 248869);
  assert.equal(v.status_counts["outside-source-denominator"], 57452);
  assert.equal(v.reclassified_absent_source_row_cells, 1237187);
  assert.equal(Object.values(v.cell_status_counts_by_dimension).length, 39);
  assert.equal(v.row.cells.cms_hospital_directory.measure, "directory_rows");
  assert.equal(
    v.row.cells.cms_nursing_home_directory.measure,
    "directory_rows",
  );
  assert.equal(
    v.row.cells.broad_org_de_license_addresses.measure,
    "license_address_rows",
  );
  assert.equal(
    v.row.cells.broad_org_or_legal_registration_addresses.measure,
    "legal_registration_address_rows",
  );
  assert.equal(
    v.row.cells.broad_org_or_brand_registration_addresses.measure,
    "brand_registration_address_rows",
  );
  assert.equal(
    v.row.cells.ak_license_location_profiles.measure,
    "registry_location_profile_count",
  );
  assert.deepEqual(
    v.row.cells.ak_license_location_profiles.source_status_counts,
    { present: 0, "empty-object": 0, missing: 0, null: 0 },
  );
  assert.equal(
    v.source_metadata.ak_license_location_profiles.source_reference_date,
    "2026-09-03",
  );
  assert.equal(
    v.source_metadata.ak_license_location_profiles.source_reference_field,
    "source_release_id.date_token",
  );
  assert.equal(
    v.source_metadata.ak_license_location_profiles.source_refresh_at,
    null,
  );
  assert.equal(
    v.source_metadata.ak_license_location_profiles.source_refresh_asserted,
    false,
  );
  assert.equal(
    v.source_metadata.ak_license_location_profiles.source_observation
      .observed_at_present,
    94550,
  );
  assert.equal(
    v.source_metadata.ak_license_location_profiles.source_observation
      .observed_at_missing,
    0,
  );
  assert.equal(
    v.source_metadata.ny_retail_food_location_profiles.source_reference_date,
    "2025-09-30",
  );
  assert.equal(
    v.source_metadata.la_registered_location_profiles.source_status_counts.null,
    633232,
  );
  assert.equal(
    v.source_metadata.la_registered_location_profiles.source_status_counts
      .present,
    0,
  );
  assert.deepEqual(v.out_of_cohort_source_zip_gaps, []);
  assert.equal(
    v.source_address_row_gaps.reduce((n, g) => n + g.address_rows, 0),
    4399806,
  );
  for (const [source, cell] of Object.entries(v.row.cells)) {
    assert.equal(Object.keys(cell.temporal_status).length, 2);
    assert.equal(v.source_metadata[source].current_operation_verified, false);
    assert.match(
      v.source_metadata[source].source_manifest,
      /^data\/.+\/manifest\.json$/,
    );
    assert.match(
      v.source_metadata[source].source_manifest_sha256,
      /^[a-f0-9]{64}$/,
    );
    if (
      source === "childcare_ut_candidates" ||
      source === "childcare_ia_candidates"
    ) {
      assert.equal(cell.temporal_status.status, "source-reference-unresolved");
      assert.equal(cell.temporal_status.source_reference_date, null);
    } else {
      assert.equal(
        cell.temporal_status.status,
        "source-referenced-current-operation-unverified",
      );
      assert.ok(cell.temporal_status.source_reference_date);
    }
  }
  for (const scope of ["PA", "CT", "MD", "VT", "CO", "UT", "IA"]) {
    const metadata =
      v.source_metadata[`childcare_${scope.toLowerCase()}_candidates`];
    assert.equal(metadata.publisher_scope, scope);
    assert.equal(metadata.export_policy, "internal");
    assert.equal(metadata.current_operation_verified, false);
    assert.ok(metadata.accepted_candidate_rows > 0);
    assert.ok(metadata.row_unit);
    assert.equal(metadata.retained_source.publisher_scope, scope);
  }
  assert.equal(
    v.source_metadata.childcare_md_candidates.accepted_candidate_rows,
    1772,
  );
  assert.deepEqual(v.source_quality_gaps, [
    {
      zip5: null,
      quality_dimension: "source-zip",
      publisher_scope: "MD",
      source_id: "md-msde-childcare-centers",
      reason: "invalid-source-zip-range",
      candidate_rows: 1,
      source_release_id:
        "retained-childcare-zip-evidence-6a696d16df9ccec8836e7bd38872feda3942293d9ff19ad5f528ac41a088fada",
      source_reference_date: "2026-05-27T19:48:49.000Z",
    },
    {
      zip5: null,
      quality_dimension: "source-zip",
      publisher_scope: "TN",
      source_id: "tn-dhs-active-childcare-centers",
      reason: "missing-source-zip",
      reported_center_rows: 27,
      source_release_id:
        "tn-childcare-a142397a0b6418ee017226d981d89314c54f17cd2ee03decd3337065260bb2c7",
      source_observed_at: "2026-09-08T00:36:36.628Z",
    },
    {
      zip5: null,
      quality_dimension: "source-zip",
      publisher_scope: "TN",
      source_id: "tn-dhs-active-childcare-centers",
      reason: "invalid-source-zip-placeholder",
      reported_center_rows: 145,
      source_release_id:
        "tn-childcare-a142397a0b6418ee017226d981d89314c54f17cd2ee03decd3337065260bb2c7",
      source_observed_at: "2026-09-08T00:36:36.628Z",
    },
  ]);
});
test("state/local source absence is not measured zero or inferred from same-code ZCTA", async () => {
  const absent = await readExactZipIndustryEvidence({ zip5: "10000" });
  assert.equal(absent.row.zcta_geoid, null);
  for (const dimension of [
    "childcare_pa_candidates",
    "ak_license_location_profiles",
    "broad_org_co_organization_addresses",
  ]) {
    assert.equal(absent.row.cells[dimension].status, "absent-from-retained-source-rows");
    assert.equal(absent.row.cells[dimension].count, null);
    assert.equal(absent.source_metadata[dimension].zero_evidence_semantics.exact_zip_denominator, false);
  }
  const sameCodeZcta = await readExactZipIndustryEvidence({ zip5: "00601" });
  assert.equal(sameCodeZcta.row.zcta_geoid, "00601");
  assert.equal(sameCodeZcta.row.cells.childcare_pa_candidates.status, "absent-from-retained-source-rows");
  for (const [zip5, dimension] of [
    ["15001", "childcare_pa_candidates"],
    ["00802", "ak_license_location_profiles"],
    ["00602", "broad_org_co_organization_addresses"],
  ]) {
    const positive = await readExactZipIndustryEvidence({ zip5 });
    assert.equal(positive.row.cells[dimension].status, "positive");
    assert.ok(positive.row.cells[dimension].count > 0);
  }
});
test("reporting-center ZIP lookup preserves source status labels, row units, temporal bounds, and OH geography restriction", async () => {
  const ma = await readExactZipIndustryEvidence({ zip5: "01001" });
  assert.equal(
    ma.row.cells.childcare_ma_reporting_centers.measure,
    "reported_center_rows",
  );
  assert.equal(ma.row.cells.childcare_ma_reporting_centers.count, 9);
  assert.deepEqual(
    ma.row.cells.childcare_ma_reporting_centers.source_status_counts,
    { Current: 9 },
  );
  assert.equal(
    ma.source_metadata.childcare_ma_reporting_centers.accepted_reporting_rows,
    3007,
  );
  assert.equal(
    ma.source_metadata.childcare_ma_reporting_centers.export_policy,
    "local-review-only",
  );
  assert.equal(
    ma.source_metadata.childcare_ma_reporting_centers
      .identity_matching_eligible,
    false,
  );
  assert.equal(
    ma.source_metadata.childcare_ma_reporting_centers.zip4_rows,
    1113,
  );
  const oh = await readExactZipIndustryEvidence({ zip5: "43003" });
  assert.deepEqual(
    oh.row.cells.childcare_oh_reporting_centers.source_status_counts,
    { Open: 1 },
  );
  assert.equal(
    oh.source_metadata.childcare_oh_reporting_centers.source_reference_field,
    "row.observed_at",
  );
  assert.equal(
    oh.source_metadata.childcare_oh_reporting_centers.source_observed_at,
    null,
  );
  assert.equal(
    oh.source_metadata.childcare_oh_reporting_centers
      .coordinate_ineligible_rows,
    4237,
  );
  assert.equal(
    oh.source_quality_gaps.filter((gap) => gap.publisher_scope === "TN").length,
    2,
  );
  assert.ok(oh.source_quality_gaps.every((gap) => gap.zip5 === null));
});
test("bounded lookup preserves source ZIPs outside the exact cohort without validity claims", async () => {
  for (const [zip5, source_id, publisher_scope] of [
    ["21708", "childcare_md_candidates", "MD"],
    ["35999", "cms_nursing_home_directory", undefined],
    ["73706", "cms_nursing_home_directory", undefined],
  ]) {
    const v = await readExactZipIndustryEvidence({ zip5 });
    assert.equal(v.row, null);
    assert.equal(v.out_of_cohort_source_zip_gaps.length, 1);
    assert.equal(v.out_of_cohort_source_zip_gaps[0].zip5, zip5);
    assert.equal(v.out_of_cohort_source_zip_gaps[0].source_id, source_id);
    assert.equal(
      v.out_of_cohort_source_zip_gaps[0].publisher_scope,
      publisher_scope,
    );
    assert.equal(v.claims.usps_validity_classified, false);
  }
});
test("lookup rejects malformed ZIP instead of normalizing it", async () => {
  await assert.rejects(readExactZipIndustryEvidence({ zip5: "501" }), /ZIP5/);
});
test("registry-location integration rejects a tampered native-status lineage pin before reading release artifacts", async () => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "exact-zip-native-status-pin-"),
  );
  try {
    const source = JSON.parse(
      await fs.readFile(
        path.join(
          APP_ROOT,
          "config/datasets/zip-source-native-status-distribution.json",
        ),
        "utf8",
      ),
    );
    source.retained_release.manifest_sha256 = "0".repeat(64);
    const target = path.join(
      root,
      "config/datasets/zip-source-native-status-distribution.json",
    );
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, JSON.stringify(source));
    await assert.rejects(
      nativeStatusEvidence(root, new Set()),
      /native status registration pin\/policy/,
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
test("out-of-cohort gap projection preserves each governed publisher without extending the cohort", () => {
  const gaps = projectOutOfCohortSourceZipGaps(
    ["10001"],
    [
      {
        id: "childcare_md_candidates",
        publisher_scope: "MD",
        release_id: "childcare-release",
        measure: "candidate_rows",
        temporal_status: {
          status: "source-referenced-current-operation-unverified",
          source_reference_date: "2026-09-01",
        },
        rows: [
          { zip5: "10001", count: 2 },
          { zip5: "21708", count: 3 },
        ],
      },
    ],
  );
  assert.deepEqual(
    gaps.map(({ zip5, source_id, publisher_scope, count }) => ({
      zip5,
      source_id,
      publisher_scope,
      count,
    })),
    [
      {
        zip5: "21708",
        source_id: "childcare_md_candidates",
        publisher_scope: "MD",
        count: 3,
      },
    ],
  );
});
