import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createGunzip } from "node:zlib";
import {
  buildFlBusinessRegistry,
  FL_BUSINESS_REGISTRY_LAYOUT,
  FL_BUSINESS_REGISTRY_LAYOUT_FINGERPRINT,
  loadFlBusinessRegistrySourceRelease,
  normalizeFlBusinessOrganization,
  parseFlCorporateLine,
  verifyFlBusinessRegistry,
} from "./fl-business-registry.mjs";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function fixedWidthRow(overrides = {}) {
  const values = {
    corporation_number: "L26000451320",
    corporation_name: "Fixture Florida Company LLC",
    status: "A",
    filing_type: "FLAL",
    principal_address_1: "100 Ocean Drive",
    principal_address_2: "Suite 200",
    principal_city: "Miami",
    principal_state: "",
    principal_zip: "33101-1234",
    principal_country: "",
    file_date: "08262026",
    last_transaction_date: "08302026",
    jurisdiction: "FL",
    report_year_1: "2026",
    report_date_1: "08152026",
    report_year_2: "2025",
    report_date_2: "07152025",
    report_year_3: "2024",
    report_date_3: "06152024",
    ...overrides,
  };
  const row = Array(1440).fill(" ");
  for (const [field, start, length] of FL_BUSINESS_REGISTRY_LAYOUT) {
    const value = String(values[field] ?? "");
    if (value.length > length) throw new Error(`${field} fixture exceeds ${length} characters`);
    row.splice(start - 1, length, ...value.padEnd(length, " "));
  }
  row.splice(480, 14, ..."12-3456789".padEnd(14, " "));
  row.splice(544, 42, ..."Private Registered Agent".padEnd(42, " "));
  row.splice(673, 42, ..."Private Officer".padEnd(42, " "));
  return row.join("");
}

function context() {
  return {
    runId: "fl-fixture-run",
    retrievedAt: "2026-08-31T10:00:00.000Z",
    sourceModifiedAt: "2026-07-10T13:41:00.000Z",
    sourceReleaseId: "fl-fixture-source",
    baselineByZip: new Map([["33101", { geography: { status: "2020-zcta-polygon-available", geo_id: "zcta:33101", geoid: "33101" } }]]),
  };
}

