import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { lstat, mkdir, open, readFile, realpath, rename, rm, unlink } from "node:fs/promises";
import path from "node:path";
import { createGunzip, createGzip } from "node:zlib";
import { createInterface } from "node:readline";
import { finished } from "node:stream/promises";
import { once } from "node:events";
import { APP_ROOT } from "./paths.mjs";
import { BROAD_ORGANIZATION_ZIP_DATASET as DATASET, BROAD_ORGANIZATION_ZIP_SCHEMA as SCHEMA, BROAD_ORGANIZATION_ZIP_SOURCES as SOURCES, BROAD_ORGANIZATION_ZIP_TRANSFORMATION as TRANSFORMATION, BROAD_ORGANIZATION_REGISTRY_RELEASE as REGISTRY_RELEASE } from "./broad-organization-zip-descriptors.mjs";

const ARTIFACT_TYPE = "broad-organization-zip-jsonl-gzip";
const missingShardPath = (state) => `derived/organizations/zip-prefix=missing/state=${state}.jsonl.gz`;
const MAX_ARTIFACT_BYTES = 2_000_000_000;
const MAX_RECORD_BYTES = 2_000_000;
const MAX_SOURCE_RECORDS = 20_000_000;
const MAX_DERIVED_ADDRESS_ROWS = 50_000_000;
const ZIP5 = /^\d{5}$/;
const sha = (value) => createHash("sha256").update(value).digest("hex");
const line = (value) => `${JSON.stringify(value)}\n`;
const fail = (message) => { throw new Error(`Broad organization ZIP evidence rejected: ${message}`); };

