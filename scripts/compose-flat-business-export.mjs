#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import { once } from "node:events";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { finished } from "node:stream/promises";
import { createGunzip, gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { APP_ROOT, assertInsideApp, relativeToApp } from "../runner/paths.mjs";
import { createCliCancellation } from "../runner/cli-cancellation.mjs";
import { validateChildcareGeographicEvidence } from "../runner/childcare-geographic-evidence.mjs";
import { validateTnChildcareGeographicEvidence, validateFreshTnChildcareGeographicEvidence } from "../runner/tn-childcare-geographic-evidence.mjs";
import { flatfileReportingCompatibility } from '../runner/business-flatfile-compatibility.mjs';
import { OH_SOURCE, loadOhioCoverageContext, validateOhChildcareGeographicEvidence, verifyOhChildcareGeographicMembership } from '../runner/oh-childcare-coverage-evidence.mjs';

const DEFAULT_SOURCE = "data/business-registry/current.json";
const TN_SOURCE = "tn-dhs-active-childcare-centers";
const REPORTING_TYPE = "business-reporting-location-evidence-jsonl-gzip";
const DEFAULT_OUTPUT = "data/exports/flat-business/builds";
const PUBLIC_POLICIES = new Set(["public", "public-open-ny-terms", "public-factual-fields-with-source-limitations"]);
const LOCAL_POLICIES = new Set([...PUBLIC_POLICIES, "local-review-only"]);
const REQUIRED_PROVENANCE_FIELDS = ["source_id", "source_release_id", "source_record_id", "ingest_run_id", "policy_id", "export_policy", "transformation_version", "dataset_id", "source_dataset_release_id"];

// Export categories include independently verified reporting-only Ohio rows.
// This does not change the map's source adoption or geographic assignment rules.
export const BUSINESS_FLATFILE_CATEGORIES = Object.freeze({
  "retail-consumer": ["usda-snap-current-retailers", "new-york-agriculture-markets-retail-food-stores", "california-abc-daily-active-licenses"],
  "health-care": ["cms-nppes-monthly-v2"],
  childcare: ["ma-licensed-center-based-childcare", "nj-licensed-childcare-centers", TN_SOURCE, OH_SOURCE],
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
  "source_status", "source_evidence", "identity_matching_eligible", "governed_geographic_assignment_eligible",
]);

export function usage() { return `Compose a governed, streamed flat business export.\n\nUsage:\n  node scripts/compose-flat-business-export.mjs [options]\n\nOptions:\n  --source <path>              Governed pointer or manifest; repeatable\n  --category <id>[,<id>...]    Export category; repeatable\n  --source-id <id>[,<id>...]   Source filter; repeatable\n  --state <US>[,<US>...]       State filter; repeatable\n  --field <name>[,<name>...]   Selected columns; repeatable\n  --format <csv|jsonl|both>    Default: both\n  --policy-mode <mode>         public-only (default) or explicit local-review\n  --output <path>              Default: ${DEFAULT_OUTPUT}\n  --output-prefix <name>       Output folder name\n  --help                       Show help\n`; }

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

async function hashFile(file, signal) { const hash = createHash("sha256"); let bytes = 0; for await (const chunk of createReadStream(file)) { signal?.throwIfAborted(); bytes += chunk.length; hash.update(chunk); } return { bytes, sha256: hash.digest("hex") }; }
async function descriptor(input, signal) {
  const inputPath = appPath(input); let manifestBytes = await readFile(inputPath); const raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(manifestBytes)); let manifest = raw; let manifestPath = inputPath; let pointerPath = null;
  if (!Array.isArray(raw.artifacts)) {
    if (!raw.dataset_id || !raw.release_id || typeof raw.manifest !== "string") throw new Error(`${relativeToApp(inputPath)} is not a governed pointer or manifest.`);
    pointerPath = inputPath; manifestPath = path.resolve(path.dirname(inputPath), raw.manifest);
    if (!contained(path.dirname(inputPath), manifestPath)) throw new Error(`Pointer escapes its release root: ${input}`);
    manifestBytes = await readFile(manifestPath); manifest = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(manifestBytes));
    if (manifest.dataset_id !== raw.dataset_id || manifest.release_id !== raw.release_id) throw new Error(`Pointer/manifest identity mismatch: ${input}`);
  }
  if (!manifest.dataset_id || !manifest.release_id || !Array.isArray(manifest.artifacts) || !String(manifest.status ?? "").startsWith("published")) throw new Error(`Invalid or unpublished governed manifest: ${relativeToApp(manifestPath)}`);
  signal?.throwIfAborted();
  return { input, pointerPath, manifestPath, manifest, manifestHash: { bytes: manifestBytes.length, sha256: createHash("sha256").update(manifestBytes).digest("hex") } };
}
function profileArtifacts(source) { return source.manifest.artifacts.filter((a) => (/location-profile/.test(String(a.artifact_type ?? "")) || a.artifact_type === "business-reporting-location-evidence-jsonl-gzip") && String(a.path ?? "").endsWith(".jsonl.gz")); }
async function governedArtifact(source, artifact, signal, boundedReporting = false) {
  if (!Number.isSafeInteger(artifact.bytes) || !/^[a-f0-9]{64}$/.test(String(artifact.sha256 ?? ""))) throw new Error(`Artifact lacks governed bytes/sha256: ${artifact.path}`);
  if (boundedReporting && (artifact.bytes < 1 || artifact.bytes > 100_000_000)) throw new Error("TN reporting artifact byte limit.");
  const file = path.resolve(path.dirname(source.manifestPath), artifact.path);
  if (!contained(path.dirname(source.manifestPath), file)) throw new Error(`Artifact escapes release directory: ${artifact.path}`);
  if (boundedReporting) return file; // The bounded parser hashes the exact consumed bytes.
  await access(file); const actual = await hashFile(file, signal);
  if (actual.bytes !== artifact.bytes || actual.sha256 !== artifact.sha256) throw new Error(`Artifact checksum mismatch: ${artifact.path}`);
  return file;
}
function projection(record, source, rowCategories) {
  const [latitude, longitude] = coordinates(record);
  return {
    business_name: record.names?.find((n) => String(n?.raw ?? "").trim())?.raw?.trim() ?? null, profile_id: record.profile_id ?? null,
    street: record.address?.street ?? null, unit_or_additional: record.address?.unit_or_additional ?? record.address?.street2 ?? null, city: record.address?.city ?? null,
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
    source_status: record.source_status ?? null, source_evidence: record.evidence ?? null,
    identity_matching_eligible: record.identity_matching_eligible ?? null,
    governed_geographic_assignment_eligible: record.governed_geographic_assignment_eligible ?? null,
  };
}
async function put(stream, text) { if (!stream.write(text)) await once(stream, "drain"); }
async function close(stream) { stream.end(); await finished(stream); }
async function atomicJson(file, value) { const temp = `${file}.tmp-${randomUUID()}`; await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`); await rename(temp, file); }

async function* profileLines(file, signal, verifiedArtifact) {
  if (verifiedArtifact) {
    if (verifiedArtifact.bytes < 1 || verifiedArtifact.bytes > 100_000_000) throw new Error("TN reporting artifact byte limit.");
    const chunks = [], hash = createHash("sha256"); let bytes = 0;
    for await (const chunk of createReadStream(file)) {
      signal?.throwIfAborted(); bytes += chunk.length;
      if (bytes > verifiedArtifact.bytes) throw new Error("TN reporting artifact byte mismatch.");
      chunks.push(chunk); hash.update(chunk);
    }
    if (bytes !== verifiedArtifact.bytes || hash.digest("hex") !== verifiedArtifact.sha256) throw new Error("TN reporting artifact checksum mismatch.");
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(gunzipSync(Buffer.concat(chunks, bytes), { maxOutputLength: 100_000_000 }));
    for (const line of decoded.split(/\r?\n/)) { signal?.throwIfAborted(); yield line; }
    return;
  }
  const source = createReadStream(file);
  const decoded = createGunzip();
  source.on("error", (error) => decoded.destroy(error));
  const lines = createInterface({ input: source.pipe(decoded), crlfDelay: Infinity });
  try { for await (const line of lines) { signal?.throwIfAborted(); yield line; } }
  finally { lines.close(); source.destroy(); decoded.destroy(); }
}

export async function composeFlatBusinessExport(argv = process.argv.slice(2), options = {}) {
  const signal = options.signal;
  signal?.throwIfAborted();
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
      const source = await descriptor(input, signal); const artifacts = profileArtifacts(source); if (!artifacts.length) throw new Error(`${source.manifest.dataset_id}/${source.manifest.release_id} has no location-profile artifacts.`);
      const {tnFresh,tennessee:tnEnabled,ohio:ohEnabled,tnDependencies} = flatfileReportingCompatibility(source.manifest);
      signal?.throwIfAborted();
      const ohContext = ohEnabled ? await loadOhioCoverageContext(source.manifest) : null, ohRows = [];
      signal?.throwIfAborted();
      const tnCounts = { records: 0, missing: 0, reasons: { "missing-source-zip": 0, "invalid-source-zip-placeholder": 0 } }, tnSites = new Set(), tnEstablishments = new Set();
      const sourceLineage = { dataset_id: source.manifest.dataset_id, release_id: source.manifest.release_id, manifest_path: relativeToApp(source.manifestPath), manifest_sha256: source.manifestHash.sha256, pointer_path: source.pointerPath ? relativeToApp(source.pointerPath) : null, artifacts: [] }; lineage.push(sourceLineage);
      for (const artifact of [...artifacts].sort((a, b) => a.path.localeCompare(b.path))) {
        const boundedReporting = (tnEnabled || ohEnabled) && artifact.artifact_type === REPORTING_TYPE;
        const file = await governedArtifact(source, artifact, signal, boundedReporting); sourceLineage.artifacts.push({ path: artifact.path, bytes: artifact.bytes, sha256: artifact.sha256 });
        let artifactRows = 0;
        for await (const line of profileLines(file, signal, boundedReporting ? artifact : undefined)) {
          if (!line.trim()) continue; read += 1; const record = JSON.parse(line);
          artifactRows++;
          if ((BUSINESS_FLATFILE_CATEGORIES.childcare.includes(record.source?.source_id) || record.source?.source_id === OH_SOURCE || /^(site|establishment):(tn|oh)_childcare_/.test(record.site_entity_id) || /^(site|establishment):(tn|oh)_childcare_/.test(record.establishment_entity_id)) && artifact.artifact_type !== REPORTING_TYPE) throw new Error("Childcare source cannot appear in matching-profile artifacts.");
          if (record.source?.source_id === TN_SOURCE) {
            if (!tnEnabled || artifact.artifact_type !== REPORTING_TYPE) throw new Error("TN export requires an exact supported registry reporting version.");
            (tnFresh ? validateFreshTnChildcareGeographicEvidence : validateTnChildcareGeographicEvidence)(record);
            if (artifact.path !== `reporting/location-evidence/zip2=${record.zip_code?.slice(0, 2) ?? "unassigned"}/records.jsonl.gz` || artifact.export_policy !== "local-review-only"
              || record.evidence.release_id !== tnDependencies[0].release_id || record.evidence.manifest_sha256 !== tnDependencies[0].manifest_sha256
              || tnSites.has(record.site_entity_id) || tnEstablishments.has(record.establishment_entity_id)) throw new Error("TN export partition, identity or source lineage differs.");
            tnSites.add(record.site_entity_id); tnEstablishments.add(record.establishment_entity_id); tnCounts.records++;
            if (record.zip_code === null) { tnCounts.missing++; tnCounts.reasons[record.evidence.zip_unavailable_reason]++; }
          } else if (record.source?.source_id === OH_SOURCE) {
            if (!ohContext || artifact.artifact_type !== REPORTING_TYPE) throw Error('OH export requires exact registry 2.15 reporting context.');
            validateOhChildcareGeographicEvidence(record,ohContext.input.verificationContext);
            if (artifact.path !== `reporting/location-evidence/zip2=${record.zip_code?.slice(0,2) ?? 'unassigned'}/records.jsonl.gz` || artifact.export_policy !== 'local-review-only') throw Error('OH export partition or policy differs.');
            ohRows.push(record);
          } else if (artifact.artifact_type === REPORTING_TYPE) validateChildcareGeographicEvidence(record);
          const sourceId = String(record.source?.source_id ?? ""); const rowState = state(record.address?.state); const rowCategories = categoriesFor(sourceId);
          if ((selectedSources.size && !selectedSources.has(sourceId)) || (states.size && !states.has(rowState))) { filtered += 1; continue; }
          const policy = typeof record.export_policy === "string" ? record.export_policy : "missing"; policies[policy] = (policies[policy] ?? 0) + 1;
          const permitted = args.policyMode === "public-only" ? PUBLIC_POLICIES : LOCAL_POLICIES;
          if (!permitted.has(policy)) { policyRejected += 1; continue; }
          const full = projection(record, source, rowCategories.length ? rowCategories : ["uncategorized"]); const row = Object.fromEntries(args.fields.map((field) => [field, full[field]]));
          if (csvStream) await put(csvStream, `${args.fields.map((field) => csv(row[field])).join(",")}\n`); if (jsonlStream) await put(jsonlStream, `${JSON.stringify(row)}\n`);
          written += 1; sourceCounts[sourceId] = (sourceCounts[sourceId] ?? 0) + 1;
        }
        if ((tnEnabled || ohEnabled) && artifact.artifact_type === REPORTING_TYPE && artifactRows !== artifact.record_count) throw new Error("TN/OH reporting artifact count differs.");
      }
      if (tnEnabled) {
        const c = source.manifest.coverage;
        if (!tnCounts.records || c?.tn_childcare_center_sites !== tnCounts.records || c.tn_childcare_center_sites_with_zip !== tnCounts.records - tnCounts.missing
          || c.tn_childcare_center_sites_without_zip !== tnCounts.missing
          || !c.tn_childcare_missing_zip_reasons || Object.keys(c.tn_childcare_missing_zip_reasons).length !== 2
          || Object.entries(tnCounts.reasons).some(([key, value]) => c.tn_childcare_missing_zip_reasons[key] !== value)) throw new Error("TN export source ZIP counts or reasons differ.");
      }
      const ohProof = ohContext ? await verifyOhChildcareGeographicMembership(ohRows,ohContext.input.verificationContext,{signal}) : null;
      if ((tnEnabled || ohEnabled) && source.manifest.coverage.reporting_location_evidence_without_zip !== tnCounts.missing + (ohProof?.withoutSourceZip ?? 0)) throw Error('Combined TN/OH missing ZIP count differs.');
    }
    await Promise.all([csvStream && close(csvStream), jsonlStream && close(jsonlStream)].filter(Boolean));
    const artifacts = []; for (const [file, type] of [[csvStream && csvPath, "flat-business-csv"], [jsonlStream && jsonlPath, "flat-business-jsonl"]]) if (file) artifacts.push({ path: path.basename(file), artifact_type: type, records: written, ...(await hashFile(file, signal)) });
    const generatedAt = new Date().toISOString(); const summary = { schema_version: "1.0.0", run_id: runId, generated_at: generatedAt, policy_mode: args.policyMode, local_review_only: args.policyMode === "local-review", counts: { source_rows_read: read, rows_written: written, filter_rejected: filtered, policy_rejected: policyRejected }, source_counts: sourceCounts, encountered_export_policies: policies };
    const summaryPath = path.join(outputDirectory, "summary.json"); await atomicJson(summaryPath, summary); artifacts.push({ path: "summary.json", artifact_type: "flat-business-summary", ...(await hashFile(summaryPath)) });
    const manifest = { schema_version: "1.0.0", dataset_id: "flat-business-export", release_id: runId, status: "published-local", generated_at: generatedAt, policy_mode: args.policyMode, export_policy: args.policyMode === "local-review" ? "local-review-only" : "public-policy-filtered", fields: args.fields, filters: { categories: args.categories, source_ids: args.sourceIds, states: args.states }, source_lineage: lineage, artifacts };
    signal?.throwIfAborted();
    const manifestPath = path.join(outputDirectory, "manifest.json"); await atomicJson(manifestPath, manifest); // publication marker, written last
    return { outputDirectory, summaryPath, manifestPath, summary, manifest };
  } catch (error) { csvStream?.destroy(); jsonlStream?.destroy(); await Promise.allSettled([csvStream && finished(csvStream), jsonlStream && finished(jsonlStream)].filter(Boolean)); await rm(outputDirectory, { recursive: true, force: true }); throw error; }
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
const cancellation = createCliCancellation();
composeFlatBusinessExport(process.argv.slice(2), { signal: cancellation.signal }).then((result) => {
  if (result.usage) process.stdout.write(result.usage); else process.stdout.write(`${JSON.stringify({ status: "ok", output_directory: relativeToApp(result.outputDirectory), rows_written: result.summary.counts.rows_written, manifest: relativeToApp(result.manifestPath) }, null, 2)}\n`);
}).catch((error) => { process.stderr.write(`compose-flat-business-export failed: ${error.message}\n`); process.exitCode = 1; }).finally(() => cancellation.dispose());
}
