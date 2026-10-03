import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

export const VERSION = "zcta-gdp-model-approval-packet@1.0.0";
const ID = "zcta-gdp-model-approval-packet";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SHA = /^[a-f0-9]{64}$/;
const hash = (value) => createHash("sha256").update(value).digest("hex");
const reject = (message) => { throw Error(`ZCTA GDP approval packet rejected: ${message}.`); };
const check = (value, message) => value || reject(message);
const inside = (root, relative) => {
  check(typeof relative === "string" && !path.isAbsolute(relative), "absolute path");
  const file = path.resolve(root, relative), rel = path.relative(root, file);
  check(rel && !rel.startsWith("..") && !path.isAbsolute(rel), "path escape");
  return file;
};
const stable = (a, b) => a.isFile() && b.isFile() && !a.isSymbolicLink() &&
  !b.isSymbolicLink() && a.nlink === 1n && b.nlink === 1n &&
  ["dev", "ino", "size", "mtimeNs", "ctimeNs"].every((key) => a[key] === b[key]);

async function read(file, max = 500_000, signal, parse = true) {
  signal?.throwIfAborted();
  const before = await fs.lstat(file, { bigint: true });
  check(before.isFile() && !before.isSymbolicLink() && before.nlink === 1n && before.size <= BigInt(max), "unsafe input");
  const handle = await fs.open(file, "r"), chunks = [];
  let length = 0;
  try {
    check(stable(before, await handle.stat({ bigint: true })), "input ownership");
    for (;;) {
      signal?.throwIfAborted();
      const buffer = Buffer.alloc(65_536), result = await handle.read(buffer, 0, buffer.length, null);
      if (!result.bytesRead) break;
      length += result.bytesRead;
      check(length <= max, "input ceiling");
      chunks.push(buffer.subarray(0, result.bytesRead));
    }
    check(stable(before, await handle.stat({ bigint: true })) && stable(before, await fs.lstat(file, { bigint: true })), "input drift");
  } finally { await handle.close(); }
  const bytes = Buffer.concat(chunks);
  return { bytes, sha256: hash(bytes), value: parse ? JSON.parse(bytes) : undefined };
}

