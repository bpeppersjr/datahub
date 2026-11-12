import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { crc32, deflateRawSync } from "node:zlib";
import { MS_BUSINESS_REPORT_HEADERS as HEADERS } from "./mississippi-business-report-offline.mjs";
import { runMississippiBusinessReportAppJob, verifyMississippiBusinessReportAppJob, MS_BUSINESS_REPORT_APP_VERSION } from "./mississippi-business-report-app.mjs";
import { extractMississippiBusinessReport } from "./mississippi-business-report-extraction.mjs";
import { APP_ROOT, relativeToApp } from "./paths.mjs";
import {
  buildMississippiBusinessReportReadiness, digest, inspectMississippiBusinessReportIntake, jsonBytes, limitsOfAuthority,
  OPERATIONS_ROOT, PACKAGES_ROOT, PACKAGE_VERSION, SOURCE,
} from "./mississippi-business-report-intake.mjs";

const NOW = "2026-10-03T12:00:00.000Z";
const SHEET = "Business Reports";
const MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PACKAGE_REL = "http://schemas.openxmlformats.org/package/2006/relationships";
const CONTENT_TYPES = "http://schemas.openxmlformats.org/package/2006/content-types";
const MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml";
const privateValue = "Fictional Fixture & Sons LLC";
const execute = promisify(execFile);
const fixture = (overrides = {}) => HEADERS.map(header => ({
  "Business Name": privateValue, "Business ID": "0123456", Status: "Good Standing", "Principal Address": "100 Fixture St, Ste 4",
  City: "Fixture", State: "MS", County: "Fixture", "Postal Code": "00392-0001", "Formation Date": "01/02/2020", ...overrides,
})[header] ?? "");

