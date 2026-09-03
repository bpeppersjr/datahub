import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createGunzip } from "node:zlib";
import {
  buildIllinoisBusinessRegistry,
  IL_SOURCE_LAYOUTS,
  normalizeIllinoisOrganization,
  parseIllinoisSourceRecord,
  verifyIllinoisBusinessRegistry,
} from "./il-business-registry.mjs";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ (0xedb88320 & -(value & 1));
  }
  return (value ^ 0xffffffff) >>> 0;
}

function storedZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [filename, content] of entries) {
    const name = Buffer.from(filename, "utf8");
    const body = Buffer.from(content, "latin1");
    const checksum = crc32(body);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(body.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, body);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(body.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += local.length + name.length + body.length;
  }
  const centralDirectory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralDirectory, end]);
}

function fixed(width, fields) {
  const chars = Array(width).fill(" ");
  for (const [start, end, value] of fields) {
    const string = String(value ?? "");
    if (string.length > end - start) throw new Error("Fixture field is too wide.");
    for (let index = 0; index < string.length; index += 1) chars[start + index] = string[index];
  }
  return chars.join("");
}

function corpMaster(id, { status = "00", type = "4", president = "PRIVATE PRESIDENT CANARY", secretary = "PRIVATE SECRETARY CANARY" } = {}) {
  return fixed(160, [[0, 8, id], [8, 16, "20010102"], [16, 24, "00000000"], [24, 26, "17"], [26, 29, "GEN"], [29, 31, status], [31, 32, type], [32, 40, "20260831"], [40, 100, president], [100, 160, secretary]]);
}

function corpName(id, name) {
  return fixed(197, [[0, 8, id], [8, 197, name]]);
}

function corpAnnual(id, { run = "20260801", paid = "00000000" } = {}) {
  return fixed(126, [[0, 8, id], [43, 51, run], [59, 67, paid], [70, 110, "PRIVATE FINANCE CANARY"]]);
}

function llcMaster(id, { status = "01", zip = "627011234", state = "IL" } = {}) {
  return fixed(136, [[0, 8, id], [8, 14, "RETAIL"], [14, 16, status], [16, 24, "20260830"], [24, 32, "20190506"], [32, 40, "00000000"], [40, 41, "M"], [41, 43, "17"], [43, 88, "100 CAPITAL AVENUE"], [88, 118, "SPRINGFIELD"], [118, 127, zip], [127, 129, state], [129, 136, "FLAG001"]]);
}

function llcName(id, name) {
  return fixed(128, [[0, 8, id], [8, 128, name]]);
}

function document(name, rows, runDate = "20260901") {
  return [`RUN DATE = ${runDate} FILE:${name}`, ...rows, `END OF FILE RECORD COUNT= ${String(rows.length).padStart(7, "0")}`].join("\r\n") + "\r\n";
}

function documents(overrides = {}) {
  const value = {
    corporation_master: document("CORPMASTER", [corpMaster("12345678"), corpMaster("22345678", { status: "03" })]),
    corporation_name: document("CORPNAME", [corpName("12345678", "Fixture Illinois Corporation"), corpName("22345678", "Inactive Corporation")]),
    corporation_annual: document("CORPANNUAL", [corpAnnual("12345678"), corpAnnual("22345678", { run: "00000000", paid: "00000000" })]),
    llc_master: document("LLCMASTER", [llcMaster("32345678"), llcMaster("42345678", { status: "03", zip: "606010000" })]),
    llc_name: document("LLCNAME", [llcName("32345678", "Fixture Illinois LLC"), llcName("42345678", "Inactive LLC")]),
  };
  return { ...value, ...overrides };
}

