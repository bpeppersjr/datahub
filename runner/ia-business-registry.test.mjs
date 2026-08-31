import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createGunzip } from "node:zlib";
import {
  buildIaBusinessRegistry,
  downloadIaArchive,
  IA_BUSINESS_REGISTRY_SCHEMA_FINGERPRINT,
  IA_BUSINESS_REGISTRY_SELECTED_FIELDS,
  IA_BUSINESS_REGISTRY_SELECTED_SCHEMA,
  normalizeIaBusinessEntity,
  requestIaColumns,
  requestIaMetadata,
  schemaFingerprint,
  verifyIaBusinessRegistry,
} from "./ia-business-registry.mjs";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function columns() {
  return IA_BUSINESS_REGISTRY_SELECTED_SCHEMA.map(([name, type]) => ({ name, type }));
}

function metadata(overrides = {}) {
  return {
    data: {
      id: 554,
      title: "Active Iowa Business Entities",
      tableBaseName: "active_business_entities",
      status: "Published",
      audience: "Public",
      columnUniqueIdentifier: "corp_number",
      updateFrequency: "Monthly",
      numRows: 4,
      modifiedAt: "2026-08-10T07:59:03.509660-05:00",
      metadata: { metadatafield15: "[CC BY](https://creativecommons.org/licenses/by/4.0/)" },
      ...overrides,
    },
  };
}

function row(overrides = {}) {
  return {
    corp_number: "123456",
    legal_name: "Fixture Iowa Company LLC",
    corporation_type: "DOMESTIC LIMITED LIABILITY COMPANY",
    effective_date: "2020-06-16",
    registered_agent: "Excluded Person",
    ra_address_1: "Excluded address",
    ho_address_1: "610 East Locust Street",
    ho_address_2: "Suite 200",
    ho_city: "Des Moines",
    ho_state: "IA",
    ho_zip: "50309",
    ho_country: "USA",
    ho_latitude: "41.5898",
    ho_longitude: "-93.6153",
    ...overrides,
  };
}

function context() {
  return {
    runId: "ia-fixture-run",
    retrievedAt: "2026-08-31T12:00:00.000Z",
    sourceModifiedAt: "2026-08-10T12:59:03.509Z",
    sourceReleaseId: "ia-fixture-source",
    baselineByZip: new Map([
      ["50309", { geography: { status: "2020-zcta-polygon-available", geo_id: "zcta:50309", geoid: "50309" } }],
      ["98004", { geography: { status: "2020-zcta-polygon-available", geo_id: "zcta:98004", geoid: "98004" } }],
    ]),
  };
}

