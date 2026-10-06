import path from "node:path";
import fs from "node:fs";
import fsp from "node:fs/promises";
import readline from "node:readline";
import { createGunzip } from "node:zlib";
import { createHash } from "node:crypto";
import { isDeepStrictEqual as same } from "node:util";
import { APP_ROOT } from "./paths.mjs";
import { verifyCmsNppesPharmacyNonprimaryAddresses } from "./cms-nppes-pharmacy-nonprimary-addresses.mjs";
export const VERSION = "cms-nppes-pharmacy-nonprimary-exact-zip-evidence@1.0.0";
const REG =
    "config/datasets/cms-nppes-pharmacy-nonprimary-exact-zip-evidence.json",
  SHA = /^[a-f0-9]{64}$/;
const check = (v) => {
    if (!v)
      throw Error(
        "CMS NPPES pharmacy nonprimary exact-ZIP admission rejected.",
      );
  },
  hash = (b) => createHash("sha256").update(b).digest("hex");
const claims = () => ({
  confirmed_pharmacy_locations: false,
  current_operations_verified: false,
  physical_sites: false,
  unique_business_count: null,
  all_pharmacy_completeness_percent: null,
  additive_to_primary_pharmacy_counts: false,
  geocode_created: false,
  zip4_aggregated: false,
  usps_validity: null,
  network_requests: 0,
  acquisition_performed: false,
  current_pointer_written: false,
  production_enrollment: false,
  matrix_admission_performed: false,
  public_export_authorized: false,
});
const keys = (v, k) =>
  v &&
  typeof v === "object" &&
  !Array.isArray(v) &&
  same(Object.keys(v).sort(), [...k].sort());
