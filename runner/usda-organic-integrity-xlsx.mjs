import { crc32 } from "node:zlib";
import { stat } from "node:fs/promises";

import unzipper from "unzipper";

export const USDA_INTEGRITY_WORKBOOK_SHEETS = Object.freeze({
  Operations: Object.freeze([
    "Operation ID", "Operation Name", "Country Code", "Country", "Status", "Effective Date of Operation Status", "Certifier",
    "Physical Address 1", "Physical Address 2", "Physical City", "Physical State", "Physical Postal Code",
    "Mailing Address 1", "Mailing Address 2", "Mailing City", "Mailing State", "Mailing Postal Code",
  ]),
  Scopes: Object.freeze(["Operation ID", "NOP Scope"]),
  Services: Object.freeze(["Operation ID", "Service"]),
  Products: Object.freeze(["Operation ID", "NOP Scope", "NOP Category ID", "NOP Category", "NOP Item ID", "NOP Item Name"]),
});

const REQUIRED_ARCHIVE_PARTS = new Set([
  "[Content_Types].xml",
  "_rels/.rels",
  "xl/workbook.xml",
  "xl/_rels/workbook.xml.rels",
]);
const FORBIDDEN_PART = /(^|\/)(?:vbaProject\.bin|externalLinks|embeddings|activeX|ctrlProps|customUI|connections\.xml)(?:\/|$)/i;