async function context(root, signal) {
  const specificationCatalog = await read(inside(root, "config/datasets/zcta-gdp-model-specification.json"), 100_000, signal);
  const evaluationCatalog = await read(inside(root, "config/datasets/zcta-gdp-allocation-method-evaluation.json"), 100_000, signal);
  const specificationPin = specificationCatalog.value.retained_release;
  const evaluationPin = evaluationCatalog.value.retained_release;
  check(specificationCatalog.value.dataset_id === "zcta-gdp-model-specification" && specificationPin, "specification registration");
  check(evaluationCatalog.value.dataset_id === "zcta-gdp-allocation-method-evaluation" && evaluationPin, "evaluation registration");
  const specificationManifest = await read(inside(root, specificationPin.manifest), 100_000, signal);
  const evaluationManifest = await read(inside(root, evaluationPin.manifest), 500_000, signal);
  check(specificationManifest.sha256 === specificationPin.manifest_sha256 && specificationManifest.value.release_id === specificationPin.release_id, "specification binding");
  check(evaluationManifest.sha256 === evaluationPin.manifest_sha256 && evaluationManifest.value.release_id === evaluationPin.release_id, "evaluation binding");
  check(specificationManifest.value.bindings.evaluation.manifest_sha256 === evaluationPin.manifest_sha256, "specification/evaluation chain");
  const policyBinding = specificationManifest.value.bindings.bea_policy;
  const policy = await read(inside(root, policyBinding.path), 100_000, signal);
  check(policy.sha256 === policyBinding.sha256 && policyBinding.sha256 === evaluationManifest.value.bindings.bea_policy.sha256, "BEA policy binding");
  check(policy.value.prohibited_use?.includes("allocating national, regional, state, county, or combined-area GDP to ZIP codes or ZCTAs without a published source relationship"), "BEA allocation prohibition");
  for (const claims of [specificationManifest.value.claims, evaluationManifest.value.claims])
    check(claims.model_approved === false && claims.numeric_gdp_emitted === false, "upstream HOLD boundary");
  const relationshipMeta = evaluationManifest.value.artifacts.find((item) => item.path === "relationship-evaluation.jsonl");
  const diagnosticMeta = evaluationManifest.value.artifacts.find((item) => item.path === "county-diagnostics.jsonl");
  check(relationshipMeta?.record_count === 65_631 && diagnosticMeta?.record_count === 3_091, "evaluation artifact inventory");
  const evaluationDirectory = path.dirname(inside(root, evaluationPin.manifest));
  const relationshipRead = await read(path.join(evaluationDirectory, relationshipMeta.path), 70_000_000, signal, false);
  const diagnosticRead = await read(path.join(evaluationDirectory, diagnosticMeta.path), 3_000_000, signal, false);
  check(relationshipRead.sha256 === relationshipMeta.sha256 && relationshipRead.bytes.length === relationshipMeta.bytes, "relationship artifact binding");
  check(diagnosticRead.sha256 === diagnosticMeta.sha256 && diagnosticRead.bytes.length === diagnosticMeta.bytes, "diagnostic artifact binding");
  const parseJsonl = (input, expected, label) => {
    check(input.length > 0 && input.at(-1) === 10 && !input.includes(Buffer.from("\r")), `${label} framing`);
    const rows = input.subarray(0, -1).toString("utf8").split("\n").map((line) => JSON.parse(line));
    check(rows.length === expected, `${label} count`);
    return rows;
  };
  const relationships = parseJsonl(relationshipRead.bytes, relationshipMeta.record_count, "relationship");
  const diagnostics = parseJsonl(diagnosticRead.bytes, diagnosticMeta.record_count, "diagnostic");
  const feasibility = calculateFeasibility(relationships, diagnostics);
  return {
    specificationPin, evaluationPin, policyBinding, feasibility,
    evaluationArtifacts: {
      relationships: { path: relationshipMeta.path, bytes: relationshipMeta.bytes, record_count: relationshipMeta.record_count, sha256: relationshipMeta.sha256 },
      county_diagnostics: { path: diagnosticMeta.path, bytes: diagnosticMeta.bytes, record_count: diagnosticMeta.record_count, sha256: diagnosticMeta.sha256 },
    },
  };
}

export function calculateFeasibility(relationships, diagnostics) {
  const tolerance = 1e-10, countyPass = new Map();
  for (const row of diagnostics) {
    check(/^\d{5}$/.test(row.county_geoid ?? "") && !countyPass.has(row.county_geoid), "duplicate or invalid county diagnostic");
    const residuals = row.conservation_residual;
    const passes = [residuals?.area, residuals?.payroll_hybrid, residuals?.establishment_fallback]
      .every((value) => typeof value === "number" && Number.isFinite(value) && value <= tolerance);
    countyPass.set(row.county_geoid, passes);
  }
  const byZcta = new Map();
  for (const row of relationships) {
    check(/^\d{5}$/.test(row.zcta ?? "") && /^\d{5}$/.test(row.county_geoid ?? ""), "invalid relationship geography");
    const rows = byZcta.get(row.zcta) ?? [];
    rows.push(row); byZcta.set(row.zcta, rows);
  }
  let feasible = 0;
  for (const rows of byZcta.values()) {
    const material = rows.filter((row) => row.material_intersection === true);
    const passes = material.length > 0 && material.every((row) =>
      row.direct_bea_county_input === true &&
      row.payroll_input_state === "observed" &&
      row.establishment_input_state === "observed" &&
      [row.area_proxy_weight, row.payroll_hybrid_weight, row.establishment_fallback_weight]
        .every((value) => typeof value === "number" && Number.isFinite(value) && value >= 0) &&
      countyPass.get(row.county_geoid) === true);
    if (passes) feasible += 1;
  }
  return {
    total_zctas: byZcta.size,
    technically_feasible_all_methods: feasible,
    withheld: byZcta.size - feasible,
  };
}

