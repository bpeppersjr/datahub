import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { setImmediate } from "node:timers/promises";
import { crc32 } from "node:zlib";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { parse as parseCsv } from "csv-parse";
import unzipper from "unzipper";
import {
  MS_BUSINESS_REPORT_HEADERS as HEADERS,
  MS_BUSINESS_REPORT_MAX_ROWS as MAX_ROWS,
  parseMississippiBusinessReportPostalCode,
  validateMississippiBusinessReportRow,
} from "./mississippi-business-report-offline.mjs";

export const MS_BUSINESS_REPORT_EXTRACTION = "mississippi-business-report-extraction@1.0.0";
export const MS_BUSINESS_REPORT_MAX_INPUT_BYTES = 64 * 1024 * 1024;
const MAX_PARTS = 32;
const MAX_EXPANDED = 256 * 1024 * 1024;
const MAX_SHEET = 192 * 1024 * 1024;
const MAX_STRINGS = 64 * 1024 * 1024;
const MAX_METADATA = 1024 * 1024;
const MAX_CELL = 500;
const MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PACKAGE_REL = "http://schemas.openxmlformats.org/package/2006/relationships";
const CONTENT_TYPES = "http://schemas.openxmlformats.org/package/2006/content-types";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml";
const CORE_REL = "http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties";
const SHEET_PART = /^xl\/worksheets\/sheet[1-9][0-9]{0,4}\.xml$/;
const OTHER_PARTS = new Set([
  "[Content_Types].xml", "_rels/.rels", "docProps/app.xml", "docProps/core.xml", "xl/workbook.xml",
  "xl/_rels/workbook.xml.rels", "xl/sharedStrings.xml", "xl/styles.xml", "xl/theme/theme1.xml",
]);
const WORKBOOK_REL = new Map([
  [`${REL}/sharedStrings`, "xl/sharedStrings.xml"], [`${REL}/styles`, "xl/styles.xml"], [`${REL}/theme`, "xl/theme/theme1.xml"],
]);
const ROOT_REL = new Map([
  [`${REL}/officeDocument`, "xl/workbook.xml"], [`${REL}/extended-properties`, "docProps/app.xml"], [CORE_REL, "docProps/core.xml"],
]);
const NUMERIC_COLUMNS = new Set([1, 7, 8, 9, 15]);
const BASE_WORKSHEET_ELEMENTS = new Set(["sheetPr", "dimension", "sheetViews", "sheetFormatPr", "cols", "sheetData", "autoFilter", "printOptions", "pageMargins", "pageSetup", "headerFooter"]);
const PROHIBITED_WORKSHEET_ELEMENTS = new Set(["f", "hyperlink", "hyperlinks", "mergeCells", "oleObjects", "controls", "extLst", "conditionalFormatting", "dataValidations"]);
const UTF8 = new TextDecoder("utf-8", { fatal: true });

function requireShape(condition) {
  if (!condition) throw new Error("Unsupported Mississippi report structure.");
}

function xmlValue(value) {
  return value.replace(/&(?:([^&;]{1,16});)?/g, (_, entity) => {
    const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
    if (Object.hasOwn(named, entity)) return named[entity];
    requireShape(/^#(?:[0-9]+|x[0-9a-fA-F]+)$/.test(entity ?? ""));
    const code = entity.startsWith("#x") ? Number.parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    requireShape(code >= 32 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) && code !== 0xfffe && code !== 0xffff);
    return String.fromCodePoint(code);
  });
}

function xmlAttributes(source) {
  const attributes = Object.create(null);
  const attribute = /\s+([A-Za-z_][\w.:-]*)\s*=\s*(?:"([^"<>]*)"|'([^'<>]*)')/gy;
  let cursor = 0;
  while (source.slice(cursor).trim()) {
    attribute.lastIndex = cursor;
    const match = attribute.exec(source);
    requireShape(match && !Object.hasOwn(attributes, match[1]));
    attributes[match[1]] = xmlValue(match[2] ?? match[3]);
    cursor = attribute.lastIndex;
  }
  return attributes;
}

