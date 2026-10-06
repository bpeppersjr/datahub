import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";
import { verifyRegisteredNationalExactZipIndustryEvidenceMatrixV29 } from "./national-exact-zip-industry-evidence-matrix-v2-9.mjs";
const D = "national-exact-zip-industry-evidence-matrix",
  DIM = "ny_retail_food_license_address_evidence_count",
  PRE =
    "national-exact-zip-industry-evidence-matrix-3533736fa5e0a27f0b4c5e4cb8e7d2af4aa04c2f0c97c4da7eff620df31f7ff7",
  PS = "9c6fa25f318d3b89f7f24efa15340d56b38a72691e40e5c4ebde22b45281c975",
  CFG = "705d0f0e9c8de2f2875c15f8b7a1a3cd9ffb8d36934f56baa4da9da98aabb3df",
  PTR = "46c00c164e7f1b9f6497340fd04f26079ef1981d23d105638d97ac7b58a1c2d0",
  REL = "ny-retail-food-stores-20260907-134303353Z-c3167a89",
  SRC = "ny-retail-food-stores-2025-09-30-9dfbb0199594dab8",
  MAN = "0c263a3a76edc73a4519f6f945e450951acc454118e193b1e69395d02ce3e815",
  ZIP = "b9bc94d0e92222ed7aa4059920c20c7010d12e8e00c53d1a97c61c3f8260cfb0",
  MEM = "a6b71a13b6f64a3efc39eac9f51ebbd370d26894255b238788f114265b36a943",
  WEI = "9cd65eb1909de5e1121e4a64792910d73f60cdd67466098705de1129f24f1d7c",
  P = /^prefix=\d{2}\.json$/,
  sha = (b) => createHash("sha256").update(b).digest("hex"),
  dig = (a) => sha(a.sort().join("\n") + "\n"),
  ck = (v, m) => {
    if (!v) throw Error("v3.0 rejected: " + m);
  };
const claims = () => ({
  publisher_membership:
    "New York Agriculture and Markets annual licensed retail-food-store snapshot",
  lifecycle_status: "non-active-reporting",
  publisher_scope: "New York State",
  current_operations_verified: false,
  continuous_operation_verified: false,
  site_occupancy_verified: false,
  public_access_verified: false,
  unique_business_count: null,
  complete_selected_official_view_snapshot: true,
  complete_all_businesses: false,
  source_coordinates_available: true,
  source_coordinates_are_verified_premises: false,
  usps_validity: null,
  zcta_is_zip_geometry: false,
  nonadditive_with_ny_retail_food_location_profiles: true,
  address_evidence_may_not_qualify_as_physical_site: true,
  record_export_policy: "local-review-only",
  aggregate_export_policy:
    "public-under-open-ny-terms-with-attribution-and-limitations",
  production_enrollment: false,
  network_requests: 0,
  current_pointer_written: false,
});
const cell = (x) =>
  x
    ? {
        status:
          x.licensed_location_address_count > 0 ? "positive" : "measured-zero",
        count: x.licensed_location_address_count,
        measure: "source_reported_retail_food_license_location_addresses",
        source_release_id: SRC,
        source_rows_updated_at: "2025-09-30T15:15:15.000Z",
        source_filter_reference_date: "2025-09-30",
        temporal_status: {
          status: "stale",
          source_status:
            "annual-current-snapshot-membership-not-current-operation",
          current_operations_verified: false,
        },
      }
    : {
        status: "outside-source-denominator",
        count: null,
        measure: "source_reported_retail_food_license_location_addresses",
        source_release_id: SRC,
        source_rows_updated_at: "2025-09-30T15:15:15.000Z",
        source_filter_reference_date: "2025-09-30",
        temporal_status: {
          status: "stale",
          source_status:
            "annual-current-snapshot-membership-not-current-operation",
          current_operations_verified: false,
        },
      };
