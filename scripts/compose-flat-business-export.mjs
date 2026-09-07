#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import { once } from "node:events";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { finished } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import { fileURLToPath } from "node:url";
import { APP_ROOT, assertInsideApp, relativeToApp } from "../runner/paths.mjs";

const DEFAULT_SOURCE = "data/business-registry/current.json";
const DEFAULT_OUTPUT = "data/exports/flat-business/builds";
const PUBLIC_POLICIES = new Set(["public", "public-open-ny-terms", "public-factual-fields-with-source-limitations"]);
const LOCAL_POLICIES = new Set([...PUBLIC_POLICIES, "local-review-only"]);
const REQUIRED_PROVENANCE_FIELDS = ["source_id", "source_release_id", "source_record_id", "ingest_run_id", "policy_id", "export_policy", "transformation_version", "dataset_id", "source_dataset_release_id"];

// Must stay aligned with runner/business-map-store.mjs. The map's registrations
// category intentionally has no physical-location profile source IDs.
export const BUSINESS_FLATFILE_CATEGORIES = Object.freeze({
  "retail-consumer": ["usda-snap-current-retailers", "new-york-agriculture-markets-retail-food-stores", "california-abc-daily-active-licenses"],
  "health-care": ["cms-nppes-monthly-v2"],
  "financial-services": ["fdic-bankfind-current-structure", "ncua-final-quarterly-call-report"],
  "food-production": ["usda-fsis-active-mpi-directory"],
  "environmental-facilities": ["epa-echo-exporter-active-facility"],
  transportation: ["fmcsa-company-census-active-us-principal-office"],
  "licensed-businesses": ["alaska-dcced-active-business-licenses", "los-angeles-office-of-finance-active-businesses", "texas-comptroller-active-sales-tax-permits", "city-of-chicago-bacp-current-active-business-licenses", "dc-dlcp-active-basic-business-licenses", "nyc-dcwp-issued-licenses-active-premises"],
});
export const AVAILABLE_EXPORT_FIELDS = Object.freeze([
  "business_name", "profile_id", "street", "unit_or_additional", "city", "state", "zip_code", "zip4", "latitude", "longitude",
  "industry_categories", "source_id", "source_release_id", "source_record_id", "ingest_run_id", "source_status_value",
  "source_status_scope", "source_status_observed_at", "observed_at", "policy_id", "export_policy", "transformation_version",
  "dataset_id", "source_dataset_release_id", "external_identifiers", "site_entity_id", "establishment_entity_id", "organization_entity_id",
]);

export function usage() { return `Compose a governed, streamed flat business export.\n\nUsage:\n  node scripts/compose-flat-business-export.mjs [options]\n\nOptions:\n  --source <path>              Governed pointer or manifest; repeatable\n  --category <id>[,<id>...]    Map category; repeatable\n  --source-id <id>[,<id>...]   Source filter; repeatable\n  --state <US>[,<US>...]       State filter; repeatable\n  --field <name>[,<name>...]   Selected columns; repeatable\n  --format <csv|jsonl|both>    Default: both\n  --policy-mode <mode>         public-only (default) or explicit local-review\n  --output <path>              Default: ${DEFAULT_OUTPUT}\n  --output-prefix <name>       Output folder name\n  --help                       Show help\n`; }

const split = (v) => String(v).split(",").map((x) => x.trim()).filter(Boolean);
const contained = (base, target) => { const rel = path.relative(base, target); return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel)); };
const appPath = (v) => assertInsideApp(path.resolve(APP_ROOT, v));
const state = (v) => /^[A-Z]{2}$/.test(String(v ?? "").trim().toUpperCase()) ? String(v).trim().toUpperCase() : null;
const zip5 = (v) => String(v ?? "").match(/^(\d{5})(?:-?\d{4})?$/)?.[1] ?? null;
const zip4 = (record) => { const direct = String(record.address?.zip4 ?? "").replace(/\D/g, ""); return /^\d{4}$/.test(direct) ? direct : String(record.address?.zip_code ?? "").match(/^\d{5}-?(\d{4})$/)?.[1] ?? null; };
const coordinates = (record) => {
  const rawLatitude = record.location?.coordinates?.[1] ?? record.location?.latitude;
  const rawLongitude = record.location?.coordinates?.[0] ?? record.location?.longitude;
  if (rawLatitude === null || rawLatitude === undefined || rawLatitude === "" || rawLongitude === null || rawLongitude === undefined || rawLongitude === "") return [null, null];
  const latitude = Number(rawLatitude); const longitude = Number(rawLongitude);
  return Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180 ? [latitude, longitude] : [null, null];
};
const categoriesFor = (id) => Object.entries(BUSINESS_FLATFILE_CATEGORIES).filter(([, ids]) => ids.includes(id)).map(([category]) => category);
const csv = (v) => { const isString = typeof v === "string"; let text = v == null ? "" : isString ? v : JSON.stringify(v); if (isString && /^[=+\-@\t\r]/.test(text)) text = `'${text}`; return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text; };

