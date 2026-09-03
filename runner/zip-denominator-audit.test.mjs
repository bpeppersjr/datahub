import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  isValidUnverifiedUspsEvidence,
  UNVERIFIED_USPS_OPERATIONAL_STATUS_REASON,
  withExplicitUnverifiedUspsReason,
} from "./business-registry.mjs";
import {
  auditRegistryZipRows,
  auditZipDenominators,
} from "./zip-denominator-audit.mjs";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function fixtureRows() {
  return [
    {
      zip_code: "00601",
      postal_code: "00601",
      zip4: null,
      registry_coverage: { status: "record-level-source-contribution" },
      geography: {
        status: "2020-zcta-polygon-available",
        geo_id: "zcta:00601",
        geoid: "00601",
        provenance: { source_release_id: "geography-release-1" },
      },
      current_usps_validity: {
        status: "unverified",
        reason: "No governed USPS source is integrated.",
      },
    },
    {
      zip_code: "99998",
      postal_code: "99998",
      zip4: null,
      registry_coverage: { status: "record-level-source-contribution" },
      geography: {
        status: "no-2020-zcta-polygon",
        geo_id: null,
        geoid: null,
      },
      current_usps_validity: { status: "unverified" },
    },
    {
      zip_code: "99999",
      postal_code: "99999",
      zip4: null,
      registry_coverage: { status: "denominator-only-no-record-level-contribution" },
      geography: {
        status: "not-observed-in-integrated-census-coverage-union",
        geo_id: null,
        geoid: null,
      },
      current_usps_validity: {
        status: "unverified",
        reason: "No current operational source.",
      },
    },
  ];
}

async function writeRegistryFixture(root, { publisherVersion = "2.10.0", rows = fixtureRows() } = {}) {
  const releaseDirectory = path.join(root, "registry", "releases", "release-1");
  await mkdir(path.join(releaseDirectory, "derived"), { recursive: true });
  const content = `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`;
  const artifact = {
    path: "derived/zip-coverage.jsonl",
    bytes: Buffer.byteLength(content),
    sha256: sha256(content),
    record_count: rows.length,
    artifact_type: "registry-zip-coverage-jsonl",
  };
  const manifest = {
    schema_version: "1.0.0",
    dataset_id: "national-business-registry",
    publisher: { id: "national-business-registry", version: publisherVersion },
    release_id: "release-1",
    status: "published-partial",
    complete_national_business_registry: false,
    coverage: { authoritative_current_usps_zip_denominator: null },
    artifacts: [artifact],
  };
  const pointer = {
    dataset_id: manifest.dataset_id,
    release_id: manifest.release_id,
    status: manifest.status,
    manifest: "releases/release-1/manifest.json",
  };
  await writeFile(path.join(releaseDirectory, artifact.path), content);
  await writeFile(path.join(releaseDirectory, "manifest.json"), `${JSON.stringify(manifest)}\n`);
  await writeFile(path.join(root, "registry", "current.json"), `${JSON.stringify(pointer)}\n`);
  return { artifactPath: path.join(releaseDirectory, artifact.path) };
}

test("audits ZCTA membership, outside source ZIPs, USPS reasons, and split postal semantics", () => {
  const report = auditRegistryZipRows(fixtureRows(), {
    registryPublisherVersion: "2.10.0",
    includeRows: true,
  });
  assert.equal(report.contract_status, "failed");
  assert.deepEqual(report.counts, {
    zip5_rows: 3,
    governed_census_zcta_members: 1,
    source_reported_zip5_outside_governed_census_zcta: 1,
    denominator_only_zip5_outside_governed_census_zcta: 1,
    usps_operational_status_unverified: 3,
    unverified_usps_rows_missing_reason: 1,
  });
  assert.deepEqual(report.governed_zcta_membership.source_release_ids, ["geography-release-1"]);
  assert.deepEqual(report.source_reported_zip5_outside_governed_zcta.zip5_values, ["99998"]);
  assert.equal(report.unresolved_proof_gaps.find((gap) => gap.gap_code === "unverified-usps-evidence-reason-missing").contract_violation, true);
  assert.deepEqual(report.rows[0].artifact_postal_fields, {
    zip_code: "00601",
    postal_code_present: true,
    postal_code: "00601",
    zip4_present: true,
    zip4: null,
  });
  assert.deepEqual(report.rows[0].split_postal_contract, {
    applicability: "required",
    status: "passed",
    zip5_and_postal_code_are_equal: true,
    zip4_is_separate_and_null: true,
    zip4_is_geometric: false,
  });
  assert.equal(report.split_postal_field_contract.status, "passed");
});

