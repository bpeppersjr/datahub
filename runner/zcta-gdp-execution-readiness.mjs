import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { APP_ROOT } from "./paths.mjs";
import {
  verifyZctaGdpModelApprovalPacket,
} from "./zcta-gdp-model-approval-packet.mjs";

export const VERSION = "zcta-gdp-execution-readiness@1.0.0";
const ID = "zcta-gdp-execution-readiness",
  SHA = /^[a-f0-9]{64}$/;
const hash = (b) => createHash("sha256").update(b).digest("hex"),
  check = (v, m) => {
    if (!v) throw Error(`ZCTA GDP execution readiness rejected: ${m}.`);
  };
const inside = (root, p) => {
  check(typeof p === "string" && !path.isAbsolute(p), "absolute path");
  const f = path.resolve(root, p),
    r = path.relative(root, f);
  check(r && !r.startsWith("..") && !path.isAbsolute(r), "path escape");
  return f;
};
const stable = (a, b) =>
  a.isFile() &&
  b.isFile() &&
  !a.isSymbolicLink() &&
  !b.isSymbolicLink() &&
  a.nlink === 1n &&
  b.nlink === 1n &&
  ["dev", "ino", "size", "mtimeNs", "ctimeNs"].every((k) => a[k] === b[k]);
async function safeDirectory(directory) {
  const stat = await fs.lstat(directory);
  check(
    stat.isDirectory() &&
      !stat.isSymbolicLink() &&
      (await fs.realpath(directory)) === directory,
    "unsafe output directory",
  );
}
async function read(file, max, signal, parse = true) {
  signal?.throwIfAborted();
  check((await fs.realpath(file)) === file, "canonical input");
  const before = await fs.lstat(file, { bigint: true }),
    h = await fs.open(file, "r"),
    parts = [];
  let n = 0;
  try {
    check(
      stable(before, await h.stat({ bigint: true })) &&
        before.size <= BigInt(max),
      "unsafe input",
    );
    for (;;) {
      signal?.throwIfAborted();
      const b = Buffer.alloc(65536),
        r = await h.read(b, 0, b.length, null);
      if (!r.bytesRead) break;
      n += r.bytesRead;
      check(n <= max, "input ceiling");
      parts.push(b.subarray(0, r.bytesRead));
    }
    check(
      stable(before, await h.stat({ bigint: true })) &&
        stable(before, await fs.lstat(file, { bigint: true })),
      "input drift",
    );
  } finally {
    await h.close();
  }
  const bytes = Buffer.concat(parts);
  return { bytes, sha256: hash(bytes), value: parse ? JSON.parse(bytes) : undefined };
}
function jsonl(bytes, count, label) {
  check(bytes.at(-1) === 10 && !bytes.includes(Buffer.from("\r")), "framing");
  const rows = bytes
    .subarray(0, -1)
    .toString("utf8")
    .split("\n")
    .map(JSON.parse);
  check(rows.length === count, `${label} count`);
  return rows;
}
async function context(root, signal) {
  const catalog = await read(
      inside(root, "config/datasets/zcta-gdp-model-approval-packet.json"),
      100000,
      signal,
    ),
    pin = catalog.value.retained_release;
  check(
    catalog.value.dataset_id === "zcta-gdp-model-approval-packet" &&
      catalog.value.runtime_pointer === null &&
      catalog.value.production_enrollment === false &&
      pin &&
      SHA.test(pin.manifest_sha256),
    "approval registration",
  );
  const verified = await verifyZctaGdpModelApprovalPacket(pin.manifest, {
    root,
    signal,
  });
  check(
    verified.release_id === pin.release_id &&
      verified.manifest_sha256 === pin.manifest_sha256 &&
      verified.claims.model_approved === false &&
      verified.claims.output_authorized === false &&
      verified.claims.numeric_gdp_emitted === false,
    "approval HOLD",
  );
  const approvalManifest = await read(inside(root, pin.manifest), 500000, signal),
    approvalArtifact = approvalManifest.value.artifacts?.find(
      (item) => item.path === "approval-packet.json",
    );
  check(
    approvalManifest.sha256 === pin.manifest_sha256 &&
      approvalManifest.value.release_id === pin.release_id &&
      approvalArtifact?.record_count === 1 &&
      SHA.test(approvalArtifact.sha256),
    "approval artifact registration",
  );
  const packetRead = await read(
      path.join(path.dirname(inside(root, pin.manifest)), approvalArtifact.path),
      500000,
      signal,
    ),
    packet = packetRead.value;
  check(
    packetRead.sha256 === approvalArtifact.sha256 &&
      packetRead.bytes.length === approvalArtifact.bytes,
    "approval artifact binding",
  );
  check(
    packet.decision_status === "hold" &&
      packet.claims.model_approved === false &&
      packet.claims.output_authorized === false &&
      packet.claims.numeric_gdp_emitted === false,
    "packet HOLD",
  );
  const evaluation = packet.bindings.allocation_evaluation,
    dir = path.dirname(inside(root, evaluation.manifest_path)),
    relMeta = packet.bindings.allocation_evaluation_artifacts.relationships,
    diagMeta =
      packet.bindings.allocation_evaluation_artifacts.county_diagnostics;
  const rel = await read(path.join(dir, relMeta.path), 70000000, signal, false),
    diag = await read(path.join(dir, diagMeta.path), 3000000, signal, false);
  check(
    rel.sha256 === relMeta.sha256 &&
      rel.bytes.length === relMeta.bytes &&
      diag.sha256 === diagMeta.sha256 &&
      diag.bytes.length === diagMeta.bytes,
    "evaluation artifact binding",
  );
  return {
    pin,
    packet,
    relationships: jsonl(rel.bytes, 65631, "relationship"),
    diagnostics: jsonl(diag.bytes, 3091, "diagnostic"),
  };
}
export function deriveExecutionReadiness(c, signal) {
  const tolerance = 1e-10,
    counties = new Map();
  for (const d of c.diagnostics) {
    signal?.throwIfAborted();
    const residual = d.conservation_residual,
      pass = ["area", "payroll_hybrid", "establishment_fallback"].every(
        (k) =>
          typeof residual?.[k] === "number" &&
          Number.isFinite(residual[k]) &&
          residual[k] <= tolerance,
      );
    check(
      /^\d{5}$/.test(d.county_geoid) && !counties.has(d.county_geoid),
      "county diagnostics",
    );
    counties.set(d.county_geoid, pass);
  }
  const groups = new Map();
  for (const r of c.relationships) {
    signal?.throwIfAborted();
    check(
      /^\d{5}$/.test(r.zcta) && /^\d{5}$/.test(r.county_geoid),
      "relationship geography",
    );
    const a = groups.get(r.zcta) ?? [];
    a.push(r);
    groups.set(r.zcta, a);
  }
  const rows = [...groups]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([zcta, all]) => {
      const material = all.filter((r) => r.material_intersection === true),
        reasons = new Set();
      for (const r of material) {
        if (r.direct_bea_county_input !== true)
          reasons.add("missing-direct-county-input");
        if (r.payroll_input_state !== "observed")
          reasons.add(`payroll-input-${r.payroll_input_state}`);
        if (r.establishment_input_state !== "observed")
          reasons.add(`establishment-input-${r.establishment_input_state}`);
        if (!(
          typeof r.area_proxy_weight === "number" &&
          Number.isFinite(r.area_proxy_weight) &&
          r.area_proxy_weight >= 0
        ))
          reasons.add("area-weight-unavailable");
        if (!(
          typeof r.payroll_hybrid_weight === "number" &&
          Number.isFinite(r.payroll_hybrid_weight) &&
          r.payroll_hybrid_weight >= 0
        ))
          reasons.add("payroll-weight-unavailable");
        if (!(
          typeof r.establishment_fallback_weight === "number" &&
          Number.isFinite(r.establishment_fallback_weight) &&
          r.establishment_fallback_weight >= 0
        ))
          reasons.add("establishment-weight-unavailable");
        if (counties.get(r.county_geoid) !== true)
          reasons.add("county-conservation-failed");
      }
      if (!material.length) reasons.add("no-material-relationship");
      const status = reasons.size ? "withheld" : "feasible-on-approval";
      return {
        schema_version: "1.0.0",
        zcta,
        execution_status: status,
        decision_status: "hold",
        relationship_count: all.length,
        material_relationship_count: material.length,
        relationship_ids: material.map((r) => r.relationship_id).sort(),
        county_geoids: [...new Set(material.map((r) => r.county_geoid))].sort(),
        diagnostics: {
          direct_county_input_complete: material.every(
            (r) => r.direct_bea_county_input === true,
          ),
          payroll_inputs_complete: material.every(
            (r) => r.payroll_input_state === "observed",
          ),
          establishment_inputs_complete: material.every(
            (r) => r.establishment_input_state === "observed",
          ),
          area_weights_complete: material.every(
            (r) =>
              typeof r.area_proxy_weight === "number" &&
              Number.isFinite(r.area_proxy_weight),
          ),
          payroll_weights_complete: material.every(
            (r) =>
              typeof r.payroll_hybrid_weight === "number" &&
              Number.isFinite(r.payroll_hybrid_weight),
          ),
          establishment_weights_complete: material.every(
            (r) =>
              typeof r.establishment_fallback_weight === "number" &&
              Number.isFinite(r.establishment_fallback_weight),
          ),
          county_conservation_complete: material.every(
            (r) => counties.get(r.county_geoid) === true,
          ),
        },
        withhold_reasons: [...reasons].sort(),
        vintages: { zcta_geography: 2020, zbp: 2023, bea: 2024 },
        total_model: {
          approval_required: true,
          output_authorized: false,
          numeric_output: false,
        },
        industry_readiness: {
          status: "unavailable",
          county_industry_input: false,
          governed_naics_bea_concordance: false,
          nonemployer_zip_allocation: false,
          numeric_output_authorized: false,
        },
        claims: {
          official_usps_zip: false,
          observed_zcta_gdp: false,
          numeric_gdp: false,
          industry_gdp: false,
          demographic_gdp: false,
        },
      };
    });
  const feasible = rows.filter(
    (r) => r.execution_status === "feasible-on-approval",
  ).length;
  check(
    rows.length === 33791 &&
      feasible === 30576 &&
      rows.length - feasible === 3215,
    "expected feasibility conservation",
  );
  return rows;
}
function shape(c, rows, created) {
  const raw = Buffer.concat(
      rows.map((r) => Buffer.from(`${JSON.stringify(r)}\n`)),
    ),
    body = {
      schema_version: VERSION,
      dataset_id: ID,
      status: "published-execution-readiness-hold",
      publication_mode: "immutable-pointer-free",
      created_at: created,
      bindings: {
        approval_packet: {
          release_id: c.pin.release_id,
          manifest_path: c.pin.manifest,
          manifest_sha256: c.pin.manifest_sha256,
        },
        model_specification: c.packet.bindings.model_specification,
        allocation_evaluation: c.packet.bindings.allocation_evaluation,
        allocation_evaluation_artifacts:
          c.packet.bindings.allocation_evaluation_artifacts,
        bea_policy: c.packet.bindings.bea_policy,
      },
      summary: { zctas: 33791, feasible_on_approval: 30576, withheld: 3215 },
      industry_readiness: {
        status: "unavailable",
        blockers: [
          "no-governed-county-industry-gdp-input",
          "no-governed-naics-to-bea-concordance",
          "nonemployer-zip-allocation-unavailable",
        ],
        numeric_output_authorized: false,
      },
      claims: {
        network_requests: 0,
        current_pointer_written: false,
        production_enrollment: false,
        model_approved: false,
        output_authorized: false,
        numeric_gdp_emitted: false,
        industry_gdp_emitted: false,
        demographic_gdp_emitted: false,
        official_usps_zip: false,
      },
      artifacts: [
        {
          path: "zcta-execution-readiness.jsonl",
          bytes: raw.length,
          sha256: hash(raw),
          record_count: rows.length,
        },
      ],
    };
  return {
    manifest: { release_id: `${ID}-${hash(JSON.stringify(body))}`, ...body },
    raw,
  };
}
async function verifyDir(root, dir, signal) {
  const mr = await read(path.join(dir, "manifest.json"), 500000, signal),
    c = await context(root, signal),
    rows = deriveExecutionReadiness(c, signal),
    expected = shape(c, rows, mr.value.created_at),
    created = Date.parse(mr.value.created_at),
    mtime = Number(
      (await fs.lstat(path.join(dir, "manifest.json"), { bigint: true }))
        .mtimeMs,
    );
  check(
    new Date(created).toISOString() === mr.value.created_at &&
      created <= Date.now() + 60000 &&
      Math.abs(mtime - created) < 900000,
    "clock",
  );
  check(
    JSON.stringify(mr.value) === JSON.stringify(expected.manifest) &&
      dir ===
        path.join(root, "data", ID, "releases", expected.manifest.release_id),
    "manifest replay",
  );
  const ar = await read(
    path.join(dir, "zcta-execution-readiness.jsonl"),
    40000000,
    signal,
    false,
  );
  check(
    ar.sha256 === expected.manifest.artifacts[0].sha256 &&
      Buffer.compare(ar.bytes, expected.raw) === 0,
    "artifact replay",
  );
  check(
    JSON.stringify((await fs.readdir(dir)).sort()) ===
      JSON.stringify(["manifest.json", "zcta-execution-readiness.jsonl"]),
    "closed inventory",
  );
  return {
    verified: true,
    release_id: expected.manifest.release_id,
    manifest_sha256: mr.sha256,
    summary: expected.manifest.summary,
    claims: expected.manifest.claims,
    created_at: expected.manifest.created_at,
    artifact: expected.manifest.artifacts[0],
  };
}
export async function verifyZctaGdpExecutionReadiness(manifestPath, o = {}) {
  const root = path.resolve(o.root ?? APP_ROOT),
    file = inside(root, manifestPath);
  check(
    path.basename(file) === "manifest.json" &&
      (await fs.realpath(file)) === file,
    "manifest identity",
  );
  return verifyDir(root, path.dirname(file), o.signal);
}
export async function publishZctaGdpExecutionReadiness(o = {}) {
  check(o.createdAt === undefined, "createdAt override unsupported");
  const root = path.resolve(o.root ?? APP_ROOT),
    c = await context(root, o.signal),
    rows = deriveExecutionReadiness(c, o.signal),
    x = shape(c, rows, new Date().toISOString()),
    base = path.join(root, "data", ID),
    releases = path.join(base, "releases"),
    staging = path.join(base, ".staging"),
    locks = path.join(base, ".locks");
  for (const d of [base, releases, staging, locks])
    await fs.mkdir(d, { recursive: true });
  for (const d of [base, releases, staging, locks]) await safeDirectory(d);
  const lock = path.join(locks, "build.lock"),
    owner = randomUUID(),
    stage = path.join(staging, randomUUID());
  let published = false;
  await fs.mkdir(lock);
  try {
    await safeDirectory(lock);
    await fs.writeFile(path.join(lock, "owner"), owner, { flag: "wx" });
    await fs.mkdir(stage);
    await safeDirectory(stage);
    o.signal?.throwIfAborted();
    await fs.writeFile(
      path.join(stage, "zcta-execution-readiness.jsonl"),
      x.raw,
      { flag: "wx" },
    );
    await fs.writeFile(
      path.join(stage, "manifest.json"),
      `${JSON.stringify(x.manifest)}\n`,
      { flag: "wx" },
    );
    const target = path.join(releases, x.manifest.release_id);
    await fs.rename(stage, target);
    published = true;
    return { ...(await verifyDir(root, target, o.signal)), directory: target };
  } catch (e) {
    if (published) e.inspection_required = true;
    else await fs.rm(stage, { recursive: true, force: true });
    throw e;
  } finally {
    try {
      check(
        (await fs.readFile(path.join(lock, "owner"), "utf8")) === owner,
        "lock token",
      );
      await fs.rm(lock, { recursive: true });
    } catch (e) {
      if (published) e.inspection_required = true;
      throw e;
    }
  }
}