function cancelled(signal) { if (signal?.aborted) throw Object.assign(new Error("Broad organization ZIP evidence build cancelled."), { name: "AbortError", code: "ABORT_ERR" }); }
function inside(parent, child, label) { const rel = path.relative(path.resolve(parent), path.resolve(child)); if (rel.startsWith("..") || path.isAbsolute(rel)) fail(`${label} escapes its root`); }
async function noLink(root, target, label) {
  const base = path.resolve(root), absolute = path.resolve(target); inside(base, absolute, label);
  if (await realpath(base) !== base) fail("root traverses a symbolic link");
  let cursor = base;
  for (const part of path.relative(base, absolute).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, part);
    try { if ((await lstat(cursor)).isSymbolicLink()) fail(`${label} traverses a symbolic link`); }
    catch (error) { if (error.code === "ENOENT") return; throw error; }
  }
}
async function hashFile(file, signal) {
  const h = createHash("sha256"); let bytes = 0;
  for await (const chunk of createReadStream(file)) { cancelled(signal); bytes += chunk.length; if (bytes > MAX_ARTIFACT_BYTES) fail("artifact exceeds the bounded byte limit"); h.update(chunk); }
  return { bytes, sha256: h.digest("hex") };
}
async function readDataset(root, pointerRel, dataset, expectedRelease, publicationContract = null) {
  const pointerPath = path.resolve(root, pointerRel); await noLink(root, pointerPath, `${dataset} pointer`);
  const pointerBytes = await readFile(pointerPath); const pointer = JSON.parse(pointerBytes.toString("utf8"));
  if (pointer.dataset_id !== dataset || pointer.release_id !== expectedRelease || !pointer.manifest) fail(`${dataset} pointer identity drifted`);
  const manifestPath = path.resolve(path.dirname(pointerPath), pointer.manifest); inside(path.dirname(pointerPath), manifestPath, `${dataset} manifest`); await noLink(root, manifestPath, `${dataset} manifest`);
  const manifestBytes = await readFile(manifestPath);
  if (pointer.manifest_sha256 && sha(manifestBytes) !== pointer.manifest_sha256) fail(`${dataset} pointer manifest checksum drifted`);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const expectedStatus = dataset === "national-business-registry" ? "published-partial" : "published";
  let publicationMatches = manifest.status === expectedStatus;
  if (publicationContract) {
    publicationMatches = publicationContract.status_field_absent === true
      ? publicationContract.status === null && !Object.hasOwn(manifest, "status") && manifest.complete_source_snapshot === publicationContract.complete_source_snapshot
      : manifest.status === publicationContract.status;
  }
  if (manifest.dataset_id !== dataset || manifest.release_id !== expectedRelease || !publicationMatches) fail(`${dataset} manifest identity or publication status drifted`);
  return { dataset, pointerRel, pointerPath, pointerBytes, pointer, manifestPath, manifestBytes, manifest, releaseDirectory: path.dirname(manifestPath) };
}
function artifactsFor(dataset, spec) {
  const rows = (dataset.manifest.artifacts ?? []).filter((item) => item.artifact_type === spec.artifactType);
  if (!rows.length || rows.length > 16 || rows.some((item) => !item.path || !Number.isSafeInteger(item.bytes) || item.bytes < 1 || item.bytes > MAX_ARTIFACT_BYTES || !/^[a-f0-9]{64}$/.test(item.sha256 ?? "") || !Number.isSafeInteger(item.record_count) || item.record_count < 0)) fail(`${spec.datasetId} normalized artifacts are missing or malformed`);
  const paths = new Set(rows.map((item) => item.path)); if (paths.size !== rows.length) fail(`${spec.datasetId} artifact paths repeat`);
  if (rows.reduce((sum, item) => sum + item.record_count, 0) > MAX_SOURCE_RECORDS) fail(`${spec.datasetId} record count exceeds the bounded source limit`);
  return rows;
}
async function verifyArtifact(root, directory, artifact, label, signal) {
  const file = path.resolve(directory, artifact.path); inside(directory, file, label); await noLink(root, file, label);
  const actual = await hashFile(file, signal); if (actual.bytes !== artifact.bytes || actual.sha256 !== artifact.sha256) fail(`${label} bytes or SHA-256 mismatch`);
}
async function* gzipJsonl(file, signal) {
  const input = createReadStream(file); const gunzip = createGunzip(); input.pipe(gunzip); const lines = createInterface({ input: gunzip, crlfDelay: Infinity });
  try { for await (const text of lines) { cancelled(signal); if (Buffer.byteLength(text) > MAX_RECORD_BYTES) fail("source record exceeds the bounded line limit"); if (text) yield JSON.parse(text); } }
  finally { lines.close(); input.destroy(); gunzip.destroy(); }
}
function descriptorAddress(spec, record) {
  const value = record?.[spec.addressField];
  const addresses = Array.isArray(value) ? value : value && typeof value === "object" ? [value] : [];
  if (!addresses.length) return [{ index: 0, address: null }];
  return addresses.map((address, index) => ({ index, address }));
}
function outputRows(state, spec, record) {
  if (record?.schema_version !== "1.0.0" || record.provenance?.source_id !== spec.normalizedSourceId || record.provenance?.source_release_id !== spec.sourceReleaseId || record.provenance?.transformation_version !== spec.transformation || !String(record.normalized_record_id ?? "").trim()) fail(`${state} normalized record source or transformation identity drifted`);
  if (typeof record[spec.nameField] !== "string" || !record[spec.nameField].trim()) fail(`${state} normalized record name is missing`);
  const kind = state === "OR" && record.registration_kind === "assumed-business-name-registration" ? "brand" : spec.recordKind;
  return descriptorAddress(spec, record).map(({ index, address }) => {
    const eligible = address?.eligible_for_us_zip_coverage === true;
    const zip5 = address?.zip_code ?? null;
    const partition = eligible && ZIP5.test(zip5 ?? "") ? zip5.slice(0, 2) : "missing";
    const reason = partition === "missing" ? !address ? "address-not-supplied" : !eligible ? "source-address-ineligible-for-ZIP-coverage" : !ZIP5.test(zip5 ?? "") ? "source-ZIP5-missing-or-invalid" : "source-address-not-eligible" : null;
    return {
      schema_version: SCHEMA, row_id: `${record.normalized_record_id}:address:${index}`, state, record_kind: kind,
      display_name: record[spec.nameField], address_field: spec.addressField, address_index: index,
      source_record: record, zip_partition: partition === "missing" ? "missing-or-ineligible" : "eligible-zip5-prefix",
      zip_partition_reason: reason,
      zip_fields: { source_value: zip5, zip5: eligible && ZIP5.test(zip5 ?? "") ? zip5 : null, zip4: address?.zip4 ?? null, eligible_for_zip_partition: partition !== "missing" },
      claims: { source_reported_administrative_address: true, physical_site: false, current_operation: false, unique_business: false, usps_validity: false, contributes_to_general_business_or_site_totals: false },
      export_policy: spec.localReviewOnly ? "local-review-only" : record.export_policy ?? "source-policy-controlled",
    };
  });
}

