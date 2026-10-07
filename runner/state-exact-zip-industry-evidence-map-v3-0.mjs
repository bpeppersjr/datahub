import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";
const sha = (b) => createHash("sha256").update(b).digest("hex"),
  ck = (v) => {
    if (!v) throw Error("State v3.0 evidence map unavailable.");
  };
export async function readStateExactZipIndustryEvidenceProjectionV30({
  root = APP_ROOT,
  dimensionId,
} = {}) {
  ck(typeof dimensionId === "string" && /^[a-z0-9_]+$/.test(dimensionId));
  const r = JSON.parse(
      await fs.readFile(
        path.join(
          root,
          "config/datasets/state-exact-zip-industry-evidence-disposition-v3-0.json",
        ),
      ),
    ),
    p = r.retained_release,
    mp = path.join(root, p.manifest),
    mb = await fs.readFile(mp);
  ck(
    sha(mb) === p.manifest_sha256 &&
      r.schema_version === "3.0.0" &&
      r.runtime_pointer === null &&
      r.production_enrollment === false,
  );
  const m = JSON.parse(mb),
    a = m.artifacts[0],
    ab = await fs.readFile(path.join(path.dirname(mp), a.path));
  ck(
    sha(ab) === p.artifact_sha256 &&
      ab.length === p.artifact_bytes &&
      a.sha256 === p.artifact_sha256,
  );
  const all = JSON.parse(ab),
    states0 = all.filter((x) => /^state:\d{2}$/.test(x.scope_id)),
    territories0 = all.filter((x) => /^territory:\d{2}$/.test(x.scope_id)),
    special0 = all.filter((x) => !/^state:|^territory:/.test(x.scope_id));
  ck(
    states0.length === 51 && territories0.length === 5 && special0.length === 4,
  );
  const geography_scope_counts = {
    state: states0.reduce((n, x) => n + x.zip5_rows, 0),
    territory: territories0.reduce((n, x) => n + x.zip5_rows, 0),
    ...Object.fromEntries(special0.map((x) => [x.scope_id, x.zip5_rows])),
  };
  ck(
    JSON.stringify(geography_scope_counts) ===
      JSON.stringify({
        state: 33455,
        territory: 149,
        "explicit-placeholder": 1,
        "multi-state-material": 184,
        "non-zcta-unassigned": 14402,
        "zcta-overlay-unresolved": 3,
      }),
  );
  const dimensions = Object.keys(states0[0].dimensions);
  ck(
    dimensions.length === 51 &&
      dimensions.includes(dimensionId) &&
      all.every(
        (x) => Object.keys(x.dimensions).join("|") === dimensions.join("|"),
      ),
  );
  const project = (x) => {
    const d = x.dimensions[dimensionId],
      positive =
        d.derived_evidence_status_counts["evidence-present"] ??
        d.derived_evidence_status_counts["linkage-evidence-present"];
    for (const k of [
      "raw_status_counts",
      "derived_evidence_status_counts",
      "lifecycle_status_counts",
    ])
      ck(Object.values(d[k]).reduce((n, v) => n + v, 0) === x.zip5_rows);
    return {
      scope_id: x.scope_id,
      scope_label: x.scope_label,
      state_fips: x.state_fips,
      state_name: x.state_name,
      postal_abbreviation: x.postal_abbreviation,
      positive_zip5_rows: positive,
      zip5_denominator: x.zip5_rows,
      positive_zip5_percent: x.zip5_rows
        ? Number(((positive / x.zip5_rows) * 100).toFixed(1))
        : 0,
      raw_status_counts: d.raw_status_counts,
      derived_evidence_status_counts: d.derived_evidence_status_counts,
      lifecycle_status_counts: d.lifecycle_status_counts,
      count_sum: d.count_sum,
    };
  };
  return {
    schema_version: "state-exact-zip-industry-evidence-projection@3.0.0",
    status: "present",
    dimension_id: dimensionId,
    dimensions: dimensions.map((id) => ({ id })),
    metric: {
      id: "evidence-present-zip5-over-scope-zip5-denominator",
      numerator: "derived evidence-present ZIP5 rows",
      denominator: "retained scope ZIP5 rows",
    },
    states: states0.map(project),
    territories: territories0.map(project),
    special_scopes: special0.map(project),
    geography_scope_counts,
    provenance: {
      release_id: m.release_id,
      manifest_sha256: p.manifest_sha256,
      artifact_sha256: p.artifact_sha256,
      matrix: m.bindings.matrix,
      chicago_current_active_business_licenses:
        m.bindings.chicago_current_active_business_licenses,
      ny_retail_food_license_snapshot: m.bindings.ny_retail_food_license_snapshot,
    },
    source_bytes_read: mb.length + ab.length,
    artifact_read_count: 1,
    claims: m.claims,
  };
}