// Only the XML subset used by this intake profile is accepted. Each node is
// consumed as it closes so worksheet rows never accumulate in a DOM.
async function parseXml(bytes, { open, close, text }, signal) {
  const source = UTF8.decode(bytes).replace(/^<\?xml\s+version=["']1\.0["'](?:\s+encoding=["']UTF-8["'])?(?:\s+standalone=["'](?:yes|no)["'])?\s*\?>/i, "");
  requireShape(!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/.test(source));
  const token = /<([^<>]+)>|([^<]+)/gy;
  const stack = [];
  let cursor = 0;
  let roots = 0;
  let tokens = 0;
  while (cursor < source.length) {
    const match = token.exec(source);
    requireShape(match);
    cursor = token.lastIndex;
    if (++tokens % 8192 === 0) await setImmediate(undefined, { signal });
    const parent = stack.at(-1);
    if (match[2] !== undefined) {
      if (parent && text) text(match[2], parent);
      else requireShape(!match[2].trim());
      continue;
    }
    const tag = match[1];
    if (tag.startsWith("/")) {
      requireShape(parent && tag.slice(1).trimEnd() === parent.qualified);
      stack.pop();
      close?.(parent, stack.at(-1));
      continue;
    }
    const head = /^([A-Za-z_][\w.-]*(?::[A-Za-z_][\w.-]*)?)/.exec(tag);
    requireShape(head && stack.length < 32);
    const single = tag.endsWith("/");
    const attributes = xmlAttributes(tag.slice(head[0].length, single ? -1 : undefined));
    const namespaces = Object.create(parent?.namespaces ?? null);
    for (const [key, value] of Object.entries(attributes)) {
      if (key === "xmlns") namespaces[""] = value;
      else if (key.startsWith("xmlns:")) namespaces[key.slice(6)] = value;
    }
    const parts = head[0].split(":");
    const node = { qualified: head[0], name: parts.at(-1), namespace: namespaces[parts.length === 2 ? parts[0] : ""], attributes, namespaces };
    if (!parent) requireShape(++roots === 1);
    open(node, parent);
    if (single) close?.(node, parent);
    else stack.push(node);
  }
  signal?.throwIfAborted();
  requireShape(roots === 1 && stack.length === 0);
}

function zipFooter(bytes) {
  requireShape(bytes.length >= 22 && bytes.readUInt32LE(0) === 0x04034b50);
  // The profile uses plain single-disk ZIP, without comments or ZIP64.
  const end = bytes.length - 22;
  requireShape(bytes.readUInt32LE(end) === 0x06054b50 && bytes.readUInt32LE(end + 4) === 0 && bytes.readUInt16LE(end + 20) === 0);
  const parts = bytes.readUInt16LE(end + 10);
  const directoryBytes = bytes.readUInt32LE(end + 12);
  const directoryStart = bytes.readUInt32LE(end + 16);
  requireShape(parts > 0 && parts <= MAX_PARTS && bytes.readUInt16LE(end + 8) === parts && directoryBytes >= parts * 46 && directoryStart + directoryBytes === end);
  let cursor = directoryStart;
  const ranges = [];
  for (let index = 0; index < parts; index += 1) {
    requireShape(cursor + 46 <= end && bytes.readUInt32LE(cursor) === 0x02014b50 && bytes.readUInt16LE(cursor + 34) === 0);
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const next = cursor + 46 + nameLength + bytes.readUInt16LE(cursor + 30) + bytes.readUInt16LE(cursor + 32);
    const local = bytes.readUInt32LE(cursor + 42);
    const flags = bytes.readUInt16LE(cursor + 8);
    const method = bytes.readUInt16LE(cursor + 10);
    const compressedSize = bytes.readUInt32LE(cursor + 20);
    const expandedSize = bytes.readUInt32LE(cursor + 24);
    requireShape(next <= end && local + 30 <= directoryStart && bytes.readUInt32LE(local) === 0x04034b50);
    requireShape(bytes.readUInt16LE(local + 6) === flags && bytes.readUInt16LE(local + 8) === method && bytes.readUInt16LE(local + 26) === nameLength);
    const data = local + 30 + nameLength + bytes.readUInt16LE(local + 28);
    let localEnd = data + compressedSize;
    requireShape(localEnd <= directoryStart && expandedSize <= MAX_EXPANDED && compressedSize > 0);
    requireShape(bytes.subarray(local + 30, local + 30 + nameLength).equals(bytes.subarray(cursor + 46, cursor + 46 + nameLength)));
    const checksum = bytes.readUInt32LE(cursor + 16);
    if (flags & 8) {
      requireShape(localEnd + 12 <= directoryStart);
      if (bytes.readUInt32LE(localEnd) === 0x08074b50) localEnd += 4;
      requireShape(localEnd + 12 <= directoryStart && bytes.readUInt32LE(localEnd) === checksum && bytes.readUInt32LE(localEnd + 4) === compressedSize && bytes.readUInt32LE(localEnd + 8) === expandedSize);
      localEnd += 12;
    } else {
      requireShape(bytes.readUInt32LE(local + 14) === checksum && bytes.readUInt32LE(local + 18) === compressedSize && bytes.readUInt32LE(local + 22) === expandedSize);
    }
    ranges.push([local, localEnd]);
    cursor = next;
  }
  requireShape(cursor === end);
  let expectedLocal = 0;
  for (const [start, finish] of ranges.sort((a, b) => a[0] - b[0])) {
    requireShape(start === expectedLocal);
    expectedLocal = finish;
  }
  requireShape(expectedLocal === directoryStart);
  return parts;
}

