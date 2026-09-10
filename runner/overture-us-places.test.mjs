import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createGunzip, gzipSync } from "node:zlib";
import { DuckDBInstance } from "@duckdb/node-api";
import {
  buildOvertureUsPlaces,
  publishOvertureUsPlacesStaging,
  normalizeOvertureUsPlace,
  OVERTURE_LARGE_ACQUISITION_CONFIRMATION,
  OVERTURE_SELECTED_FIELDS,
  overtureExtractionSql,
  preflightOverturePlaces,
  prepareOvertureUsPlacesSource,
  splitUsPostcode,
  verifyOvertureUsPlaces,
} from "./overture-us-places.mjs";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function source(overrides = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    version: 3,
    operating_status: "open",
    basic_category: "pharmacy",
    taxonomy_primary: "retail_pharmacy",
    taxonomy_hierarchy: ["shopping", "retail", "pharmacy", "retail_pharmacy"],
    taxonomy_alternates: ["health_care_service"],
    confidence: 0.91,
    primary_name: "Fixture Pharmacy",
    common_names: { en: ["Fixture Pharmacy"] },
    websites: ["https://example.test/fixture"],
    brand_primary_name: "Fixture Health",
    brand_common_names: { en: ["Fixture Health"] },
    brand_wikidata: "Q123",
    address_freeform: "100 Test Street",
    address_locality: "Chicago",
    address_postcode: "60601-1234",
    address_region: "US-IL",
    address_country: "US",
    latitude: 41.885,
    longitude: -87.622,
    sources: [{ dataset: "meta", record_id: "meta-1", update_time: "2026-08-10T00:00:00Z", confidence: 0.91, license: null }],
    ...overrides,
  };
}

function context() {
  return {
    runId: "fixture-run",
    retrievedAt: "2026-09-03T12:00:00.000Z",
    sourceReleaseId: "overture-places-2026-08-19.0-fixture",
    overtureReleaseId: "2026-08-19.0",
    releaseObservedAt: "2026-08-19T00:00:00Z",
    baselineByZip: new Map([["60601", { postal_label: { preferred_state: "IL" } }]]),
  };
}

