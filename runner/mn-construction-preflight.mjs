import { createHash, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { mkdir, realpath, lstat, open, link, unlink } from "node:fs/promises";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";
import { profileMnConstructionCodes, validateMnConstructionCodeProfile } from "./mn-construction-code-profile.mjs";

export const MN_CONSTRUCTION_EXPORTS = Object.freeze([
  "https://secure.doli.state.mn.us/ccld/data/MNDLILicRegCertExport_Contractor_Registrations.csv",
  "https://secure.doli.state.mn.us/ccld/data/MNDLILicRegCertExport_Residential_Contractors.csv",
]);
// Observed in both publisher exports on 2026-09-08. Presence of Bus_Pers does
// not establish its value codebook or prove that Name/Addr1 identify a business site.
export const MN_CONSTRUCTION_COLUMNS = Object.freeze(["Bus_Pers", "License_Type", "License_Subtype", "Name", "DBA_Name", "Addr1", "Addr2", "City", "St", "Zip", "Phone_No", "Email_Address", "Lic_Number", "Status", "Orig_Date", "Exp_Date", "Enforcement_Action", "Renewal_in_Progress"]);
const LIMIT = 4096;
const hash = (v) => createHash("sha256").update(v).digest("hex");
const check = (v, reason) => { if (!v) throw new Error(`Minnesota construction prerequisite rejected: ${reason}.`); };
const object = (v) => v && typeof v === "object" && !Array.isArray(v);
const exact = (v, fields) => object(v) && Object.keys(v).length === fields.length && fields.every((f) => Object.hasOwn(v, f));
const time = (v) => typeof v === "string" && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;

/** Only the first terminated header is decoded. Trailing prefix bytes are neither
 * parsed as records nor returned. The narrow header grammar rejects multiline
 * fields, formulas, duplicate/empty names and non-UTF8 source encodings.
 */
export function inspectMnConstructionHeader(prefix) {
  check(Buffer.isBuffer(prefix) && prefix.length > 0 && prefix.length <= LIMIT, "prefix limit");
  const end = prefix.indexOf(10); check(end > 0, "complete header missing within prefix limit");
  const bytes = prefix.subarray(0, end + 1);
  let line;
  try { line = new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/\r?\n$/, ""); } catch { throw new Error("Minnesota construction prerequisite rejected: header encoding."); }
  const columns = []; let field = "", quoted = false, closed = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"') { if (line[i + 1] === '"') { field += '"'; i++; } else { quoted = false; closed = true; } }
      else field += c;
    } else if (c === ",") { columns.push(field); field = ""; closed = false; }
    else if (c === '"') { check(!field && !closed, "header quoting"); quoted = true; }
    else { check(!closed, "header quoting"); field += c; }
  }
  check(!quoted, "unterminated quoted header"); columns.push(field);
  check(columns.length >= 3 && columns.length <= 100 && new Set(columns).size === columns.length
    && columns.every((v) => /^[A-Za-z][A-Za-z0-9_ ()/.-]{0,99}$/.test(v)), "column names");
  check(columns.filter((v) => /^license/i.test(v)).length >= 2, "license header identity");
  return { columns, header_bytes: bytes.length, header_base64: bytes.toString("base64"), header_sha256: hash(bytes) };
}

function identity(headers) {
  const length = headers.get("content-length"), etag = headers.get("etag"), modified = headers.get("last-modified"), type = headers.get("content-type");
  check(/^\d+$/.test(length ?? "") && Number.isSafeInteger(Number(length)) && Number(length) > LIMIT && Number(length) <= 100_000_000, "advertised file size");
  check(typeof etag === "string" && /^"[\x21\x23-\x7e]{1,150}"$/.test(etag), "strong source ETag required");
  check(typeof modified === "string" && modified.length <= 80 && Number.isFinite(Date.parse(modified)), "source modification time");
  check(typeof type === "string" && /^(application\/octet-stream|text\/csv)(;|$)/i.test(type), "source content type");
  check(!headers.get("content-encoding") || headers.get("content-encoding") === "identity", "encoded range unsupported");
  return { file_bytes: Number(length), etag, last_modified: modified, content_type: type };
}