async function writeBaseline(root) {
  const releaseDirectory = path.join(root, "releases", "zbp-fixture");
  await mkdir(path.join(releaseDirectory, "derived"), { recursive: true });
  const rows = ["33101", "32301", "99999"].map((zipCode) => ({
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

test("pins the official 1440-character layout while excluding FEIN, mailing, agent, and officer fields", () => {
  assert.equal(FL_BUSINESS_REGISTRY_LAYOUT.length, 19);
  assert.equal(sha256(FL_BUSINESS_REGISTRY_LAYOUT.map((field) => field.join(":")).join("\0")), FL_BUSINESS_REGISTRY_LAYOUT_FINGERPRINT);
  for (const excluded of ["fei_number", "mail_address_1", "registered_agent_name", "officer_1_name", "officer_6_address"]) {
    assert.equal(FL_BUSINESS_REGISTRY_LAYOUT.some(([field]) => field === excluded), false);
  }
  const parsed = parseFlCorporateLine(fixedWidthRow());
  assert.equal(parsed.corporation_number, "L26000451320");
  assert.equal(parsed.principal_zip, "33101-1234");
  const serialized = JSON.stringify(parsed);
  for (const forbidden of ["12-3456789", "Private Registered Agent", "Private Officer"]) assert.equal(serialized.includes(forbidden), false);
  assert.throws(() => parseFlCorporateLine("short"), /1440 characters/);
});

test("normalizes Florida active source evidence without inferring a site, owner, agent, or relationship", () => {
  const normalized = normalizeFlBusinessOrganization(parseFlCorporateLine(fixedWidthRow()), context());
  assert.equal(normalized.entity_candidates.organization_id, "organization:fl_document_l26000451320");
  assert.equal(normalized.entity_candidates.physical_site_id, undefined);
  assert.equal(normalized.reported_principal_address.postal_code, "33101");
  assert.equal(normalized.reported_principal_address.zip4, "1234");
  assert.equal(normalized.reported_principal_address.state_code, null);
  assert.equal(normalized.reported_principal_address.eligible_for_us_zip_coverage, true);
  assert.equal(normalized.reported_address_coordinate, null);
  assert.equal(normalized.registration_profile.filing_type, "FLAL");
  assert.equal(normalized.registration_profile.file_date, "2026-08-26");
  assert.equal(normalized.source_status.status_class, "active-in-florida-division-of-corporations-quarterly-source");
  assert.match(normalized.source_status.semantics, /not-independent-proof-of-current-operations/);
});

test("builds and independently replays a privacy-minimized Florida fixture release", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "datahub-fl-business-test-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const lines = [
    fixedWidthRow({ corporation_number: "L26000451320", principal_zip: "33101-1234" }),
    fixedWidthRow({ corporation_number: "P26000000001", corporation_name: "Second Florida Company", filing_type: "DOMP", principal_city: "Tallahassee", principal_zip: "32301", report_year_1: "", report_date_1: "" }),
    fixedWidthRow({ corporation_number: "", corporation_name: "", principal_address_1: "", principal_address_2: "", principal_city: "", principal_zip: "" }),
    fixedWidthRow({ corporation_number: "L02000020020", corporation_name: "Inactive Historical Entity", status: "I", principal_zip: "33101" }),
  ];
  const result = await buildFlBusinessRegistry({
    outputRoot: path.join(root, "output"),
    zbpPointer: await writeBaseline(path.join(root, "zbp")),
    sourceLines: lines,
    sourceMetadata: {
      remotePath: "/Public/doc/quarterly/cor/cordata.zip",
      bytes: 12345,
      modifiedAt: "2026-07-10T13:41:00.000Z",
      archiveSha256: "a".repeat(64),
      members: [..."0123456789"].map((digit) => `cordata${digit}.txt`),
      uncompressedBytes: 5760,
    },
    minimumOrganizations: 1,
    logger: () => {},
    now: () => new Date("2026-08-31T10:00:00.000Z"),
  });
  assert.equal(result.manifest.coverage.source_records, 4);
  assert.equal(result.manifest.coverage.active_source_records, 3);
  assert.equal(result.manifest.coverage.organizations_published, 2);
  assert.equal(result.manifest.coverage.quarantined_source_records, 1);
  assert.equal(result.manifest.coverage.inactive_source_records_excluded, 1);
  assert.equal(result.manifest.coverage.eligible_reported_us_principal_addresses, 2);
  assert.equal(result.manifest.coverage.physical_sites, null);
  assert.equal(result.manifest.raw_archive_retained, false);
  const verified = await verifyFlBusinessRegistry(path.join(result.releaseDirectory, "manifest.json"));
  assert.equal(verified.coverage.zip_union_records, 3);
  const normalizedArtifacts = result.manifest.artifacts.filter((artifact) => artifact.artifact_type === "normalized-fl-business-organization-jsonl-gzip");
  const normalized = (await Promise.all(normalizedArtifacts.map((artifact) => gunzipRecords(path.join(result.releaseDirectory, artifact.path))))).flat();
  assert.equal(normalized.length, 2);
  const allText = JSON.stringify(normalized);
  for (const forbidden of ["12-3456789", "Private Registered Agent", "Private Officer"]) assert.equal(allText.includes(forbidden), false);
  assert.equal(result.manifest.artifacts.some((artifact) => /cordata\.zip/i.test(artifact.path)), false);

  const replaySource = await loadFlBusinessRegistrySourceRelease({
    releasePath: result.pointerPath,
    allowedRoot: root,
  });
  assert.equal(replaySource.sourceReleaseId, result.manifest.source_release_id);
  assert.equal(replaySource.sourceMetadata.replaySource.release_id, result.manifest.release_id);
  const replayed = await buildFlBusinessRegistry({
    outputRoot: path.join(root, "replayed-output"),
    zbpPointer: await writeBaseline(path.join(root, "replayed-zbp")),
    sourceSnapshotPath: replaySource.sourceSnapshotPath,
    sourceMetadata: replaySource.sourceMetadata,
    minimumOrganizations: 1,
    logger: () => {},
    now: () => new Date("2026-09-02T10:00:00.000Z"),
  });
  assert.equal(replayed.manifest.source_release_id, result.manifest.source_release_id);
  assert.equal(replayed.manifest.source.selected_source_replay.release_id, result.manifest.release_id);
  await verifyFlBusinessRegistry(path.join(replayed.releaseDirectory, "manifest.json"));

  await writeFile(replaySource.sourceSnapshotPath, "tampered");
  const tamperedZbpPointer = await writeBaseline(path.join(root, "tampered-replay-zbp"));
  await assert.rejects(
    () => buildFlBusinessRegistry({
      outputRoot: path.join(root, "tampered-replay-output"),
      zbpPointer: tamperedZbpPointer,
      sourceSnapshotPath: replaySource.sourceSnapshotPath,
      sourceMetadata: replaySource.sourceMetadata,
      minimumOrganizations: 1,
      logger: () => {},
    }),
    /changed after source-release verification/,
  );
  await assert.rejects(
    () => loadFlBusinessRegistrySourceRelease({ releasePath: result.pointerPath, allowedRoot: root }),
    /size or SHA-256 mismatch/,
  );
});

test("rejects a Florida source-release pointer that escapes its allowed root", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "datahub-fl-business-source-path-test-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const allowedRoot = path.join(root, "allowed");
  const outsideRoot = path.join(root, "outside");
  await mkdir(allowedRoot, { recursive: true });
  await mkdir(outsideRoot, { recursive: true });
  await writeFile(path.join(outsideRoot, "manifest.json"), "{}\n");
  const pointer = path.join(allowedRoot, "current.json");
  await writeFile(pointer, `${JSON.stringify({ manifest: "../outside/manifest.json" })}\n`);
  await assert.rejects(
    () => loadFlBusinessRegistrySourceRelease({ releasePath: pointer, allowedRoot }),
    /escapes its allowed root/,
  );
});

test("blocks row-length drift, duplicate identity, unknown status codes, and pre-cancelled runs", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "datahub-fl-business-invalid-test-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const zbpPointer = await writeBaseline(path.join(root, "zbp"));
  const metadata = { remotePath: "/Public/doc/quarterly/cor/cordata.zip", bytes: 12345, modifiedAt: "2026-07-10T13:41:00.000Z", archiveSha256: "b".repeat(64), members: ["cordata0.txt"] };
  await assert.rejects(() => buildFlBusinessRegistry({ outputRoot: path.join(root, "short"), zbpPointer, sourceLines: ["short"], sourceMetadata: metadata, minimumOrganizations: 1, logger: () => {} }), /1440 characters/);
  await assert.rejects(() => buildFlBusinessRegistry({ outputRoot: path.join(root, "duplicate"), zbpPointer, sourceLines: [fixedWidthRow(), fixedWidthRow()], sourceMetadata: metadata, minimumOrganizations: 1, logger: () => {} }), /duplicate Florida document number/);
  await assert.rejects(() => buildFlBusinessRegistry({ outputRoot: path.join(root, "unknown-status"), zbpPointer, sourceLines: [fixedWidthRow({ status: "X" })], sourceMetadata: metadata, minimumOrganizations: 1, logger: () => {} }), /unknown status code/);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(() => buildFlBusinessRegistry({ outputRoot: path.join(root, "cancelled"), zbpPointer, sourceLines: [fixedWidthRow()], sourceMetadata: metadata, minimumOrganizations: 1, signal: controller.signal, logger: () => {} }), { name: "AbortError" });
});
