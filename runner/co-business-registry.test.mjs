import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createGunzip } from "node:zlib";
import {
  buildCoBusinessRegistry,
  CO_BUSINESS_REGISTRY_FIELDS,
  CO_BUSINESS_REGISTRY_SCHEMA,
  CO_BUSINESS_REGISTRY_SCHEMA_FINGERPRINT,
  normalizeCoBusinessOrganization,
  requestCoJson,
  schemaFingerprint,
  verifyCoBusinessRegistry,
} from "./co-business-registry.mjs";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function metadata(overrides = {}) {
  return {
    id: "4ykn-tg5h",
    name: "Business Entities in Colorado",
    attribution: "CDOS",
    license: { name: "Public Domain" },
    rowsUpdatedAt: 1_788_088_854,
    selectedRecordCount: 4,
    columns: CO_BUSINESS_REGISTRY_SCHEMA.map(([fieldName, dataTypeName]) => ({ fieldName, dataTypeName })),
    ...overrides,
  };
}

function organization(overrides = {}) {
  return {
    entityid: "18881009142",
    entityname: "Fixture Colorado Company LLC",
    principaladdress1: "660 Willow Wood Ln",
    principaladdress2: "Unit 204",
    principalcity: "Delta",
    principalstate: "CO",
    principalzipcode: "81416-3910",
    principalcountry: "US",
    entitystatus: "Good Standing",
    jurisdictonofformation: "CO",
    entitytype: "DLLC",
    entityformdate: "2025-06-16T00:00:00.000",
    ...overrides,
  };
}

function context() {
  return {
    runId: "co-fixture-run",
    retrievedAt: "2026-08-30T20:00:00.000Z",
    sourceRowsUpdatedAt: "2026-08-30T08:47:47.000Z",
    sourceReleaseId: "co-fixture-source",
    baselineByZip: new Map([["81416", { geography: { status: "2020-zcta-polygon-available", geo_id: "zcta:81416", geoid: "81416" } }]]),
  };
}

