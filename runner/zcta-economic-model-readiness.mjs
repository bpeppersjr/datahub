import { createHash, randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";
export const SCHEMA_VERSION = "1.0.0",
  TRANSFORMATION_VERSION = "zcta-economic-model-readiness@1.0.0";
const ID = "zcta-economic-model-readiness",
  EXPECTED = [
    "bea-regional-gdp",
    "census-zbp-baseline",
    "us-census-geography",
    "us-census-zcta-jurisdiction-crosswalk",
  ].sort(),
  POLICY = "config/source-policies/bea-regional-gdp.json";
const LIMITS = [
    "Rows describe 2020 Census ZCTAs, not official or currently active USPS ZIP Codes.",
    "Polygon relationships are jurisdiction metadata, not economic, population, business, or address weights.",
    "No numeric ZIP/ZCTA GDP or demographic allocation is produced.",
    "ZBP is a historical employer aggregate and not current active-business evidence.",
  ],
  BASE = [
    "policy-prohibits-zip-zcta-gdp-allocation",
    "missing-governed-demographic-slices",
  ],
  ZBP = new Set(["zbp-and-zcta", "zcta-without-published-zbp"]),
  hex = /^[a-f0-9]{64}$/;
const sha = (b) => createHash("sha256").update(b).digest("hex"),
  stop = (s) => {
    if (s?.aborted) throw s.reason ?? new DOMException("Aborted", "AbortError");
  },
  uniq = (a) => new Set(a).size === a.length;
function exact(o, k, l) {
  if (
    !o ||
    typeof o !== "object" ||
    Array.isArray(o) ||
    JSON.stringify(Object.keys(o).sort()) !== JSON.stringify([...k].sort())
  )
    throw new Error(`${l} has unexpected schema.`);
}
async function contained(root, file) {
  const base = await realpath(root),
    resolved = path.resolve(file),
    rel = path.relative(base, resolved);
  if (rel.startsWith("..") || path.isAbsolute(rel))
    throw new Error("Path escapes release directory.");
  let cur = base;
  for (const p of rel.split(path.sep).filter(Boolean)) {
    cur = path.join(cur, p);
    if ((await lstat(cur)).isSymbolicLink())
      throw new Error("Links are prohibited.");
  }
  if ((await realpath(resolved)) !== resolved)
    throw new Error("Non-canonical path prohibited.");
  return resolved;
}
async function creatableContained(root, file) {
  const base = await realpath(root),
    resolved = path.resolve(file),
    relative = path.relative(base, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative))
    throw new Error("Output root escapes the application.");
  let existing = resolved;
  while (true) {
    try {
      await lstat(existing);
      break;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      const parent = path.dirname(existing);
      if (parent === existing)
        throw new Error("No contained output ancestor exists.");
      existing = parent;
    }
  }
  await contained(base, existing);
  return resolved;
}
async function input(file, id, signal, appRoot) {
  stop(signal);
  const requested = await contained(appRoot, path.resolve(file)),
    first = JSON.parse(await readFile(requested));
  if (
    first.manifest &&
    (path.isAbsolute(first.manifest) ||
      first.manifest.split(/[\\/]/).includes(".."))
  )
    throw new Error(
      "Pointer manifest redirect must be relative and contained.",
    );
  const manifestPath = first.manifest
      ? await contained(
          path.dirname(requested),
          path.resolve(path.dirname(requested), first.manifest),
        )
      : requested,
    raw = await readFile(manifestPath),
    manifest = JSON.parse(raw);
  if (manifest.dataset_id !== id || manifest.status !== "published")
    throw new Error(`Expected published ${id}.`);
  return {
    manifest,
    manifestPath,
    dir: path.dirname(manifestPath),
    sha256: sha(raw),
  };
}
async function artifact(i, type, suffix, signal) {
  const ms = (i.manifest.artifacts ?? []).filter(
    (a) => a.artifact_type === type && (!suffix || a.path.endsWith(suffix)),
  );
  if (ms.length !== 1)
    throw new Error(`${i.manifest.dataset_id} must declare one ${type}.`);
  const a = ms[0];
  if (
    !Number.isInteger(a.bytes) ||
    a.bytes < 0 ||
    !Number.isInteger(a.record_count) ||
    a.record_count < 0 ||
    !hex.test(a.sha256)
  )
    throw new Error(`Bad ${type} metadata.`);
  const file = await contained(i.dir, path.join(i.dir, a.path)),
    buf = await readFile(file);
  stop(signal);
  if (buf.length !== a.bytes || sha(buf) !== a.sha256)
    throw new Error(`${type} authentication failed.`);
  const rows = buf.toString().split(/\r?\n/).filter(Boolean).map(JSON.parse);
  if (rows.length !== a.record_count)
    throw new Error(`${type} record count failed.`);
  return rows;
}
function validate(row) {
  exact(
    row,
    [
      "schema_version",
      "zcta",
      "geography_release_id",
      "population_2020",
      "housing_units_2020",
      "zbp_publication_status",
      "relationship_count",
      "material_relationship_count",
      "state_fips",
      "county_geoids",
      "direct_county_gdp_count",
      "missing_county_gdp_geoids",
      "direct_gdp_relationship_coverage",
      "model_status",
      "blockers",
      "claims",
    ],
    `row ${row?.zcta}`,
  );
  exact(
    row.claims,
    [
      "official_zip_code",
      "active_businesses",
      "numeric_gdp_or_demographic_allocation",
    ],
    "claims",
  );
  if (
    row.schema_version !== SCHEMA_VERSION ||
    !/^\d{5}$/.test(row.zcta) ||
    !Number.isInteger(row.population_2020) ||
    row.population_2020 < 0 ||
    !Number.isInteger(row.housing_units_2020) ||
    row.housing_units_2020 < 0 ||
    !ZBP.has(row.zbp_publication_status) ||
    row.model_status !== "withheld"
  )
    throw new Error("Row domain invalid.");
  for (const a of [
    row.state_fips,
    row.county_geoids,
    row.missing_county_gdp_geoids,
    row.blockers,
  ])
    if (!Array.isArray(a) || !uniq(a)) throw new Error("Row arrays invalid.");
  if (
    !row.state_fips.every((x) => /^\d{2}$/.test(x)) ||
    !row.county_geoids.every((x) => /^\d{5}$/.test(x)) ||
    !row.missing_county_gdp_geoids.every((x) =>
      row.county_geoids.includes(x),
    ) ||
    row.relationship_count !== row.county_geoids.length ||
    row.material_relationship_count < 0 ||
    row.material_relationship_count > row.relationship_count ||
    row.direct_county_gdp_count + row.missing_county_gdp_geoids.length !==
      row.relationship_count
  )
    throw new Error("Row conservation invalid.");
  if (
    row.direct_gdp_relationship_coverage !==
      (row.relationship_count
        ? row.direct_county_gdp_count / row.relationship_count
        : null) ||
    !BASE.every((x) => row.blockers.includes(x)) ||
    Object.values(row.claims).some(Boolean)
  )
    throw new Error("Row withholding invalid.");
}
async function replay(p, signal, appRoot) {
  const [g, b, c, z] = await Promise.all([
    input(p.geographyPath, "us-census-geography", signal, appRoot),
    input(p.beaPath, "bea-regional-gdp", signal, appRoot),
    input(
      p.crosswalkPath,
      "us-census-zcta-jurisdiction-crosswalk",
      signal,
      appRoot,
    ),
    input(p.zbpPath, "census-zbp-baseline", signal, appRoot),
  ]);
  if (
    b.manifest.geography_dependency?.release_id !== g.manifest.release_id ||
    c.manifest.upstream?.release_id !== g.manifest.release_id ||
    z.manifest.geography_dependency?.release_id !== g.manifest.release_id
  )
    throw new Error("Input geography identities do not match.");
  if (b.manifest.sources?.[0]?.policy_profile !== POLICY)
    throw new Error("BEA policy drift.");
  const [gs, governedCountyRows, cs, bs, zs] = await Promise.all([
      artifact(g, "normalized-index", "zctas.jsonl", signal),
      artifact(g, "normalized-index", "counties.jsonl", signal),
      artifact(c, "zcta-county-area-weights", null, signal),
      artifact(b, "bea-county-gdp-jsonl", null, signal),
      artifact(z, "zip-coverage-union-jsonl", null, signal),
    ]),
    members = new Set(gs.map((x) => x.zcta)),
    governedCounties = new Set(governedCountyRows.map((x) => x.geoid));
  if (
    gs.some((x) => x.geo_type !== "zcta") ||
    gs.length !== g.manifest.coverage.zctas ||
    members.size !== gs.length
  )
    throw new Error("Geography denominator invalid.");
  if (
    governedCountyRows.some(
      (x) => x.geo_type !== "county" || !/^\d{5}$/.test(x.geoid),
    ) ||
    governedCounties.size !== governedCountyRows.length
  )
    throw new Error("Governed county domain invalid.");
  const rel = new Map(),
    seen = new Set();
  for (const x of cs) {
    const key = `${x.zcta}:${x.county_geoid}`;
    if (
      !members.has(x.zcta) ||
      !/^\d{5}$/.test(x.county_geoid) ||
      !/^\d{2}$/.test(x.state_fips) ||
      !governedCounties.has(x.county_geoid) ||
      x.state_fips !== x.county_geoid.slice(0, 2) ||
      typeof x.material_intersection !== "boolean" ||
      seen.has(key)
    )
      throw new Error("Invalid duplicate or foreign relationship.");
    seen.add(key);
    if (!rel.has(x.zcta)) rel.set(x.zcta, []);
    rel.get(x.zcta).push(x);
  }
  const counties = new Set();
  for (const x of bs) {
    if (
      !/^\d{5}$/.test(x.geoid) ||
      !governedCounties.has(x.geoid) ||
      counties.has(x.geoid)
    )
      throw new Error("Invalid duplicate county GDP.");
    counties.add(x.geoid);
  }
  const zm = new Map();
  for (const x of zs) {
    if (!/^\d{5}$/.test(x.zip_code) || zm.has(x.zip_code))
      throw new Error("Invalid duplicate ZBP row.");
    zm.set(x.zip_code, x);
  }
  for (const id of members)
    if (!ZBP.has(zm.get(id)?.coverage_status))
      throw new Error(`Missing or invalid ZBP ${id}.`);
  stop(signal);
  const rows = gs
    .map((x) => {
      const rs = (rel.get(x.zcta) ?? []).sort((a, d) =>
          a.county_geoid.localeCompare(d.county_geoid),
        ),
        ids = rs.map((r) => r.county_geoid),
        missing = ids.filter((id) => !counties.has(id)),
        blockers = [...BASE];
      if (!rs.length) blockers.push("missing-jurisdiction-relationship");
      if (missing.length)
        blockers.push("incomplete-direct-county-gdp-coverage");
      const row = {
        schema_version: SCHEMA_VERSION,
        zcta: x.zcta,
        geography_release_id: g.manifest.release_id,
        population_2020: x.population_2020,
        housing_units_2020: x.housing_units_2020,
        zbp_publication_status: zm.get(x.zcta).coverage_status,
        relationship_count: ids.length,
        material_relationship_count: rs.filter((r) => r.material_intersection)
          .length,
        state_fips: [...new Set(rs.map((r) => r.state_fips))].sort(),
        county_geoids: ids,
        direct_county_gdp_count: ids.length - missing.length,
        missing_county_gdp_geoids: missing,
        direct_gdp_relationship_coverage: ids.length
          ? (ids.length - missing.length) / ids.length
          : null,
        model_status: "withheld",
        blockers,
        claims: {
          official_zip_code: false,
          active_businesses: false,
          numeric_gdp_or_demographic_allocation: false,
        },
      };
      validate(row);
      return row;
    })
    .sort((a, d) => a.zcta.localeCompare(d.zcta));
  return { rows, inputs: [g, b, c, z] };
}
async function atomic(file, data) {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${randomUUID()}`;
  await writeFile(tmp, data);
  await rename(tmp, file);
}
export async function buildZctaEconomicModelReadiness({
  geographyPath,
  beaPath,
  crosswalkPath,
  zbpPath,
  outputRoot,
  signal,
  appRoot = APP_ROOT,
  now = () => new Date(),
  hooks = {},
} = {}) {
  const canonicalAppRoot = await realpath(appRoot),
    root = await creatableContained(canonicalAppRoot, outputRoot),
    runId = randomUUID(),
    stage = path.join(root, ".staging", runId);
  try {
    const r = await replay(
        { geographyPath, beaPath, crosswalkPath, zbpPath },
        signal,
        canonicalAppRoot,
      ),
      created = now().toISOString(),
      releaseId = `${ID}-${created.replaceAll(/[-:.]/g, "")}-${runId.slice(0, 8)}`,
      body = Buffer.from(`${r.rows.map(JSON.stringify).join("\n")}\n`);
    await atomic(path.join(stage, "derived/zcta-readiness.jsonl"), body);
    const m = {
      schema_version: SCHEMA_VERSION,
      dataset_id: ID,
      transformation_version: TRANSFORMATION_VERSION,
      release_id: releaseId,
      run_id: runId,
      created_at: created,
      status: "published",
      publication_mode: "immutable-pointer-free",
      inputs: r.inputs
        .map((x) => ({
          dataset_id: x.manifest.dataset_id,
          release_id: x.manifest.release_id,
          manifest_path: x.manifestPath,
          manifest_sha256: x.sha256,
        }))
        .sort((a, d) => a.dataset_id.localeCompare(d.dataset_id)),
      coverage: {
        governed_zctas: r.rows.length,
        withheld: r.rows.length,
        rows_with_incomplete_direct_county_gdp_coverage: r.rows.filter(
          (x) => x.missing_county_gdp_geoids.length,
        ).length,
      },
      policy: {
        bea_policy_profile: POLICY,
        allocation_status: "prohibited-and-withheld",
      },
      limitations: LIMITS,
      artifacts: [
        {
          path: "derived/zcta-readiness.jsonl",
          artifact_type: "zcta-economic-model-readiness-jsonl",
          record_count: r.rows.length,
          bytes: body.length,
          sha256: sha(body),
        },
      ],
    };
    await atomic(path.join(stage, "manifest.json"), `${JSON.stringify(m)}\n`);
    await verifyZctaEconomicModelReadiness(path.join(stage, "manifest.json"), {
      signal,
      appRoot: canonicalAppRoot,
    });
    await hooks.beforeRename?.();
    stop(signal);
    const dest = path.join(root, "releases", releaseId);
    await mkdir(path.dirname(dest), { recursive: true });
    try {
      await lstat(dest);
      throw new Error("Release already exists.");
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    await rename(stage, dest);
    await hooks.afterRename?.();
    return {
      manifest: m,
      releaseDirectory: dest,
      committed: true,
      cancellation_after_commit: !!signal?.aborted,
    };
  } catch (e) {
    await rm(stage, { recursive: true, force: true });
    throw e;
  }
}
export async function verifyZctaEconomicModelReadiness(
  manifestPath,
  { signal, appRoot = APP_ROOT } = {},
) {
  stop(signal);
  const canonicalAppRoot = await realpath(appRoot),
    safeManifestPath = await contained(canonicalAppRoot, manifestPath),
    raw = await readFile(safeManifestPath),
    m = JSON.parse(raw),
    dir = path.dirname(safeManifestPath);
  exact(
    m,
    [
      "schema_version",
      "dataset_id",
      "transformation_version",
      "release_id",
      "run_id",
      "created_at",
      "status",
      "publication_mode",
      "inputs",
      "coverage",
      "policy",
      "limitations",
      "artifacts",
    ],
    "manifest",
  );
  if (
    m.dataset_id !== ID ||
    m.schema_version !== SCHEMA_VERSION ||
    m.transformation_version !== TRANSFORMATION_VERSION ||
    m.status !== "published" ||
    m.publication_mode !== "immutable-pointer-free" ||
    JSON.stringify(m.limitations) !== JSON.stringify(LIMITS)
  )
    throw new Error("Manifest drift.");
  if (
    !Array.isArray(m.inputs) ||
    JSON.stringify(m.inputs.map((x) => x.dataset_id).sort()) !==
      JSON.stringify(EXPECTED)
  )
    throw new Error("Input set drift.");
  for (const x of m.inputs) {
    exact(
      x,
      ["dataset_id", "release_id", "manifest_path", "manifest_sha256"],
      "input",
    );
    const safeInputManifest = await contained(
      canonicalAppRoot,
      x.manifest_path,
    );
    if (
      !path.isAbsolute(x.manifest_path) ||
      !hex.test(x.manifest_sha256) ||
      sha(await readFile(safeInputManifest)) !== x.manifest_sha256
    )
      throw new Error("Input manifest authentication failed.");
  }
  if (
    m.policy?.bea_policy_profile !== POLICY ||
    m.policy?.allocation_status !== "prohibited-and-withheld"
  )
    throw new Error("Policy drift.");
  exact(
    m.coverage,
    [
      "governed_zctas",
      "withheld",
      "rows_with_incomplete_direct_county_gdp_coverage",
    ],
    "coverage",
  );
  exact(m.policy, ["bea_policy_profile", "allocation_status"], "policy");
  if (
    m.artifacts?.length !== 1 ||
    m.artifacts[0].path !== "derived/zcta-readiness.jsonl" ||
    m.artifacts[0].artifact_type !== "zcta-economic-model-readiness-jsonl"
  )
    throw new Error("Artifact drift.");
  const a = m.artifacts[0],
    buf = await readFile(await contained(dir, path.join(dir, a.path)));
  exact(
    a,
    ["path", "artifact_type", "record_count", "bytes", "sha256"],
    "artifact",
  );
  if (buf.length !== a.bytes || sha(buf) !== a.sha256)
    throw new Error("Readiness artifact hash mismatch.");
  const actual = buf.toString().split(/\r?\n/).filter(Boolean).map(JSON.parse);
  actual.forEach(validate);
  const p = Object.fromEntries(
      m.inputs.map((x) => [x.dataset_id, x.manifest_path]),
    ),
    expected = (
      await replay(
        {
          geographyPath: p["us-census-geography"],
          beaPath: p["bea-regional-gdp"],
          crosswalkPath: p["us-census-zcta-jurisdiction-crosswalk"],
          zbpPath: p["census-zbp-baseline"],
        },
        signal,
        canonicalAppRoot,
      )
    ).rows;
  stop(signal);
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error("Source replay mismatch.");
  if (
    a.record_count !== actual.length ||
    m.coverage?.governed_zctas !== actual.length ||
    m.coverage?.withheld !== actual.length ||
    m.coverage?.rows_with_incomplete_direct_county_gdp_coverage !==
      actual.filter((x) => x.missing_county_gdp_geoids.length).length
  )
    throw new Error("Coverage conservation failed.");
  return {
    dataset_id: m.dataset_id,
    release_id: m.release_id,
    record_count: actual.length,
    verified_bytes: buf.length,
  };
}