async function writeBaseline(root) {
  const releaseDirectory = path.join(root, "releases", "zbp-fixture");
  await mkdir(path.join(releaseDirectory, "derived"), { recursive: true });
  const rows = ["60601", "62701", "99999"].map((zipCode) => ({
    zip_code: zipCode,
    coverage_status: "zbp-and-zcta",
    current_usps_validity: { status: "unverified" },
    geography: { status: "2020-zcta-polygon-available", geo_id: `zcta:${zipCode}`, geoid: zipCode },
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

test("pins the five Illinois fixed-width layouts and excludes officer and finance fields", () => {
  assert.deepEqual(Object.fromEntries(Object.entries(IL_SOURCE_LAYOUTS).map(([key, value]) => [key, value.width])), {
    corporation_master: 160,
    corporation_name: 197,
    corporation_annual: 126,
    llc_master: 136,
    llc_name: 128,
  });
  const master = parseIllinoisSourceRecord("corporation_master", corpMaster("12345678"));
  const annual = parseIllinoisSourceRecord("corporation_annual", corpAnnual("12345678"));
  assert.equal(master.file_number, "12345678");
  assert.equal(master.incorporation_date, "2001-01-02");
  assert.equal(JSON.stringify({ master, annual }).includes("PRIVATE"), false);
  assert.throws(() => parseIllinoisSourceRecord("llc_name", "too short"), /record width/);
  assert.throws(() => parseIllinoisSourceRecord("corporation_master", corpMaster("12345678", { status: "99" })), /unknown status/);
});

test("normalizes ZIP5 and ZIP+4 separately without inferring a physical site", () => {
  const master = parseIllinoisSourceRecord("llc_master", llcMaster("32345678"));
  const name = parseIllinoisSourceRecord("llc_name", llcName("32345678", "Fixture Illinois LLC"));
  const record = normalizeIllinoisOrganization({ entityKind: "llc", master, name }, {
    runId: "fixture-run",
    sourceRunDate: "2026-09-01",
    sourceReleaseId: "fixture-source",
    baselineByZip: new Map([["62701", { geography: { status: "2020-zcta-polygon-available", geo_id: "zcta:62701", geoid: "62701" } }]]),
  });
  assert.equal(record.records_office_address.zip_code, "62701");
  assert.equal(record.records_office_address.postal_code, "62701");
  assert.equal(record.records_office_address.zip4, "1234");
  assert.equal(record.records_office_address.eligible_for_us_zip_coverage, true);
  assert.equal(record.entity_candidates.physical_site_id, undefined);
  assert.equal(record.entity_candidates.establishment_id, undefined);
  assert.match(record.records_office_address.address_scope, /not-verified-physical-operating-site/);
});

test("builds, minimizes, publishes, and independently verifies an Illinois daily-file release", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "datahub-il-business-test-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const result = await buildIllinoisBusinessRegistry({
    outputRoot: path.join(root, "output"),
    zbpPointer: await writeBaseline(path.join(root, "zbp")),
    sourceDocuments: documents(),
    minimumOrganizations: 1,
    logger: () => {},
    now: () => new Date("2026-09-03T12:00:00.000Z"),
  });
  assert.equal(result.manifest.coverage.active_organizations_published, 2);
  assert.equal(result.manifest.coverage.active_corporations_published, 1);
  assert.equal(result.manifest.coverage.active_llcs_published, 1);
  assert.equal(result.manifest.coverage.eligible_llc_records_office_addresses, 1);
  assert.equal(result.manifest.coverage.possible_corporation_ngs_month_rule_not_evaluated, 1);
  assert.equal(result.manifest.coverage.physical_sites, null);
  assert.equal(result.manifest.quality_gates.network_requests, 0);
  const verified = await verifyIllinoisBusinessRegistry(path.join(result.releaseDirectory, "manifest.json"));
  assert.equal(verified.artifact_count, 24);
  const normalizedArtifacts = result.manifest.artifacts.filter((artifact) => artifact.artifact_type === "normalized-il-business-organization-jsonl-gzip");
  const records = (await Promise.all(normalizedArtifacts.map((artifact) => gunzipRecords(path.join(result.releaseDirectory, artifact.path))))).flat();
  assert.equal(records.length, 2);
  assert.equal(records.every((record) => record.export_policy === "local-review-only"), true);
  assert.equal(records.every((record) => !JSON.stringify(record).includes("PRIVATE")), true);
  const corporation = records.find((record) => record.registration_profile.entity_kind === "corporation");
  assert.equal(corporation.records_office_address, null);
  assert.equal(corporation.annual_report_evidence.month_rule_evaluation, "not-evaluated-published-rule-is-ambiguous");
  const current = JSON.parse(await readFile(result.pointerPath, "utf8"));
  assert.equal(current.release_id, result.manifest.release_id);
});

test("rejects malformed documents, mixed run dates, bad joins, and cancellation", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "datahub-il-invalid-test-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const zbpPointer = await writeBaseline(path.join(root, "zbp"));
  const build = (sourceDocuments, suffix) => buildIllinoisBusinessRegistry({ outputRoot: path.join(root, suffix), zbpPointer, sourceDocuments, minimumOrganizations: 1, logger: () => {} });
  await assert.rejects(() => build(documents({ corporation_master: document("CORPMASTER", [corpMaster("12345678").slice(0, 159)]) }), "width"), /record width/);
  await assert.rejects(() => build(documents({ llc_name: document("LLCNAME", [llcName("32345678", "Fixture Illinois LLC"), llcName("42345678", "Inactive LLC")], "20260902") }), "mixed-date"), /mixed RUN DATE/);
  await assert.rejects(() => build(documents({ corporation_name: document("CORPNAME", [corpName("12345678", "Fixture Illinois Corporation")]) }), "join"), /sets differ in size/);
  await assert.rejects(() => build(documents({ llc_master: document("LLCMASTER", [llcMaster("32345678"), llcMaster("32345678")]) }), "duplicate"), /Duplicate Illinois file number/);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(() => buildIllinoisBusinessRegistry({ outputRoot: path.join(root, "cancelled"), zbpPointer, sourceDocuments: documents(), minimumOrganizations: 1, signal: controller.signal, logger: () => {} }), { name: "AbortError" });
});