async function writeBaseline(root) {
  const releaseDirectory = path.join(root, "releases", "zbp-fixture");
  await mkdir(path.join(releaseDirectory, "derived"), { recursive: true });
  const rows = ["50309", "51501", "98004", "99999"].map((zipCode) => ({
    zip_code: zipCode,
    coverage_status: "zbp-and-zcta",
    current_usps_validity: { status: "unverified" },
    geography: { status: "2020-zcta-polygon-available", geo_id: `zcta:${zipCode}`, geoid: zipCode },
    employer_baseline: { status: "published", establishments: 10 },
  }));
  const buffer = Buffer.from(`${rows.map((item) => JSON.stringify(item)).join("\n")}\n`);
  await writeFile(path.join(releaseDirectory, "derived", "zip-coverage.jsonl"), buffer);
  const manifest = {
    dataset_id: "census-zbp-baseline",
    release_id: "zbp-fixture",
    complete_national_release: true,
    geography_dependency: { dataset_id: "us-census-geography", release_id: "geo-fixture" },
    artifacts: [{ path: "derived/zip-coverage.jsonl", bytes: buffer.length, sha256: sha256(buffer) }],
  };
  await writeFile(path.join(releaseDirectory, "manifest.json"), `${JSON.stringify(manifest)}\n`);
  const pointer = path.join(root, "current.json");
  await writeFile(pointer, `${JSON.stringify({ manifest: "releases/zbp-fixture/manifest.json" })}\n`);
  return pointer;
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

test("pins business-only Iowa fields and excludes registered-agent data", () => {
  assert.equal(IA_BUSINESS_REGISTRY_SELECTED_FIELDS.length, 12);
  assert.equal(sha256(IA_BUSINESS_REGISTRY_SELECTED_SCHEMA.map(([field, type]) => `${field}:${type}`).join("\u0000")), IA_BUSINESS_REGISTRY_SCHEMA_FINGERPRINT);
  assert.equal(schemaFingerprint(columns()), IA_BUSINESS_REGISTRY_SCHEMA_FINGERPRINT);
  for (const excluded of ["registered_agent", "ra_address_1", "ra_address_2", "ra_city", "ra_state", "ra_zip", "ra_latitude", "ra_longitude", "ra_location", "home_office", "ho_location"]) {
    assert.equal(IA_BUSINESS_REGISTRY_SELECTED_FIELDS.includes(excluded), false);
  }
});

test("normalizes Iowa registration evidence without inferring a site, establishment, or owner", () => {
  const normalized = normalizeIaBusinessEntity(row(), context());
  assert.equal(normalized.entity_candidates.organization_id, "organization:ia_sos_corp_123456");
  assert.equal(normalized.entity_candidates.physical_site_id, null);
  assert.equal(normalized.entity_candidates.establishment_id, null);
  assert.equal(normalized.home_office_address.eligible_for_us_zip_coverage, true);
  assert.equal(normalized.home_office_address.coordinate_status, "source-geocoded-coordinate-pair");
  assert.equal(normalized.home_office_address.geography.zcta_geoid, "50309");
  assert.equal(JSON.stringify(normalized).includes("Excluded Person"), false);

  const foreign = normalizeIaBusinessEntity(row({ corp_number: "123457", ho_state: "ON", ho_zip: "M5V 2T6", ho_country: "CAN", ho_latitude: "", ho_longitude: "" }), context());
  assert.equal(foreign.home_office_address.eligible_for_us_zip_coverage, false);
  assert.equal(foreign.home_office_address.coordinate_status, "not-provided");

  const partialCoordinates = normalizeIaBusinessEntity(row({ corp_number: "123458", ho_latitude: "41.5", ho_longitude: "" }), context());
  assert.equal(partialCoordinates.home_office_address.latitude, null);
  assert.equal(partialCoordinates.home_office_address.coordinate_status, "incomplete-source-coordinate-pair");
});

test("retries Iowa metadata and validates the signed columns redirect", async () => {
  let metadataAttempts = 0;
  const metadataResult = await requestIaMetadata({
    sleep: async () => {},
    fetchImpl: async () => {
      metadataAttempts += 1;
      if (metadataAttempts === 1) return new Response("temporary", { status: 503 });
      return new Response(JSON.stringify(metadata()), { status: 200, headers: { "content-type": "application/json" } });
    },
  });
  assert.equal(metadataResult.data.id, 554);
  assert.equal(metadataAttempts, 2);

  const redirect = "https://storage.googleapis.com/iowa-datahub-prod/iowa-datahub-exports/datasets/554/columns.json?X-Goog-Signature=fixture";
  let requests = 0;
  const schema = await requestIaColumns({
    sleep: async () => {},
    fetchImpl: async (url) => {
      requests += 1;
      if (String(url).startsWith("https://idh-be.iowa.gov")) return new Response("", { status: 303, headers: { location: redirect } });
      return new Response(JSON.stringify(columns()), { status: 200, headers: { "content-type": "application/json" } });
    },
  });
  assert.deepEqual(schema, columns());
  assert.equal(requests, 2);
  await assert.rejects(() => requestIaColumns({ fetchImpl: async () => new Response("", { status: 303, headers: { location: "https://example.invalid/columns.json" } }) }), /outside the approved storage object/);
});

test("accepts a streaming Iowa archive response without Content-Length", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "datahub-ia-download-test-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const destination = path.join(root, "source.zip");
  const body = Buffer.from("fixture-archive-body");
  await downloadIaArchive(destination, {
    fetchImpl: async () => new Response(body, {
      status: 200,
      headers: {
        "content-type": "application/zip",
        "content-disposition": "attachment; filename=active_iowa_business_entities_554_rows.zip",
      },
    }),
    sleep: async () => {},
    logger: () => {},
  });
  assert.deepEqual(await readFile(destination), body);
});

