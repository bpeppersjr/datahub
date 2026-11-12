import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";

export const OPERATIONAL_INDUSTRY_CENSUS_STATUS_VERSION = "operational-industry-census-status@1.0.0";
const POINTER = "data/business-baselines/census-zbp/current.json";
const ORDER = ["childcare", "construction", "financial-services", "health-care", "local-business-licenses", "retail-consumer", "sales-tax-outlets", "tax-exempt-organizations", "transportation"];
const MAPPING = Object.freeze({
  childcare: ["624410", "Child Care Services"],
  construction: ["23----", "Construction"],
  "financial-services": ["52----", "Finance and Insurance"],
  "health-care": ["62----", "Health Care and Social Assistance"],
  "retail-consumer": ["44----", "Retail Trade"],
  transportation: ["48----", "Transportation and Warehousing"],
});
const REASONS = Object.freeze({
  "local-business-licenses": "License coverage spans industries and cannot be represented by one NAICS row.",
  "sales-tax-outlets": "Sales-tax permit coverage spans taxable industries and cannot be represented by one NAICS row.",
  "tax-exempt-organizations": "Tax-exempt status is an organization attribute, not one NAICS industry.",
});
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const fail = message => { throw new Error(`Operational industry Census status rejected: ${message}.`); };
const inside = (root, candidate) => { const relative = path.relative(root, candidate); return relative && !relative.startsWith("..") && !path.isAbsolute(relative); };

async function fixedFile(root, relative, maximum) {
  const candidate = path.resolve(root, ...relative.split("/"));
  if (!inside(root, candidate)) fail("path escaped datahub");
  const resolved = await realpath(candidate);
  if (!inside(root, resolved)) fail("resolved path escaped datahub");
  const before = await lstat(resolved, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n || before.size <= 0n || before.size > BigInt(maximum)) fail("file is not bounded and regular");
  const bytes = await readFile(resolved), after = await lstat(resolved, { bigint: true });
  if (BigInt(bytes.length) !== before.size || after.dev !== before.dev || after.ino !== before.ino || after.size !== before.size || after.mtimeNs !== before.mtimeNs) fail("file changed while read");
  return { bytes, sha256: digest(bytes), path: resolved };
}

export async function readOperationalIndustryCensusStatus({ root = APP_ROOT } = {}) {
  root = await realpath(path.resolve(root));
  const pointerRead = await fixedFile(root, POINTER, 16_384), pointer = JSON.parse(pointerRead.bytes);
  if (pointer.dataset_id !== "census-zbp-baseline" || !/^releases\/[A-Za-z0-9-]+\/manifest\.json$/.test(pointer.manifest ?? "")) fail("pointer identity");
  const manifestRelative = path.posix.join(path.posix.dirname(POINTER), pointer.manifest);
  const manifestRead = await fixedFile(root, manifestRelative, 128_000), manifest = JSON.parse(manifestRead.bytes);
  if (manifest.dataset_id !== pointer.dataset_id || manifest.release_id !== pointer.release_id || manifest.reference_year !== 2023 || manifest.complete_national_release !== true) fail("manifest identity");
  const artifact = manifest.artifacts?.find(item => item.path === "derived/naics-coverage.jsonl");
  if (!artifact || artifact.artifact_type !== "naics-coverage-jsonl" || !Number.isSafeInteger(artifact.bytes) || !/^[a-f0-9]{64}$/.test(artifact.sha256 ?? "")) fail("NAICS catalog descriptor");
  const catalogRelative = path.posix.join(path.posix.dirname(manifestRelative), artifact.path);
  const catalogRead = await fixedFile(root, catalogRelative, 2_000_000);
  if (catalogRead.bytes.length !== artifact.bytes || catalogRead.sha256 !== artifact.sha256) fail("NAICS catalog integrity");
  const rows = catalogRead.bytes.toString("utf8").trim().split(/\r?\n/).map(line => JSON.parse(line));
  const byCode = new Map(rows.map(row => [row.naics_code, row]));
  const industries = ORDER.map(id => {
    const mapping = MAPPING[id];
    if (!mapping) return { id, aggregate_status: "not-comparable-to-single-naics", naics_code: null, naics_label: null, published_zip_rows: null, published_establishments: null, reason: REASONS[id] };
    const row = byCode.get(mapping[0]);
    if (!row || !Number.isSafeInteger(row.published_zip_rows) || row.published_zip_rows < 1 || !Number.isSafeInteger(row.published_establishments) || row.published_establishments < 1) fail(`missing mapped NAICS row ${mapping[0]}`);
    return { id, aggregate_status: "retained-annual-employer-establishment-aggregate", naics_code: mapping[0], naics_label: mapping[1], published_zip_rows: row.published_zip_rows, published_establishments: row.published_establishments, reason: null };
  });
  return Object.freeze({
    schema_version: OPERATIONAL_INDUSTRY_CENSUS_STATUS_VERSION,
    source: { dataset_id: manifest.dataset_id, release_id: manifest.release_id, reference_year: manifest.reference_year, pointer_sha256: pointerRead.sha256, manifest_sha256: manifestRead.sha256, naics_catalog_sha256: catalogRead.sha256 },
    industries,
    claims: { annual_aggregate_context_only: true, named_businesses: false, current_operations_verified: false, business_completeness: null, industry_completeness: null, state_access_gap_resolution_performed: false, zip5_is_zcta: false, zip4_joined: false, network_requests: 0, runtime_writes: 0 },
  });
}