export function parseArguments(argv = process.argv.slice(2)) {
  const out = { sources: [], categories: [], sourceIds: [], states: [], fields: [], format: "both", policyMode: "public-only", output: DEFAULT_OUTPUT, outputPrefix: null, help: false };
  const repeated = { "--source": "sources", "--category": "categories", "--source-id": "sourceIds", "--state": "states", "--field": "fields" };
  const scalar = { "--format": "format", "--policy-mode": "policyMode", "--output": "output", "--output-prefix": "outputPrefix" };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i]; if (flag === "--help") { out.help = true; continue; }
    if (!repeated[flag] && !scalar[flag]) throw new Error(`Unknown argument: ${flag}`);
    if (!argv[i + 1]) throw new Error(`${flag} requires a value.`);
    if (repeated[flag]) out[repeated[flag]].push(...split(argv[++i])); else out[scalar[flag]] = argv[++i];
  }
  out.sources = out.sources.length ? [...new Set(out.sources)] : [DEFAULT_SOURCE];
  out.categories = [...new Set(out.categories)]; out.sourceIds = [...new Set(out.sourceIds)];
  out.states = [...new Set(out.states.map(state))]; out.fields = out.fields.length ? [...new Set([...out.fields, ...REQUIRED_PROVENANCE_FIELDS])] : [...AVAILABLE_EXPORT_FIELDS];
  if (out.states.includes(null)) throw new Error("States must be two-letter abbreviations.");
  for (const id of out.categories) if (!BUSINESS_FLATFILE_CATEGORIES[id]) throw new Error(`Unknown category: ${id}`);
  for (const field of out.fields) if (!AVAILABLE_EXPORT_FIELDS.includes(field)) throw new Error(`Unknown field: ${field}`);
  if (!["csv", "jsonl", "both"].includes(out.format)) throw new Error("--format must be csv, jsonl, or both.");
  if (!["public-only", "local-review"].includes(out.policyMode)) throw new Error("--policy-mode must be public-only or local-review.");
  if (out.outputPrefix && !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(out.outputPrefix)) throw new Error("Invalid --output-prefix.");
  return out;
}

