/* eslint-disable @typescript-eslint/no-unused-vars */
import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

export const VERSION = "zcta-gdp-model-specification@1.0.0";
const ID = "zcta-gdp-model-specification",
  ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = (b) => createHash("sha256").update(b).digest("hex"),
  fail = (m) => {
    throw Error(`ZCTA GDP model specification rejected: ${m}.`);
  },
  ok = (v, m) => v || fail(m);
const inside = (root, p) => {
  const f = path.resolve(root, p),
    r = path.relative(root, f);
  ok(r && !r.startsWith("..") && !path.isAbsolute(r), "path escape");
  return f;
};
async function bytes(file, max = 500000, signal, hooks) {
  signal?.throwIfAborted();
  const real = await fs.realpath(file),
    s = await fs.lstat(file, { bigint: true });
  ok(
    real === path.resolve(file) &&
      s.isFile() &&
      !s.isSymbolicLink() &&
      s.nlink === 1n &&
      s.size <= BigInt(max),
    "unsafe input",
  );
  const h = await fs.open(file, "r"),
    parts = [];
  let length = 0;
  try {
    const opened = await h.stat({ bigint: true });
    ok(
      opened.dev === s.dev && opened.ino === s.ino && opened.nlink === 1n,
      "open ownership",
    );
    for (;;) {
      signal?.throwIfAborted();
      const chunk = Buffer.alloc(65536),
        read = await h.read(chunk, 0, chunk.length, null);
      if (!read.bytesRead) break;
      length += read.bytesRead;
      ok(length <= max, "input ceiling");
      parts.push(chunk.subarray(0, read.bytesRead));
      await hooks?.duringInputRead?.({ file, bytes: length });
    }
    const e = await h.stat({ bigint: true }),
      named = await fs.lstat(file, { bigint: true });
    ok(
      s.dev === e.dev &&
        s.ino === e.ino &&
        s.size === e.size &&
        s.mtimeNs === e.mtimeNs &&
        e.dev === named.dev &&
        e.ino === named.ino,
      "input drift",
    );
  } finally {
    await h.close();
  }
  const b = Buffer.concat(parts);
  return { b, sha256: sha(b), value: JSON.parse(b) };
}
async function context(root, signal, hooks) {
  const cat = await bytes(
      inside(
        root,
        "config/datasets/zcta-gdp-allocation-method-evaluation.json",
      ),
      500000,
      signal,
      hooks,
    ),
    pin = cat.value.retained_release;
  ok(
    cat.value.dataset_id === "zcta-gdp-allocation-method-evaluation" && pin,
    "evaluation catalog",
  );
  const mf = inside(root, pin.manifest),
    m = await bytes(mf, 500000, signal, hooks);
  ok(
    m.sha256 === pin.manifest_sha256 &&
      m.value.release_id === pin.release_id &&
      m.value.claims?.numeric_gdp_emitted === false &&
      m.value.claims?.model_approved === false,
    "evaluation binding",
  );
  const policyPath = m.value.bindings?.bea_policy?.path,
    p = await bytes(inside(root, policyPath), 500000, signal, hooks);
  ok(
    p.sha256 === m.value.bindings.bea_policy.sha256 &&
      p.value.prohibited_use?.includes(
        "allocating national, regional, state, county, or combined-area GDP to ZIP codes or ZCTAs without a published source relationship",
      ),
    "policy binding",
  );
  return { pin, m, p, policyPath };
}
export function specification(c) {
  return {
    schema_version: "1.0.0",
    specification_id: "county-to-zcta-gdp-proposed-v1",
    decision_status: "hold",
    model_approved: false,
    output_authorized: false,
    target_geography: {
      type: "2020-census-zcta",
      official_usps_zip: false,
      zip_zcta_equivalence: "not-established",
    },
    target_measure: {
      name: "modeled-current-dollar-gdp",
      bea_line_code: "3",
      bea_reference_year: 2024,
      units: "current dollars",
      publisher_measure_remains_county_level: true,
    },
    methods: {
      primary: "zbp-payroll-area-hybrid",
      sensitivity: ["polygon-area", "zbp-establishment-area-fallback"],
      fallback: null,
      description:
        "Normalize observed 2023 ZBP annual payroll multiplied by the governed ZCTA/county polygon share within each directly matched BEA county. The area and establishment methods are sensitivity estimates, never automatic substitutes.",
    },
    eligibility: {
      relationship_requires: [
        "material_intersection=true",
        "direct_bea_county_input=true",
      ],
      primary_requires: [
        "payroll_input_state=observed",
        "positive county payroll-hybrid denominator",
      ],
      withhold_zcta_when: [
        "any material relationship lacks direct BEA county input",
        "any contributing county GDP is null or flagged",
        "any contributing primary weight is null",
        "county conservation fails",
      ],
      suppressed_unpublished_or_not_applicable: "null-and-withhold-never-zero",
    },
    vintages: {
      zcta_geography: 2020,
      zbp: 2023,
      bea: 2024,
      mismatch_disclosure_required: true,
    },
    conservation: {
      scope: "each county and method",
      weight_sum: 1,
      tolerance: 1e-10,
      residual_beyond_tolerance: "reject-release",
    },
    aggregation: {
      county_component_formula:
        "county current-dollar GDP multiplied by selected relationship weight",
      zcta_formula:
        "sum eligible county components only after complete-coverage gate",
      rounding:
        "compute in IEEE-754 double precision; publish integer current dollars using round-half-away-from-zero only after summing unrounded county components",
      negative_values: "reject",
    },
    uncertainty: {
      kind: "method-sensitivity-not-statistical-confidence-interval",
      primary: "payroll-hybrid estimate",
      lower:
        "minimum of complete primary, polygon-area, and establishment sensitivity estimates",
      upper:
        "maximum of complete primary, polygon-area, and establishment sensitivity estimates",
      missing_method: "withhold uncertainty bounds; never impute",
      required_disclosure:
        "Bounds measure proxy-method spread only and do not quantify total model error.",
    },
    provenance: {
      required_per_release: [
        "evaluation release id and manifest SHA-256",
        "BEA, ZBP, geography and crosswalk release ids and manifest SHA-256 values",
        "BEA policy path and SHA-256",
        "model specification release id and manifest SHA-256",
      ],
      required_per_zcta: [
        "contributing county GEOIDs",
        "relationship ids",
        "method weights",
        "unrounded county components",
        "input and output status reasons",
      ],
    },
    prohibited_claims: [
      "official USPS ZIP GDP",
      "BEA-published ZIP or ZCTA GDP",
      "economic value of a named business",
      "active-business count or collection completeness",
      "GDP by race, lineage, sex, age or other demographic",
      "statistical confidence interval",
      "production readiness or model approval",
    ],
    approval_gate: {
      status: "hold",
      required_action:
        "Explicitly approve a separate derived-model policy/specification without weakening the BEA source policy.",
      numeric_publication_before_approval: "prohibited",
    },
  };
}
function manifest(c, s, created) {
  const artifact = Buffer.from(`${JSON.stringify(s)}\n`),
    body = {
      schema_version: VERSION,
      dataset_id: ID,
      status: "published-proposed-specification-hold",
      publication_mode: "immutable-pointer-free",
      created_at: created,
      bindings: {
        evaluation: {
          release_id: c.pin.release_id,
          manifest_path: c.pin.manifest,
          manifest_sha256: c.pin.manifest_sha256,
        },
        bea_policy: {
          path: c.policyPath,
          sha256: c.m.value.bindings.bea_policy.sha256,
        },
      },
      claims: {
        network_requests: 0,
        current_pointer_written: false,
        production_enrollment: false,
        national_denominator_enrollment: false,
        model_approved: false,
        output_authorized: false,
        numeric_gdp_emitted: false,
        demographic_slices_emitted: false,
        official_usps_zip: false,
        active_business_claims: false,
      },
      artifacts: [
        {
          path: "model-specification.json",
          bytes: artifact.length,
          sha256: sha(artifact),
          record_count: 1,
        },
      ],
    };
  return { release_id: `${ID}-${sha(JSON.stringify(body))}`, ...body };
}
async function verifyDir(root, dir) {
  const canonicalRoot = await fs.realpath(root),
    canonicalDir = await fs.realpath(dir);
  ok(
    canonicalRoot === root &&
      canonicalDir === dir &&
      path
        .relative(root, dir)
        .startsWith(`data${path.sep}${ID}${path.sep}releases${path.sep}`),
    "canonical release ancestry",
  );
  const c = await context(root),
    manifestFile = path.join(dir, "manifest.json"),
    mr = await bytes(manifestFile),
    s = specification(c),
    expected = manifest(c, s, mr.value.created_at),
    created = Date.parse(mr.value.created_at),
    sourceCreated = Date.parse(c.m.value.created_at),
    mtime = Number((await fs.lstat(manifestFile, { bigint: true })).mtimeMs);
  ok(
    new Date(created).toISOString() === mr.value.created_at &&
      created >= sourceCreated &&
      created <= Date.now() + 60000 &&
      Math.abs(mtime - created) < 900000,
    "created_at bounds",
  );
  ok(JSON.stringify(mr.value) === JSON.stringify(expected), "manifest replay");
  ok(
    dir === path.join(root, "data", ID, "releases", expected.release_id),
    "content-derived release path",
  );
  const ar = await bytes(path.join(dir, "model-specification.json"));
  ok(
    ar.sha256 === expected.artifacts[0].sha256 &&
      ar.b.length === expected.artifacts[0].bytes &&
      Buffer.compare(ar.b, Buffer.from(`${JSON.stringify(s)}\n`)) === 0,
    "exact artifact replay",
  );
  ok(
    JSON.stringify((await fs.readdir(dir)).sort()) ===
      JSON.stringify(["manifest.json", "model-specification.json"]),
    "closed inventory",
  );
  return {
    verified: true,
    release_id: expected.release_id,
    manifest_sha256: mr.sha256,
    claims: expected.claims,
  };
}
export async function verifyZctaGdpModelSpecification(manifestPath, o = {}) {
  const root = path.resolve(o.root ?? ROOT),
    file = inside(root, manifestPath);
  ok(path.basename(file) === "manifest.json", "manifest basename");
  ok((await fs.realpath(file)) === file, "exact supplied manifest path");
  return verifyDir(root, path.dirname(file));
}
export async function publishZctaGdpModelSpecification(o = {}) {
  ok(o.createdAt === undefined, "createdAt override unsupported");
  const root = path.resolve(o.root ?? ROOT),
    hooks = o._testHooks;
  ok(!hooks || root !== ROOT, "test hooks require isolated root");
  o.signal?.throwIfAborted();
  const c = await context(root, o.signal, hooks),
    s = specification(c),
    created = new Date().toISOString(),
    m = manifest(c, s, created),
    base = path.join(root, "data", ID),
    releases = path.join(base, "releases"),
    staging = path.join(base, ".staging"),
    locks = path.join(base, ".locks");
  for (const d of [base, releases, staging, locks])
    await fs.mkdir(d, { recursive: true });
  const lock = path.join(locks, "build.lock"),
    owner = randomUUID(),
    ownerFile = path.join(lock, "owner");
  let lockStat,
    ownerStat,
    stage,
    stageStat,
    published = false,
    primary;
  try {
    await fs.mkdir(lock);
    lockStat = await fs.lstat(lock, { bigint: true });
    await fs.writeFile(ownerFile, owner, { flag: "wx" });
    ownerStat = await fs.lstat(ownerFile, { bigint: true });
    await hooks?.afterLock?.({ lock, ownerFile });
    o.signal?.throwIfAborted();
    stage = path.join(staging, randomUUID());
    await fs.mkdir(stage);
    stageStat = await fs.lstat(stage, { bigint: true });
    await hooks?.afterStage?.({ stage });
    o.signal?.throwIfAborted();
    for (const [name, data] of [
      ["model-specification.json", `${JSON.stringify(s)}\n`],
      ["manifest.json", `${JSON.stringify(m)}\n`],
    ]) {
      const file = path.join(stage, name),
        h = await fs.open(file, "wx");
      try {
        await h.writeFile(data);
        await h.sync();
        const st = await h.stat({ bigint: true });
        ok(
          st.isFile() &&
            st.nlink === 1n &&
            st.size === BigInt(Buffer.byteLength(data)),
          "write ownership",
        );
      } finally {
        await h.close();
      }
      await hooks?.afterWrite?.({ file, name });
      o.signal?.throwIfAborted();
    }
    await hooks?.preRename?.({ stage });
    o.signal?.throwIfAborted();
    const target = path.join(releases, m.release_id);
    await fs.rename(stage, target);
    published = true;
    await hooks?.postRename?.({ target });
    o.signal?.throwIfAborted();
    return { ...(await verifyDir(root, target)), directory: target };
  } catch (e) {
    primary = e;
    if (published) {
      e.inspection_required = true;
      e.release_id = m.release_id;
    } else if (stage && stageStat) {
      try {
        const now = await fs.lstat(stage, { bigint: true });
        ok(
          now.isDirectory() &&
            !now.isSymbolicLink() &&
            now.dev === stageStat.dev &&
            now.ino === stageStat.ino,
          "stage ownership",
        );
        await hooks?.beforeStageCleanup?.({ stage });
        const cleanupStage = await fs.lstat(stage, { bigint: true });
        ok(
          cleanupStage.isDirectory() &&
            !cleanupStage.isSymbolicLink() &&
            cleanupStage.dev === stageStat.dev &&
            cleanupStage.ino === stageStat.ino,
          "stage ownership after cleanup hook",
        );
        await fs.rm(stage, { recursive: true });
      } catch {
        e.inspection_required = true;
      }
    }
    throw e;
  } finally {
    if (lockStat) {
      try {
        const ld = await fs.lstat(lock, { bigint: true }),
          od = await fs.lstat(ownerFile, { bigint: true });
        ok(
          ld.isDirectory() &&
            !ld.isSymbolicLink() &&
            ld.dev === lockStat.dev &&
            ld.ino === lockStat.ino &&
            od.isFile() &&
            !od.isSymbolicLink() &&
            od.nlink === 1n &&
            od.dev === ownerStat.dev &&
            od.ino === ownerStat.ino,
          "lock ownership",
        );
        ok((await fs.readFile(ownerFile, "utf8")) === owner, "lock token");
        await hooks?.beforeLockCleanup?.({ lock });
        const cleanupLock = await fs.lstat(lock, { bigint: true }),
          cleanupOwner = await fs.lstat(ownerFile, { bigint: true });
        ok(
          cleanupLock.dev === lockStat.dev &&
            cleanupLock.ino === lockStat.ino &&
            cleanupOwner.dev === ownerStat.dev &&
            cleanupOwner.ino === ownerStat.ino &&
            cleanupOwner.nlink === 1n &&
            (await fs.readFile(ownerFile, "utf8")) === owner,
          "lock ownership after cleanup hook",
        );
        await fs.unlink(ownerFile);
        await fs.rmdir(lock);
      } catch (e) {
        if (primary) primary.inspection_required = true;
        else throw e;
      }
    }
  }
}