function boundedFetch(fetchImpl, url, options) {
  options.signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    let settled = false;
    const abort = () => { if (!settled) { settled = true; reject(options.signal.reason); } };
    options.signal.addEventListener("abort", abort, { once: true });
    Promise.resolve().then(() => { options.signal.throwIfAborted(); return fetchImpl(url, options); }).then((r) => {
      options.signal.removeEventListener("abort", abort);
      if (settled) { if (r?.body && !r.body.locked) void r.body.cancel().catch(() => {}); return; }
      settled = true; resolve(r);
    }, (e) => { options.signal.removeEventListener("abort", abort); if (!settled) { settled = true; reject(e); } });
  });
}

export const preflightMnConstruction = (options = {}) => runPreflight(options, false);
export const preflightMnConstructionCodes = (options = {}) => runPreflight(options, true);
async function runPreflight(options, profileCodes) {
  check(object(options) && Object.keys(options).every((k) => ["fetchImpl", "signal", "sleep", "now", "timeoutMs"].includes(k)), "unsupported options");
  const { fetchImpl = fetch, signal, sleep = (ms, opts) => delay(ms, undefined, opts), now = () => new Date(), timeoutMs = 15_000 } = options;
  check([fetchImpl, sleep, now].every((v) => typeof v === "function") && (signal === undefined || signal instanceof AbortSignal) && Number.isInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 60_000, "options");
  signal?.throwIfAborted(); const startedAt = now().toISOString(); check(time(startedAt), "clock");
  const observations = []; let calls = 0;
  async function request(url, method, expected) {
    if (calls) await sleep(1000, { signal }); signal?.throwIfAborted();
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(new DOMException("Minnesota metadata deadline.", "TimeoutError")), timeoutMs);
    const requestSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
    let r;
    try {
      calls++;
      r = await boundedFetch(fetchImpl, url, { method, redirect: "error", credentials: "omit", signal: requestSignal,
        headers: method === "GET" ? { Range: "bytes=0-4095", "If-Match": expected.etag, "Accept-Encoding": "identity" } : { "Accept-Encoding": "identity" } });
      requestSignal.throwIfAborted();
      check(r instanceof Response && !r.redirected, "response identity");
      check(r.status === (method === "HEAD" ? 200 : 206), "HTTP status or range not honored; no body accepted");
      if (method === "HEAD") return identity(r.headers);
      check(r.headers.get("content-range") === `bytes 0-4095/${expected.file_bytes}` && r.headers.get("content-length") === "4096", "exact byte range");
      check(r.headers.get("etag") === expected.etag && r.headers.get("last-modified") === expected.last_modified && r.headers.get("content-type") === expected.content_type, "range source drift");
      check(!r.headers.get("content-encoding") || r.headers.get("content-encoding") === "identity", "encoded range unsupported");
      check(r.body, "range body missing");
      const reader = r.body.getReader(), chunks = []; let bytes = 0;
      const abort = () => { void reader.cancel().catch(() => {}); };
      requestSignal.addEventListener("abort", abort, { once: true });
      try {
        while (true) {
          requestSignal.throwIfAborted(); const next = await reader.read(); requestSignal.throwIfAborted(); if (next.done) break;
          bytes += next.value.byteLength; check(bytes <= LIMIT, "consumed prefix ceiling"); chunks.push(next.value);
        }
        check(bytes === LIMIT, "truncated prefix");
        const prefix = Buffer.concat(chunks, bytes), header = inspectMnConstructionHeader(prefix);
        check(JSON.stringify(header.columns) === JSON.stringify(MN_CONSTRUCTION_COLUMNS), "publisher header changed; review required");
        return { ...header, ...(profileCodes ? { code_profile: profileMnConstructionCodes(prefix, header) } : {}) };
      } finally { requestSignal.removeEventListener("abort", abort); void reader.cancel().catch(() => {}); reader.releaseLock(); }
    } catch (error) {
      signal?.throwIfAborted();
      if (error.message?.startsWith("Minnesota construction prerequisite rejected:")) throw error;
      throw new Error("Minnesota construction prerequisite failed: request, deadline or response handling; no source body retained.");
    } finally { clearTimeout(timer); if (r?.body && !r.body.locked) void r.body.cancel().catch(() => {}); }
  }
  for (const url of MN_CONSTRUCTION_EXPORTS) {
    const before = await request(url, "HEAD"), header = await request(url, "GET", before), after = await request(url, "HEAD");
    check(JSON.stringify(header.columns) === JSON.stringify(MN_CONSTRUCTION_COLUMNS), "publisher header changed; review required");
    check(JSON.stringify(before) === JSON.stringify(after), "source changed during header observation");
    const observedAt = now().toISOString(); check(time(observedAt) && observedAt >= (observations.at(-1)?.observed_at ?? startedAt), "observation clock");
    observations.push({ url, observed_at: observedAt, source_identity: before, prefix_bytes_consumed: LIMIT, ...header });
  }
  const receipt = { schema_version: profileCodes ? 2 : 1, dataset_id: "mn-dli-construction-schema", started_at: startedAt, finished_at: now().toISOString(), observations,
    claims: { business_records_retained: 0, prefix_requests: 2, full_export_downloaded: false, connector_ready: false, acquisition_authorized: false, public_export_authorized: false, source_record_count: null },
    scope: profileCodes ? "Two bounded prefixes are inspected for finite code counts only; headers and aggregate code buckets are retained, never source rows. Not representative, independently replayed code counts, source authenticity, address-role validation or a transactional snapshot." : "Two bounded prefixes may contain record bytes in memory; only validated CSV header bytes and source headers are retained. Not source authenticity, row schema/value validation or a transactional snapshot." };
  signal?.throwIfAborted(); validateMnConstructionPreflight(receipt); return receipt;
}