test("builds and independently verifies an Iowa active-entity release", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "datahub-ia-business-test-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const rows = [
    row(),
    row({ corp_number: "123457", legal_name: "Canadian Parent Inc", corporation_type: "FOREIGN PROFIT", ho_address_1: "10 King Street", ho_address_2: "", ho_city: "Toronto", ho_state: "ON", ho_zip: "M5V 2T6", ho_country: "CAN", ho_latitude: "", ho_longitude: "" }),
    row({ corp_number: "123458", legal_name: "", ho_address_1: "5 Missing Name Road", ho_latitude: "", ho_longitude: "" }),
    row({ corp_number: "123459", legal_name: "Washington Office LLC", corporation_type: "FOREIGN LIMITED LIABILITY COMPANY", ho_address_1: "1 Main Street", ho_address_2: "", ho_city: "Bellevue", ho_state: "WA", ho_zip: "98004", ho_country: "USA", ho_latitude: "47.61", ho_longitude: "" }),
  ];
  const result = await buildIaBusinessRegistry({
    outputRoot: path.join(root, "output"),
    zbpPointer: await writeBaseline(path.join(root, "zbp")),
    metadataResponse: metadata(),
    columns: columns(),
    sourceRecords: rows,
    minimumEntities: 1,
    logger: () => {},
    now: () => new Date("2026-08-31T12:00:00.000Z"),
  });
  assert.equal(result.manifest.coverage.source_rows, 4);
  assert.equal(result.manifest.coverage.active_entities_published, 3);
  assert.equal(result.manifest.coverage.quarantined_entities, 1);
  assert.equal(result.manifest.coverage.entities_with_eligible_us_home_office_address, 2);
  assert.equal(result.manifest.coverage.eligible_us_entity_zip_contributions, 2);
  assert.equal(result.manifest.coverage.entities_with_source_geocoded_coordinates, 1);
  assert.equal(result.manifest.coverage.rejected_or_incomplete_source_coordinate_pairs, 1);
  assert.equal(result.manifest.coverage.distinct_source_zip_codes, 2);
  assert.equal(result.manifest.coverage.physical_sites, null);
  assert.equal(result.manifest.coverage.establishments, null);
  const verified = await verifyIaBusinessRegistry(path.join(result.releaseDirectory, "manifest.json"));
  assert.equal(verified.coverage.zip_union_records, 4);
  const normalizedArtifacts = result.manifest.artifacts.filter((artifact) => artifact.artifact_type === "normalized-ia-business-entity-jsonl-gzip");
  const normalized = (await Promise.all(normalizedArtifacts.map((artifact) => gunzipRecords(path.join(result.releaseDirectory, artifact.path))))).flat();
  assert.equal(normalized.length, 3);
  assert.equal(normalized.every((record) => record.entity_candidates.physical_site_id === null), true);
  assert.equal(JSON.stringify(normalized).includes("registered_agent"), false);
  const current = JSON.parse(await readFile(result.pointerPath, "utf8"));
  assert.equal(current.release_id, result.manifest.release_id);
});

test("blocks Iowa schema drift, duplicate identity, count drift, and pre-cancelled runs", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "datahub-ia-business-invalid-test-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const zbpPointer = await writeBaseline(path.join(root, "zbp"));
  const drifted = columns().map((column) => column.name === "corporation_type" ? { ...column, type: "INTEGER" } : column);
  await assert.rejects(() => buildIaBusinessRegistry({ outputRoot: path.join(root, "drift"), zbpPointer, metadataResponse: metadata({ numRows: 1 }), columns: drifted, sourceRecords: [row()], minimumEntities: 1, logger: () => {} }), /selected schema changed/);
  await assert.rejects(() => buildIaBusinessRegistry({ outputRoot: path.join(root, "duplicate"), zbpPointer, metadataResponse: metadata({ numRows: 2 }), columns: columns(), sourceRecords: [row(), row()], minimumEntities: 1, logger: () => {} }), /Duplicate Iowa corporation number/);
  await assert.rejects(() => buildIaBusinessRegistry({ outputRoot: path.join(root, "count"), zbpPointer, metadataResponse: metadata({ numRows: 2 }), columns: columns(), sourceRecords: [row()], minimumEntities: 1, logger: () => {} }), /metadata reported 2/);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(() => buildIaBusinessRegistry({ outputRoot: path.join(root, "cancelled"), zbpPointer, metadataResponse: metadata({ numRows: 1 }), columns: columns(), sourceRecords: [row()], minimumEntities: 1, signal: controller.signal, logger: () => {} }), { name: "AbortError" });
});