async function workbookParts(bytes, signal) {
  const expectedCount = zipFooter(bytes);
  const archive = await unzipper.Open.buffer(bytes, { tailSize: 22 });
  requireShape(archive.files.length === expectedCount);
  const parts = new Map();
  let expanded = 0;
  for (const entry of archive.files) {
    signal?.throwIfAborted();
    const name = entry.path;
    const limit = SHEET_PART.test(name) ? MAX_SHEET : name === "xl/sharedStrings.xml" ? MAX_STRINGS : MAX_METADATA;
    requireShape((OTHER_PARTS.has(name) || SHEET_PART.test(name)) && entry.type === "File" && !parts.has(name));
    requireShape((entry.flags & ~0x80e) === 0 && [0, 8].includes(entry.compressionMethod));
    requireShape(entry.uncompressedSize > 0 && entry.uncompressedSize <= limit && entry.compressedSize > 0 && entry.compressedSize <= bytes.length);
    expanded += entry.uncompressedSize;
    requireShape(expanded <= MAX_EXPANDED);
    parts.set(name, entry);
  }
  return parts;
}

async function readPart(parts, name, signal) {
  const entry = parts.get(name);
  requireShape(entry);
  const chunks = [];
  let count = 0;
  let checksum = 0;
  const stream = entry.stream();
  const abort = () => stream.destroy();
  signal?.addEventListener("abort", abort, { once: true });
  try {
    signal?.throwIfAborted();
    for await (const chunk of stream) {
      count += chunk.length;
      requireShape(count <= entry.uncompressedSize);
      checksum = crc32(chunk, checksum);
      chunks.push(chunk);
    }
  } finally {
    signal?.removeEventListener("abort", abort);
  }
  requireShape(count === entry.uncompressedSize && checksum === entry.crc32);
  return Buffer.concat(chunks, count);
}

async function relationships(bytes, parts, isRoot, signal) {
  const entries = new Map();
  const targets = new Set();
  await parseXml(bytes, { open(node, parent) {
    requireShape(node.namespace === PACKAGE_REL);
    if (!parent) { requireShape(node.name === "Relationships"); return; }
    requireShape(parent.name === "Relationships" && node.name === "Relationship");
    const { Id, Target, Type, TargetMode } = node.attributes;
    requireShape(/^[A-Za-z][\w.-]{0,127}$/.test(Id ?? "") && !entries.has(Id) && (TargetMode === undefined || TargetMode === "Internal"));
    requireShape(typeof Target === "string" && /^\/?[A-Za-z0-9_.\/-]+$/.test(Target) && !Target.split("/").includes(".."));
    const target = Target.startsWith("/") ? Target.slice(1) : path.posix.join(isRoot ? "" : "xl", Target);
    const fixedTarget = (isRoot ? ROOT_REL : WORKBOOK_REL).get(Type);
    requireShape(!targets.has(target) && parts.has(target) && (fixedTarget === target || (!isRoot && Type === `${REL}/worksheet` && SHEET_PART.test(target))));
    targets.add(target);
    entries.set(Id, { target, type: Type });
  } }, signal);
  return entries;
}