function zip(entries, deflate = true) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, xml] of Object.entries(entries)) {
    const nameBytes = Buffer.from(name);
    const data = Buffer.from(xml);
    const body = deflate ? deflateRawSync(data) : data;
    const checksum = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(deflate ? 8 : 0, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(deflate ? 8 : 0, 10);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, body);
    centrals.push(central, nameBytes);
    offset += local.length + nameBytes.length + body.length;
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(Object.keys(entries).length, 8);
  end.writeUInt16LE(Object.keys(entries).length, 10);
  end.writeUInt32LE(Buffer.concat(centrals).length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

const escape = value => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
function workbook({ rows = [fixture()], headers = HEADERS, state = "visible", edit = value => value, extra = {}, external = false, deflate = true, shared = false } = {}) {
  const strings = [];
  const sheetRows = [headers, ...rows].map((row, index) => `<row r="${index + 1}">${row.map((value, column) => {
    const reference = `${String.fromCharCode(65 + column)}${index + 1}`;
    if (!shared) return `<c r="${reference}" t="inlineStr"><is><t>${escape(value)}</t></is></c>`;
    strings.push(value);
    return `<c r="${reference}" t="s"><v>${strings.length - 1}</v></c>`;
  }).join("")}</row>`).join("");
  return zip({
    "[Content_Types].xml": `<Types xmlns="${CONTENT_TYPES}"><Override PartName="/xl/workbook.xml" ContentType="${MIME}.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="${MIME}.worksheet+xml"/></Types>`,
    "_rels/.rels": `<Relationships xmlns="${PACKAGE_REL}"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="${MAIN}" xmlns:r="${REL}"><sheets><sheet name="${SHEET}" sheetId="1" state="${state}" r:id="rId1"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<Relationships xmlns="${PACKAGE_REL}"><Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"${external ? ' TargetMode="External"' : ""}/>${shared ? `<Relationship Id="rId2" Type="${REL}/sharedStrings" Target="sharedStrings.xml"/>` : ""}</Relationships>`,
    "xl/worksheets/sheet1.xml": edit(`<worksheet xmlns="${MAIN}"><sheetData>${sheetRows}</sheetData></worksheet>`),
    ...(shared ? { "xl/sharedStrings.xml": `<sst xmlns="${MAIN}">${strings.map(value => `<si><t>${escape(value)}</t></si>`).join("")}</sst>` } : {}),
    ...extra,
  }, deflate);
}

function csv(rows = [fixture()], headers = HEADERS) {
  return Buffer.from([headers, ...rows].map(row => row.map(value => `"${value.replaceAll('"', '""')}"`).join(",")).join("\r\n") + "\r\n");
}

const file = (name, bytes) => ({ path: name, bytes: bytes.length, sha256: digest(bytes) });
async function makePackage(t, { format = "xlsx", original = workbook(), companion = null, source = true, rights = true, retained = true } = {}) {
  const id = `test-${randomUUID()}`;
  const directory = path.join(PACKAGES_ROOT, id);
  await mkdir(directory, { recursive: true });
  t.after(() => rm(directory, { recursive: true, force: true }));
  const originalFile = file(`original.${format}`, original);
  const scope = { publisher_url: SOURCE, artifact_sha256: originalFile.sha256, supporting_document_sha256: "a".repeat(64) };
  const sourceBytes = jsonBytes({ schema_version: "mississippi-business-report-source-evidence@1.0.0", ...scope, observed_at: NOW, method: "operator-observed-publisher-export" });
  const rightsBytes = jsonBytes({ schema_version: "mississippi-business-report-rights-evidence@1.0.0", ...scope, basis: "publisher-written-permission", local_retention: retained, derived_use: true });
  const selection = {
    schema_version: PACKAGE_VERSION, package_id: id, observed_at: NOW, source: SOURCE, format, sheet_name: format === "xlsx" ? SHEET : null,
    files: {
      ORIGINAL: originalFile, CSV_COMPANION: companion ? file("export.csv", companion) : null,
      SOURCE_EVIDENCE: source ? file("source-evidence.json", sourceBytes) : null, RIGHTS_EVIDENCE: rights ? file("rights-evidence.json", rightsBytes) : null,
    },
  };
  for (const [filename, bytes] of [[originalFile.path, original], ["selection.json", jsonBytes(selection)], ["export.csv", companion], ["source-evidence.json", source && sourceBytes], ["rights-evidence.json", rights && rightsBytes]]) {
    if (bytes) await writeFile(path.join(directory, filename), bytes);
  }
  return { directory, selection };
}

async function runFixture(t, pkg, options = {}) {
  const operationId = randomUUID();
  const operation = path.join(OPERATIONS_ROOT, operationId);
  t.after(() => rm(operation, { recursive: true, force: true }));
  return runMississippiBusinessReportAppJob({ packageDirectory: pkg.directory, operationId, ...options });
}

test("parses stored and deflated XLSX, shared strings and CSV into the same ordered, ZIP-separated proof", async () => {
  const xlsx = await extractMississippiBusinessReport(workbook(), { format: "xlsx", sheetName: SHEET });
  assert.deepEqual(xlsx, await extractMississippiBusinessReport(workbook({ shared: true, deflate: false }), { format: "xlsx", sheetName: SHEET }));
  assert.deepEqual(xlsx, await extractMississippiBusinessReport(csv([fixture({ "Postal Code": "003920001" })]), { format: "csv" }));
  assert.deepEqual(Object.keys(xlsx), ["rows_observed", "registry_status_present", "principal_address_present", "zip5_present", "zip4_present", "ordered_projection_sha256"]);
  assert.equal(xlsx.rows_observed, 1);
  assert.equal(xlsx.zip5_present, 1);
  assert.equal(xlsx.zip4_present, 1);
  assert.equal(xlsx.registry_status_present, 1);
  assert.notEqual(xlsx.ordered_projection_sha256, (await extractMississippiBusinessReport(csv([fixture({ "Postal Code": "00392" })]), { format: "csv" })).ordered_projection_sha256);
  assert.doesNotMatch(JSON.stringify(xlsx), /Fictional|0123456|00392|Good Standing/);
});

test("rejects changed headers, extra person fields, duplicate identifiers, invalid ZIP, unsafe XML and hidden sheets", async () => {
  const invalid = [
    workbook({ headers: [...HEADERS, "Registered Agent"], rows: [[...fixture(), "PRIVATE PERSON"]] }),
    workbook({ rows: [fixture(), fixture()] }), workbook({ rows: [fixture({ "Business ID": "1.23456e6" })] }),
    workbook({ rows: [fixture({ "Postal Code": "1234-0001" })] }), workbook({ state: "hidden" }),
    workbook({ edit: sheet => sheet.replace('<c r="O2" t="inlineStr"><is><t>00392-0001</t></is></c>', '<c r="O2"><v>12345</v></c>') }),
    workbook({ edit: sheet => sheet.replace("<sheetData>", "<sheetData><row r=\"1\"><c r=\"A1\"><f/></c></row>") }),
    workbook({ edit: sheet => `<!DOCTYPE worksheet SYSTEM "https://example.invalid/">${sheet}` }), workbook({ external: true }),
    workbook({ extra: { "xl/worksheets/sheet2.xml": `<worksheet xmlns="${MAIN}"/>` } }), Buffer.from("not a workbook"),
  ];
  for (const input of invalid) await assert.rejects(extractMississippiBusinessReport(input, { format: "xlsx", sheetName: SHEET }), { code: "MS_REPORT_EXTRACTION_REJECTED" });
  await assert.rejects(extractMississippiBusinessReport(workbook(), { format: "xlsx", sheetName: "Other Sheet" }), { code: "MS_REPORT_EXTRACTION_REJECTED" });
  await assert.rejects(extractMississippiBusinessReport(csv([fixture()], [...HEADERS.slice(1), HEADERS[0]]), { format: "csv" }), { code: "MS_REPORT_EXTRACTION_REJECTED" });
});

test("app retains only a manifest-bound private readiness report and verifies exact replay with no network", async t => {
  t.mock.method(globalThis, "fetch", () => assert.fail("No provider requests"));
  const pkg = await makePackage(t, { companion: csv() });
  const result = await runFixture(t, pkg);
  assert.equal(result.receipt.status, "SUCCEEDED");
  assert.equal(result.receipt.source.readiness_status, "operator-attested-awaiting-independent-review");
  assert.equal(result.receipt.source.gates.csv_companion, "matched");
  assert.deepEqual(result.receipt.claims, limitsOfAuthority);
  assert.deepEqual((await readdir(result.operationDirectory)).sort(), ["readiness", "receipt.json", "start.json"]);
  const output = path.join(result.operationDirectory, "readiness");
  assert.deepEqual((await readdir(output)).sort(), ["manifest.json", "report.json"]);
  const report = await readFile(path.join(output, "report.json"));
  assert.equal(digest(report), result.receipt.source.report_sha256);
  assert.doesNotMatch(report.toString(), /Fictional|Fixture St|0123456|00392|Good Standing/);
  assert.equal((await verifyMississippiBusinessReportAppJob(result.receiptPath)).receipt.source.rows_observed, 1);
  await writeFile(path.join(pkg.directory, "original.xlsx"), "changed");
  await assert.rejects(verifyMississippiBusinessReportAppJob(result.receiptPath), { code: "MS_REPORT_RECEIPT_REJECTED" });
  await writeFile(path.join(pkg.directory, "original.xlsx"), workbook());
  await writeFile(path.join(output, "report.json"), "{}\n");
  await assert.rejects(verifyMississippiBusinessReportAppJob(result.receiptPath), { code: "MS_REPORT_RECEIPT_REJECTED" });
});

test("requires exact independently reviewed input pins and distinguishes missing rights and unsupported originals", async t => {
  const pkg = await makePackage(t);
  const assessment = await inspectMississippiBusinessReportIntake(pkg.directory);
  const review = {
    selection_sha256: assessment.selectionSha256, original_sha256: assessment.files.ORIGINAL.sha256, csv_companion_sha256: null,
    source_evidence_sha256: assessment.files.SOURCE_EVIDENCE.sha256, rights_evidence_sha256: assessment.files.RIGHTS_EVIDENCE.sha256,
    source_reviewed: true, local_retention_reviewed: true, derived_use_reviewed: true,
  };
  const awaiting = "operator-attested-awaiting-independent-review";
  assert.equal(buildMississippiBusinessReportReadiness(assessment, []).readiness_status, awaiting);
  assert.equal(buildMississippiBusinessReportReadiness(assessment, [{ ...review, original_sha256: "b".repeat(64) }]).readiness_status, awaiting);
  assert.equal(buildMississippiBusinessReportReadiness(assessment, [review], null).readiness_status, awaiting);
  const reviewed = buildMississippiBusinessReportReadiness(assessment, [review]);
  assert.equal(reviewed.readiness_status, "ready-for-normalization-review");
  assert.equal(reviewed.claims.source_authenticity_verified, false);
  assert.equal(reviewed.claims.retention_rights_verified, false);
  assert.equal(reviewed.claims.admission_eligible, false);
  assert.throws(() => buildMississippiBusinessReportReadiness(assessment, [], reviewed.review_pin_sha256), { code: "MS_REPORT_RECEIPT_REJECTED" });
  for (const [options, gate, value] of [
    [{ source: false }, "source_evidence", "missing"], [{ rights: false }, "rights_evidence", "missing"],
    [{ retained: false }, "rights_evidence", "scope-insufficient"], [{ format: "csv", original: csv() }, "original_workbook", "supported-original-workbook-required"],
    [{ format: "xls", original: Buffer.from("synthetic binary format marker") }, "extraction", "unsupported-format"],
    [{ original: workbook({ rows: [] }) }, "extraction", "empty-export"],
    [{ companion: csv([fixture({ Status: "Different" })]) }, "csv_companion", "mismatch"],
  ]) {
    const result = await runFixture(t, await makePackage(t, options));
    assert.equal(result.receipt.source.readiness_status, "blocked");
    assert.equal(result.receipt.source.gates[gate], value);
    await verifyMississippiBusinessReportAppJob(result.receiptPath);
  }
});

test("rejects inventory and evidence tampering, writes redacted terminal failures and preserves package files", async t => {
  const pkg = await makePackage(t);
  const operationId = randomUUID();
  const operation = path.join(OPERATIONS_ROOT, operationId);
  t.after(() => rm(operation, { recursive: true, force: true }));
  const extra = path.join(pkg.directory, "PRIVATE-CONTACT.txt");
  await writeFile(extra, "PRIVATE TOKEN");
  await assert.rejects(runMississippiBusinessReportAppJob({ packageDirectory: pkg.directory, operationId }), { code: "MS_REPORT_PACKAGE_REJECTED" });
  const { receipt } = await verifyMississippiBusinessReportAppJob(path.join(operation, "receipt.json"));
  assert.equal(receipt.status, "FAILED");
  assert.doesNotMatch(JSON.stringify(receipt), /PRIVATE/);
  assert.equal(await readFile(extra, "utf8"), "PRIVATE TOKEN");
  await rm(extra);
  const evidence = path.join(pkg.directory, "source-evidence.json");
  const originalEvidence = await readFile(evidence);
  await writeFile(evidence, "PRIVATE ATTESTATION");
  await assert.rejects(runFixture(t, pkg), { code: "MS_REPORT_PACKAGE_REJECTED" });
  await writeFile(evidence, originalEvidence);
  const linked = path.join(PACKAGES_ROOT, `test-link-${randomUUID()}`);
  try { await symlink(pkg.directory, linked, "junction"); }
  catch (error) { if (error.code === "EPERM") return; throw error; }
  t.after(() => rm(linked, { force: true }));
  await assert.rejects(runFixture(t, { directory: linked }), { code: "MS_REPORT_PACKAGE_REJECTED" });
});

test("cooperative cancellation cleans publication and releases the lock with a redacted receipt", async t => {
  const pkg = await makePackage(t);
  const controller = new AbortController();
  const operationId = randomUUID();
  const operation = path.join(OPERATIONS_ROOT, operationId);
  t.after(() => rm(operation, { recursive: true, force: true }));
  await assert.rejects(runMississippiBusinessReportAppJob({
    packageDirectory: pkg.directory, operationId, signal: controller.signal,
    now: () => { controller.abort(Error("PRIVATE TOKEN")); return new Date(NOW); },
  }), { name: "AbortError", message: "Mississippi intake was cancelled." });
  assert.deepEqual((await readdir(operation)).sort(), ["receipt.json", "start.json"]);
  const { receipt } = await verifyMississippiBusinessReportAppJob(path.join(operation, "receipt.json"));
  assert.equal(receipt.status, "CANCELLED");
  assert.doesNotMatch(JSON.stringify(receipt), /PRIVATE/);
  assert.equal((await runFixture(t, pkg)).receipt.status, "SUCCEEDED");
});

test("cancellation before the terminal commit removes the staged manifest", async t => {
  const pkg = await makePackage(t);
  const controller = new AbortController();
  const operationId = randomUUID();
  const operation = path.join(OPERATIONS_ROOT, operationId);
  t.after(() => rm(operation, { recursive: true, force: true }));
  let clockReads = 0;
  await assert.rejects(runMississippiBusinessReportAppJob({
    packageDirectory: pkg.directory, operationId, signal: controller.signal,
    now: () => { if (++clockReads === 2) controller.abort(); return new Date(NOW); },
  }), { name: "AbortError" });
  assert.deepEqual((await readdir(operation)).sort(), ["receipt.json", "start.json"]);
  const proof = await verifyMississippiBusinessReportAppJob(path.join(operation, "receipt.json"));
  assert.equal(proof.receipt.status, "CANCELLED");
});

test("blocks a live lock owner and recovers a dead owner without reusing its incomplete operation", async t => {
  const pkg = await makePackage(t);
  const lock = path.join(OPERATIONS_ROOT, ".intake-lock");
  const runId = randomUUID();
  const token = randomUUID();
  const interrupted = path.join(OPERATIONS_ROOT, runId);
  await mkdir(lock, { recursive: true });
  await mkdir(path.join(interrupted, "readiness"), { recursive: true });
  t.after(() => Promise.all([rm(lock, { recursive: true, force: true }), rm(interrupted, { recursive: true, force: true })]));
  const owner = path.join(lock, `owner-${token}.json`);
  const record = { schema_version: "mississippi-business-report-intake-lock@1.0.0", run_id: runId, token, pid: process.pid };
  await writeFile(owner, jsonBytes(record));
  await assert.rejects(runFixture(t, pkg), { code: "MS_REPORT_INTAKE_LOCKED" });
  await writeFile(owner, jsonBytes({ ...record, pid: 2147483647 }));
  await writeFile(path.join(interrupted, "start.json"), jsonBytes({
    schema_version: MS_BUSINESS_REPORT_APP_VERSION, run_id: runId, status: "RUNNING", execution_mode: "operator-supplied-local-intake",
    package_id: pkg.selection.package_id, started_at: NOW,
  }));
  await writeFile(path.join(interrupted, "readiness", "report.json"), "{}\n");
  await writeFile(path.join(interrupted, "readiness", "manifest.json"), "{}\n");
  assert.equal((await runFixture(t, pkg)).receipt.status, "SUCCEEDED");
  const { receipt } = await verifyMississippiBusinessReportAppJob(path.join(interrupted, "receipt.json"));
  assert.equal(receipt.status, "FAILED");
  assert.equal(receipt.error_code, "MS_REPORT_INTAKE_INTERRUPTED");
  assert.deepEqual((await readdir(interrupted)).sort(), ["receipt.json", "start.json"]);
});

test("the managed CLI dispatch uses the operation ID and the CLI verifier independently replays it", async t => {
  const pkg = await makePackage(t, { companion: csv() });
  const operationId = randomUUID();
  const operation = path.join(OPERATIONS_ROOT, operationId);
  t.after(() => rm(operation, { recursive: true, force: true }));
  const run = await execute(process.execPath, ["scripts/run-mississippi-business-report-app.mjs", "--package", relativeToApp(pkg.directory), "--operation-id", operationId], { cwd: APP_ROOT });
  const descriptor = JSON.parse(run.stdout);
  assert.equal(descriptor.operationDirectory, operation);
  assert.equal(descriptor.receipt.run_id, operationId);
  const verification = await execute(process.execPath, ["scripts/verify-mississippi-business-report-app.mjs", "--receipt", relativeToApp(descriptor.receiptPath)], { cwd: APP_ROOT });
  assert.deepEqual(JSON.parse(verification.stdout).receipt, descriptor.receipt);
});

test("the verifier accepts historical v1 terminal receipts without writing new files", async t => {
  const runId = randomUUID();
  const operation = path.join(OPERATIONS_ROOT, runId);
  await mkdir(operation, { recursive: true });
  t.after(() => rm(operation, { recursive: true, force: true }));
  const envelope = {
    schema_version: "mississippi-business-report-app@1.0.0", run_id: runId, execution_mode: "operator-supplied-local-package",
    started_at: NOW, network_requests: 0, acquisition_performed: false, account_action_performed: false, purchase_performed: false,
  };
  const start = jsonBytes({
    ...envelope, status: "RUNNING", package_id: "fixture", package_path: "data/imports/mississippi-business-report/packages/fixture", selection_sha256: "a".repeat(64),
  });
  const receipt = {
    ...envelope, status: "CANCELLED", finished_at: NOW, start_sha256: digest(start), source: null, source_pointer_changed: false,
    national_admission_performed: false, statewide_complete: false, current_operation_claim: false, geocode_claim: false,
    physical_site_claim: false, public_export_authorized: false, error_code: "MS_BUSINESS_REPORT_APP_CANCELLED", inspection_required: true,
  };
  const receiptPath = path.join(operation, "receipt.json");
  await writeFile(path.join(operation, "start.json"), start);
  await writeFile(receiptPath, jsonBytes(receipt));
  assert.deepEqual((await verifyMississippiBusinessReportAppJob(receiptPath)).receipt, receipt);
  assert.deepEqual((await readdir(operation)).sort(), ["receipt.json", "start.json"]);
});