test("rejects source paths whose real path escapes the allowed datahub root", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "datahub-il-path-test-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const outside = path.join(root, "outside.txt");
  await writeFile(outside, documents().corporation_master);
  const allowedRoot = path.join(root, "allowed");
  await mkdir(allowedRoot);
  const sourcePaths = Object.fromEntries(Object.keys(IL_SOURCE_LAYOUTS).map((key) => [key, outside]));
  const zbpPointer = await writeBaseline(path.join(allowedRoot, "zbp"));
  await assert.rejects(() => buildIllinoisBusinessRegistry({ outputRoot: path.join(allowedRoot, "output"), zbpPointer, sourcePaths, allowedRoot, minimumOrganizations: 1, logger: () => {} }), /escapes its allowed directory/);
});

test("accepts one-file ZIP inputs and rejects unsafe ZIP member paths", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "datahub-il-zip-test-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const sourceDocuments = documents();
  const sourcePaths = {};
  for (const [key, content] of Object.entries(sourceDocuments)) {
    const filename = path.join(root, `${key}.zip`);
    await writeFile(filename, storedZip([[`${key}.txt`, content]]));
    sourcePaths[key] = filename;
  }
  const zbpPointer = await writeBaseline(path.join(root, "zbp"));
  const result = await buildIllinoisBusinessRegistry({ outputRoot: path.join(root, "output"), zbpPointer, sourcePaths, allowedRoot: root, minimumOrganizations: 1, logger: () => {} });
  assert.equal(result.manifest.coverage.active_organizations_published, 2);
  assert.equal(Object.values(result.manifest.coverage.source_records).reduce((sum, value) => sum + value, 0), 10);
  const unsafe = path.join(root, "unsafe.zip");
  await writeFile(unsafe, storedZip([["../unsafe.txt", sourceDocuments.corporation_master]]));
  await assert.rejects(() => buildIllinoisBusinessRegistry({ outputRoot: path.join(root, "unsafe-output"), zbpPointer, sourcePaths: { ...sourcePaths, corporation_master: unsafe }, allowedRoot: root, minimumOrganizations: 1, logger: () => {} }), /Unsafe Illinois archive entry/);
});

test("the verifier detects post-publication artifact tampering", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "datahub-il-tamper-test-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const result = await buildIllinoisBusinessRegistry({ outputRoot: path.join(root, "output"), zbpPointer: await writeBaseline(path.join(root, "zbp")), sourceDocuments: documents(), minimumOrganizations: 1, logger: () => {} });
  const artifact = result.manifest.artifacts.find((candidate) => candidate.artifact_type === "il-business-registry-source-summary");
  await writeFile(path.join(result.releaseDirectory, artifact.path), "tampered\n");
  await assert.rejects(() => verifyIllinoisBusinessRegistry(path.join(result.releaseDirectory, "manifest.json")), /verification failed/);
});