async function loadInputs(root, signal) {
  cancelled(signal);
  const registry = await readDataset(root, "data/business-registry/current.json", "national-business-registry", REGISTRY_RELEASE);
  const summaryArtifacts = (registry.manifest.artifacts ?? []).filter((artifact) => artifact.path === "derived/source-contributions.json" && artifact.artifact_type === "registry-source-contribution-summary");
  if (summaryArtifacts.length !== 1) fail("registry source-contribution summary is not uniquely declared");
  const contributionPath = path.join(registry.releaseDirectory, summaryArtifacts[0].path); await noLink(root, contributionPath, "registry source-contribution summary");
  const contributionProof = await hashFile(contributionPath, signal);
  if (contributionProof.bytes !== summaryArtifacts[0].bytes || contributionProof.sha256 !== summaryArtifacts[0].sha256) fail("registry source-contribution summary failed integrity verification");
  const contributions = JSON.parse(await readFile(contributionPath, "utf8"));
  const specs = {};
  for (const [state, spec] of Object.entries(SOURCES)) {
    const source = await readDataset(root, spec.sourcePointer, spec.datasetId, spec.releaseId, spec.publicationContract);
    const dependency = (registry.manifest.dependencies ?? []).filter((item) => item.dataset_id === spec.datasetId);
    if (dependency.length !== 1 || dependency[0].release_id !== spec.releaseId || dependency[0].manifest_sha256 !== sha(source.manifestBytes)) fail(`${state} source does not match the pinned registry dependency`);
    const contribution = contributions[spec.registryKey];
    if (contribution?.dataset_id !== spec.datasetId || contribution.dataset_release_id !== spec.releaseId || contribution.source_id !== spec.registryContributionSourceId || contribution.source_release_id !== spec.sourceReleaseId) fail(`${state} registry source summary identity drifted`);
    const policyPath = path.join(root, "config/source-policies", spec.policy);
    const policyBytes = await readFile(policyPath);
    const policy = JSON.parse(policyBytes.toString("utf8"));
    if (policy.policy_id !== spec.policy.replace(/\.json$/, "") || !/^\d+\.\d+\.\d+$/.test(policy.version ?? "") || typeof policy.redistribution !== "string") fail(`${state} source policy identity or semantics drifted`);
    const artifacts = artifactsFor(source, spec);
    for (const artifact of artifacts) { cancelled(signal); await verifyArtifact(root, source.releaseDirectory, artifact, `${state}/${artifact.path}`, signal); }
    specs[state] = { state, spec, source, artifacts, contribution, policy, policyPath, policyBytes };
  }
  return { registry, specs, summaryProof: { path: contributionPath, artifact: summaryArtifacts[0] } };
}
async function assertStableInputs(root, inputs, signal) {
  const datasets = [inputs.registry, ...Object.values(inputs.specs).map((entry) => entry.source)];
  for (const item of datasets) {
    cancelled(signal); await noLink(root, item.pointerPath, `${item.dataset} pointer`); await noLink(root, item.manifestPath, `${item.dataset} manifest`);
    const pointer = await readFile(item.pointerPath); const manifest = await readFile(item.manifestPath);
    if (!pointer.equals(item.pointerBytes) || !manifest.equals(item.manifestBytes)) fail(`${item.dataset} changed while reading the retained release`);
  }
  for (const entry of Object.values(inputs.specs)) for (const artifact of entry.artifacts) await verifyArtifact(root, entry.source.releaseDirectory, artifact, `${entry.state}/${artifact.path}`, signal);
  const summary = await hashFile(inputs.summaryProof.path, signal);
  if (summary.bytes !== inputs.summaryProof.artifact.bytes || summary.sha256 !== inputs.summaryProof.artifact.sha256) fail("registry source-contribution summary changed while reading the release");
  for (const entry of Object.values(inputs.specs)) {
    const policy = await readFile(entry.policyPath);
    if (!policy.equals(entry.policyBytes)) fail(`${entry.state} source policy changed while reading the release`);
  }
}