async function worksheetTarget(parts, sheetName, signal) {
  const types = new Map();
  await parseXml(await readPart(parts, "[Content_Types].xml", signal), { open(node, parent) {
    requireShape(node.namespace === CONTENT_TYPES);
    if (!parent) { requireShape(node.name === "Types"); return; }
    const { PartName, ContentType, Extension } = node.attributes;
    requireShape(parent.name === "Types" && ["Override", "Default"].includes(node.name) && typeof ContentType === "string" && !/macro|external|oleobject|activex/i.test(ContentType));
    if (node.name === "Default") {
      requireShape(["xml", "rels"].includes(Extension));
      return;
    }
    requireShape(PartName?.startsWith("/") && parts.has(PartName.slice(1)) && !types.has(PartName.slice(1)));
    types.set(PartName.slice(1), ContentType);
  } }, signal);
  requireShape(types.get("xl/workbook.xml") === `${XLSX_MIME}.sheet.main+xml`);
  const rootRels = await relationships(await readPart(parts, "_rels/.rels", signal), parts, true, signal);
  const workbookRels = await relationships(await readPart(parts, "xl/_rels/workbook.xml.rels", signal), parts, false, signal);
  requireShape([...rootRels.values()].some(({ target }) => target === "xl/workbook.xml"));
  requireShape(parts.has("xl/sharedStrings.xml") === [...workbookRels.values()].some(({ target }) => target === "xl/sharedStrings.xml"));
  const worksheetParts = [...parts.keys()].filter(name => SHEET_PART.test(name));
  requireShape(worksheetParts.length === 1 && types.get(worksheetParts[0]) === `${XLSX_MIME}.worksheet+xml`);
  let selected;
  await parseXml(await readPart(parts, "xl/workbook.xml", signal), { open(node, parent) {
    requireShape(node.namespace === MAIN && !["definedNames", "externalReferences", "extLst", "fileSharing"].includes(node.name));
    if (!parent) requireShape(node.name === "workbook");
    if (node.name === "sheets") requireShape(parent?.name === "workbook");
    if (node.name !== "sheet") return;
    const relationship = Object.entries(node.attributes).filter(([key]) => key.endsWith(":id") && node.namespaces[key.split(":")[0]] === REL);
    const { name, state } = node.attributes;
    requireShape(parent?.name === "sheets" && !selected && name === sheetName && (state === undefined || state === "visible") && relationship.length === 1);
    selected = workbookRels.get(relationship[0][1]);
    requireShape(selected?.target === worksheetParts[0] && selected.type === `${REL}/worksheet`);
  } }, signal);
  requireShape(selected);
  return selected.target;
}

async function sharedStrings(parts, signal) {
  if (!parts.has("xl/sharedStrings.xml")) return [];
  const strings = [];
  let value;
  await parseXml(await readPart(parts, "xl/sharedStrings.xml", signal), {
    open(node, parent) {
      requireShape(node.namespace === MAIN);
      if (!parent) requireShape(node.name === "sst");
      if (node.name === "si") { requireShape(parent?.name === "sst"); value = ""; }
      if (node.name === "t") requireShape(value !== undefined && ["si", "r"].includes(parent?.name));
    },
    text(raw, node) {
      if (node.name === "t") { value += xmlValue(raw); requireShape(value.length <= MAX_CELL); }
      else requireShape(!raw.trim());
    },
    close(node) {
      if (node.name !== "si") return;
      requireShape(strings.length < 1_000_000);
      strings.push(value);
      value = undefined;
    },
  }, signal);
  return strings;
}

function projection() {
  const identifiers = new Set();
  const hash = createHash("sha256");
  const counts = { rows_observed: 0, registry_status_present: 0, principal_address_present: 0, zip5_present: 0, zip4_present: 0 };
  let headerSeen = false;
  return {
    row(values) {
      if (!headerSeen) { requireShape(isDeepStrictEqual(values, HEADERS)); headerSeen = true; return; }
      requireShape(values.length === HEADERS.length && counts.rows_observed < MAX_ROWS);
      const row = Object.fromEntries(HEADERS.map((header, index) => [header, values[index]]));
      validateMississippiBusinessReportRow(row);
      const id = row["Business ID"];
      requireShape(!identifiers.has(id));
      identifiers.add(id);
      const postal = parseMississippiBusinessReportPostalCode(row["Postal Code"]);
      const fields = { ...row, ...postal };
      delete fields["Postal Code"];
      hash.update(`${JSON.stringify(fields)}\n`);
      counts.rows_observed += 1;
      counts.registry_status_present += Number(Boolean(row.Status));
      counts.principal_address_present += Number(Boolean(row["Principal Address"]));
      counts.zip5_present += Number(postal.zip5 !== null);
      counts.zip4_present += Number(postal.zip4 !== null);
    },
    result() {
      requireShape(headerSeen);
      return { ...counts, ordered_projection_sha256: hash.digest("hex") };
    },
  };
}