function validSummary(s) {
  ck(
    s.zip5_rows === 48194 &&
      s.dimension_count === 51 &&
      s.industry_cells === 2457894 &&
      s.positive_zip5_rows === 1500 &&
      s.measured_zero_zip5_rows === 36336 &&
      s.outside_denominator_zip5_rows === 10358 &&
      s.address_evidence_sum === 24280 &&
      s.member_sha256 === MEM &&
      s.weighted_sha256 === WEI &&
      s.source_license_records === 24281 &&
      s.organizations_published === 24281 &&
      s.provisional_physical_sites === 24230 &&
      s.provisional_establishments === 24230 &&
      s.organizations_without_complete_site_address === 51 &&
      s.zip_evidence_addresses === 24280 &&
      s.usable_platform_geocodes === 22999 &&
      s.quarantined_source_records === 0 &&
      s.source_zip_codes === 1500 &&
      s.zip_union_records === 37836 &&
      s.rows_with_undocumented_establishment_codes === 19,
    "summary " + JSON.stringify(s),
  );
}
async function inputs(root, signal) {
  const pv = await verifyRegisteredNationalExactZipIndustryEvidenceMatrixV29({
    root,
    signal,
  });
  ck(pv.release_id === PRE && pv.manifest_sha256 === PS, "predecessor");
  const pc = JSON.parse(
      await readFile(
        path.join(
          root,
          "config/datasets/national-exact-zip-industry-evidence-matrix-v2-9.json",
        ),
      ),
    ),
    pm = JSON.parse(
      await readFile(path.join(root, pc.retained_release.manifest)),
    ),
    cb = await readFile(
      path.join(
        root,
        "config/datasets/ny-retail-food-store-license-sites.json",
      ),
    ),
    pb = await readFile(
      path.join(
        root,
        "data/business-sources/ny-retail-food-store-license-sites/current.json",
      ),
    );
  ck(sha(cb) === CFG && sha(pb) === PTR, "New York registration");
  const reg = JSON.parse(cb),
    ptr = JSON.parse(pb);
  ck(
    reg.current_verified_release?.release_id === REL &&
      reg.current_verified_release?.manifest_sha256 === MAN &&
      ptr.release_id === REL,
    "New York release registration",
  );
  const mp = path.join(
      root,
      "data/business-sources/ny-retail-food-store-license-sites",
      ptr.manifest,
    ),
    mb = await readFile(mp);
  ck(sha(mb) === MAN, "New York manifest");
  const m = JSON.parse(mb),
    a = m.artifacts.find((x) => x.path === "derived/zip-coverage.jsonl"),
    zb = await readFile(path.join(path.dirname(mp), a.path));
  ck(
    m.release_id === REL &&
      m.source_release_id === SRC &&
      m.complete_selected_license_snapshot === true &&
      m.artifacts.length === 7 &&
      m.artifacts.reduce((n, x) => n + x.bytes, 0) === 48664054 &&
      a.sha256 === ZIP &&
      sha(zb) === ZIP &&
      a.record_count === 37836,
    "New York ZIP artifact",
  );
  const map = new Map(
      zb
        .toString()
        .trim()
        .split(/\r?\n/)
        .map(JSON.parse)
        .map((r) => [r.zip_code, r.ny_retail_food_store_license_snapshot]),
    ),
    c = m.coverage;
  ck(
    map.size === 37836 &&
      c.source_license_records === 24281 &&
      c.organizations_published === 24281 &&
      c.provisional_physical_sites === 24230 &&
      c.provisional_establishments === 24230 &&
      c.organizations_without_complete_site_address === 51 &&
      c.zip_evidence_addresses === 24280 &&
      c.usable_platform_geocodes === 22999 &&
      c.quarantined_source_records === 0 &&
      c.source_zip_codes === 1500 &&
      c.zip_union_records === 37836 &&
      c.rows_with_undocumented_establishment_codes === 19,
    "New York conservation",
  );
  return {
    pm,
    pdir: path.dirname(path.join(root, pc.retained_release.manifest)),
    map,
    bindings: {
      predecessor: { release_id: PRE, manifest_sha256: PS },
      ny_retail_food_license_snapshot: {
        config_sha256: CFG,
        pointer_sha256: PTR,
        release_id: REL,
        source_release_id: SRC,
        manifest_sha256: MAN,
        manifest_bytes: mb.length,
        policy_sha256:
          "735293eafbd68e3aaabaa91610eaaad3bac6b848c64bf02e3de7bd67c44ca012",
        source_artifact_sha256:
          "196dc3b31263d70cfdf11a8556096670c3de885c1ad6d0779a9625465bc8f17c",
        metadata_sha256:
          "562bb09f75c7585d1956e83ccee3144e4de233fe5afc5a53a8e1a16e8a66ced6",
        zip_coverage_sha256: ZIP,
        source_summary_sha256:
          "9a3161468fe53753b9e51a4617e43ee814bf864305cb75942cbf63858ae676ee",
        quarantine_sha256:
          "46b50c321b39e89a491b6727a01628c34245605a30beb3e7414c5e01cff90e6e",
      },
    },
  };
}
async function compose(i, write) {
  const arts = [],
    mem = [],
    wei = [];
  let pos = 0,
    zero = 0,
    out = 0,
    sum = 0;
  for (const a of i.pm.artifacts) {
    const b = await readFile(path.join(i.pdir, a.path));
    ck(sha(b) === a.sha256, "predecessor artifact");
    if (!P.test(a.path)) {
      await write?.(a, b);
      arts.push(a);
      continue;
    }
    const rows = JSON.parse(b);
    for (const r of rows) {
      const x = i.map.get(r.zip5),
        c = cell(x);
      r.schema_version = "national-exact-zip-industry-evidence-row@3.0.0";
      r.cells = { ...r.cells, [DIM]: c };
      if (!x) out++;
      else if (x.licensed_location_address_count > 0) {
        pos++;
        sum += x.licensed_location_address_count;
        mem.push(r.zip5);
        wei.push(`${r.zip5}|${x.licensed_location_address_count}`);
      } else zero++;
    }
    const nb = Buffer.from(JSON.stringify(rows) + "\n"),
      d = {
        path: a.path,
        bytes: nb.length,
        sha256: sha(nb),
        record_count: rows.length,
      };
    await write?.(d, nb);
    arts.push(d);
  }
  const c = {
      source_license_records: 24281,
      organizations_published: 24281,
      provisional_physical_sites: 24230,
      provisional_establishments: 24230,
      organizations_without_complete_site_address: 51,
      zip_evidence_addresses: 24280,
      usable_platform_geocodes: 22999,
      quarantined_source_records: 0,
      source_zip_codes: 1500,
      zip_union_records: 37836,
      rows_with_undocumented_establishment_codes: 19,
    },
    s = {
      zip5_rows: 48194,
      dimension_count: 51,
      industry_cells: 2457894,
      positive_zip5_rows: pos,
      measured_zero_zip5_rows: zero,
      outside_denominator_zip5_rows: out,
      address_evidence_sum: sum,
      member_sha256: dig(mem),
      weighted_sha256: dig(wei),
      ...c,
    };
  validSummary(s);
  return { arts, s };
}
const body = (a, s, b) => ({
  schema_version: "national-exact-zip-industry-evidence-matrix@3.0.0",
  dataset_id: D,
  status: "immutable-pointer-free-local-review-only",
  claims: claims(),
  bindings: b,
  summary: s,
  artifacts: a,
});
export async function buildNationalExactZipIndustryEvidenceMatrixV30({
  root = APP_ROOT,
  outputRoot = path.join(
    APP_ROOT,
    "data/national-exact-zip-industry-evidence-matrix-v3-0",
  ),
  signal,
} = {}) {
  const i = await inputs(root, signal),
    stage = path.join(outputRoot, ".staging-" + randomUUID());
  await mkdir(stage, { recursive: true });
  try {
    const x = await compose(i, (d, b) =>
        writeFile(path.join(stage, d.path), b, { flag: "wx" }),
      ),
      bo = body(x.arts, x.s, i.bindings),
      id = D + "-" + sha(JSON.stringify(bo)),
      m = { release_id: id, ...bo };
    await writeFile(
      path.join(stage, "manifest.json"),
      JSON.stringify(m, null, 2) + "\n",
      { flag: "wx" },
    );
    await mkdir(path.join(outputRoot, "releases"), { recursive: true });
    const dir = path.join(outputRoot, "releases", id);
    await rename(stage, dir);
    return {
      release_id: id,
      manifest: path.join(dir, "manifest.json"),
      summary: x.s,
    };
  } catch (e) {
    await rm(stage, { recursive: true, force: true });
    throw e;
  }
}
export async function verifyNationalExactZipIndustryEvidenceMatrixV30(
  mp,
  { root = APP_ROOT, signal } = {},
) {
  const m = JSON.parse(await readFile(mp)),
    i = await inputs(root, signal),
    x = await compose(i);
  ck(
    JSON.stringify(m.summary) === JSON.stringify(x.s) &&
      JSON.stringify(m.artifacts) === JSON.stringify(x.arts) &&
      JSON.stringify(m.bindings) === JSON.stringify(i.bindings) &&
      JSON.stringify(m.claims) === JSON.stringify(claims()) &&
      m.release_id ===
        D + "-" + sha(JSON.stringify(body(m.artifacts, m.summary, m.bindings))),
    "replay",
  );
  for (const a of m.artifacts)
    ck(
      sha(await readFile(path.join(path.dirname(mp), a.path))) === a.sha256,
      "artifact",
    );
  const b = await readFile(mp);
  return {
    verified: true,
    release_id: m.release_id,
    manifest_sha256: sha(b),
    manifest_bytes: b.length,
    summary: m.summary,
  };
}
export async function verifyRegisteredNationalExactZipIndustryEvidenceMatrixV30({
  root = APP_ROOT,
  signal,
} = {}) {
  const r = JSON.parse(
      await readFile(
        path.join(
          root,
          "config/datasets/national-exact-zip-industry-evidence-matrix-v3-0.json",
        ),
      ),
    ),
    v = await verifyNationalExactZipIndustryEvidenceMatrixV30(
      path.join(root, r.retained_release.manifest),
      { root, signal },
    );
  ck(
    r.schema_version === "3.0.0" &&
      r.runtime_pointer === null &&
      r.production_enrollment === false &&
      v.release_id === r.retained_release.release_id &&
      v.manifest_sha256 === r.retained_release.manifest_sha256 &&
      v.manifest_bytes === r.retained_release.manifest_bytes &&
      v.summary.zip5_rows === r.retained_release.zip5_rows &&
      v.summary.dimension_count === r.retained_release.dimension_count &&
      v.summary.industry_cells === r.retained_release.industry_cells,
    "registration",
  );
  return v;
}
export const V30_TEST = { validSummary, claims, cell };