export function validateMnConstructionPreflight(receipt) {
  check(exact(receipt, ["schema_version", "dataset_id", "started_at", "finished_at", "observations", "claims", "scope"]) && [1, 2].includes(receipt.schema_version) && receipt.dataset_id === "mn-dli-construction-schema", "receipt envelope");
  check(time(receipt.started_at) && time(receipt.finished_at) && receipt.started_at <= receipt.finished_at && Array.isArray(receipt.observations) && receipt.observations.length === 2, "receipt chronology/roster");
  let prior = receipt.started_at;
  for (const [i, o] of receipt.observations.entries()) {
    check(exact(o, ["url", "observed_at", "source_identity", "prefix_bytes_consumed", "columns", "header_bytes", "header_base64", "header_sha256", ...(receipt.schema_version === 2 ? ["code_profile"] : [])]) && o.url === MN_CONSTRUCTION_EXPORTS[i] && time(o.observed_at) && prior <= o.observed_at && o.observed_at <= receipt.finished_at && o.prefix_bytes_consumed === LIMIT, "observation identity");
    if (receipt.schema_version === 2) validateMnConstructionCodeProfile(o.code_profile);
    check(typeof o.header_base64 === "string" && o.header_base64.length <= 5464, "header encoding size");
    const bytes = Buffer.from(o.header_base64, "base64"), header = inspectMnConstructionHeader(bytes);
    check(JSON.stringify(header.columns) === JSON.stringify(MN_CONSTRUCTION_COLUMNS), "publisher header contract");
    check(bytes.toString("base64") === o.header_base64 && bytes.length === header.header_bytes && Object.keys(header).every((k) => JSON.stringify(header[k]) === JSON.stringify(o[k])), "header reconstruction");
    check(exact(o.source_identity, ["file_bytes", "etag", "last_modified", "content_type"]), "source identity fields");
    const s = o.source_identity;
    check(JSON.stringify(identity(new Headers({ "content-length": String(s.file_bytes), etag: s.etag, "last-modified": s.last_modified, "content-type": s.content_type }))) === JSON.stringify(s), "source identity reconstruction"); prior = o.observed_at;
  }
  check(JSON.stringify(receipt.claims) === JSON.stringify({ business_records_retained: 0, prefix_requests: 2, full_export_downloaded: false, connector_ready: false, acquisition_authorized: false, public_export_authorized: false, source_record_count: null }), "receipt claims");
  check(receipt.scope === (receipt.schema_version === 2 ? "Two bounded prefixes are inspected for finite code counts only; headers and aggregate code buckets are retained, never source rows. Not representative, independently replayed code counts, source authenticity, address-role validation or a transactional snapshot." : "Two bounded prefixes may contain record bytes in memory; only validated CSV header bytes and source headers are retained. Not source authenticity, row schema/value validation or a transactional snapshot."), "receipt scope");
  return receipt;
}