async function hashFile(file) { const hash = createHash("sha256"); let bytes = 0; for await (const chunk of createReadStream(file)) { bytes += chunk.length; hash.update(chunk); } return { bytes, sha256: hash.digest("hex") }; }
async function descriptor(input) {
  const inputPath = appPath(input); const raw = JSON.parse(await readFile(inputPath, "utf8")); let manifest = raw; let manifestPath = inputPath; let pointerPath = null;
  if (!Array.isArray(raw.artifacts)) {
    if (!raw.dataset_id || !raw.release_id || typeof raw.manifest !== "string") throw new Error(`${relativeToApp(inputPath)} is not a governed pointer or manifest.`);
    pointerPath = inputPath; manifestPath = path.resolve(path.dirname(inputPath), raw.manifest);
    if (!contained(path.dirname(inputPath), manifestPath)) throw new Error(`Pointer escapes its release root: ${input}`);
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    if (manifest.dataset_id !== raw.dataset_id || manifest.release_id !== raw.release_id) throw new Error(`Pointer/manifest identity mismatch: ${input}`);
  }
  if (!manifest.dataset_id || !manifest.release_id || !Array.isArray(manifest.artifacts) || !String(manifest.status ?? "").startsWith("published")) throw new Error(`Invalid or unpublished governed manifest: ${relativeToApp(manifestPath)}`);
  return { input, pointerPath, manifestPath, manifest, manifestHash: await hashFile(manifestPath) };
}
function profileArtifacts(source) { return source.manifest.artifacts.filter((a) => /location-profile/.test(String(a.artifact_type ?? "")) && String(a.path ?? "").endsWith(".jsonl.gz")); }
async function governedArtifact(source, artifact) {
  if (!Number.isSafeInteger(artifact.bytes) || !/^[a-f0-9]{64}$/.test(String(artifact.sha256 ?? ""))) throw new Error(`Artifact lacks governed bytes/sha256: ${artifact.path}`);
  const file = path.resolve(path.dirname(source.manifestPath), artifact.path);
  if (!contained(path.dirname(source.manifestPath), file)) throw new Error(`Artifact escapes release directory: ${artifact.path}`);
  await access(file); const actual = await hashFile(file);
  if (actual.bytes !== artifact.bytes || actual.sha256 !== artifact.sha256) throw new Error(`Artifact checksum mismatch: ${artifact.path}`);
  return file;
}
function projection(record, source, rowCategories) {
  const [latitude, longitude] = coordinates(record);
  return {
    business_name: record.names?.find((n) => String(n?.raw ?? "").trim())?.raw?.trim() ?? null, profile_id: record.profile_id ?? null,
    street: record.address?.street ?? null, unit_or_additional: record.address?.unit_or_additional ?? null, city: record.address?.city ?? null,
    state: state(record.address?.state), zip_code: zip5(record.address?.zip_code), zip4: zip4(record),
    latitude, longitude,
    industry_categories: rowCategories, source_id: record.source?.source_id ?? null, source_release_id: record.source?.source_release_id ?? null,
    source_record_id: record.source?.source_record_id ?? null, ingest_run_id: record.source?.ingest_run_id ?? null,
    source_status_value: record.source_status?.value ?? null, source_status_scope: record.source_status?.scope ?? null,
    source_status_observed_at: record.source_status?.observed_at ?? null, observed_at: record.observed_at ?? null,
    policy_id: record.source?.policy_id ?? null, export_policy: record.export_policy ?? null, transformation_version: record.source?.transformation_version ?? null,
    dataset_id: source.manifest.dataset_id, source_dataset_release_id: source.manifest.release_id,
    external_identifiers: Array.isArray(record.external_identifiers) ? record.external_identifiers : [], site_entity_id: record.site_entity_id ?? null,
    establishment_entity_id: record.establishment_entity_id ?? null, organization_entity_id: record.organization_entity_id ?? null,
  };
}
async function put(stream, text) { if (!stream.write(text)) await once(stream, "drain"); }
async function close(stream) { stream.end(); await finished(stream); }
async function atomicJson(file, value) { const temp = `${file}.tmp-${randomUUID()}`; await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`); await rename(temp, file); }

export async function composeFlatBusinessExport(argv = process.argv.slice(2), options = {}) {
  const args = parseArguments(argv); if (args.help) return { usage: usage() };
  const runId = options.runId ?? randomUUID(); const root = appPath(args.output);
  const prefix = args.outputPrefix ?? `flat-business-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}-${runId.slice(0, 8)}`;
  const outputDirectory = assertInsideApp(path.join(root, prefix)); await mkdir(root, { recursive: true }); await mkdir(outputDirectory, { recursive: false });
  const csvPath = path.join(outputDirectory, "records.csv"); const jsonlPath = path.join(outputDirectory, "records.jsonl");
  const csvStream = args.format !== "jsonl" ? createWriteStream(csvPath, { encoding: "utf8", flags: "wx" }) : null;
  const jsonlStream = args.format !== "csv" ? createWriteStream(jsonlPath, { encoding: "utf8", flags: "wx" }) : null;
  const selectedSources = new Set(args.sourceIds); for (const category of args.categories) for (const id of BUSINESS_FLATFILE_CATEGORIES[category]) selectedSources.add(id);
  const states = new Set(args.states); const policies = {}; const sourceCounts = {}; const lineage = []; let read = 0; let written = 0; let filtered = 0; let policyRejected = 0;
  try {
    if (csvStream) await put(csvStream, `${args.fields.join(",")}\n`);
    for (const input of [...args.sources].sort()) {
      const source = await descriptor(input); const artifacts = profileArtifacts(source); if (!artifacts.length) throw new Error(`${source.manifest.dataset_id}/${source.manifest.release_id} has no location-profile artifacts.`);
      const sourceLineage = { dataset_id: source.manifest.dataset_id, release_id: source.manifest.release_id, manifest_path: relativeToApp(source.manifestPath), manifest_sha256: source.manifestHash.sha256, pointer_path: source.pointerPath ? relativeToApp(source.pointerPath) : null, artifacts: [] }; lineage.push(sourceLineage);
      for (const artifact of [...artifacts].sort((a, b) => a.path.localeCompare(b.path))) {
        const file = await governedArtifact(source, artifact); sourceLineage.artifacts.push({ path: artifact.path, bytes: artifact.bytes, sha256: artifact.sha256 });
        const lines = createInterface({ input: createReadStream(file).pipe(createGunzip()), crlfDelay: Infinity });
        for await (const line of lines) {
          if (!line.trim()) continue; read += 1; const record = JSON.parse(line); const sourceId = String(record.source?.source_id ?? ""); const rowState = state(record.address?.state); const rowCategories = categoriesFor(sourceId);
          if ((selectedSources.size && !selectedSources.has(sourceId)) || (states.size && !states.has(rowState))) { filtered += 1; continue; }
          const policy = typeof record.export_policy === "string" ? record.export_policy : "missing"; policies[policy] = (policies[policy] ?? 0) + 1;
          const permitted = args.policyMode === "public-only" ? PUBLIC_POLICIES : LOCAL_POLICIES;
          if (!permitted.has(policy)) { policyRejected += 1; continue; }
          const full = projection(record, source, rowCategories.length ? rowCategories : ["uncategorized"]); const row = Object.fromEntries(args.fields.map((field) => [field, full[field]]));
          if (csvStream) await put(csvStream, `${args.fields.map((field) => csv(row[field])).join(",")}\n`); if (jsonlStream) await put(jsonlStream, `${JSON.stringify(row)}\n`);
          written += 1; sourceCounts[sourceId] = (sourceCounts[sourceId] ?? 0) + 1;
        }
      }
    }
    await Promise.all([csvStream && close(csvStream), jsonlStream && close(jsonlStream)].filter(Boolean));
    const artifacts = []; for (const [file, type] of [[csvStream && csvPath, "flat-business-csv"], [jsonlStream && jsonlPath, "flat-business-jsonl"]]) if (file) artifacts.push({ path: path.basename(file), artifact_type: type, records: written, ...(await hashFile(file)) });
    const generatedAt = new Date().toISOString(); const summary = { schema_version: "1.0.0", run_id: runId, generated_at: generatedAt, policy_mode: args.policyMode, local_review_only: args.policyMode === "local-review", counts: { source_rows_read: read, rows_written: written, filter_rejected: filtered, policy_rejected: policyRejected }, source_counts: sourceCounts, encountered_export_policies: policies };
    const summaryPath = path.join(outputDirectory, "summary.json"); await atomicJson(summaryPath, summary); artifacts.push({ path: "summary.json", artifact_type: "flat-business-summary", ...(await hashFile(summaryPath)) });
    const manifest = { schema_version: "1.0.0", dataset_id: "flat-business-export", release_id: runId, status: "published-local", generated_at: generatedAt, policy_mode: args.policyMode, export_policy: args.policyMode === "local-review" ? "local-review-only" : "public-policy-filtered", fields: args.fields, filters: { categories: args.categories, source_ids: args.sourceIds, states: args.states }, source_lineage: lineage, artifacts };
    const manifestPath = path.join(outputDirectory, "manifest.json"); await atomicJson(manifestPath, manifest); // publication marker, written last
    return { outputDirectory, summaryPath, manifestPath, summary, manifest };
  } catch (error) { csvStream?.destroy(); jsonlStream?.destroy(); await Promise.allSettled([csvStream && finished(csvStream), jsonlStream && finished(jsonlStream)].filter(Boolean)); await rm(outputDirectory, { recursive: true, force: true }); throw error; }
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) composeFlatBusinessExport().then((result) => {
  if (result.usage) process.stdout.write(result.usage); else process.stdout.write(`${JSON.stringify({ status: "ok", output_directory: relativeToApp(result.outputDirectory), rows_written: result.summary.counts.rows_written, manifest: relativeToApp(result.manifestPath) }, null, 2)}\n`);
}).catch((error) => { process.stderr.write(`compose-flat-business-export failed: ${error.message}\n`); process.exitCode = 1; });