async function* expectedRows(inputs, signal, counters = {}) {
  let globalAddressRows = 0;
  for (const [state, entry] of Object.entries(inputs.specs)) {
    counters[state] ??= { input_records: 0, address_rows: 0, eligible_zip_rows: 0, missing_or_ineligible_rows: 0, record_kinds: {} };
    for (const artifact of entry.artifacts) {
      let artifactRows = 0;
      for await (const record of gzipJsonl(path.join(entry.source.releaseDirectory, artifact.path), signal)) {
        cancelled(signal); artifactRows += 1; counters[state].input_records += 1;
        for (const output of outputRows(state, entry.spec, record)) {
          counters[state].address_rows += 1; counters[state].record_kinds[output.record_kind] = (counters[state].record_kinds[output.record_kind] ?? 0) + 1;
          globalAddressRows += 1;
          if (globalAddressRows > MAX_DERIVED_ADDRESS_ROWS) fail(`derived address rows exceed the global ${MAX_DERIVED_ADDRESS_ROWS} row limit`);
          if (output.zip_partition === "missing-or-ineligible") counters[state].missing_or_ineligible_rows += 1; else counters[state].eligible_zip_rows += 1;
          yield output;
        }
      }
      if (artifactRows !== artifact.record_count) fail(`${state} ${artifact.path} record count differs from manifest`);
    }
  }
}
function sourceContract(inputs) {
  return Object.fromEntries(Object.entries(inputs.specs).map(([state, e]) => [state, {
    dataset_id: e.spec.datasetId, normalized_source_id: e.spec.normalizedSourceId, registry_contribution_source_id: e.spec.registryContributionSourceId, source_release_id: e.spec.sourceReleaseId,
    publication_contract: e.spec.publicationContract,
    policy_id: e.policy.policy_id, policy_version: e.policy.version, address_field: e.spec.addressField,
    name_field: e.spec.nameField, record_kind: e.spec.recordKind, identity_and_record_unit_semantics: e.contribution.identity_resolution,
    redistribution: e.policy.redistribution, field_export_policy: e.policy.field_export_policy ?? null,
  }]));
}