export function approvalPacket(context) {
  return {
    schema_version: "1.0.0",
    packet_id: "county-to-2020-zcta-gdp-research-scenario-v1",
    decision_status: "hold",
    decision_requested: "Explicit approval of a separate derived-model policy and specification is required before any numeric output is built or published.",
    scope: { geography: "2020 Census ZCTA", official_usps_zip: false, measure: "modeled current-dollar GDP research scenario", bea_reference_year: 2024, zbp_reference_year: 2023 },
    feasibility: {
      ...context.feasibility,
      conservation: `${context.feasibility.technically_feasible_all_methods} + ${context.feasibility.withheld} = ${context.feasibility.total_zctas}`,
      feasible_when_all: [
        "every material ZCTA/county relationship has a direct BEA county GDP input",
        "every material relationship has an observed payroll input and an observed establishment input",
        "each contributing county has positive denominators for polygon-area, payroll-area-hybrid, and establishment-area methods",
        "each method passes county weight conservation tolerance 1e-10",
      ],
      withhold_when_any: [
        "a material relationship lacks direct BEA county GDP",
        "a contributing county GDP value is null or flagged",
        "a primary or sensitivity proxy input or weight is unavailable",
        "any county/method conservation check fails",
      ],
      missing_values: "null-and-withhold-never-zero",
      interpretation: "Technical feasibility is not approval, publication authority, coverage of operational USPS ZIP codes, or evidence of observed ZCTA GDP.",
    },
    proposed_methods: { primary: "zbp-payroll-area-hybrid", sensitivity: ["polygon-area", "zbp-establishment-area-fallback"], fallback: null },
    required_decisions: [
      "Approve or reject the derived-model policy independently of the BEA source policy.",
      "Accept or revise the three-method complete-case gate and its 3215 withheld ZCTAs.",
      "Accept or revise the mixed 2020/2023/2024 vintage disclosure.",
      "Define permitted exports and labels; official USPS ZIP GDP and BEA-published ZCTA GDP remain prohibited claims.",
    ],
    bindings: {
      model_specification: { release_id: context.specificationPin.release_id, manifest_path: context.specificationPin.manifest, manifest_sha256: context.specificationPin.manifest_sha256 },
      allocation_evaluation: { release_id: context.evaluationPin.release_id, manifest_path: context.evaluationPin.manifest, manifest_sha256: context.evaluationPin.manifest_sha256 },
      allocation_evaluation_artifacts: context.evaluationArtifacts,
      bea_policy: { path: context.policyBinding.path, sha256: context.policyBinding.sha256 },
    },
    claims: { model_approved: false, output_authorized: false, numeric_gdp_emitted: false, demographic_slices_emitted: false, official_usps_zip: false, network_requests: 0, current_pointer_written: false, production_enrollment: false },
  };
}

function manifest(packet, createdAt) {
  const artifact = Buffer.from(`${JSON.stringify(packet)}\n`);
  const body = { schema_version: VERSION, dataset_id: ID, status: "published-approval-packet-hold", publication_mode: "immutable-pointer-free", created_at: createdAt, bindings: packet.bindings, claims: packet.claims, summary: packet.feasibility, artifacts: [{ path: "approval-packet.json", bytes: artifact.length, sha256: hash(artifact), record_count: 1 }] };
  return { release_id: `${ID}-${hash(JSON.stringify(body))}`, ...body };
}

