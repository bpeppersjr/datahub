import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";
const D = "national-business-lifecycle-industry-jurisdiction-evidence",
  IND = [
    "retail-consumer",
    "health-care",
    "financial-services",
    "transportation",
    "construction",
    "tax-exempt-organizations",
    "sales-tax-outlets",
    "local-business-licenses",
    "childcare",
  ],
  SEG = [
    "construction",
    "retail-consumer",
    "financial-services",
    "transportation",
    "health-care",
    "childcare",
  ],
  LIFE = [
    "source-defined-current",
    "non-active-reporting",
    "unknown",
    "contradictory",
  ],
  REVIEW = ["within-review-window", "stale", "unmeasured", "unmapped"],
  SPECIAL = [
    "multi-state-material",
    "zcta-overlay-unresolved",
    "non-zcta-unassigned",
    "explicit-placeholder",
  ],
  EPA = "epa-echo-exporter-active-facility";
const PIN = {
  release_id:
    D + "-78a6260b319dd10c7006a0bace30736712ddaad5bc515b30fe7c9faa5cb14cd2",
  registration:
    "fee5ead43901852b940c4df492de8f0b5fda51f91c9e5fb7305c1ec0199d3f38",
  manifest: "7c8bddbefefb780a5aab846d901770fda7e8b4d4686b0ebdbfe3a1c041ac8fc6",
  artifact: "54150df0060c19bdc9924f8bcb497cb213dcecc363b49bd8a2e086951adba5ff",
  zipManifest:
    "830eaec18ee614250e9234386e6fb897a4891e67a2188b6bf39bf16a03e15f4c",
  jurisdictionManifest:
    "d2f2114dfdbf6788eea0dd2335c9a9383673d61baf557486ebd2e8aba7ffbf41",
  jurisdictionArtifact:
    "d29f7047dfe713fd9e95ede930edd0d2642eaa59158e3d2398ee3d5945658c84",
  lifecycleZipManifest:
    "f1d4959f62e0837441dd1bdd1af7271c8a9093d5fc172d9d046e997cfed3d33a",
  epaManifest:
    "bb154192843c65ccb7723259c6fda50725a2c7c9e4999477608b61f1fd716dc7",
  epaArtifact:
    "f47b129512c75389897c44b849ca89da0926d4269aad39ae67d80008cb4fa266",
};
const CLAIMS = {
  record_unit: "registry-location-profile-lifecycle-membership",
  source_relative_lifecycle_evidence: true,
  governed_jurisdiction_disposition_reused: true,
  all_60_scopes_retained: true,
  special_scopes_separate: true,
  multi_state_evidence_allocated: false,
  usps_zip_state_assignment: false,
  zip_prefix_assignment: false,
  reported_state_assignment: false,
  fractional_allocation: false,
  mapped_source_record_union_separate_from_industry_assignments: true,
  industry_assignments_additive: false,
  cross_source_additivity: false,
  unique_business_count: null,
  active_business_count: null,
  current_operating_business_count: null,
  all_business_completeness: null,
  industry_completeness: null,
  current_operation_verified: false,
  active_business_eligible: false,
  identity_resolution_applied: false,
  authoritative_current_usps_zip_denominator: null,
  zip4_joined: false,
  network_requests: 0,
  source_acquisition_performed: false,
  current_pointer_written: false,
  production_enrollment: false,
};
const ROUTES = {
  "retail-consumer": [
    "california-abc-daily-active-licenses",
    "new-york-agriculture-markets-retail-food-stores",
    "usda-snap-current-retailers",
    EPA,
  ],
  "health-care": ["cms-nppes-monthly-v2", EPA],
  "financial-services": [
    "fdic-bankfind-current-structure",
    "ncua-final-quarterly-call-report",
    EPA,
  ],
  transportation: ["fmcsa-company-census-active-us-principal-office", EPA],
  construction: [EPA],
  "tax-exempt-organizations": [],
  "sales-tax-outlets": ["texas-comptroller-active-sales-tax-permits"],
  "local-business-licenses": [
    "alaska-dcced-active-business-licenses",
    "city-of-chicago-bacp-current-active-business-licenses",
    "dc-dlcp-active-basic-business-licenses",
    "los-angeles-office-of-finance-active-businesses",
    "nyc-dcwp-issued-licenses-active-premises",
  ],
  childcare: [EPA],
};
const ASSIGNMENTS = {
  "alaska-dcced-active-business-licenses": 94550,
  "california-abc-daily-active-licenses": 84497,
  "city-of-chicago-bacp-current-active-business-licenses": 42940,
  "cms-nppes-monthly-v2": 2088780,
  "dc-dlcp-active-basic-business-licenses": 54910,
  [EPA]: 296595,
  "fdic-bankfind-current-structure": 77285,
  "fmcsa-company-census-active-us-principal-office": 2195563,
  "los-angeles-office-of-finance-active-businesses": 633232,
  "ncua-final-quarterly-call-report": 22445,
  "new-york-agriculture-markets-retail-food-stores": 23608,
  "nyc-dcwp-issued-licenses-active-premises": 31163,
  "texas-comptroller-active-sales-tax-permits": 885097,
  "usda-snap-current-retailers": 252080,
};
const exact = (v, k) =>
    v &&
    typeof v === "object" &&
    !Array.isArray(v) &&
    Object.keys(v).sort().join("|") === [...k].sort().join("|"),
  same = (a, b) => JSON.stringify(a) === JSON.stringify(b),
  sha = (v) => createHash("sha256").update(v).digest("hex"),
  sum = (v) => Object.values(v).reduce((n, x) => n + x, 0),
  integer = (v) => Number.isSafeInteger(v) && v >= 0,
  fail = () => {
    throw Error("Lifecycle industry jurisdiction runtime evidence rejected.");
  },
  parse = (v) => {
    try {
      return JSON.parse(v);
    } catch {
      fail();
    }
  },
  counts = (v, k, n) =>
    exact(v, k) && k.every((x) => integer(v[x])) && sum(v) === n,
  kind = (id) =>
    id.startsWith("state:")
      ? "state"
      : id.startsWith("territory:")
        ? "territory"
        : id;
