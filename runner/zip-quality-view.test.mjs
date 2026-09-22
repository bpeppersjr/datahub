import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createZipQualityView } from "./zip-quality-view.mjs";

const hash = (value) => createHash("sha256").update(value).digest("hex");

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "zip-quality-view-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const release = path.join(root, "registry", "releases", "r1");
  await mkdir(path.join(release, "derived"), { recursive: true });
  const rows = [
    { zip_code: "00000", postal_code: "00000", zip4: null, registry_coverage: { status: "record-level-source-contribution" }, source_contributions: { source_a: { record_count: 1, source_release_id: "source-a-r1" } }, geography: { status: "no-2020-zcta-polygon", geo_id: null, geoid: null }, current_usps_validity: { status: "unverified", reason: "Source placeholder." } },
    { zip_code: "00601", postal_code: "00601", zip4: null, registry_coverage: { status: "record-level-source-contribution" }, source_contributions: {}, geography: { status: "2020-zcta-polygon-available", geo_id: "zcta:00601", geoid: "00601", provenance: { source_release_id: "zcta-r1" } }, current_usps_validity: { status: "unverified", reason: "No governed USPS evidence." } },
    { zip_code: "00006", postal_code: "00006", zip4: null, registry_coverage: { status: "record-level-source-contribution" }, source_contributions: {}, geography: { status: "no-2020-zcta-polygon", geo_id: null, geoid: null }, current_usps_validity: { status: "unverified", reason: "No governed USPS evidence." } },
    { zip_code: "99999", postal_code: "99999", zip4: null, registry_coverage: { status: "denominator-only-no-record-level-contribution" }, source_contributions: {}, geography: { status: "not-observed-in-integrated-census-coverage-union", geo_id: null, geoid: null }, current_usps_validity: { status: "unverified", reason: "No governed USPS evidence." } },
  ];
  const artifactText = `${rows.map(JSON.stringify).join("\n")}\n`;
  const artifact = { path: "derived/zip-coverage.jsonl", bytes: Buffer.byteLength(artifactText), sha256: hash(artifactText), record_count: rows.length, artifact_type: "registry-zip-coverage-jsonl" };
  const manifest = { dataset_id: "national-business-registry", release_id: "r1", status: "published-partial", complete_national_business_registry: false, publisher: { version: "2.15.0" }, artifacts: [artifact] };
  const manifestText = `${JSON.stringify(manifest)}\n`;
  const pointer = { dataset_id: manifest.dataset_id, release_id: manifest.release_id, status: manifest.status, manifest: "releases/r1/manifest.json" };
  const pointerText = `${JSON.stringify(pointer)}\n`;
  await writeFile(path.join(release, artifact.path), artifactText);
  await writeFile(path.join(release, "manifest.json"), manifestText);
  await writeFile(path.join(root, "registry", "current.json"), pointerText);
  return { root, artifactPath: path.join(release, artifact.path), enrollment: { cohort_id: "fixture", pointer_path: "registry/current.json", pointer_sha256: hash(pointerText), manifest_sha256: hash(manifestText), zip_artifact_sha256: artifact.sha256, release_id: "r1" } };
}

test("summary conserves mutually exclusive classes and does not invent low-number placeholders", async (t) => {
  const { root, enrollment } = await fixture(t);
  const view = createZipQualityView({ appRoot: root, enrollment });
  const summary = await view();
  assert.equal(summary.classification.conservation.status, "passed");
  assert.equal(summary.classification.classes.contract_invalid_or_missing.count, 0);
  assert.equal(summary.classification.classes.explicit_placeholder.count, 1);
  assert.equal(summary.classification.classes.valid_format_same_code_governed_zcta.count, 1);
  assert.equal(summary.classification.classes.valid_format_source_reported_no_same_code_zcta.count, 1);
  assert.equal(summary.classification.classes.valid_format_denominator_only_no_same_code_zcta.count, 1);
  assert.equal((await view({ zip: "00006" })).classification.class, "valid-format-source-reported-no-same-code-zcta");
});

test("lookup retains source evidence, separates ZIP4, and exposes no asserted USPS status", async (t) => {
  const { root, enrollment } = await fixture(t);
  const row = await createZipQualityView({ appRoot: root, enrollment })({ zip: "00000" });
  assert.equal(row.classification.class, "explicit-placeholder");
  assert.equal(row.classification.ordinary_zip5_eligible, false);
  assert.equal(row.postal_fields.zip4, null);
  assert.equal(row.split_postal_contract.zip4_is_geometric, false);
  assert.equal(row.positive_source_contributions[0].source_release_id, "source-a-r1");
  assert.equal(row.usps_operational_evidence.operational_status, null);
  assert.equal(row.usps_operational_evidence.evidence_status, "unverified");
  assert.match(row.usps_operational_evidence.reason, /placeholder/i);
});

test("view fails closed when enrolled content is tampered", async (t) => {
  const { root, enrollment, artifactPath } = await fixture(t);
  const view = createZipQualityView({ appRoot: root, enrollment });
  assert.equal((await view({ zip: "00000" })).found, true);
  await writeFile(artifactPath, "{}\n");
  await assert.rejects(() => view({ zip: "00000" }), /bytes, SHA-256, or record count/);
});