async function verifyDirectory(root, directory, signal) {
  const manifestRead = await read(path.join(directory, "manifest.json"), 500_000, signal);
  const contextValue = await context(root, signal), packet = approvalPacket(contextValue);
  const expected = manifest(packet, manifestRead.value.created_at);
  check(JSON.stringify(manifestRead.value) === JSON.stringify(expected), "manifest replay");
  check(directory === path.join(root, "data", ID, "releases", expected.release_id), "release path");
  const created = Date.parse(expected.created_at), mtime = Number((await fs.lstat(path.join(directory, "manifest.json"), { bigint: true })).mtimeMs);
  check(Number.isFinite(created) && created <= Date.now() + 60_000 && Math.abs(mtime - created) < 900_000, "created_at bounds");
  const artifactRead = await read(path.join(directory, "approval-packet.json"), 500_000, signal), expectedArtifact = Buffer.from(`${JSON.stringify(packet)}\n`);
  check(artifactRead.sha256 === expected.artifacts[0].sha256 && Buffer.compare(artifactRead.bytes, expectedArtifact) === 0, "artifact replay");
  check(JSON.stringify((await fs.readdir(directory)).sort()) === JSON.stringify(["approval-packet.json", "manifest.json"]), "closed inventory");
  return { verified: true, release_id: expected.release_id, manifest_sha256: manifestRead.sha256, summary: expected.summary, claims: expected.claims };
}

export async function verifyZctaGdpModelApprovalPacket(manifestPath, options = {}) {
  const root = path.resolve(options.root ?? ROOT), file = inside(root, manifestPath);
  check(path.basename(file) === "manifest.json", "manifest basename");
  check((await fs.realpath(file)) === file, "manifest identity");
  return verifyDirectory(root, path.dirname(file), options.signal);
}

export async function publishZctaGdpModelApprovalPacket(options = {}) {
  check(options.createdAt === undefined, "createdAt override unsupported");
  const root = path.resolve(options.root ?? ROOT), contextValue = await context(root, options.signal), packet = approvalPacket(contextValue), createdAt = new Date().toISOString(), outputManifest = manifest(packet, createdAt);
  const base = path.join(root, "data", ID), releases = path.join(base, "releases"), staging = path.join(base, ".staging"), locks = path.join(base, ".locks");
  for (const directory of [base, releases, staging, locks]) await fs.mkdir(directory, { recursive: true });
  const lock = path.join(locks, "build.lock"), owner = randomUUID(), ownerFile = path.join(lock, "owner"), stage = path.join(staging, randomUUID());
  let published = false;
  try {
    await fs.mkdir(lock); await fs.writeFile(ownerFile, owner, { flag: "wx" });
    await fs.mkdir(stage);
    options.signal?.throwIfAborted();
    await fs.writeFile(path.join(stage, "approval-packet.json"), `${JSON.stringify(packet)}\n`, { flag: "wx" });
    await fs.writeFile(path.join(stage, "manifest.json"), `${JSON.stringify(outputManifest)}\n`, { flag: "wx" });
    const target = path.join(releases, outputManifest.release_id);
    await fs.rename(stage, target); published = true;
    return { ...(await verifyDirectory(root, target, options.signal)), directory: target };
  } catch (error) {
    if (published) error.inspection_required = true;
    else await fs.rm(stage, { recursive: true, force: true });
    throw error;
  } finally {
    try {
      check((await fs.readFile(ownerFile, "utf8")) === owner, "lock token");
      await fs.unlink(ownerFile); await fs.rmdir(lock);
    } catch (error) { if (published) error.inspection_required = true; }
  }
}

export async function readZctaGdpModelApprovalPacket(options = {}) {
  const root = path.resolve(options.root ?? ROOT), registration = await read(inside(root, "config/datasets/zcta-gdp-model-approval-packet.json"), 100_000, options.signal);
  const pin = registration.value.retained_release;
  check(registration.value.dataset_id === ID && registration.value.runtime_pointer === null && registration.value.production_enrollment === false, "registration");
  check(pin && SHA.test(pin.manifest_sha256), "registration pin");
  const verification = await verifyZctaGdpModelApprovalPacket(pin.manifest, { root, signal: options.signal });
  check(verification.manifest_sha256 === pin.manifest_sha256, "registered manifest hash");
  const artifact = await read(path.join(path.dirname(inside(root, pin.manifest)), "approval-packet.json"), 500_000, options.signal);
  return artifact.value;
}
