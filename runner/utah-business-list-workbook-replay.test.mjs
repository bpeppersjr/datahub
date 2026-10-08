import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { APP_ROOT } from "./paths.mjs";
import { inspectUtahBusinessListPackage, UTAH_BUSINESS_LIST_SHEETS } from "./utah-business-list-offline.mjs";
import { buildUtahBusinessListReplayPackage, extractUtahBusinessWorkbook } from "./utah-business-list-workbook-replay.mjs";

const escape = value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
function crc32(bytes) { let crc = 0xffffffff; for (const byte of bytes) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); } return (crc ^ 0xffffffff) >>> 0; }
function zip(entries) {
  const locals = [], centrals = []; let offset = 0;
  for (const [name, source] of Object.entries(entries)) {
    const filename = Buffer.from(name), data = Buffer.from(source), crc = crc32(data);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(filename.length, 26);
    locals.push(local, filename, data);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt32LE(crc, 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(filename.length, 28); central.writeUInt32LE(offset, 42);
    centrals.push(central, filename); offset += local.length + filename.length + data.length;
  }
  const centralSize = centrals.reduce((sum, value) => sum + value.length, 0), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(Object.keys(entries).length, 8); end.writeUInt16LE(Object.keys(entries).length, 10); end.writeUInt32LE(centralSize, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}
const cell = (ref, value, formula = false) => `<c r="${ref}" t="inlineStr">${formula ? "<f>1+1</f>" : ""}<is><t>${escape(value)}</t></is></c>`;
const col = index => { let value = ""; for (let n = index + 1; n; n = Math.floor((n - 1) / 26)) value = String.fromCharCode(65 + ((n - 1) % 26)) + value; return value; };
function sheetXml(headers, rows, formula = false) { return `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${[headers, ...rows].map((row, ri) => `<row r="${ri + 1}">${row.map((value, ci) => cell(`${col(ci)}${ri + 1}`, value, formula && ri === 1 && ci === 0)).join("")}</row>`).join("")}</sheetData></worksheet>`; }
const row = (headers, values) => headers.map(header => values[header] ?? "");
function workbook(overrides = {}) {
  const entity = row(UTAH_BUSINESS_LIST_SHEETS.BUSENTITY, { "Entity No.": "001234-0142", "Entity ID": "00042", "Entity Type": "Domestic LLC", "License Type": "LLC", "Business Name": "Example Market LLC", Address: "100 Main St", City: "Salt Lake City", State: "UT", ZipCode: "08410-0123", "Applicant Name": "PRIVATE APPLICANT" });
  const info = row(UTAH_BUSINESS_LIST_SHEETS.BUSINFO, { "Entity ID": "00042", "Business Name": "Example Market LLC", "Information Type": "Agent", Information: "PRIVATE INFO" });
  const principal = row(UTAH_BUSINESS_LIST_SHEETS.PRINCIPAL, { "Entity ID": "00042", "Business Name": "Example Market LLC", "Member Position": "Member", "Full Name": "PRIVATE PERSON", Address: "PRIVATE ADDRESS", City: "PRIVATE CITY", State: "UT", ZipCode: "08410" });
  const sheetNames = overrides.sheetNames ?? ["BUSENTITY", "BUSINFO", "PRINCIPAL"], rels = sheetNames.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("");
  const entries = {
    "[Content_Types].xml": `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Default Extension="xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
    "xl/workbook.xml": `<?xml version="1.0"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetNames.map((name, index) => `<sheet name="${name}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("")}</sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0"?><Relationships>${rels}${overrides.externalRelationship ?? ""}</Relationships>`,
    "xl/worksheets/sheet1.xml": sheetXml(overrides.entityHeaders ?? UTAH_BUSINESS_LIST_SHEETS.BUSENTITY, [entity], overrides.formula),
    "xl/worksheets/sheet2.xml": sheetXml(UTAH_BUSINESS_LIST_SHEETS.BUSINFO, [overrides.orphan ? row(UTAH_BUSINESS_LIST_SHEETS.BUSINFO, { "Entity ID": "999", "Business Name": "Orphan" }) : info]),
    "xl/worksheets/sheet3.xml": sheetXml(UTAH_BUSINESS_LIST_SHEETS.PRINCIPAL, [principal]),
    ...(overrides.extraEntries ?? {}),
  };
  return zip(entries);
}
async function fixture(t, bytes = workbook()) { const root = path.join(APP_ROOT, "data", "imports", "utah-business-list", "workbooks"); await mkdir(root, { recursive: true }); const directory = await mkdtemp(path.join(root, "test-")); t.after(() => rm(directory, { recursive: true, force: true })); const file = path.join(directory, "..", `${path.basename(directory)}.xlsx`); await writeFile(file, bytes); t.after(() => rm(file, { force: true })); return file; }

test("deterministically extracts exact official sheets, preserves string IDs and ZIP, and minimizes private values", async t => {
  const file = await fixture(t), saved = globalThis.fetch; globalThis.fetch = () => assert.fail("workbook replay made a network request");
  try { const first = await extractUtahBusinessWorkbook(file), second = await extractUtahBusinessWorkbook(file); assert.deepEqual(first.sheets, second.sheets); assert.equal(first.sheets.BUSENTITY[0]["Entity ID"], "00042"); assert.equal(first.sheets.BUSENTITY[0].ZipCode, "08410-0123"); assert.equal(first.sheets.BUSENTITY[0]["Applicant Name"], ""); assert.equal(first.sheets.BUSINFO[0].Information, ""); assert.equal(first.sheets.PRINCIPAL[0]["Full Name"], ""); assert.doesNotMatch(JSON.stringify(first.sheets), /PRIVATE/); }
  finally { globalThis.fetch = saved; }
});

test("builds a deterministic legacy-validator-compatible closed package without authority escalation", async t => {
  const file = await fixture(t), packageId = `replay-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const result = await buildUtahBusinessListReplayPackage({ workbookPath: file, packageId, observedAt: "2026-10-08T12:00:00.000Z", updatedThrough: "2026-10-06" }); t.after(() => rm(result.package_directory, { recursive: true, force: true }));
  const legacy = await inspectUtahBusinessListPackage(result.package_directory); assert.equal(legacy.records[0].entity_id, "00042"); assert.equal(legacy.records[0].administrative_address.zip5, "08410"); assert.equal(legacy.records[0].administrative_address.zip4, "0123"); assert.equal(result.claims.deterministic_replay_performed, true); assert.equal(result.claims.admission_eligible, false);
  const selection = JSON.parse(await readFile(path.join(result.package_directory, "selection.json"), "utf8")); assert.equal(selection.transformation.reproducible_extraction_verified, true); assert.equal(selection.claims.network_requests, 0); assert.equal(legacy.records[0].claims.reproducible_extraction_verified, true); assert.equal(legacy.records[0].claims.admission_eligible, false);
});

test("fails closed on formula, macro, link, schema drift, extra sheet, orphan reference, and cancellation", async t => {
  const variants = [
    workbook({ formula: true }),
    workbook({ extraEntries: { "xl/vbaProject.bin": "unsafe" } }),
    workbook({ externalRelationship: '<Relationship Id="rId9" TargetMode="External" Target="https://example.invalid/"/>' }),
    workbook({ entityHeaders: [...UTAH_BUSINESS_LIST_SHEETS.BUSENTITY.slice(0, -1), "Drift"] }),
    workbook({ sheetNames: ["BUSENTITY", "BUSINFO", "PRINCIPAL", "EXTRA"] }),
    workbook({ orphan: true }),
  ];
  for (const value of variants) { const file = await fixture(t, value); await assert.rejects(extractUtahBusinessWorkbook(file), /Utah workbook replay rejected/); }
  const file = await fixture(t), controller = new AbortController(); controller.abort(); await assert.rejects(extractUtahBusinessWorkbook(file, { signal: controller.signal }), error => error.name === "AbortError");
});

test("refuses package collisions without changing the existing package", async t => {
  const file = await fixture(t), packageId = `collision-${Date.now()}-${Math.random().toString(16).slice(2)}`, existing = path.join(APP_ROOT, "data", "imports", "utah-business-list", "packages", packageId); await mkdir(existing, { recursive: false }); await writeFile(path.join(existing, "owner.txt"), "existing\n"); t.after(() => rm(existing, { recursive: true, force: true }));
  await assert.rejects(buildUtahBusinessListReplayPackage({ workbookPath: file, packageId, observedAt: "2026-10-08T12:00:00.000Z", updatedThrough: "2026-10-06" }));
  assert.equal(await readFile(path.join(existing, "owner.txt"), "utf8"), "existing\n");
});