async function extractXlsx(bytes, sheetName, signal) {
  const parts = await workbookParts(bytes, signal);
  const target = await worksheetTarget(parts, sheetName, signal);
  const strings = await sharedStrings(parts, signal);
  const result = projection();
  let dataSeen = false;
  let rowNumber = 0;
  let row;
  let cell;
  await parseXml(await readPart(parts, target, signal), {
    open(node, parent) {
      requireShape(node.namespace === MAIN && !PROHIBITED_WORKSHEET_ELEMENTS.has(node.name));
      if (!parent) { requireShape(node.name === "worksheet"); return; }
      if (parent.name === "worksheet") requireShape(BASE_WORKSHEET_ELEMENTS.has(node.name));
      if (node.name === "sheetData") { requireShape(parent.name === "worksheet" && !dataSeen); dataSeen = true; }
      if (parent.name === "sheetData" || node.name === "row") {
        requireShape(parent.name === "sheetData" && node.name === "row" && node.attributes.r === String(++rowNumber) && rowNumber <= MAX_ROWS + 1);
        requireShape(node.attributes.hidden === undefined || node.attributes.hidden === "0" || node.attributes.hidden === "false");
        row = Array(HEADERS.length).fill("");
      }
      if (parent.name === "row" || node.name === "c") {
        const reference = /^([A-P])([1-9][0-9]{0,5})$/.exec(node.attributes.r ?? "");
        requireShape(parent.name === "row" && node.name === "c" && reference && reference[2] === String(rowNumber));
        const column = reference[1].charCodeAt(0) - 65;
        requireShape(!row[column + HEADERS.length]);
        row[column + HEADERS.length] = true;
        const type = node.attributes.t ?? "n";
        requireShape(["inlineStr", "s", "str", "n", "d"].includes(type));
        cell = { column, type, style: node.attributes.s, value: "", payload: false };
      }
      if (parent.name === "c") {
        requireShape(!cell.payload && (cell.type === "inlineStr" ? node.name === "is" : node.name === "v"));
        cell.payload = true;
      }
      if (node.name === "is" || node.name === "v") requireShape(parent.name === "c");
      if (node.name === "t") requireShape(cell?.type === "inlineStr" && ["is", "r"].includes(parent.name));
    },
    text(raw, node) {
      if (cell && (node.name === "v" || node.name === "t")) { cell.value += xmlValue(raw); requireShape(cell.value.length <= MAX_CELL); }
      else requireShape(!raw.trim());
    },
    close(node) {
      if (node.name === "c") {
        let value = cell.value;
        if (cell.type === "s") {
          requireShape(/^(?:0|[1-9][0-9]{0,6})$/.test(value) && Number(value) < strings.length);
          value = strings[Number(value)];
        }
        if (cell.type === "n" && value) {
          requireShape(NUMERIC_COLUMNS.has(cell.column) && /^[0-9]+$/.test(value));
          if (cell.column === 1) requireShape(cell.style === undefined || cell.style === "0");
        }
        if (cell.type === "d") requireShape(cell.column === 15);
        row[cell.column] = value;
        cell = undefined;
      }
      if (node.name === "row") { result.row(row.slice(0, HEADERS.length)); row = undefined; }
    },
  }, signal);
  requireShape(dataSeen);
  return result.result();
}

async function extractCsv(bytes, signal) {
  UTF8.decode(bytes); // Reject malformed UTF-8 before csv-parse can replace it.
  function* chunks() {
    for (let offset = 0; offset < bytes.length; offset += 65536) yield bytes.subarray(offset, offset + 65536);
  }
  const source = Readable.from(chunks());
  const parser = parseCsv({ bom: true, max_record_size: 16384, record_delimiter: ["\r\n", "\n"] });
  const result = projection();
  let count = 0;
  source.pipe(parser);
  try {
    for await (const row of parser) {
      signal?.throwIfAborted();
      result.row(row);
      if (++count % 2048 === 0) await setImmediate(undefined, { signal });
    }
  } finally {
    source.destroy();
    parser.destroy();
  }
  return result.result();
}

export async function extractMississippiBusinessReport(bytes, { format, sheetName, signal } = {}) {
  signal?.throwIfAborted();
  try {
    requireShape(Buffer.isBuffer(bytes) && bytes.length > 0 && bytes.length <= MS_BUSINESS_REPORT_MAX_INPUT_BYTES);
    if (format === "xlsx") return await extractXlsx(bytes, sheetName, signal);
    if (format === "csv") return await extractCsv(bytes, signal);
    requireShape(false);
  } catch {
    signal?.throwIfAborted();
    throw Object.assign(new Error("Mississippi report extraction did not match the supported file and row contract."), { code: "MS_REPORT_EXTRACTION_REJECTED" });
  }
}