async function writeBaseline(root) {
  const releaseDirectory = path.join(root, "releases", "zbp-fixture");
  await mkdir(path.join(releaseDirectory, "derived"), { recursive: true });
  const rows = ["60601", "99999"].map((zipCode) => ({
    zip_code: zipCode,
    coverage_status: "zbp-and-zcta",
    current_usps_validity: { status: "unverified" },
    postal_label: zipCode === "60601" ? { preferred_state: "IL" } : null,
    geography: { status: "2020-zcta-polygon-available", geo_id: `zcta:${zipCode}`, geoid: zipCode },
    employer_baseline: { status: "published", establishments: 10 },
  }));
  const buffer = Buffer.from(`${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);
  await writeFile(path.join(releaseDirectory, "derived", "zip-coverage.jsonl"), buffer);
  const manifest = {
    dataset_id: "census-zbp-baseline",
    release_id: "zbp-fixture",
    complete_national_release: true,
    artifacts: [{ path: "derived/zip-coverage.jsonl", bytes: buffer.length, sha256: sha256(buffer), artifact_type: "zip-coverage-union-jsonl" }],
  };
  await writeFile(path.join(releaseDirectory, "manifest.json"), `${JSON.stringify(manifest)}\n`);
  const pointer = path.join(root, "current.json");
  await writeFile(pointer, `${JSON.stringify({ manifest: "releases/zbp-fixture/manifest.json" })}\n`);
  return pointer;
}

function sourceMetadata() {
  return {
    overture_release_id: "2026-08-19.0",
    overture_release_datetime: "2026-08-19T00:00:00Z",
    prepared_at: "2026-09-03T11:00:00.000Z",
    stac_fingerprint: "a".repeat(64),
    query_contract_sha256: "b".repeat(64),
  };
}

async function gunzipRecords(filename) {
  const compressed = await readFile(filename);
  const chunks = [];
  const stream = createGunzip();
  stream.on("data", (chunk) => chunks.push(chunk));
  stream.end(compressed);
  await new Promise((resolve, reject) => stream.on("end", resolve).on("error", reject));
  return Buffer.concat(chunks).toString("utf8").split("\n").filter(Boolean).map(JSON.parse);
}

function mockStacFetch() {
  const release = "2026-08-19.0";
  const documents = new Map([
    ["https://stac.overturemaps.org/catalog.json", {
      type: "Catalog", stac_version: "1.1.0", links: [{ rel: "child", latest: true, href: `https://stac.overturemaps.org/${release}/catalog.json` }],
    }],
    [`https://stac.overturemaps.org/${release}/places/place/collection.json`, {
      type: "Collection", id: "place", stac_version: "1.1.0", links: [0, 1].map((index) => ({ rel: "item", href: `https://stac.overturemaps.org/${release}/places/place/${String(index).padStart(5, "0")}/${String(index).padStart(5, "0")}.json` })),
    }],
  ]);
  for (const index of [0, 1]) {
    const part = String(index).padStart(5, "0");
    documents.set(`https://stac.overturemaps.org/${release}/places/place/${part}/${part}.json`, {
      type: "Feature", id: part,
      assets: { aws: { href: `https://overturemaps-us-west-2.s3.us-west-2.amazonaws.com/release/${release}/theme=places/type=place/part-${part}-c7e47654-8483-5b8f-b183-7ba73334f7a5-c000.zstd.parquet` } },
      properties: { num_rows: 4_500_000 + index, num_row_groups: 256, datetime: "2026-08-19T00:00:00Z" },
    });
  }
  return async (url) => {
    const document = documents.get(String(url));
    return { status: document ? 200 : 404, ok: Boolean(document), json: async () => structuredClone(document) };
  };
}

test("preflights an immutable latest Overture release without touching data assets", async () => {
  const result = await preflightOverturePlaces({ fetchImpl: mockStacFetch(), now: () => new Date("2026-09-03T12:00:00.000Z") });
  assert.equal(result.release_id, "2026-08-19.0");
  assert.equal(result.asset_count, 2);
  assert.equal(result.declared_global_rows, 9_000_001);
  assert.equal(result.status, "ready-metadata-only-large-acquisition-not-authorized");
  assert.match(result.stac_fingerprint, /^[0-9a-f]{64}$/);
  assert.equal(result.geometry_policy, "business-records-retain-latitude-and-longitude-only");
});

test("fails closed on redirects, hostile assets, and an unapproved large acquisition", async () => {
  await assert.rejects(() => preflightOverturePlaces({ fetchImpl: async () => ({ status: 302, ok: false, json: async () => ({}) }) }), /redirects are not permitted/);
  const fetchImpl = mockStacFetch();
  const original = await fetchImpl("https://stac.overturemaps.org/2026-08-19.0/places/place/00000/00000.json");
  const hostile = await original.json();
  hostile.assets.aws.href = "https://example.com/place.parquet";
  await assert.rejects(() => preflightOverturePlaces({
    fetchImpl: async (url) => String(url).endsWith("/00000/00000.json") ? { status: 200, ok: true, json: async () => hostile } : fetchImpl(url),
  }), /Unexpected AWS place asset URL/);
  await assert.rejects(() => prepareOvertureUsPlacesSource({ outputRoot: "unused", authorization: "yes" }), /blocked without the exact explicit authorization/);
  assert.equal(OVERTURE_LARGE_ACQUISITION_CONFIRMATION, "I-APPROVE-OVERTURE-LARGE-ACQUISITION");
});