function decodeXml(value) {
  return String(value ?? "")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&")
    .replace(/&#(\d+);/g, (_, digits) => String.fromCodePoint(Number(digits)))
    .replace(/&#x([0-9a-f]+);/gi, (_, digits) => String.fromCodePoint(Number.parseInt(digits, 16)));
}

function attributes(value) {
  const result = {};
  for (const match of String(value ?? "").matchAll(/([\w:.-]+)\s*=\s*(["'])(.*?)\2/g)) result[match[1]] = decodeXml(match[3]);
  return result;
}

function normalizePart(value) {
  const normalized = String(value ?? "").replaceAll("\\", "/").replace(/^\//, "");
  const segments = [];
  for (const segment of normalized.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (!segments.length) throw new Error("XLSX relationship escapes the archive root.");
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return segments.join("/");
}

function workbookTarget(target) {
  return normalizePart(target.startsWith("/") ? target : `xl/${target}`);
}

async function entryBuffer(entry, maximumPartBytes, signal) {
  if (entry.uncompressedSize > maximumPartBytes) throw new Error(`XLSX part ${entry.path} exceeds the configured size limit.`);
  const chunks = [];
  let bytes = 0;
  for await (const chunk of entry.stream()) {
    if (signal?.aborted) throw signal.reason ?? new DOMException("The operation was aborted.", "AbortError");
    bytes += chunk.length;
    if (bytes > maximumPartBytes) throw new Error(`XLSX part ${entry.path} exceeds the configured size limit.`);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, bytes);
}

function textRuns(xml) {
  return [...String(xml).matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((match) => decodeXml(match[1])).join("");
}

function columnIndex(reference) {
  const letters = String(reference ?? "").match(/^([A-Z]+)\d+$/)?.[1];
  if (!letters) throw new Error(`Invalid XLSX cell reference ${reference}.`);
  let value = 0;
  for (const letter of letters) value = value * 26 + letter.charCodeAt(0) - 64;
  return value - 1;
}

function parseSharedStrings(xml) {
  if (!xml) return [];
  return [...xml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)].map((match) => textRuns(match[1]));
}

function cellValue(cellAttributes, body, sharedStrings) {
  const type = cellAttributes.t ?? "n";
  if (type === "inlineStr") return textRuns(body);
  const raw = body.match(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/)?.[1] ?? "";
  if (type === "s") {
    const index = Number(raw);
    if (!Number.isInteger(index) || index < 0 || index >= sharedStrings.length) throw new Error("XLSX cell has an invalid shared-string reference.");
    return sharedStrings[index];
  }
  if (type === "b") return raw === "1" ? "TRUE" : "FALSE";
  return decodeXml(raw);
}

function assertWorksheetSafety(xml, sheetName) {
  if (/<f(?:\s|>)/i.test(xml)) throw new Error(`XLSX sheet ${sheetName} contains a formula.`);
  if (/<(?:hyperlinks|mergeCells|oleObjects|controls)(?:\s|>)/i.test(xml)) throw new Error(`XLSX sheet ${sheetName} contains unsupported active or ambiguous content.`);
}

function parseSheet(xml, sharedStrings, expectedHeaders, sheetName) {
  assertWorksheetSafety(xml, sheetName);
  const parsedRows = [];
  for (const rowMatch of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const rowAttributes = attributes(rowMatch[1]);
    const rowNumber = Number(rowAttributes.r);
    if (!Number.isInteger(rowNumber) || rowNumber < 1) throw new Error(`XLSX sheet ${sheetName} has an invalid row index.`);
    const values = [];
    for (const cellMatch of rowMatch[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const cellAttributes = attributes(cellMatch[1]);
      const index = columnIndex(cellAttributes.r);
      if (index >= expectedHeaders.length) throw new Error(`XLSX sheet ${sheetName} has a cell outside its pinned columns.`);
      if (values[index] !== undefined) throw new Error(`XLSX sheet ${sheetName} contains a duplicate cell reference.`);
      values[index] = cellValue(cellAttributes, cellMatch[2] ?? "", sharedStrings);
    }
    parsedRows[rowNumber - 1] = Array.from({ length: expectedHeaders.length }, (_, index) => values[index] ?? "");
  }
  if (!parsedRows.length) throw new Error(`XLSX sheet ${sheetName} is empty.`);
  if (parsedRows.some((row) => row === undefined)) throw new Error(`XLSX sheet ${sheetName} has non-contiguous row numbers.`);
  const headers = parsedRows[0];
  if (headers.length !== expectedHeaders.length || headers.some((value, index) => value !== expectedHeaders[index])) {
    throw new Error(`XLSX sheet ${sheetName} header schema drifted.`);
  }
  return parsedRows.slice(1).filter((row) => row.some((value) => String(value).trim() !== ""))
    .map((row) => Object.fromEntries(expectedHeaders.map((header, index) => [header, String(row[index] ?? "").trim()])));
}

export async function readUsdaIntegrityWorkbook(filename, {
  maximumArchiveBytes = 128 * 1024 * 1024,
  maximumPartBytes = 512 * 1024 * 1024,
  maximumExpandedBytes = 1024 * 1024 * 1024,
  maximumPartCount = 2048,
  signal,
} = {}) {
  if (signal?.aborted) throw signal.reason ?? new DOMException("The operation was aborted.", "AbortError");
  if (!String(filename).toLowerCase().endsWith(".xlsx")) throw new Error("USDA INTEGRITY offline source must be an .xlsx workbook.");
  for (const [label, value] of [["archive", maximumArchiveBytes], ["part", maximumPartBytes], ["expanded", maximumExpandedBytes], ["part count", maximumPartCount]]) {
    if (!Number.isSafeInteger(value) || value < 1) throw new Error(`USDA INTEGRITY XLSX ${label} limit is invalid.`);
  }
  const sourceStats = await stat(filename);
  if (!sourceStats.isFile() || sourceStats.size > maximumArchiveBytes) throw new Error("USDA INTEGRITY workbook exceeds the governed offline archive size limit; live bulk acquisition is not enabled.");
  const directory = await unzipper.Open.file(filename);
  if (directory.files.length > maximumPartCount) throw new Error("USDA INTEGRITY workbook exceeds the governed XLSX part-count limit.");
  const archiveBytes = directory.files.reduce((sum, entry) => sum + Number(entry.compressedSize ?? 0), 0);
  const expandedBytes = directory.files.reduce((sum, entry) => sum + Number(entry.uncompressedSize ?? 0), 0);
  if (archiveBytes > maximumArchiveBytes) throw new Error("USDA INTEGRITY workbook exceeds the governed offline archive size limit; live bulk acquisition is not enabled.");
  if (!Number.isSafeInteger(expandedBytes) || expandedBytes > maximumExpandedBytes) throw new Error("USDA INTEGRITY workbook exceeds the governed expanded-size limit.");
  const files = new Map();
  for (const entry of directory.files) {
    if (signal?.aborted) throw signal.reason ?? new DOMException("The operation was aborted.", "AbortError");
    const part = normalizePart(entry.path);
    if (!part || part.endsWith("/")) continue;
    if (FORBIDDEN_PART.test(part)) throw new Error(`XLSX contains forbidden active or external content in ${part}.`);
    if (files.has(part)) throw new Error(`XLSX contains duplicate part ${part}.`);
    files.set(part, entry);
  }
  for (const required of REQUIRED_ARCHIVE_PARTS) if (!files.has(required)) throw new Error(`XLSX is missing required part ${required}.`);

  const contentTypes = (await entryBuffer(files.get("[Content_Types].xml"), maximumPartBytes, signal)).toString("utf8");
  if (/macroEnabled|vbaProject|activeX|oleObject|externalLink/i.test(contentTypes)) throw new Error("XLSX content types declare active or external content.");
  const relationshipXml = new Map();
  for (const [part, entry] of files) {
    if (!part.toLowerCase().endsWith(".rels")) continue;
    const xml = (await entryBuffer(entry, maximumPartBytes, signal)).toString("utf8");
    if (/TargetMode\s*=\s*["']External["']/i.test(xml)) throw new Error(`XLSX contains an external relationship in ${part}.`);
    relationshipXml.set(part, xml);
  }
  const rootRelationships = relationshipXml.get("_rels/.rels");
  const workbookRelationships = relationshipXml.get("xl/_rels/workbook.xml.rels");
  if (!rootRelationships || !workbookRelationships) throw new Error("XLSX relationship parts are unreadable.");

  const relationshipTargets = new Map();
  for (const match of workbookRelationships.matchAll(/<Relationship\b([^>]*?)\/?>(?:<\/Relationship>)?/g)) {
    const attrs = attributes(match[1]);
    if (!attrs.Id || !attrs.Target) throw new Error("XLSX workbook relationship is malformed.");
    relationshipTargets.set(attrs.Id, workbookTarget(attrs.Target));
  }
  const workbookXml = (await entryBuffer(files.get("xl/workbook.xml"), maximumPartBytes, signal)).toString("utf8");
  if (/<(?:definedNames|externalReferences|fileSharing)(?:\s|>)/i.test(workbookXml)) throw new Error("XLSX workbook contains unsupported definitions or external references.");
  const workbookSheets = [];
  for (const match of workbookXml.matchAll(/<sheet\b([^>]*?)\/?>(?:<\/sheet>)?/g)) {
    const attrs = attributes(match[1]);
    const relationshipId = attrs["r:id"];
    const target = relationshipTargets.get(relationshipId);
    if (!attrs.name || !target || !files.has(target)) throw new Error("XLSX workbook sheet relationship is invalid.");
    workbookSheets.push({ name: attrs.name, target });
  }
  const expectedNames = Object.keys(USDA_INTEGRITY_WORKBOOK_SHEETS);
  if (workbookSheets.length !== expectedNames.length || workbookSheets.some((sheet, index) => sheet.name !== expectedNames[index])) {
    throw new Error("USDA INTEGRITY workbook sheet schema drifted.");
  }
  const sharedStringsEntry = files.get("xl/sharedStrings.xml");
  const sharedStrings = sharedStringsEntry
    ? parseSharedStrings((await entryBuffer(sharedStringsEntry, maximumPartBytes, signal)).toString("utf8"))
    : [];
  const sheets = {};
  const selectedTargets = new Set(workbookSheets.map((sheet) => sheet.target));
  for (const [part, entry] of files) {
    if (!/^xl\/worksheets\/[^/]+\.xml$/i.test(part) || selectedTargets.has(part)) continue;
    assertWorksheetSafety((await entryBuffer(entry, maximumPartBytes, signal)).toString("utf8"), part);
  }
  for (const sheet of workbookSheets) {
    const xml = (await entryBuffer(files.get(sheet.target), maximumPartBytes, signal)).toString("utf8");
    sheets[sheet.name] = parseSheet(xml, sharedStrings, USDA_INTEGRITY_WORKBOOK_SHEETS[sheet.name], sheet.name);
  }
  return { sheets, archive_bytes: archiveBytes, expanded_bytes: expandedBytes };
}

function xmlEscape(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function cellReference(index, row) {
  let value = index + 1;
  let letters = "";
  while (value) {
    value -= 1;
    letters = String.fromCharCode(65 + (value % 26)) + letters;
    value = Math.floor(value / 26);
  }
  return `${letters}${row}`;
}

function worksheetXml(headers, rows) {
  const allRows = [Object.fromEntries(headers.map((header) => [header, header])), ...rows];
  const body = allRows.map((record, rowIndex) => {
    const cells = headers.map((header, columnIndex_) => `<c r="${cellReference(columnIndex_, rowIndex + 1)}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(record[header] ?? "")}</t></is></c>`).join("");
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

function createStoredZip(parts) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const [name, content] of parts) {
    const nameBuffer = Buffer.from(name, "utf8");
    const data = Buffer.from(content, "utf8");
    const checksum = crc32(data);
    const local = Buffer.alloc(30 + nameBuffer.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    nameBuffer.copy(local, 30);
    localParts.push(local, data);
    const central = Buffer.alloc(46 + nameBuffer.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt32LE(offset, 42);
    nameBuffer.copy(central, 46);
    centralParts.push(central);
    offset += local.length + data.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(parts.length, 8);
  end.writeUInt16LE(parts.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

export function createUsdaIntegrityFixtureWorkbook(sheetRows, { extraParts = [], sheetHeaders = {}, worksheetTransforms = {} } = {}) {
  const sheetNames = Object.keys(USDA_INTEGRITY_WORKBOOK_SHEETS);
  for (const name of sheetNames) if (!Array.isArray(sheetRows?.[name])) throw new Error(`Fixture workbook requires ${name} rows.`);
  const contentOverrides = sheetNames.map((name, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("");
  const contentTypes = `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${contentOverrides}</Types>`;
  const rootRelationships = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const workbookSheets = sheetNames.map((name, index) => `<sheet name="${xmlEscape(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("");
  const workbook = `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${workbookSheets}</sheets></workbook>`;
  const workbookRelationships = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheetNames.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("")}</Relationships>`;
  const parts = [
    ["[Content_Types].xml", contentTypes],
    ["_rels/.rels", rootRelationships],
    ["xl/workbook.xml", workbook],
    ["xl/_rels/workbook.xml.rels", workbookRelationships],
    ...sheetNames.map((name, index) => {
      const xml = worksheetXml(sheetHeaders[name] ?? USDA_INTEGRITY_WORKBOOK_SHEETS[name], sheetRows[name]);
      return [`xl/worksheets/sheet${index + 1}.xml`, worksheetTransforms[name]?.(xml) ?? xml];
    }),
    ...extraParts,
  ];
  return createStoredZip(parts);
}