test("legacy registries report missing reasons as gaps without retroactively changing their contract", () => {
  const legacyRows = fixtureRows().map((row) => {
    const legacy = { ...row };
    delete legacy.postal_code;
    delete legacy.zip4;
    return legacy;
  });
  const report = auditRegistryZipRows(legacyRows, {
    registryPublisherVersion: "2.9.0",
    includeRows: true,
  });
  assert.equal(report.reason_contract.unverified_reason_required, false);
  assert.equal(report.contract_status, "passed");
  assert.equal(report.counts.unverified_usps_rows_missing_reason, 1);
  assert.deepEqual(report.split_postal_field_contract, {
    minimum_registry_publisher_version: "2.10.0",
    registry_publisher_version: "2.9.0",
    applicability: "not-applicable-legacy",
    status: "not-evaluated",
    requirements: null,
    invalid_counts: null,
  });
  assert.deepEqual(report.rows[0].artifact_postal_fields, {
    zip_code: "00601",
    postal_code_present: false,
    zip4_present: false,
  });
  assert.equal(report.rows[0].split_postal_contract.status, "not-evaluated");
  assert.equal(report.postal_field_policy.compatibility_alias_equals_zip5, null);
  assert.equal(report.postal_field_policy.evidence_basis, "not-applicable-legacy-fields-not-asserted");
});

test("2.10 audit fails when the physical postal_code alias is missing", () => {
  const rows = fixtureRows();
  delete rows[0].postal_code;
  const report = auditRegistryZipRows(rows, { registryPublisherVersion: "2.10.0" });
  assert.equal(report.contract_status, "failed");
  assert.equal(report.split_postal_field_contract.status, "failed");
  assert.equal(report.split_postal_field_contract.invalid_counts.missing_postal_code, 1);
  assert.deepEqual(report.unresolved_proof_gaps.find((gap) => gap.gap_code === "postal-code-alias-missing").zip5_values, ["00601"]);
});

test("2.10 audit fails when postal_code contains a joined ZIP+4", () => {
  const rows = fixtureRows();
  rows[0].postal_code = "00601-1234";
  const report = auditRegistryZipRows(rows, { registryPublisherVersion: "2.10.0" });
  assert.equal(report.contract_status, "failed");
  assert.equal(report.split_postal_field_contract.invalid_counts.joined_postal_code, 1);
  assert.deepEqual(report.unresolved_proof_gaps.find((gap) => gap.gap_code === "postal-code-alias-joined-with-zip4").zip5_values, ["00601"]);
});

test("2.10 audit fails when the separate zip4 field is missing", () => {
  const rows = fixtureRows();
  delete rows[0].zip4;
  const report = auditRegistryZipRows(rows, { registryPublisherVersion: "2.10.0" });
  assert.equal(report.contract_status, "failed");
  assert.equal(report.split_postal_field_contract.invalid_counts.missing_zip4, 1);
  assert.deepEqual(report.unresolved_proof_gaps.find((gap) => gap.gap_code === "separate-zip4-field-missing").zip5_values, ["00601"]);
});

test("direct row audit requires a valid registry publisher version", () => {
  assert.throws(() => auditRegistryZipRows(fixtureRows()), /publisher version is required/);
  assert.throws(() => auditRegistryZipRows(fixtureRows(), { registryPublisherVersion: "current" }), /valid semantic version/);
});

test("future registry ZIP construction supplies an explicit reason without replacing source detail", () => {
  assert.deepEqual(withExplicitUnverifiedUspsReason(undefined), {
    status: "unverified",
    reason: UNVERIFIED_USPS_OPERATIONAL_STATUS_REASON,
  });
  assert.deepEqual(withExplicitUnverifiedUspsReason({ status: "unverified", reason: "  Source-specific reason.  ", extra: true }), {
    status: "unverified",
    reason: "Source-specific reason.",
    extra: true,
  });
  const listed = { status: "listed-in-current-usps-area-district-file" };
  assert.equal(withExplicitUnverifiedUspsReason(listed), listed);
  assert.equal(isValidUnverifiedUspsEvidence({ status: "unverified" }, { reasonRequired: false }), true);
  assert.equal(isValidUnverifiedUspsEvidence({ status: "unverified" }), false);
  assert.equal(isValidUnverifiedUspsEvidence({ status: "unverified", reason: "Known evidence gap." }), true);
});

test("pointer audit is deterministic and fails closed for a 2.10 release missing a reason", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "zip-denominator-audit-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeRegistryFixture(root);
  const cohorts = [{ cohort_id: "fixture", pointer: "registry/current.json", required: true }];
  const first = await auditZipDenominators({ appRoot: root, cohorts, includeRows: true });
  const second = await auditZipDenominators({ appRoot: root, cohorts, includeRows: true });
  assert.deepEqual(first, second);
  assert.equal(first.overall_contract_status, "failed");
  assert.match(first.audit_id, /^zip-denominator-audit-[a-f0-9]{24}$/);
  assert.equal(first.cohorts[0].artifact.record_count, 3);
  assert.equal(first.cohorts[0].contract_status, "failed");
});

test("pointer audit rejects a ZIP artifact that no longer matches its manifest", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "zip-denominator-audit-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const { artifactPath } = await writeRegistryFixture(root, { publisherVersion: "2.9.0" });
  await writeFile(artifactPath, `${JSON.stringify(fixtureRows()[0])}\n`);
  await assert.rejects(
    () => auditZipDenominators({
      appRoot: root,
      cohorts: [{ cohort_id: "fixture", pointer: "registry/current.json", required: true }],
    }),
    /bytes, SHA-256, or record count do not match/,
  );
});
