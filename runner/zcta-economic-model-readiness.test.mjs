import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  buildZctaEconomicModelReadiness,
  verifyZctaEconomicModelReadiness,
} from "./zcta-economic-model-readiness.mjs";
const hash = (b) => createHash("sha256").update(b).digest("hex");
async function fixture(root, name, manifest, files) {
  const dir = path.join(root, name);
  await mkdir(dir, { recursive: true });
  const artifacts = [];
  for (const [type, rows] of Object.entries(files)) {
    const p =
        type === "normalized-index"
          ? "derived/index/zctas.jsonl"
          : type === "county-normalized-index"
            ? "derived/index/counties.jsonl"
            : `${type}.jsonl`,
      body = Buffer.from(`${rows.map(JSON.stringify).join("\n")}\n`);
    await mkdir(path.dirname(path.join(dir, p)), { recursive: true });
    await writeFile(path.join(dir, p), body);
    artifacts.push({
      artifact_type:
        type === "county-normalized-index" ? "normalized-index" : type,
      path: p,
      bytes: body.length,
      record_count: rows.length,
      sha256: hash(body),
    });
  }
  await writeFile(
    path.join(dir, "manifest.json"),
    JSON.stringify({ ...manifest, status: "published", artifacts }),
  );
  return path.join(dir, "manifest.json");
}
async function inputs(root, o = {}) {
  const g = o.geo ?? [
      {
        geo_type: "zcta",
        zcta: "12345",
        population_2020: 100,
        housing_units_2020: 40,
      },
      {
        geo_type: "zcta",
        zcta: "23456",
        population_2020: 0,
        housing_units_2020: 0,
      },
    ],
    r = o.rel ?? [
      {
        zcta: "12345",
        county_geoid: "01001",
        state_fips: "01",
        material_intersection: true,
      },
      {
        zcta: "23456",
        county_geoid: "01003",
        state_fips: "01",
        material_intersection: true,
      },
    ],
    z = o.zbp ?? [
      { zip_code: "12345", coverage_status: "zbp-and-zcta" },
      { zip_code: "23456", coverage_status: "zcta-without-published-zbp" },
    ];
  return {
    geographyPath: await fixture(
      root,
      "geo",
      {
        dataset_id: "us-census-geography",
        release_id: "geo-1",
        coverage: { zctas: g.length },
      },
      {
        "normalized-index": g,
        "county-normalized-index": [
          { geo_type: "county", geoid: "01001" },
          { geo_type: "county", geoid: "01003" },
        ],
      },
    ),
    beaPath: await fixture(
      root,
      "bea",
      {
        dataset_id: "bea-regional-gdp",
        release_id: "bea-1",
        geography_dependency: { release_id: "geo-1" },
        sources: [
          { policy_profile: "config/source-policies/bea-regional-gdp.json" },
        ],
      },
      { "bea-county-gdp-jsonl": o.bea ?? [{ geoid: "01001" }] },
    ),
    crosswalkPath: await fixture(
      root,
      "cross",
      {
        dataset_id: "us-census-zcta-jurisdiction-crosswalk",
        release_id: "cross-1",
        upstream: { release_id: "geo-1" },
      },
      { "zcta-county-area-weights": r },
    ),
    zbpPath: await fixture(
      root,
      "zbp",
      {
        dataset_id: "census-zbp-baseline",
        release_id: "zbp-1",
        geography_dependency: { release_id: "geo-1" },
      },
      { "zip-coverage-union-jsonl": z },
    ),
  };
}
test("publishes pointer-free and replays", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ready-")),
    r = await buildZctaEconomicModelReadiness({
      ...(await inputs(root)),
      outputRoot: path.join(root, "out"),
      appRoot: root,
    });
  assert.equal(
    (
      await verifyZctaEconomicModelReadiness(
        path.join(r.releaseDirectory, "manifest.json"),
        { appRoot: root },
      )
    ).record_count,
    2,
  );
  await assert.rejects(readFile(path.join(root, "out/current.json")));
});
test("rejects forged rehashed output and upstream mutation", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ready-")),
    args = await inputs(root),
    r = await buildZctaEconomicModelReadiness({
      ...args,
      outputRoot: path.join(root, "out"),
      appRoot: root,
    }),
    mp = path.join(r.releaseDirectory, "manifest.json"),
    m = JSON.parse(await readFile(mp)),
    dp = path.join(r.releaseDirectory, m.artifacts[0].path),
    rows = (await readFile(dp, "utf8")).trim().split("\n").map(JSON.parse);
  rows[0].population_2020 = 99;
  const body = Buffer.from(`${rows.map(JSON.stringify).join("\n")}\n`);
  await writeFile(dp, body);
  m.artifacts[0].bytes = body.length;
  m.artifacts[0].sha256 = hash(body);
  await writeFile(mp, JSON.stringify(m));
  await assert.rejects(
    verifyZctaEconomicModelReadiness(mp, { appRoot: root }),
    /replay mismatch/,
  );
  await writeFile(
    args.geographyPath,
    `${await readFile(args.geographyPath, "utf8")} `,
  );
  await assert.rejects(
    verifyZctaEconomicModelReadiness(mp, { appRoot: root }),
    /authentication/,
  );
});
test("rejects duplicate and foreign source rows", async () => {
  for (const o of [
    {
      rel: [
        {
          zcta: "99999",
          county_geoid: "01001",
          state_fips: "01",
          material_intersection: true,
        },
      ],
    },
    { bea: [{ geoid: "01001" }, { geoid: "01001" }] },
    { bea: [{ geoid: "99999" }] },
    {
      rel: [
        {
          zcta: "12345",
          county_geoid: "01001",
          state_fips: "02",
          material_intersection: true,
        },
        {
          zcta: "23456",
          county_geoid: "01003",
          state_fips: "01",
          material_intersection: true,
        },
      ],
    },
    {
      zbp: [
        { zip_code: "12345", coverage_status: "zbp-and-zcta" },
        { zip_code: "12345", coverage_status: "zbp-and-zcta" },
      ],
    },
  ]) {
    const root = await mkdtemp(path.join(os.tmpdir(), "ready-"));
    await assert.rejects(
      buildZctaEconomicModelReadiness({
        ...(await inputs(root, o)),
        outputRoot: path.join(root, "out"),
        appRoot: root,
      }),
      /duplicate|foreign|Missing|relationship|county GDP/,
    );
  }
});
test("rejects pointer escape, external verifier input, and nested extras", async () => {
  let root = await mkdtemp(path.join(os.tmpdir(), "ready-")),
    args = await inputs(root);
  const pointer = path.join(root, "pointer.json");
  await writeFile(
    pointer,
    JSON.stringify({ manifest: "../external/manifest.json" }),
  );
  await assert.rejects(
    buildZctaEconomicModelReadiness({
      ...args,
      geographyPath: pointer,
      outputRoot: path.join(root, "out"),
      appRoot: root,
    }),
    /redirect/,
  );
  root = await mkdtemp(path.join(os.tmpdir(), "ready-"));
  args = await inputs(root);
  const release = await buildZctaEconomicModelReadiness({
      ...args,
      outputRoot: path.join(root, "out"),
      appRoot: root,
    }),
    mp = path.join(release.releaseDirectory, "manifest.json"),
    m = JSON.parse(await readFile(mp));
  m.coverage.extra = true;
  await writeFile(mp, JSON.stringify(m));
  await assert.rejects(
    verifyZctaEconomicModelReadiness(mp, { appRoot: root }),
    /coverage has unexpected schema/,
  );
  const outside = await mkdtemp(path.join(os.tmpdir(), "outside-")),
    external = path.join(outside, "manifest.json");
  await writeFile(external, "{}");
  m.coverage.extra = undefined;
  delete m.coverage.extra;
  m.inputs[0].manifest_path = external;
  m.inputs[0].manifest_sha256 = hash(Buffer.from("{}"));
  await writeFile(mp, JSON.stringify(m));
  await assert.rejects(
    verifyZctaEconomicModelReadiness(mp, { appRoot: root }),
    /escapes/,
  );
});
test("cancellation cleanup and post-commit status", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ready-")),
    args = await inputs(root),
    c = new AbortController();
  c.abort();
  await assert.rejects(
    buildZctaEconomicModelReadiness({
      ...args,
      outputRoot: path.join(root, "cancel"),
      signal: c.signal,
      appRoot: root,
    }),
    (e) => e.name === "AbortError",
  );
  const c2 = new AbortController(),
    r = await buildZctaEconomicModelReadiness({
      ...args,
      outputRoot: path.join(root, "done"),
      signal: c2.signal,
      appRoot: root,
      hooks: {
        afterRename() {
          c2.abort();
        },
      },
    });
  assert.equal(r.committed, true);
  assert.equal(r.cancellation_after_commit, true);
});
test("concurrent timestamp builds remain distinct", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ready-")),
    args = await inputs(root),
    out = path.join(root, "out"),
    clock = () => new Date("2026-10-02T00:00:00Z"),
    [a, b] = await Promise.all([
      buildZctaEconomicModelReadiness({
        ...args,
        outputRoot: out,
        now: clock,
        appRoot: root,
      }),
      buildZctaEconomicModelReadiness({
        ...args,
        outputRoot: out,
        now: clock,
        appRoot: root,
      }),
    ]);
  assert.notEqual(a.releaseDirectory, b.releaseDirectory);
});
test("rejects upstream path escape, policy drift, and output artifact drift", async () => {
  let root = await mkdtemp(path.join(os.tmpdir(), "ready-")),
    args = await inputs(root),
    gm = JSON.parse(await readFile(args.geographyPath));
  gm.artifacts[0].path = "../zctas.jsonl";
  await writeFile(args.geographyPath, JSON.stringify(gm));
  await assert.rejects(
    buildZctaEconomicModelReadiness({
      ...args,
      outputRoot: path.join(root, "out"),
      appRoot: root,
    }),
    /escapes/,
  );
  root = await mkdtemp(path.join(os.tmpdir(), "ready-"));
  args = await inputs(root);
  const bm = JSON.parse(await readFile(args.beaPath));
  bm.sources[0].policy_profile = "other";
  await writeFile(args.beaPath, JSON.stringify(bm));
  await assert.rejects(
    buildZctaEconomicModelReadiness({
      ...args,
      outputRoot: path.join(root, "out"),
      appRoot: root,
    }),
    /policy drift/i,
  );
  root = await mkdtemp(path.join(os.tmpdir(), "ready-"));
  args = await inputs(root);
  const release = await buildZctaEconomicModelReadiness({
      ...args,
      outputRoot: path.join(root, "out"),
      appRoot: root,
    }),
    mp = path.join(release.releaseDirectory, "manifest.json"),
    om = JSON.parse(await readFile(mp));
  om.artifacts[0].artifact_type = "forged";
  await writeFile(mp, JSON.stringify(om));
  await assert.rejects(
    verifyZctaEconomicModelReadiness(mp, { appRoot: root }),
    /Artifact drift/,
  );
});
test("rejects external and linked output roots", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ready-")),
    args = await inputs(root),
    external = await mkdtemp(path.join(os.tmpdir(), "external-output-"));
  await assert.rejects(
    buildZctaEconomicModelReadiness({
      ...args,
      outputRoot: path.join(external, "release"),
      appRoot: root,
    }),
    /escapes/,
  );
  const linked = path.join(root, "linked-output");
  try {
    await symlink(
      external,
      linked,
      process.platform === "win32" ? "junction" : "dir",
    );
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) {
      t.diagnostic(`linked-ancestor check skipped: ${error.code}`);
      return;
    }
    throw error;
  }
  await assert.rejects(
    buildZctaEconomicModelReadiness({
      ...args,
      outputRoot: path.join(linked, "release"),
      appRoot: root,
    }),
    /Links|Non-canonical/,
  );
});