export async function writeMnConstructionPreflight(receipt, { signal, outputRoot = path.join(APP_ROOT, "data/business-sources/mn-dli-construction/preflights") } = {}) {
  validateMnConstructionPreflight(receipt); signal?.throwIfAborted();
  // Snapshot before the first asynchronous operation: caller mutation cannot
  // replace validated evidence while path creation or file I/O is in progress.
  const bytes = Buffer.from(JSON.stringify(receipt, null, 2) + "\n");
  const relative = path.relative(APP_ROOT, outputRoot);
  const segments = relative.split(path.sep);
  check(segments.every((s) => !["releases", ".staging"].includes(s.toLowerCase()) && !/[ .]$/.test(s)), "immutable or noncanonical output ancestor");
  check(outputRoot === path.resolve(outputRoot) && relative && !relative.startsWith("..") && !path.isAbsolute(relative) && await realpath(APP_ROOT) === APP_ROOT, "receipt output root");
  let directory = APP_ROOT;
  for (const segment of segments) {
    directory = path.join(directory, segment); signal?.throwIfAborted();
    try { await mkdir(directory); } catch (e) { if (e.code !== "EEXIST") throw e; }
    const s = await lstat(directory); check(s.isDirectory() && !s.isSymbolicLink() && await realpath(directory) === directory, "receipt path alias");
    check(!await lstat(path.join(directory, "manifest.json")).then(() => true, (e) => { if (e.code === "ENOENT") return false; throw e; }), "manifest-bearing output ancestor");
  }
  const id = randomUUID(), temporary = path.join(outputRoot, `${id}.tmp`), destination = path.join(outputRoot, `${id}.json`); let owner, written;
  const owned = (s) => s?.isFile() && !s.isSymbolicLink() && s.ino === owner?.ino && s.dev === owner?.dev;
  try {
    signal?.throwIfAborted(); const handle = await open(temporary, "wx+");
    try {
      owner = await handle.stat({ bigint: true }); signal?.throwIfAborted(); await handle.writeFile(bytes); await handle.sync();
      const verified = Buffer.alloc(bytes.length + 1); const read = await handle.read(verified, 0, verified.length, 0);
      check(read.bytesRead === bytes.length && verified.subarray(0, read.bytesRead).equals(bytes), "written receipt bytes");
      written = await handle.stat({ bigint: true });
    } finally { await handle.close(); }
    signal?.throwIfAborted(); const actual = await lstat(temporary, { bigint: true });
    check(owned(actual) && actual.nlink === 1n && actual.size === BigInt(bytes.length) && actual.mtimeNs === written.mtimeNs && actual.ctimeNs === written.ctimeNs && await realpath(outputRoot) === outputRoot, "receipt ownership");
    // This is the commit boundary. Do not interrupt the link/unlink pair halfway.
    signal?.throwIfAborted(); await link(temporary, destination); await unlink(temporary);
    const published = await lstat(destination, { bigint: true });
    check(owned(published) && published.nlink === 1n && await realpath(outputRoot) === outputRoot, "published receipt ownership");
    return { path: destination, sha256: hash(bytes), bytes: bytes.length };
  } catch (error) {
    // Ordinary failures retain staging for diagnosis. Cancel only owned temporary
    // evidence, never prior receipts or substituted files/directories.
    if (signal?.aborted && owner && await realpath(outputRoot).catch(() => null) === outputRoot) {
      const current = await lstat(temporary, { bigint: true }).catch(() => null);
      if (owned(current) && current.nlink === 1n) await unlink(temporary);
    }
    throw error;
  }
}
