import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createGunzip } from "node:zlib";
import { DuckDBInstance } from "@duckdb/node-api";
import {
  buildOvertureUsPlaces,
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

test("builds, quarantines, publishes, and independently verifies an offline Overture fixture", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "overture-us-places-fixture-"));
  try {
    const zbpPointer = await writeBaseline(path.join(root, "zbp"));
    const records = [
      source(),
      source({ id: "22222222-2222-4222-8222-222222222222", primary_name: "Fixture Cafe", address_postcode: null, operating_status: "temporarily_closed", taxonomy_primary: "cafe", taxonomy_hierarchy: ["food_and_drink", "casual_eatery", "cafe"], basic_category: "cafe" }),
      source({ id: "33333333-3333-4333-8333-333333333333", primary_name: null }),
    ];
    const result = await buildOvertureUsPlaces({
      outputRoot: path.join(root, "output"), zbpPointer, sourceRecords: records, sourceMetadata: sourceMetadata(),
      minimumPlaces: 1, maximumQuarantineRatio: 1, now: () => new Date("2026-09-03T12:00:00.000Z"), logger: () => {},
    });
    assert.equal(result.manifest.coverage.selected_us_place_records, 3);
    assert.equal(result.manifest.coverage.normalized_places, 2);
    assert.equal(result.manifest.coverage.quarantined_records, 1);
    assert.equal(result.manifest.coverage.records_with_valid_zip5, 1);
    assert.equal(result.manifest.coverage.records_with_separate_zip4, 1);
    assert.equal(result.manifest.coverage.complete_all_us_businesses, false);
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
  } finally {
    await rm(root, { recursive: true, force: true });
  }
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
    }), /Duplicate Overture GERS ID/);
    await assert.rejects(() => buildOvertureUsPlaces({
      outputRoot: path.join(root, "quality"), zbpPointer, sourceRecords: [source({ primary_name: null })], sourceMetadata: sourceMetadata(),
      minimumPlaces: 1, maximumQuarantineRatio: 0, logger: () => {},
    }), /quality gate failed/);
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