async function writeBaseline(root) {
  const releaseDirectory = path.join(root, "releases", "zbp-fixture");
  await mkdir(path.join(releaseDirectory, "derived"), { recursive: true });
  const rows = ["10001", "80014", "81416", "99999"].map((zipCode) => ({
    zip_code: zipCode,
    coverage_status: "zbp-and-zcta",
    current_usps_validity: { status: "unverified" },
    geography: { status: "2020-zcta-polygon-available", geo_id: `zcta:${zipCode}`, geoid: zipCode },
    employer_baseline: { status: "published", establishments: 10 },
  }));
  const buffer = Buffer.from(`${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);
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

test("pins the 12 selected non-agent Colorado Business Entities fields", () => {
  assert.equal(CO_BUSINESS_REGISTRY_FIELDS.length, 12);
  assert.equal(sha256(CO_BUSINESS_REGISTRY_SCHEMA.map(([field, type]) => `${field}:${type}`).join("\u0000")), CO_BUSINESS_REGISTRY_SCHEMA_FINGERPRINT);
  assert.equal(schemaFingerprint(metadata().columns), CO_BUSINESS_REGISTRY_SCHEMA_FINGERPRINT);
  for (const excluded of ["mailingaddress1", "agentfirstname", "agentorganizationname", "agentprincipaladdress1", "agentmailingaddress1"]) {
    assert.equal(CO_BUSINESS_REGISTRY_FIELDS.includes(excluded), false);
  }
});

test("normalizes registration evidence without inferring a physical site", () => {
  const normalized = normalizeCoBusinessOrganization(organization({
    agentfirstname: "Private",
    agentlastname: "Person",
  }), context());
  assert.equal(normalized.entity_candidates.organization_id, "organization:co_sos_record_18881009142");
  assert.equal(normalized.entity_candidates.physical_site_id, undefined);
  assert.equal(normalized.reported_business_address.postal_code, "81416");
  assert.equal(normalized.reported_business_address.zip4, "3910");
  assert.equal(normalized.reported_business_address.eligible_for_us_zip_coverage, true);
  assert.equal(normalized.reported_address_coordinate, null);
  assert.equal(normalized.registration_profile.entity_type, "DLLC");
  assert.equal(normalized.source_status.status, "Good Standing");
  assert.equal(JSON.stringify(normalized).includes("Private"), false);
  const delinquent = normalizeCoBusinessOrganization(organization({ entitystatus: "Delinquent", principalcountry: "CANADA", principalstate: "ON" }), context());
  assert.equal(delinquent.source_status.status_class, "uncured-registry-delinquency");
  assert.equal(delinquent.reported_business_address.eligible_for_us_zip_coverage, false);
  assert.throws(() => normalizeCoBusinessOrganization(organization({ entitystatus: "Voluntarily Dissolved" }), context()), /outside-selected/);
});

test("retries transient source responses and rejects redirects", async () => {
  let attempts = 0;
  const fetchImpl = async () => {
    attempts += 1;
    if (attempts === 1) return new Response("temporary", { status: 503 });
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const result = await requestCoJson("https://data.colorado.gov/api/views/4ykn-tg5h", { fetchImpl, type: "metadata", sleep: async () => {} });
  assert.deepEqual(result, { ok: true });
  assert.equal(attempts, 2);
  await assert.rejects(() => requestCoJson("https://data.colorado.gov/api/views/4ykn-tg5h", {
    type: "metadata",
    fetchImpl: async () => new Response("", { status: 302, headers: { location: "https://example.invalid" } }),
  }), /redirect rejected/);
});

test("builds and independently verifies a complete selected-field Colorado release", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "datahub-co-business-test-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const rows = [
    organization(),
    organization({ entityid: "19871073632", entityname: "Second Colorado LLC", principaladdress1: "1 Main St", principaladdress2: null, principalcity: "Aurora", principalzipcode: "80014", entitystatus: "Delinquent" }),
    organization({ entityid: "20251665680", entityname: "New York Foreign Company", principaladdress1: "50 Broadway", principalcity: "New York", principalstate: "NY", principalzipcode: "10001", entitystatus: "Good Standing", jurisdictonofformation: "DE", entitytype: "FLLC" }),
    organization({ entityid: "20261147600", entityname: null, principaladdress1: null, principalcity: null, principalstate: null, principalzipcode: null, principalcountry: null, entitystatus: "Delinquent" }),
  ];
  const result = await buildCoBusinessRegistry({
    outputRoot: path.join(root, "output"),
    zbpPointer: await writeBaseline(path.join(root, "zbp")),
    catalogMetadata: metadata(),
    sourceRecords: rows,
    minimumOrganizations: 1,
    logger: () => {},
    now: () => new Date("2026-08-30T20:00:00.000Z"),
  });
  assert.equal(result.manifest.coverage.source_good_standing_or_delinquent_records, 4);
  assert.equal(result.manifest.coverage.organizations_published, 3);
  assert.equal(result.manifest.coverage.quarantined_source_records, 1);
  assert.equal(result.manifest.coverage.good_standing_organizations, 2);
  assert.equal(result.manifest.coverage.delinquent_organizations, 1);
  assert.equal(result.manifest.coverage.eligible_reported_us_business_addresses, 3);
  assert.equal(result.manifest.coverage.physical_sites, null);
  const verified = await verifyCoBusinessRegistry(path.join(result.releaseDirectory, "manifest.json"));
  assert.equal(verified.coverage.zip_union_records, 4);
  const normalizedArtifacts = result.manifest.artifacts.filter((artifact) => artifact.artifact_type === "normalized-co-business-organization-jsonl-gzip");
  const normalized = (await Promise.all(normalizedArtifacts.map((artifact) => gunzipRecords(path.join(result.releaseDirectory, artifact.path))))).flat();
  assert.equal(normalized.length, 3);
  assert.equal(normalized.every((record) => record.entity_candidates.physical_site_id === undefined), true);
  const sourceArtifact = result.manifest.artifacts.find((artifact) => artifact.artifact_type === "co-business-registry-source-jsonl-gzip");
  assert.equal(sourceArtifact.export_policy, "internal");
  const current = JSON.parse(await readFile(result.pointerPath, "utf8"));
  assert.equal(current.release_id, result.manifest.release_id);
  const resumed = await buildCoBusinessRegistry({
    outputRoot: path.join(root, "output"),
    zbpPointer: await writeBaseline(path.join(root, "zbp-resume")),
    catalogMetadata: metadata(),
    sourceSnapshotPath: path.join(result.releaseDirectory, sourceArtifact.path),
    minimumOrganizations: 1,
    logger: () => {},
    now: () => new Date("2026-08-30T21:00:00.000Z"),
  });
  assert.equal(resumed.manifest.coverage.source_good_standing_or_delinquent_records, 4);
  assert.equal(resumed.manifest.coverage.quarantined_source_records, 1);
  assert.equal(resumed.manifest.source_release_id, result.manifest.source_release_id);
});

test("blocks schema drift, duplicate identity, and pre-cancelled runs", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "datahub-co-business-invalid-test-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const zbpPointer = await writeBaseline(path.join(root, "zbp"));
  const drift = metadata({ columns: metadata().columns.map((column) => column.fieldName === "entitystatus" ? { ...column, dataTypeName: "number" } : column), selectedRecordCount: 1 });
  await assert.rejects(() => buildCoBusinessRegistry({ outputRoot: path.join(root, "drift"), zbpPointer, catalogMetadata: drift, sourceRecords: [organization()], minimumOrganizations: 1, logger: () => {} }), /selected schema changed/);
  await assert.rejects(() => buildCoBusinessRegistry({
    outputRoot: path.join(root, "duplicate"),
    zbpPointer,
    catalogMetadata: metadata({ selectedRecordCount: 2 }),
    sourceRecords: [organization(), organization()],
    minimumOrganizations: 1,
    logger: () => {},
  }), /strictly increasing/);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(() => buildCoBusinessRegistry({
    outputRoot: path.join(root, "cancelled"),
    zbpPointer,
    catalogMetadata: metadata({ selectedRecordCount: 1 }),
    sourceRecords: [organization()],
    minimumOrganizations: 1,
    signal: controller.signal,
    logger: () => {},
  }), { name: "AbortError" });
});