async function stable(root, name, max, expected) {
  try {
    root = path.resolve(root);
    const target = path.resolve(root, name),
      rel = path.relative(root, target);
    if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) fail();
    let cursor = root;
    for (const part of rel.split(path.sep)) {
      cursor = path.join(cursor, part);
      if ((await fs.lstat(cursor)).isSymbolicLink()) fail();
    }
    if ((await fs.realpath(target)) !== target) fail();
    const a = await fs.lstat(target),
      value = await fs.readFile(target),
      b = await fs.lstat(target);
    if (
      !a.isFile() ||
      a.isSymbolicLink() ||
      a.nlink !== 1 ||
      a.dev !== b.dev ||
      a.ino !== b.ino ||
      a.size !== b.size ||
      a.mtimeMs !== b.mtimeMs ||
      value.length !== a.size ||
      !value.length ||
      value.length > max ||
      (expected && sha(value) !== expected)
    )
      fail();
    return { value, sha256: sha(value) };
  } catch (error) {
    if (
      error instanceof Error &&
      error.message ===
        "Lifecycle industry jurisdiction runtime evidence rejected."
    )
      throw error;
    fail();
  }
}
function row(v) {
  const keys = [
    "schema_version",
    "scope_id",
    "scope_kind",
    "scope_label",
    "state_geo_id",
    "state_fips",
    "state_name",
    "postal_abbreviation",
    "zip5_rows",
    "source_membership_count",
    "lifecycle_evidence_counts",
    "review_status_counts",
    "mapped_source_record_union_count",
    "unresolved_source_record_count",
    "industry_assignment_count",
    "industries",
    "epa_refinement",
    "unmapped_sources",
  ];
  if (
    !exact(v, keys) ||
    v.schema_version !== D + "-row@1.1.0" ||
    v.scope_kind !== kind(v.scope_id) ||
    typeof v.scope_label !== "string" ||
    !v.scope_label ||
    !integer(v.zip5_rows) ||
    !integer(v.source_membership_count) ||
    !counts(v.lifecycle_evidence_counts, LIFE, v.source_membership_count) ||
    !counts(v.review_status_counts, REVIEW, v.source_membership_count) ||
    !integer(v.mapped_source_record_union_count) ||
    !integer(v.unresolved_source_record_count) ||
    v.mapped_source_record_union_count + v.unresolved_source_record_count !==
      v.source_membership_count ||
    !integer(v.industry_assignment_count) ||
    v.industry_assignment_count < v.mapped_source_record_union_count ||
    !Array.isArray(v.industries) ||
    v.industries.length !== 9
  )
    fail();
  const stateLike = /^(state|territory):\d{2}$/.test(v.scope_id);
  if (
    stateLike !==
    (typeof v.state_geo_id === "string" &&
      /^state:\d{2}$/.test(v.state_geo_id) &&
      /^\d{2}$/.test(v.state_fips) &&
      typeof v.state_name === "string" &&
      /^[A-Z]{2}$/.test(v.postal_abbreviation))
  )
    fail();
  if (
    !stateLike &&
    [v.state_geo_id, v.state_fips, v.state_name, v.postal_abbreviation].some(
      (x) => x !== null,
    )
  )
    fail();
  let total = 0;
  for (let i = 0; i < 9; i++) {
    const x = v.industries[i],
      sk = [
        "industry_id",
        "source_assignment_count",
        "lifecycle_evidence_assignment_counts",
        "review_status_assignment_counts",
        "sources",
      ];
    if (
      !exact(x, sk) ||
      x.industry_id !== IND[i] ||
      !integer(x.source_assignment_count) ||
      !counts(
        x.lifecycle_evidence_assignment_counts,
        LIFE,
        x.source_assignment_count,
      ) ||
      !counts(
        x.review_status_assignment_counts,
        REVIEW,
        x.source_assignment_count,
      ) ||
      !Array.isArray(x.sources) ||
      x.sources.length !== ROUTES[x.industry_id].length
    )
      fail();
    let st = 0;
    const lc = Object.fromEntries(LIFE.map((k) => [k, 0])),
      rc = Object.fromEntries(REVIEW.map((k) => [k, 0]));
    for (let j = 0; j < x.sources.length; j++) {
      const s = x.sources[j],
        ssk = [
          "source_id",
          "source_assignment_count",
          "lifecycle_evidence_assignment_counts",
          "review_status_assignment_counts",
        ];
      if (
        !exact(s, ssk) ||
        s.source_id !== ROUTES[x.industry_id][j] ||
        !integer(s.source_assignment_count) ||
        !counts(
          s.lifecycle_evidence_assignment_counts,
          LIFE,
          s.source_assignment_count,
        ) ||
        !counts(
          s.review_status_assignment_counts,
          REVIEW,
          s.source_assignment_count,
        )
      )
        fail();
      st += s.source_assignment_count;
      for (const k of LIFE) lc[k] += s.lifecycle_evidence_assignment_counts[k];
      for (const k of REVIEW) rc[k] += s.review_status_assignment_counts[k];
    }
    if (
      st !== x.source_assignment_count ||
      !same(lc, x.lifecycle_evidence_assignment_counts) ||
      !same(rc, x.review_status_assignment_counts)
    )
      fail();
    total += x.source_assignment_count;
  }
  if (total !== v.industry_assignment_count) fail();
  const e = v.epa_refinement,
    ek = [
      "source_record_count",
      "mapped_source_record_union_count",
      "industry_assignment_count",
      "multisegment_record_count",
      "partially_unmapped_record_count",
      "unresolved_source_record_count",
      "segment_assignment_counts",
      "lifecycle_evidence_counts",
      "review_status_counts",
    ];
  if (
    !exact(e, ek) ||
    !integer(e.source_record_count) ||
    !counts(e.lifecycle_evidence_counts, LIFE, e.source_record_count) ||
    !counts(e.review_status_counts, REVIEW, e.source_record_count) ||
    !integer(e.mapped_source_record_union_count) ||
    !integer(e.unresolved_source_record_count) ||
    e.mapped_source_record_union_count + e.unresolved_source_record_count !==
      e.source_record_count ||
    !counts(e.segment_assignment_counts, SEG, e.industry_assignment_count) ||
    e.multisegment_record_count > e.mapped_source_record_union_count ||
    e.partially_unmapped_record_count > e.mapped_source_record_union_count ||
    v.industry_assignment_count - v.mapped_source_record_union_count !==
      e.industry_assignment_count - e.mapped_source_record_union_count
  )
    fail();
  for (const id of SEG) {
    const source = v.industries
      .find((x) => x.industry_id === id)
      .sources.find((x) => x.source_id === EPA);
    if (
      !source ||
      source.source_assignment_count !== e.segment_assignment_counts[id]
    )
      fail();
  }
  const uk = [
    "source_id",
    "unmapped_reason",
    "source_membership_count",
    "lifecycle_evidence_counts",
    "review_status_counts",
  ];
  if (!Array.isArray(v.unmapped_sources) || v.unmapped_sources.length !== 1) {
    fail();
  }
  const u = v.unmapped_sources[0];
  if (
    !exact(u, uk) ||
    u.source_id !== "usda-fsis-active-mpi-directory" ||
    typeof u.unmapped_reason !== "string" ||
    !u.unmapped_reason ||
    !integer(u.source_membership_count) ||
    !counts(u.lifecycle_evidence_counts, LIFE, u.source_membership_count) ||
    !counts(u.review_status_counts, REVIEW, u.source_membership_count) ||
    u.source_membership_count + e.unresolved_source_record_count !==
      v.unresolved_source_record_count
  )
    fail();
  let nonEpaMemberships = 0;
  const sourceLife = Object.fromEntries(LIFE.map((key) => [key, 0]));
  const sourceReview = Object.fromEntries(REVIEW.map((key) => [key, 0]));
  for (const industry of v.industries) {
    for (const source of industry.sources) {
      if (source.source_id === EPA) continue;
      nonEpaMemberships += source.source_assignment_count;
      for (const key of LIFE)
        sourceLife[key] += source.lifecycle_evidence_assignment_counts[key];
      for (const key of REVIEW)
        sourceReview[key] += source.review_status_assignment_counts[key];
    }
  }
  if (
    nonEpaMemberships + e.source_record_count + u.source_membership_count !==
    v.source_membership_count
  )
    fail();
  for (const key of LIFE)
    sourceLife[key] +=
      e.lifecycle_evidence_counts[key] + u.lifecycle_evidence_counts[key];
  for (const key of REVIEW)
    sourceReview[key] +=
      e.review_status_counts[key] + u.review_status_counts[key];
  if (
    !same(sourceLife, v.lifecycle_evidence_counts) ||
    !same(sourceReview, v.review_status_counts)
  )
    fail();
  return structuredClone(v);
}
function summary(v) {
  const geo = {
      state: 33455,
      territory: 149,
      "multi-state-material": 184,
      "zcta-overlay-unresolved": 3,
      "non-zcta-unassigned": 14402,
      "explicit-placeholder": 1,
    },
    epa = {
      source_record_count: 1517826,
      mapped_source_record_union_count: 294477,
      industry_assignment_count: 296595,
      multisegment_record_count: 2107,
      partially_unmapped_record_count: 25035,
      unresolved_source_record_count: 1223349,
    },
    industry = {
      "retail-consumer": 484508,
      "health-care": 2118021,
      "financial-services": 101618,
      transportation: 2242612,
      construction: 93917,
      "tax-exempt-organizations": 0,
      "sales-tax-outlets": 885097,
      "local-business-licenses": 856795,
      childcare: 177,
    },
    keys = [
      "scope_rows",
      "state_scope_rows",
      "territory_scope_rows",
      "special_scope_rows",
      "geography_scope_counts",
      "zip5_rows",
      "source_membership_count",
      "lifecycle_evidence_counts",
      "review_status_counts",
      "mapped_source_record_union_count",
      "unresolved_source_record_count",
      "industry_assignment_count",
      "industry_assignment_counts",
      "epa_refinement",
    ];
  if (
    !exact(v, keys) ||
    v.scope_rows !== 60 ||
    v.state_scope_rows !== 51 ||
    v.territory_scope_rows !== 5 ||
    v.special_scope_rows !== 4 ||
    !same(v.geography_scope_counts, geo) ||
    v.zip5_rows !== 48194 ||
    v.source_membership_count !== 8011213 ||
    !counts(v.lifecycle_evidence_counts, LIFE, v.source_membership_count) ||
    !counts(v.review_status_counts, REVIEW, v.source_membership_count) ||
    v.mapped_source_record_union_count !== 6780627 ||
    v.unresolved_source_record_count !== 1230586 ||
    v.mapped_source_record_union_count + v.unresolved_source_record_count !==
      v.source_membership_count ||
    v.industry_assignment_count !== 6782745 ||
    !same(v.industry_assignment_counts, industry) ||
    !same(v.epa_refinement, epa)
  )
    fail();
  return structuredClone(v);
}
async function contract(root) {
  const rp = await stable(
      root,
      "config/datasets/" + D + ".json",
      100000,
      PIN.registration,
    ),
    r = parse(rp.value),
    rr = r.retained_release,
    h = r.retained_releases,
    hk = [
      "release_id",
      "schema_version",
      "manifest",
      "manifest_sha256",
      "artifact_sha256",
      "artifact_bytes",
      "selected",
    ];
  if (
    !exact(r, [
      "schema_version",
      "dataset_id",
      "status",
      "runtime_pointer",
      "production_enrollment",
      "retained_release",
      "retained_releases",
      "claims",
      "documentation",
    ]) ||
    r.schema_version !== D + "-registration@1.1.0" ||
    !same(r.claims, CLAIMS) ||
    r.documentation !==
      "docs/NATIONAL-BUSINESS-LIFECYCLE-INDUSTRY-JURISDICTION-EVIDENCE-V1-1.md" ||
    rr.release_id !== PIN.release_id ||
    rr.manifest_sha256 !== PIN.manifest ||
    rr.artifact_sha256 !== PIN.artifact ||
    rr.artifact_bytes !== 615817 ||
    rr.scope_rows !== 60 ||
    rr.zip5_rows !== 48194 ||
    rr.source_membership_count !== 8011213 ||
    !Array.isArray(h) ||
    h.length !== 2 ||
    h.some((x) => !exact(x, hk)) ||
    h[0].release_id !==
      D + "-a1c2f181ccef283559dd8a1ec1223deb731cc18d44b4bcda33bec579815bceb1" ||
    h[0].schema_version !== D + "@1.0.0" ||
    h[0].manifest !== `data/${D}/releases/${h[0].release_id}/manifest.json` ||
    h[0].manifest_sha256 !==
      "c9535617ee521c6a54b3539d125c4427f9f30d1e469afe515eeeb6275a701f86" ||
    h[0].artifact_sha256 !==
      "e416e18c84d232cb6676eadfa2c0e108fa2492e0447ae7513f29719485a4c373" ||
    h[0].artifact_bytes !== 454365 ||
    h[0].selected !== false ||
    h[1].release_id !== PIN.release_id ||
    h[1].schema_version !== D + "@1.1.0" ||
    h[1].manifest !== rr.manifest ||
    h[1].manifest_sha256 !== PIN.manifest ||
    h[1].artifact_sha256 !== PIN.artifact ||
    h[1].artifact_bytes !== 615817 ||
    h[1].selected !== true
  )
    fail();
  const mp = await stable(root, rr.manifest, 10000, PIN.manifest),
    m = parse(mp.value),
    z = m.bindings?.lifecycle_industry_zip_evidence,
    j = m.bindings?.jurisdiction_disposition,
    l = m.bindings?.lifecycle_zip_evidence;
  if (
    mp.value.length !== 4732 ||
    !exact(m, [
      "release_id",
      "schema_version",
      "dataset_id",
      "status",
      "publication_mode",
      "predecessor",
      "bindings",
      "summary",
      "claims",
      "artifacts",
    ]) ||
    m.release_id !== PIN.release_id ||
    m.schema_version !== D + "@1.1.0" ||
    !same(m.claims, CLAIMS) ||
    !exact(m.predecessor, [
      "release_id",
      "manifest_path",
      "manifest_sha256",
      "artifact_sha256",
    ]) ||
    m.predecessor.manifest_sha256 !==
      "c9535617ee521c6a54b3539d125c4427f9f30d1e469afe515eeeb6275a701f86" ||
    m.predecessor.release_id !== h[0].release_id ||
    m.predecessor.manifest_path !== h[0].manifest ||
    m.predecessor.artifact_sha256 !== h[0].artifact_sha256 ||
    !exact(m.bindings, [
      "lifecycle_industry_zip_evidence",
      "jurisdiction_disposition",
      "lifecycle_zip_evidence",
    ]) ||
    z.manifest_sha256 !== PIN.zipManifest ||
    j.manifest_sha256 !== PIN.jurisdictionManifest ||
    j.artifact_sha256 !== PIN.jurisdictionArtifact ||
    l.manifest_sha256 !== PIN.lifecycleZipManifest ||
    !Array.isArray(m.artifacts) ||
    m.artifacts.length !== 1
  )
    fail();
  const zipManifest = await stable(
      root,
      z.manifest_path,
      30000,
      PIN.zipManifest,
    ),
    zm = parse(zipManifest.value),
    epa = zm.bindings?.epa_operational_segment_evidence;
  if (
    zm.release_id !== z.release_id ||
    epa.manifest_sha256 !== PIN.epaManifest ||
    epa.zip_artifact_sha256 !== PIN.epaArtifact
  )
    fail();
  const s = summary(m.summary),
    a = m.artifacts[0];
  if (
    !exact(a, ["path", "artifact_type", "record_count", "bytes", "sha256"]) ||
    a.path !== "jurisdictions.json" ||
    a.artifact_type !== "lifecycle-industry-jurisdiction-evidence-v1-1" ||
    a.record_count !== 60 ||
    a.bytes !== rr.artifact_bytes ||
    a.sha256 !== PIN.artifact
  )
    fail();
  const ap = await stable(
      root,
      path.join(path.dirname(rr.manifest), a.path),
      700000,
      PIN.artifact,
    ),
    raw = parse(ap.value);
  if (!Array.isArray(raw) || raw.length !== 60) fail();
  const rows = raw.map(row),
    byId = new Map(rows.map((x) => [x.scope_id, x])),
    states = rows
      .filter((x) => x.scope_kind === "state")
      .sort((a, b) => a.state_fips.localeCompare(b.state_fips)),
    territories = rows
      .filter((x) => x.scope_kind === "territory")
      .sort((a, b) => a.state_fips.localeCompare(b.state_fips)),
    special = SPECIAL.map((id) => byId.get(id)),
    ordered = [...states, ...territories, ...special];
  if (
    byId.size !== 60 ||
    states.length !== 51 ||
    territories.length !== 5 ||
    special.some((x) => !x)
  )
    fail();
  const scalar = (k) => ordered.reduce((n, x) => n + x[k], 0);
  for (const [k, n] of [
    ["zip5_rows", 48194],
    ["source_membership_count", 8011213],
    ["mapped_source_record_union_count", 6780627],
    ["unresolved_source_record_count", 1230586],
    ["industry_assignment_count", 6782745],
  ])
    if (scalar(k) !== n) fail();
  for (const k of LIFE)
    if (
      ordered.reduce((n, x) => n + x.lifecycle_evidence_counts[k], 0) !==
      s.lifecycle_evidence_counts[k]
    )
      fail();
  for (const k of REVIEW)
    if (
      ordered.reduce((n, x) => n + x.review_status_counts[k], 0) !==
      s.review_status_counts[k]
    )
      fail();
  for (const id of IND)
    if (
      ordered.reduce(
        (n, x) =>
          n +
          x.industries.find((i) => i.industry_id === id)
            .source_assignment_count,
        0,
      ) !== s.industry_assignment_counts[id]
    )
      fail();
  for (const k of Object.keys(s.epa_refinement))
    if (
      ordered.reduce((n, x) => n + x.epa_refinement[k], 0) !==
      s.epa_refinement[k]
    )
      fail();
  const assignments = {};
  for (const x of ordered)
    for (const i of x.industries)
      for (const source of i.sources)
        assignments[source.source_id] =
          (assignments[source.source_id] ?? 0) + source.source_assignment_count;
  if (
    !exact(assignments, Object.keys(ASSIGNMENTS)) ||
    Object.keys(ASSIGNMENTS).some(
      (id) => assignments[id] !== ASSIGNMENTS[id],
    ) ||
    ordered.reduce(
      (n, x) => n + x.unmapped_sources[0].source_membership_count,
      0,
    ) !== 7237
  )
    fail();
  return {
    m,
    s,
    states,
    territories,
    special,
    byId,
    registration_sha256: rp.sha256,
    manifest_sha256: mp.sha256,
    artifact_sha256: ap.sha256,
  };
}
const release = (v) => ({
  release_id: v.m.release_id,
  registration_sha256: v.registration_sha256,
  manifest_sha256: v.manifest_sha256,
  artifact_sha256: v.artifact_sha256,
  exact_zip_manifest_sha256: PIN.zipManifest,
  jurisdiction_manifest_sha256: PIN.jurisdictionManifest,
  jurisdiction_artifact_sha256: PIN.jurisdictionArtifact,
  epa_manifest_sha256: PIN.epaManifest,
  epa_zip_artifact_sha256: PIN.epaArtifact,
});
export async function readNationalBusinessLifecycleIndustryJurisdictionSummary({
  root = APP_ROOT,
  signal,
} = {}) {
  signal?.throwIfAborted();
  const v = await contract(path.resolve(root));
  signal?.throwIfAborted();
  return {
    schema_version: D + "-runtime-summary@1.1.0",
    release: release(v),
    summary: v.s,
    scopes: {
      states: v.states.map(
        ({ scope_id, state_fips, state_name, postal_abbreviation }) => ({
          scope_id,
          state_fips,
          state_name,
          postal_abbreviation,
        }),
      ),
      territories: v.territories.map(
        ({ scope_id, state_fips, state_name, postal_abbreviation }) => ({
          scope_id,
          state_fips,
          state_name,
          postal_abbreviation,
        }),
      ),
      special: v.special.map(({ scope_id, scope_label }) => ({
        scope_id,
        scope_label,
      })),
    },
    claims: CLAIMS,
  };
}
export async function readNationalBusinessLifecycleIndustryJurisdiction({
  root = APP_ROOT,
  state,
  scopeId,
  signal,
} = {}) {
  const sq = typeof state === "string" && /^[A-Z]{2}$/.test(state),
    iq =
      typeof scopeId === "string" &&
      (/^(state|territory):\d{2}$/.test(scopeId) || SPECIAL.includes(scopeId));
  if (sq === iq) fail();
  signal?.throwIfAborted();
  const v = await contract(path.resolve(root)),
    scope = sq
      ? v.states.find((x) => x.postal_abbreviation === state)
      : v.byId.get(scopeId);
  if (!scope || (sq && scope.scope_kind !== "state")) fail();
  signal?.throwIfAborted();
  return {
    schema_version: D + "-runtime-lookup@1.1.0",
    release: release(v),
    status: "governed-source-relative-industry-memberships",
    scope: structuredClone(scope),
    claims: CLAIMS,
  };
}
export { row as validateNationalBusinessLifecycleIndustryJurisdictionRowForTest };