async function writerFor(directory, key, writers) {
  if (writers.has(key)) return writers.get(key);
  const rel = key.startsWith("missing:") ? missingShardPath(key.slice("missing:".length)) : `derived/organizations/zip-prefix=${key}.jsonl.gz`;
  const destination = path.join(directory, rel); await mkdir(path.dirname(destination), { recursive: true });
  const temp = `${destination}.tmp-${randomUUID()}`; const output = createWriteStream(temp, { flags: "wx" }); const gzip = createGzip(); gzip.pipe(output);
  const writer = { rel, destination, temp, output, gzip, record_count: 0 }; writers.set(key, writer); return writer;
}
async function writeExpected(directory, rows, signal, states) {
  const writers = new Map();
  try {
    for await (const row of rows) {
      cancelled(signal); const key = row.zip_partition === "missing-or-ineligible" ? `missing:${row.state}` : row.zip_fields.zip5.slice(0, 2); const writer = await writerFor(directory, key, writers);
      if (!writer.gzip.write(line(row))) await once(writer.gzip, "drain", { signal }); writer.record_count += 1;
    }
    for (const state of states) if (!writers.has(`missing:${state}`)) await writerFor(directory, `missing:${state}`, writers);
    await Promise.all([...writers.values()].map(async (writer) => { const done = finished(writer.output); writer.gzip.end(); await done; }));
    const artifacts = [];
    for (const writer of writers.values()) { await rename(writer.temp, writer.destination); artifacts.push({ path: writer.rel, ...(await hashFile(writer.destination, signal)), record_count: writer.record_count, artifact_type: ARTIFACT_TYPE }); }
    return artifacts.sort((a, b) => a.path.localeCompare(b.path));
  } catch (error) {
    for (const writer of writers.values()) { writer.gzip.destroy(); writer.output.destroy(); }
    await Promise.allSettled([...writers.values()].map((writer) => finished(writer.output)));
    throw error;
  }
}
async function exists(pathname) { try { await lstat(pathname); return true; } catch (error) { if (error.code === "ENOENT") return false; throw error; } }

export async function buildBroadOrganizationZipEvidence({ root = APP_ROOT, outputRoot = path.join(root, "data/business-sources/broad-organization-zip-evidence"), asOf = new Date(), signal, onProgress = () => {} } = {}) {
  if (!(asOf instanceof Date) || !Number.isFinite(asOf.getTime())) fail("build timestamp is invalid");
  const absoluteOutput = path.resolve(root, outputRoot); await noLink(root, absoluteOutput, "output root"); await mkdir(absoluteOutput, { recursive: true });
  const inputs = await loadInputs(root, signal);
  const pins = Object.fromEntries(Object.entries(inputs.specs).map(([state, entry]) => [state, { source_release_id: entry.source.manifest.release_id, source_manifest_sha256: sha(entry.source.manifestBytes), source_pointer_sha256: sha(entry.source.pointerBytes), policy_sha256: sha(entry.policyBytes), transformation: entry.spec.transformation }]));
  const identity = sha(JSON.stringify({ registry_release_id: inputs.registry.manifest.release_id, registry_pointer_sha256: sha(inputs.registry.pointerBytes), pins, transformation: TRANSFORMATION, as_of: asOf.toISOString() })).slice(0, 12);
  const releaseId = `broad-organization-zip-evidence-${asOf.toISOString().replace(/[-:.]/g, "").replace("T", "-").replace("Z", "Z")}-${identity}`;
  const releaseDirectory = path.join(absoluteOutput, "releases", releaseId); const staging = path.join(absoluteOutput, "releases", `.staging-${randomUUID()}`); let stagingOwned = false; let lockHandle; const lockPath = `${releaseDirectory}.lock`; const lockToken = randomUUID();
  try {
    await mkdir(path.dirname(releaseDirectory), { recursive: true }); await noLink(root, path.dirname(releaseDirectory), "release directory");
    try { lockHandle = await open(lockPath, "wx"); } catch (error) { if (error.code === "EEXIST") fail("release identity is locked by another build"); throw error; }
    await lockHandle.writeFile(`${lockToken}\n`); await lockHandle.sync();
    if (await exists(releaseDirectory)) fail("release identity already exists");
    await noLink(root, path.dirname(staging), "release directory"); await mkdir(path.dirname(staging), { recursive: true }); await mkdir(staging, { recursive: false }); stagingOwned = true;
    onProgress({ phase: "staging-created", release_id: releaseId }); cancelled(signal);
    const counts = {}; const artifacts = await writeExpected(staging, expectedRows(inputs, signal, counts), signal, Object.keys(inputs.specs));
    await assertStableInputs(root, inputs, signal);
    const manifest = {
      schema_version: SCHEMA, dataset_id: DATASET, release_id: releaseId, status: "published", created_at: asOf.toISOString(),
      connector: { id: DATASET, version: "1.0.0", transformation: TRANSFORMATION },
      dependencies: { registry: { dataset_id: inputs.registry.manifest.dataset_id, release_id: inputs.registry.manifest.release_id, pointer_sha256: sha(inputs.registry.pointerBytes), manifest_sha256: sha(inputs.registry.manifestBytes) }, sources: pins },
      source_contract: sourceContract(inputs),
      conservation: { counts, input_record_total: Object.values(counts).reduce((n, c) => n + c.input_records, 0), address_row_total: Object.values(counts).reduce((n, c) => n + c.address_rows, 0), eligible_zip_row_total: Object.values(counts).reduce((n, c) => n + c.eligible_zip_rows, 0), missing_or_ineligible_row_total: Object.values(counts).reduce((n, c) => n + c.missing_or_ineligible_rows, 0) },
      claims: { source_reported_administrative_address_only: true, physical_sites_asserted: false, current_operations_asserted: false, unique_businesses_asserted: false, usps_validity_asserted: false, contributes_to_general_business_or_site_totals: false, network_requests_performed: 0 },
      limitations: ["Records preserve administrative source status and address semantics; no record is asserted to be a physical site, current operation, unique business, or USPS-valid ZIP.", "Oregon assumed business names remain separate brand records; ZIP5 and ZIP4 are preserved separately.", "Delaware record-level use remains subject to its local-review-only restriction.", "This derivative is additive neither to national totals nor the general business/site layers."],
      artifacts,
    };
    cancelled(signal); await writeFileExclusive(path.join(staging, "manifest.json"), line(manifest));
    if (await exists(releaseDirectory)) fail("release identity appeared before publication");
    await noLink(root, staging, "staging release"); await mkdir(path.dirname(releaseDirectory), { recursive: true }); await rename(staging, releaseDirectory); stagingOwned = false;
    return { manifest, releaseDirectory };
  } catch (error) { if (stagingOwned) await rm(staging, { recursive: true, force: true }).catch(() => {}); throw error; }
  finally { if (lockHandle) { await lockHandle.close(); try { if ((await readFile(lockPath, "utf8")) === `${lockToken}\n`) await unlink(lockPath); } catch (error) { if (error.code !== "ENOENT") throw error; } } }
}