test("defines a selected extraction without storing geometry, bbox, or contact fields", () => {
  const url = "https://overturemaps-us-west-2.s3.us-west-2.amazonaws.com/release/2026-08-19.0/theme=places/type=place/part-00000-c7e47654-8483-5b8f-b183-7ba73334f7a5-c000.zstd.parquet";
  const sql = overtureExtractionSql([url], "C:\\fixture\\selected.jsonl.gz");
  assert.match(sql, /AS latitude/);
  assert.match(sql, /AS longitude/);
  assert.doesNotMatch(sql, /geometry\s+AS/i);
  for (const field of ["geometry", "bbox", "emails", "phones", "socials"]) assert.equal(OVERTURE_SELECTED_FIELDS.includes(field), false);
});

test("executes the governed DuckDB extraction contract against an offline GeoParquet fixture", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "overture-geoparquet-fixture-"));
  try {
    const database = path.join(root, "fixture.duckdb").replaceAll("\\", "/");
    const parquet = path.join(root, "fixture.parquet").replaceAll("\\", "/");
    const selected = path.join(root, "selected.jsonl.gz").replaceAll("\\", "/");
    const instance = await DuckDBInstance.create(database);
    const connection = await instance.connect();
    await connection.run(`COPY (SELECT
      '11111111-1111-4111-8111-111111111111'::UUID AS id,
      3::BIGINT AS version,
      'open'::VARCHAR AS operating_status,
      'pharmacy'::VARCHAR AS basic_category,
      {'primary':'retail_pharmacy'::VARCHAR, 'hierarchy':['shopping','retail','pharmacy','retail_pharmacy']::VARCHAR[], 'alternates':['health_care_service']::VARCHAR[]} AS taxonomy,
      0.91::DOUBLE AS confidence,
      {'primary':'Fixture Pharmacy'::VARCHAR, 'common':map(['en'], [['Fixture Pharmacy']])} AS names,
      ['https://example.test']::VARCHAR[] AS websites,
      {'names':{'primary':'Fixture Health'::VARCHAR, 'common':map(['en'], [['Fixture Health']])}, 'wikidata':'Q123'::VARCHAR} AS brand,
      [{'freeform':'100 Test Street'::VARCHAR, 'locality':'Chicago'::VARCHAR, 'postcode':'60601-1234'::VARCHAR, 'region':'US-IL'::VARCHAR, 'country':'US'::VARCHAR}] AS addresses,
      {'xmin':-87.622::DOUBLE, 'ymin':41.885::DOUBLE, 'xmax':-87.622::DOUBLE, 'ymax':41.885::DOUBLE} AS bbox,
      [{'property':NULL::VARCHAR, 'dataset':'meta'::VARCHAR, 'license':NULL::VARCHAR, 'record_id':'meta-1'::VARCHAR, 'update_time':TIMESTAMPTZ '2026-08-10 00:00:00+00', 'confidence':0.91::DOUBLE, 'provider':NULL::VARCHAR, 'resource':NULL::VARCHAR, 'version':NULL::VARCHAR, 'between':NULL::VARCHAR}] AS sources
    ) TO '${parquet}' (FORMAT PARQUET)`);
    const remoteFixture = "https://overturemaps-us-west-2.s3.us-west-2.amazonaws.com/release/2026-08-19.0/theme=places/type=place/part-00000-c7e47654-8483-5b8f-b183-7ba73334f7a5-c000.zstd.parquet";
    const sql = overtureExtractionSql([remoteFixture], selected).replace(remoteFixture, parquet);
    await connection.run(sql);
    connection.closeSync();
    const rows = await gunzipRecords(selected);
    assert.equal(rows.length, 1);
    assert.deepEqual(Object.keys(rows[0]).sort(), [...OVERTURE_SELECTED_FIELDS].sort());
    assert.equal(rows[0].latitude, 41.885);
    assert.equal(rows[0].longitude, -87.622);
    for (const field of ["geometry", "bbox", "emails", "phones", "socials"]) assert.equal(Object.hasOwn(rows[0], field), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("normalizes address coordinates and keeps ZIP5 and ZIP+4 separate without asserting a business", () => {
  assert.deepEqual(splitUsPostcode("60601-1234"), { zip_code: "60601", zip4: "1234", source_postcode: "60601-1234", status: "normalized-us-zip-plus-4" });
  assert.deepEqual(splitUsPostcode("bad"), { zip_code: null, zip4: null, source_postcode: "bad", status: "unusable-source-postcode" });
  const normalized = normalizeOvertureUsPlace(source(), context());
  assert.deepEqual(normalized.geocode, { latitude: 41.885, longitude: -87.622, source: "overture-place-point" });
  assert.equal(normalized.reported_address.zip_code, "60601");
  assert.equal(normalized.reported_address.zip4, "1234");
  assert.equal(normalized.classification.place_scope, "business-or-institution-place-candidate");
  assert.equal(normalized.classification.commercial_business_asserted, false);
  assert.equal(normalized.source_status.active_business_status_inferred, false);
  assert.equal(normalized.privacy.geometry_excluded, true);
  assert.equal(Object.hasOwn(normalized, "geometry"), false);
});

test("missing or nonnumeric measurements are not coerced to zero", () => {
  for (const value of [null, undefined, "", " ", "0", false, true, [], {}, NaN, Infinity]) {
    for (const coordinate of ["latitude", "longitude"]) assert.throws(() => normalizeOvertureUsPlace(source({ [coordinate]: value }), context()), /missing-or-invalid-coordinate/);
    assert.throws(() => normalizeOvertureUsPlace(source({ version: value }), context()), /invalid-version/);
    const normalized = normalizeOvertureUsPlace(source({ sources: [{ dataset: "meta", record_id: "fixture", confidence: value }] }), context());
    assert.equal(normalized.source_records[0].source_confidence, null);
    if (value !== null && value !== undefined) assert.throws(() => normalizeOvertureUsPlace(source({ confidence: value }), context()), /invalid-confidence/);
  }
  const zero = normalizeOvertureUsPlace(source({ latitude: 0, longitude: 0, version: 0, confidence: 0, sources: [{ dataset: "meta", record_id: "fixture", confidence: 0 }] }), context());
  assert.deepEqual(zero.geocode, { latitude: 0, longitude: 0, source: "overture-place-point" });
  assert.equal(zero.source_records[0].source_confidence, 0);
  assert.equal(zero.source_status.confidence, 0);
  assert.equal(normalizeOvertureUsPlace(source({ confidence: null }), context()).source_status.confidence, null);
  assert.equal(zero.provenance.transformation_version, "overture-us-places@1.0.1");
});

test("builds, quarantines, publishes, and independently verifies an offline Overture fixture", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "overture-us-places-fixture-"));
  try {
    const zbpPointer = await writeBaseline(path.join(root, "zbp"));
    const records = [
      source(),
      source({ id: "22222222-2222-4222-8222-222222222222", primary_name: "Fixture Cafe", address_postcode: null, operating_status: "temporarily_closed", taxonomy_primary: "cafe", taxonomy_hierarchy: ["food_and_drink", "casual_eatery", "cafe"], basic_category: "cafe" }),
      source({ id: "33333333-3333-4333-8333-333333333333", primary_name: null }),
      source({ id: "44444444-4444-4444-8444-444444444444", latitude: null, longitude: null }),
    ];
    const result = await buildOvertureUsPlaces({
      outputRoot: path.join(root, "output"), zbpPointer, sourceRecords: records, sourceMetadata: sourceMetadata(),
      publicationMode: "publish",
      minimumPlaces: 1, maximumQuarantineRatio: 1, now: () => new Date("2026-09-03T12:00:00.000Z"), logger: () => {},
    });
    assert.equal(result.manifest.coverage.selected_us_place_records, 4);
    assert.equal(result.manifest.coverage.normalized_places, 2);
    assert.equal(result.manifest.coverage.quarantined_records, 2);
    assert.equal(result.manifest.coverage.records_with_valid_zip5, 1);
    assert.equal(result.manifest.coverage.records_with_separate_zip4, 1);
    assert.equal(result.manifest.coverage.complete_all_us_businesses, false);
    const summaryArtifact = result.manifest.artifacts.find(a => a.artifact_type === "overture-us-place-source-summary");
    const summary = JSON.parse(await readFile(path.join(result.releaseDirectory, summaryArtifact.path), "utf8"));
    assert.equal(summary.normalization_output_budget.records_reserved, 4);
    assert.equal(summary.normalization_output_budget.registered_files, 17);
    assert.equal(summary.normalization_output_budget.compressed_bytes_reserved,
      result.manifest.artifacts.filter(a => ["normalized-overture-us-place-jsonl-gzip", "overture-us-place-quarantine-jsonl-gzip"].includes(a.artifact_type)).reduce((sum, a) => sum + a.bytes, 0));
    const verified = await verifyOvertureUsPlaces(path.join(result.releaseDirectory, "manifest.json"));
    assert.equal(verified.coverage.normalized_places, 2);
    const artifacts = result.manifest.artifacts.filter((artifact) => artifact.artifact_type === "normalized-overture-us-place-jsonl-gzip");
    const normalized = (await Promise.all(artifacts.map((artifact) => gunzipRecords(path.join(result.releaseDirectory, artifact.path))))).flat();
    assert.equal(normalized.length, 2);
    for (const record of normalized) {
      assert.equal(Object.hasOwn(record, "geometry"), false);
      assert.equal(Object.hasOwn(record, "bbox"), false);
      assert.equal(typeof record.geocode.latitude, "number");
      assert.equal(typeof record.geocode.longitude, "number");
    }
    const quarantine = result.manifest.artifacts.find(artifact => artifact.artifact_type === "overture-us-place-quarantine-jsonl-gzip");
    assert.ok((await gunzipRecords(path.join(result.releaseDirectory, quarantine.path))).some(record => record.reason === "missing-or-invalid-coordinate"));
    const artifact = artifacts.find(candidate => candidate.record_count > 0), filename = path.join(result.releaseDirectory, artifact.path);
    const original = await gunzipRecords(filename);
    for (const [coordinate, value] of [["latitude", 91], ["latitude", -91], ["longitude", 181], ["longitude", -181]]) {
      const changed = structuredClone(original); changed[0].geocode[coordinate] = value;
      const raw = gzipSync(changed.map(record => JSON.stringify(record) + "\n").join(""));
      await writeFile(filename, raw); artifact.bytes = raw.length; artifact.sha256 = sha256(raw);
      await writeFile(path.join(result.releaseDirectory, "manifest.json"), JSON.stringify(result.manifest));
      await assert.rejects(verifyOvertureUsPlaces(path.join(result.releaseDirectory, "manifest.json")), error => error.failures?.some(failure => failure.reason === "invalid normalized geocode"));
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("source replay rejects rehashed semantic mutations and missing context", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "overture-replay-fixture-"));
  try {
    const built = await buildOvertureUsPlaces({ outputRoot: path.join(root, "output"), zbpPointer: await writeBaseline(path.join(root, "zbp")),
      sourceRecords: [source(), source({ id: "33333333-3333-4333-8333-333333333333", primary_name: null })], sourceMetadata: sourceMetadata(),
      minimumPlaces: 1, maximumQuarantineRatio: 1, logger: () => {} });
    const filename = path.join(built.releaseDirectory, "manifest.json"), originalManifest = await readFile(filename);
    const manifest = JSON.parse(originalManifest), artifact = manifest.artifacts.find(a => a.artifact_type === "normalized-overture-us-place-jsonl-gzip" && a.record_count);
    const target = path.join(built.releaseDirectory, artifact.path), originalBytes = await readFile(target), [record] = await gunzipRecords(target);
    const mutations = [r => r.names.primary_name = "Altered", r => r.reported_address.address_line = "Altered",
      r => r.reported_address.zip4 = "9999", r => r.geocode.latitude = 40, r => r.classification.taxonomy_primary = "cafe",
      r => r.source_status.confidence = 0.5, r => r.brand.primary_name = "Altered", r => r.source_records[0].record_id = "Altered",
      r => r.provenance.retrieved_at = "2020-01-01T00:00:00.000Z", r => r.extra = true];
    for (const mutate of mutations) {
      const changed = structuredClone(record); mutate(changed);
      const raw = gzipSync(JSON.stringify(changed) + "\n"); await writeFile(target, raw);
      artifact.bytes = raw.length; artifact.sha256 = sha256(raw); await writeFile(filename, JSON.stringify(manifest));
      await assert.rejects(verifyOvertureUsPlaces(filename), e => e.failures?.some(f => /source-to-output replay/.test(f.reason)));
    }
    await writeFile(target, originalBytes); await writeFile(filename, originalManifest);
    await verifyOvertureUsPlaces(filename);
    const missingContext = JSON.parse(originalManifest); delete missingContext.replay_context;
    await writeFile(filename, JSON.stringify(missingContext));
    await assert.rejects(verifyOvertureUsPlaces(filename), e => e.failures?.some(f => /source-to-output replay/.test(f.reason)));
    await writeFile(filename, originalManifest);
    const quarantine = manifest.artifacts.find(a => a.artifact_type === "overture-us-place-quarantine-jsonl-gzip");
    const quarantinePath = path.join(built.releaseDirectory, quarantine.path), [q] = await gunzipRecords(quarantinePath);
    q.reason = "invalid-version";
    const qraw = gzipSync(JSON.stringify(q) + "\n"); await writeFile(quarantinePath, qraw);
    const qmanifest = JSON.parse(originalManifest), qa = qmanifest.artifacts.find(a => a.path === quarantine.path);
    qa.bytes = qraw.length; qa.sha256 = sha256(qraw); await writeFile(filename, JSON.stringify(qmanifest));
    await assert.rejects(verifyOvertureUsPlaces(filename), e => e.failures?.some(f => /source-to-output replay/.test(f.reason)));
    await assert.rejects(verifyOvertureUsPlaces(filename, { signal: AbortSignal.abort() }));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("normalization retains by default and requires a separate explicit promotion", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "overture-retention-"));
  try {
    const zbpPointer = await writeBaseline(path.join(root, "zbp")), outputRoot = path.join(root, "output");
    await mkdir(outputRoot); const pointerPath = path.join(outputRoot, "current.json"), original = '{"existing":"published-data"}\n';
    await writeFile(pointerPath, original);
    const result = await buildOvertureUsPlaces({ outputRoot, zbpPointer, sourceRecords: [source()], sourceMetadata: sourceMetadata(), minimumPlaces: 1, logger: () => {} });
    assert.equal(result.status, "verified-retained-not-promoted");
    assert.equal(result.pointerPath, null);
    const checkRoot = path.join(outputRoot, ".identity-checks", result.stagingRunId), checks = await readdir(checkRoot);
    assert.equal(checks.length, 1);
    assert.ok((await stat(path.join(checkRoot, checks[0], "identity.duckdb"))).size > 0);
    assert.equal(await readFile(pointerPath, "utf8"), original);
    assert.equal(path.dirname(result.releaseDirectory), path.join(outputRoot, ".staging"));
    assert.equal((await verifyOvertureUsPlaces(path.join(result.releaseDirectory, "manifest.json"))).coverage.normalized_places, 1);
    const reused = await buildOvertureUsPlaces({ outputRoot: path.join(root, "reused"), zbpPointer,
      sourceFile: path.join(result.releaseDirectory, "source/selected-records.jsonl.gz"),
      sourceMetadataFile: path.join(result.releaseDirectory, "source/source-metadata.json"), minimumPlaces: 1, logger: () => {} });
    assert.equal(reused.pointerPath, null);
    assert.equal(reused.manifest.source_release_id, result.manifest.source_release_id);
    assert.equal((await verifyOvertureUsPlaces(path.join(reused.releaseDirectory, "manifest.json"))).coverage.normalized_places, 1);
    await assert.rejects(publishOvertureUsPlacesStaging({ outputRoot, stagingRunId: "../outside" }));
    await assert.rejects(publishOvertureUsPlacesStaging({ outputRoot, stagingRunId: result.stagingRunId, signal: AbortSignal.abort() }));
    assert.equal(await readFile(pointerPath, "utf8"), original);
    const promoted = await publishOvertureUsPlacesStaging({ outputRoot, stagingRunId: result.stagingRunId, expectedReleaseId: result.manifest.release_id });
    assert.equal(JSON.parse(await readFile(promoted.pointerPath, "utf8")).release_id, result.manifest.release_id);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("build CLI documents explicit publication and rejects duplicate publication flags", () => {
  const script = path.resolve("scripts/build-overture-us-places.mjs");
  const help = spawnSync(process.execPath, [script, "--help"], { encoding: "utf8" });
  assert.equal(help.status, 0); assert.match(help.stdout, /default does not update current.json/); assert.match(help.stdout, /--publish/);
  const duplicate = spawnSync(process.execPath, [script, "--publish", "--publish"], { encoding: "utf8" });
  assert.equal(duplicate.status, 1); assert.match(duplicate.stderr, /Duplicate build option/);
});

test("disk-backed verification rejects rehashed duplicate identities across normalized partitions", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "overture-disk-verify-"));
  try {
    const zbpPointer = await writeBaseline(path.join(root, "zbp")), outputRoot = path.join(root, "output");
    const result = await buildOvertureUsPlaces({ outputRoot, zbpPointer,
      sourceRecords: [source(), source({ id: "22222222-2222-4222-8222-222222222222" })], sourceMetadata: sourceMetadata(), minimumPlaces: 1, logger: () => {} });
    const artifacts = result.manifest.artifacts.filter(a => a.artifact_type === "normalized-overture-us-place-jsonl-gzip" && a.record_count);
    const first = (await gunzipRecords(path.join(result.releaseDirectory, artifacts[0].path)))[0].normalized_record_id;
    let seen = false;
    for (const artifact of artifacts) {
      const rows = await gunzipRecords(path.join(result.releaseDirectory, artifact.path));
      for (const row of rows) { if (seen) row.normalized_record_id = first; seen = true; }
      const bytes = gzipSync(rows.map(row => JSON.stringify(row) + "\n").join(""));
      await writeFile(path.join(result.releaseDirectory, artifact.path), bytes); artifact.bytes = bytes.length; artifact.sha256 = sha256(bytes);
    }
    await writeFile(path.join(result.releaseDirectory, "manifest.json"), JSON.stringify(result.manifest));
    await assert.rejects(verifyOvertureUsPlaces(path.join(result.releaseDirectory, "manifest.json")), error => error.failures?.some(f => /duplicate source identities/.test(f.reason)));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("failed pointer commit preserves the moved release with an inspection reference", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "overture-promotion-failure-"));
  try {
    const zbpPointer = await writeBaseline(path.join(root, "zbp")), outputRoot = path.join(root, "output");
    const result = await buildOvertureUsPlaces({ outputRoot, zbpPointer, sourceRecords: [source()], sourceMetadata: sourceMetadata(), minimumPlaces: 1, logger: () => {} });
    // A directory at the pointer path forces a real filesystem commit failure.
    await mkdir(path.join(outputRoot, "current.json"));
    let failure;
    try { await publishOvertureUsPlacesStaging({ outputRoot, stagingRunId: result.stagingRunId }); }
    catch (error) { failure = error; }
    assert.equal(failure?.recovery?.publicationCommitted, false);
    assert.equal(failure.recovery.releaseDirectory, path.join(outputRoot, "releases", result.manifest.release_id));
    assert.equal(JSON.parse(await readFile(path.join(failure.recovery.releaseDirectory, "manifest.json"), "utf8")).release_id, result.manifest.release_id);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("invalid publication mode and cancellation after verification cannot change current", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "overture-final-cancel-"));
  try {
    const zbpPointer = await writeBaseline(path.join(root, "zbp")), outputRoot = path.join(root, "output");
    const options = { outputRoot, zbpPointer, sourceRecords: [source()], sourceMetadata: sourceMetadata(), minimumPlaces: 1 };
    await assert.rejects(buildOvertureUsPlaces({ ...options, publicationMode: "typo" }));
    const controller = new AbortController();
    await assert.rejects(buildOvertureUsPlaces({ ...options, publicationMode: "publish", signal: controller.signal, logger: () => controller.abort() }), { name: "AbortError" });
    await assert.rejects(readFile(path.join(outputRoot, "current.json")), { code: "ENOENT" });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("rejects selected-field drift, duplicate identities, quality failure, and cancellation", async () => {
  assert.throws(() => normalizeOvertureUsPlace({ ...source(), geometry: "POINT" }, context()), /selected source fields drifted/);
  assert.throws(() => normalizeOvertureUsPlace(source({ latitude: 100 }), context()), /missing-or-invalid-coordinate/);
  assert.throws(() => normalizeOvertureUsPlace(source({ operating_status: "permanently_closed" }), context()), /permanently-closed-record/);
  const root = await mkdtemp(path.join(tmpdir(), "overture-us-places-failure-"));
  try {
    const zbpPointer = await writeBaseline(path.join(root, "zbp"));
    await assert.rejects(() => buildOvertureUsPlaces({
      outputRoot: path.join(root, "duplicate"), zbpPointer, sourceRecords: [source(), source()], sourceMetadata: sourceMetadata(),
      minimumPlaces: 1, maximumQuarantineRatio: 1, logger: () => {},
    }), /duplicate source identities/);
    await assert.rejects(() => buildOvertureUsPlaces({
      outputRoot: path.join(root, "duplicate-missing"), zbpPointer, sourceRecords: [source({ id: null }), source({ id: null })], sourceMetadata: sourceMetadata(),
      minimumPlaces: 1, maximumQuarantineRatio: 1, logger: () => {},
    }), /duplicate source identities/);
    await assert.rejects(() => buildOvertureUsPlaces({
      outputRoot: path.join(root, "quality"), zbpPointer, sourceRecords: [source({ primary_name: null })], sourceMetadata: sourceMetadata(),
      minimumPlaces: 1, maximumQuarantineRatio: 0, logger: () => {},
    }), /quality gate failed/);
    await assert.rejects(() => buildOvertureUsPlaces({
      outputRoot: path.join(root, "summary-limit"), zbpPointer,
      sourceRecords: [source({ taxonomy_hierarchy: ["x".repeat(513), "pharmacy", "retail_pharmacy"] })], sourceMetadata: sourceMetadata(),
      minimumPlaces: 1, maximumQuarantineRatio: 1, logger: () => {},
    }));
    await assert.rejects(readFile(path.join(root, "summary-limit", "current.json")), { code: "ENOENT" });
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(() => buildOvertureUsPlaces({
      outputRoot: path.join(root, "cancelled"), zbpPointer, sourceRecords: [source()], sourceMetadata: sourceMetadata(),
      minimumPlaces: 1, maximumQuarantineRatio: 1, signal: controller.signal, logger: () => {},
    }), { name: "AbortError" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