async function pinned(root, relative, sha, max) {
  check(
    typeof relative === "string" &&
      !path.isAbsolute(relative) &&
      !relative.includes("\\") &&
      !relative.split("/").some((x) => !x || x === "." || x === ".."),
  );
  const b = await fsp.readFile(path.join(root, relative));
  check(b.length <= max && hash(b) === sha);
  return { bytes: b, value: JSON.parse(b) };
}
async function* rows(file, signal) {
  const input = fs.createReadStream(file),
    gunzip = createGunzip(),
    lines = readline.createInterface({
      input: input.pipe(gunzip),
      crlfDelay: Infinity,
    });
  try {
    for await (const line of lines) {
      signal?.throwIfAborted();
      if (line) yield JSON.parse(line);
    }
  } finally {
    lines.close();
    input.destroy();
    gunzip.destroy();
  }
}
export function projectCmsNppesPharmacyNonprimaryExactZip(
  sourceRows,
  {
    source,
    dimension_id = "cms_nppes_pharmacy_nonprimary_reported_address_rows",
    measure = "reported_nonprimary_practice_address_rows",
    source_reference_date = "2026-08-09",
  } = {},
) {
  check(
    Array.isArray(sourceRows) &&
      sourceRows.length <= 10000 &&
      source &&
      SHA.test(source.manifest_sha256) &&
      typeof source.release_id === "string",
  );
  const counts = new Map();
  let zip4Rows = 0,
    missing = 0;
  const ids = new Set();
  for (const row of sourceRows) {
    check(
      row?.schema_version === "1.0.0" && !ids.has(row.secondary_address_id),
    );
    ids.add(row.secondary_address_id);
    const a = row.address;
    check(
      row.address_role === "non-primary-practice-location" &&
        row.claims?.confirmed_pharmacy_location === false &&
        row.claims?.current_operation === false &&
        row.claims?.physical_site === false &&
        row.claims?.contributes_to_business_or_site_totals === false &&
        row.export_policy === "public-normalized-source-evidence" &&
        row.temporal?.source_through_date === source_reference_date,
    );
    check(
      a?.postal_code === a?.zip_code &&
        (a.zip_code === null || /^\d{5}$/.test(a.zip_code)) &&
        (a.zip4 === null || /^\d{4}$/.test(a.zip4)),
    );
    if (a.zip4 !== null) zip4Rows++;
    if (a.zip_code === null) {
      missing++;
      continue;
    }
    counts.set(a.zip_code, (counts.get(a.zip_code) ?? 0) + 1);
  }
  const c = claims(),
    projection = [...counts]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([zip5, count]) => ({
        schema_version: VERSION,
        dimension_id,
        zip5,
        zip4: null,
        status: "positive",
        count,
        measure,
        temporal_status: {
          status: "source-referenced-current-operation-unverified",
          source_reference_date,
        },
        provenance: { ...source },
        claims: {
          ...c,
          record_unit: "reported-nonprimary-practice-address-row",
          nonadditive: true,
        },
      }));
  return {
    rows: projection,
    summary: {
      source_address_rows: sourceRows.length,
      zip5_address_rows: sourceRows.length - missing,
      missing_reported_zip5_rows: missing,
      reported_zip4_rows: zip4Rows,
      positive_zip5_rows: projection.length,
      projected_address_rows: projection.reduce((n, r) => n + r.count, 0),
    },
    claims: {
      ...c,
      record_unit: "reported-nonprimary-practice-address-row",
      nonadditive: true,
    },
  };
}
export async function verifyCmsNppesPharmacyNonprimaryExactZipAdmission({
  root = APP_ROOT,
  signal,
} = {}) {
  root = path.resolve(root);
  const rb = await fsp.readFile(path.join(root, REG)),
    r = JSON.parse(rb);
  check(
    keys(r, [
      "schema_version",
      "dataset_id",
      "status",
      "pointer_path",
      "pointer_sha256",
      "source_release_id",
      "source_manifest_sha256",
      "policy_path",
      "policy_sha256",
      "dimension_id",
      "measure",
      "source_reference_date",
      "export_policy",
      "production_enrollment",
      "matrix_admission_performed",
    ]) &&
      r.schema_version ===
        "cms-nppes-pharmacy-nonprimary-exact-zip-registration@1.0.0" &&
      r.status === "registered-local-aggregate-review-only" &&
      r.production_enrollment === false &&
      r.matrix_admission_performed === false &&
      SHA.test(r.pointer_sha256) &&
      SHA.test(r.source_manifest_sha256) &&
      SHA.test(r.policy_sha256),
  );
  const policy = (await pinned(root, r.policy_path, r.policy_sha256, 100000))
    .value;
  check(
    policy.policy_id === "national-pharmacy-industry-coverage" &&
      policy.export_policy === "local-aggregate-review-required" &&
      policy.personal_data_handling.includes("Aggregate ZIP5 counts only") &&
      policy.prohibited_use.includes(
        "treating an address as a confirmed physical pharmacy",
      ),
  );
  const pointer = (await pinned(root, r.pointer_path, r.pointer_sha256, 10000))
    .value;
  check(
    pointer.release_id === r.source_release_id &&
      pointer.manifest_sha256 === r.source_manifest_sha256,
  );
  await verifyCmsNppesPharmacyNonprimaryAddresses(r.pointer_path, { signal });
  const manifestPath = path.join(
      root,
      path.posix.dirname(r.pointer_path),
      pointer.manifest,
    ),
    mb = await fsp.readFile(manifestPath),
    manifest = JSON.parse(mb);
  check(
    hash(mb) === r.source_manifest_sha256 &&
      manifest.coverage?.rows === 420 &&
      manifest.coverage?.distinct_zip5 === 377 &&
      manifest.claims?.business_or_site_total_contribution === false,
  );
  const sourceRows = [];
  for (const a of manifest.artifacts) {
    check(
      a.artifact_type ===
        "cms-nppes-pharmacy-nonprimary-addresses-jsonl-gzip" &&
        SHA.test(a.sha256),
    );
    for await (const row of rows(
      path.join(path.dirname(manifestPath), a.path),
      signal,
    ))
      sourceRows.push(row);
  }
  const projection = projectCmsNppesPharmacyNonprimaryExactZip(sourceRows, {
    source: {
      dataset_id: manifest.dataset_id,
      release_id: manifest.release_id,
      manifest_sha256: r.source_manifest_sha256,
      pointer_sha256: r.pointer_sha256,
      source_release_id: manifest.source_release_id,
    },
    dimension_id: r.dimension_id,
    measure: r.measure,
    source_reference_date: r.source_reference_date,
  });
  check(
    projection.summary.source_address_rows === 420 &&
      projection.summary.zip5_address_rows === 420 &&
      projection.summary.missing_reported_zip5_rows === 0 &&
    projection.summary.reported_zip4_rows === 369 &&
      projection.summary.positive_zip5_rows === 377 &&
      projection.summary.projected_address_rows === 420,
  );
  return {
    schema_version: VERSION,
    status: "admission-ready-local-aggregate-review-only",
    registration_sha256: hash(rb),
    dimension_id: r.dimension_id,
    summary: projection.summary,
    claims: projection.claims,
    rows: projection.rows,
  };
}