async function writeFileExclusive(filename, contents) { const handle = await open(filename, "wx"); try { await handle.writeFile(contents); await handle.sync(); } finally { await handle.close(); } }

async function* readGzipLines(file, signal) { yield* gzipJsonl(file, signal); }

export async function verifyBroadOrganizationZipEvidence(releasePath, { root = APP_ROOT, signal } = {}) {
  const directory = path.resolve(root, releasePath); inside(root, directory, "release"); await noLink(root, directory, "release");
  const manifestPath = path.join(directory, "manifest.json"); await noLink(root, manifestPath, "manifest"); const manifestBytes = await readFile(manifestPath); const manifest = JSON.parse(manifestBytes.toString("utf8"));
  if (manifest.schema_version !== SCHEMA || manifest.dataset_id !== DATASET || manifest.status !== "published" || manifest.connector?.transformation !== TRANSFORMATION || manifest.claims?.physical_sites_asserted !== false || manifest.claims?.current_operations_asserted !== false || manifest.claims?.unique_businesses_asserted !== false || manifest.claims?.usps_validity_asserted !== false || manifest.claims?.contributes_to_general_business_or_site_totals !== false || manifest.claims?.network_requests_performed !== 0) fail("manifest contract or claim boundary drifted");
  const inputs = await loadInputs(root, signal);
  if (inputs.registry.manifest.release_id !== manifest.dependencies?.registry?.release_id || sha(inputs.registry.pointerBytes) !== manifest.dependencies?.registry?.pointer_sha256 || sha(inputs.registry.manifestBytes) !== manifest.dependencies?.registry?.manifest_sha256) fail("registry pin drifted");
  for (const [state, entry] of Object.entries(inputs.specs)) {
    const pin = manifest.dependencies?.sources?.[state];
    if (!pin || pin.source_release_id !== entry.source.manifest.release_id || pin.source_manifest_sha256 !== sha(entry.source.manifestBytes) || pin.source_pointer_sha256 !== sha(entry.source.pointerBytes) || pin.policy_sha256 !== sha(entry.policyBytes) || pin.transformation !== entry.spec.transformation) fail(`${state} source/policy/transformation pin drifted`);
  }
  if (JSON.stringify(manifest.source_contract) !== JSON.stringify(sourceContract(inputs))) fail("source descriptor, status, or policy contract drifted");
  const artifacts = manifest.artifacts;
  const missingStates = new Set(Object.keys(inputs.specs));
  const artifactPaths = new Set(Array.isArray(artifacts) ? artifacts.map((a) => a.path) : []);
  if (!Array.isArray(artifacts) || artifacts.length > 108 || artifactPaths.size !== artifacts.length || artifacts.some((a) => a.artifact_type !== ARTIFACT_TYPE || !/^derived\/organizations\/zip-prefix=(?:\d{2}|missing\/state=(?:CO|CT|DE|FL|IA|NY|OR|PA))\.jsonl\.gz$/.test(a.path))) fail("output artifact set malformed");
  for (const state of missingStates) if (!artifactPaths.has(missingShardPath(state))) fail(`missing/ineligible shard for ${state} is absent`);
  for (const artifact of artifacts) { cancelled(signal); const file = path.join(directory, artifact.path); await noLink(root, file, artifact.path); const actual = await hashFile(file, signal); if (actual.bytes !== artifact.bytes || actual.sha256 !== artifact.sha256) fail(`${artifact.path} output bytes/hash mismatch`); }
  const readers = new Map();
  async function next(shard) {
    if (!readers.has(shard)) {
      const artifact = artifacts.find((item) => item.path === (shard.startsWith("missing:") ? missingShardPath(shard.slice("missing:".length)) : `derived/organizations/zip-prefix=${shard}.jsonl.gz`));
      if (!artifact) return { done: true };
      const iterator = readGzipLines(path.join(directory, artifact.path), signal)[Symbol.asyncIterator](); readers.set(shard, iterator);
    }
    return readers.get(shard).next();
  }
  const counters = {};
  try {
    for await (const expected of expectedRows(inputs, signal, counters)) {
      const shard = expected.zip_partition === "missing-or-ineligible" ? `missing:${expected.state}` : expected.zip_fields.zip5.slice(0, 2); const actual = await next(shard);
      if (actual.done || JSON.stringify(actual.value) !== JSON.stringify(expected)) fail(`output join, source linkage, or semantics differs for ${expected.row_id}`);
    }
    for (const [shard, iterator] of readers) if (!(await iterator.next()).done) fail(`output shard ${shard} contains an orphan row`);
  } finally { for (const iterator of readers.values()) await iterator.return?.(); }
  const summarized = Object.values(counters).reduce((n, c) => n + c.address_rows, 0);
  const eligible = Object.values(counters).reduce((n, c) => n + c.eligible_zip_rows, 0);
  const excluded = Object.values(counters).reduce((n, c) => n + c.missing_or_ineligible_rows, 0);
  if (summarized > MAX_DERIVED_ADDRESS_ROWS) fail(`derived address rows exceed the global ${MAX_DERIVED_ADDRESS_ROWS} row limit`);
  if (summarized !== manifest.conservation?.address_row_total
    || manifest.conservation.input_record_total !== Object.values(counters).reduce((n, c) => n + c.input_records, 0)
    || eligible !== manifest.conservation.eligible_zip_row_total || excluded !== manifest.conservation.missing_or_ineligible_row_total
    || JSON.stringify(counters) !== JSON.stringify(manifest.conservation.counts)) fail("conservation totals drifted");
  await assertStableInputs(root, inputs, signal);
  return { status: "verified", release_id: manifest.release_id, source_count: Object.keys(inputs.specs).length, conservation: manifest.conservation };
}
