import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { readFile, mkdir, symlink, readdir } from "node:fs/promises";
import { APP_ROOT } from "./paths.mjs";
import { MN_CONSTRUCTION_EXPORTS, MN_CONSTRUCTION_COLUMNS, inspectMnConstructionHeader, preflightMnConstruction, validateMnConstructionPreflight, writeMnConstructionPreflight } from "./mn-construction-preflight.mjs";
const line = '\ufeff' + MN_CONSTRUCTION_COLUMNS.map((v) => `"${v}"`).join(",") + '\r\n';
const body = () => { const b = Buffer.alloc(4096, 120); b.write(line + 'PRIVATE RECORD MUST NOT SURVIVE\n'); b[4095] = 0xc3; return b; };
const headers = { "content-length": "10000", "content-type": "application/octet-stream", etag: '"v1"', "last-modified": "Mon, 07 Sep 2026 09:32:00 GMT" };
function fixture(change = () => {}) {
  const calls = [], waits = [];
  return { calls, waits, options: { now: () => new Date("2026-09-08T10:00:00.000Z"), sleep: async (ms, { signal } = {}) => { signal?.throwIfAborted(); waits.push(ms); },
    fetchImpl: async (url, opts) => {
      calls.push({ url, ...opts }); const changed = await change({ url, opts, call: calls.length });
      return changed ?? (opts.method === "HEAD" ? new Response(null, { headers }) : new Response(body(), { status: 206, headers: { ...headers, "content-length": "4096", "content-range": "bytes 0-4095/10000" } }));
    } } };
}
test("MN schema prerequisite makes six serial fixed requests and retains headers only", async () => {
  const f = fixture(), r = await preflightMnConstruction(f.options);
  assert.deepEqual(f.calls.map((c) => c.method), ["HEAD", "GET", "HEAD", "HEAD", "GET", "HEAD"]);
  assert.deepEqual(f.calls.map((c) => c.url), MN_CONSTRUCTION_EXPORTS.flatMap((u) => [u, u, u]));
  assert.deepEqual(f.waits, Array(5).fill(1000));
  for (const c of f.calls) { assert.equal(c.redirect, "error"); assert.equal(c.credentials, "omit"); if (c.method === "GET") { assert.equal(c.headers.Range, "bytes=0-4095"); assert.equal(c.headers["If-Match"], '"v1"'); } }
  assert.equal(r.claims.business_records_retained, 0); assert.equal(r.claims.acquisition_authorized, false);
  assert.ok(!JSON.stringify(r).includes("PRIVATE"));
  assert.deepEqual(r.observations[0].columns, [...MN_CONSTRUCTION_COLUMNS]);
  assert.equal(Buffer.from(r.observations[0].header_base64, "base64").toString(), line);
  assert.equal(validateMnConstructionPreflight(r), r);
});
test("MN header parser rejects malformed/oversized/duplicate/non-header input without exposing it", () => {
  for (const s of ['License_Number,License_Type,ZIP', 'License_Number,License_Type,ZIP,ZIP\n', 'License_Number,"License_Type,ZIP\n', 'License_Number,"License_Type"x,ZIP\n', 'License_Number,License_Type,=PRIVATE\n', 'License_Number,License_Type,\n', 'PRIVATE NAME,ADDRESS,PHONE\n', 'License_Number,License_Type,"multi\nline"\n']) assert.throws(() => inspectMnConstructionHeader(Buffer.from(s)), (e) => !e.message.includes("PRIVATE"));
  assert.throws(() => inspectMnConstructionHeader(Buffer.alloc(4097)));
  assert.throws(() => inspectMnConstructionHeader(Buffer.from([0xff, 10])), /encoding/);
  assert.deepEqual(inspectMnConstructionHeader(Buffer.from('License_Number,License_Type,ZIP\n\xff')).columns, ["License_Number", "License_Type", "ZIP"]);
});
test("MN unhonored ranges, redirects and provider failures are cancelled unread with no retry", async () => {
  for (const status of [200, 302, 403, 429, 503]) {
    let cancelled = 0;
    const f = fixture(({ call }) => call === 2 ? new Response(new ReadableStream({ cancel() { cancelled++; } }), { status, headers: { "retry-after": "120" } }) : undefined);
    await assert.rejects(preflightMnConstruction(f.options), /HTTP status/); assert.equal(f.calls.length, 2); assert.equal(cancelled, 1);
  }
});
test("MN checks exact ranges, source validators, encoding and consumed size", async () => {
  const valid = { ...headers, "content-length": "4096", "content-range": "bytes 0-4095/10000" };
  for (const changed of [{ "content-range": "bytes 1-4096/10000" }, { "content-range": "bytes 0-4095/*" }, { "content-length": "4000" }, { etag: '"v2"' }, { "last-modified": "Tue, 08 Sep 2026 09:32:00 GMT" }, { "content-encoding": "gzip" }, { "content-type": "text/html" }]) {
    const f = fixture(({ call }) => call === 2 ? new Response(body(), { status: 206, headers: { ...valid, ...changed } }) : undefined);
    await assert.rejects(preflightMnConstruction(f.options)); assert.equal(f.calls.length, 2);
  }
  for (const bytes of [4095, 4097]) {
    const f = fixture(({ call }) => call === 2 ? new Response(Buffer.alloc(bytes), { status: 206, headers: valid }) : undefined);
    await assert.rejects(preflightMnConstruction(f.options)); assert.equal(f.calls.length, 2);
  }
  for (const changed of [{ etag: 'W/"weak"' }, { etag: "" }, { "content-length": "100000001" }, { "last-modified": "bad" }]) {
    const f = fixture(({ call }) => call === 1 ? new Response(null, { headers: { ...headers, ...changed } }) : undefined);
    await assert.rejects(preflightMnConstruction(f.options)); assert.equal(f.calls.length, 1);
  }
  const drift = fixture(({ call }) => call === 3 ? new Response(null, { headers: { ...headers, etag: '"changed"' } }) : undefined);
  await assert.rejects(preflightMnConstruction(drift.options), /source changed/); assert.equal(drift.calls.length, 3);
});
test("MN ignored signals, stalled bodies and late replies cannot defeat deadlines", async () => {
  const f = fixture(() => new Promise(() => {}));
  await assert.rejects(preflightMnConstruction({ ...f.options, timeoutMs: 20 }), /deadline/); assert.equal(f.calls.length, 1);
  let cancelled = 0;
  const b = fixture(({ call }) => call === 2 ? new Response(new ReadableStream({ cancel() { cancelled++; } }), { status: 206, headers: { ...headers, "content-length": "4096", "content-range": "bytes 0-4095/10000" } }) : undefined);
  await assert.rejects(preflightMnConstruction({ ...b.options, timeoutMs: 20 }), /deadline/); assert.equal(cancelled, 1);
  let resolveLate;
  const l = fixture(() => new Promise((r) => { resolveLate = r; }));
  await assert.rejects(preflightMnConstruction({ ...l.options, timeoutMs: 20 }));
  resolveLate(new Response(new ReadableStream({ cancel() { cancelled++; } })));
  await new Promise((r) => setImmediate(r)); assert.equal(cancelled, 2);
});
test("MN invalid options, pacing cancellation and reversed observation clocks reject", async () => {
  const f = fixture();
  for (const extra of [{ url: "https://example.com" }, { signal: {} }, { timeoutMs: 0 }, { timeoutMs: 60001 }]) await assert.rejects(preflightMnConstruction({ ...f.options, ...extra }));
  await assert.rejects(preflightMnConstruction({ ...f.options, signal: AbortSignal.abort() }), { name: "AbortError" }); assert.equal(f.calls.length, 0);
  const c = new AbortController();
  await assert.rejects(preflightMnConstruction({ ...f.options, signal: c.signal, sleep: async () => c.abort() }), { name: "AbortError" }); assert.equal(f.calls.length, 1);
  let n = 0; await assert.rejects(preflightMnConstruction({ ...fixture().options, now: () => new Date(n++ ? "2020-01-01" : "2026-09-08") }), /clock/);
});
test("MN replay rejects changed claims, URLs, columns, trailing record bytes and source identity", async () => {
  const r = await preflightMnConstruction(fixture().options);
  for (const change of [(r) => { r.claims.acquisition_authorized = true; }, (r) => { r.observations[0].url += "?extra=1"; }, (r) => { r.observations[0].columns[0] = "changed"; }, (r) => { r.observations[0].source_identity.extra = "PRIVATE"; }, (r) => { r.observations[0].header_base64 = Buffer.from(line + "PRIVATE\n").toString("base64"); }]) {
    const altered = structuredClone(r); change(altered); assert.throws(() => validateMnConstructionPreflight(altered));
  }
});
test("MN changed source columns cannot silently become a compatible schema", async () => {
  const b = Buffer.alloc(4096, 120); b.write(line.replace("Bus_Pers", "Changed_Field"));
  const f = fixture(({ call }) => call === 2 ? new Response(b, { status: 206, headers: { ...headers, "content-length": "4096", "content-range": "bytes 0-4095/10000" } }) : undefined);
  await assert.rejects(preflightMnConstruction(f.options), /publisher header changed/); assert.equal(f.calls.length, 3);
});
test("MN receipt publication is unique, replayable, app-contained and rejects aliases", async () => {
  const r = await preflightMnConstruction(fixture().options), root = path.join(APP_ROOT, "data/tmp", `mn-schema-${randomUUID()}`);
  const a = await writeMnConstructionPreflight(r, { outputRoot: root }), b = await writeMnConstructionPreflight(r, { outputRoot: root });
  assert.notEqual(a.path, b.path); validateMnConstructionPreflight(JSON.parse(await readFile(a.path, "utf8")));
  assert.deepEqual((await readdir(root)).sort(), [path.basename(a.path), path.basename(b.path)].sort());
  await assert.rejects(writeMnConstructionPreflight(r, { outputRoot: path.dirname(APP_ROOT) }), /output/);
  const target = root + "-target", alias = root + "-alias"; await mkdir(target); await symlink(target, alias, "junction");
  await assert.rejects(writeMnConstructionPreflight(r, { outputRoot: alias }), /alias/); assert.deepEqual(await readdir(target), []);
});
test("MN receipt publication snapshots validated evidence before awaits and refuses immutable outputs", async () => {
  const r = await preflightMnConstruction(fixture().options), root = path.join(APP_ROOT, "data/tmp", `mn-schema-snapshot-${randomUUID()}`);
  const pending = writeMnConstructionPreflight(r, { outputRoot: root }); r.claims.acquisition_authorized = true;
  const saved = await pending, stored = JSON.parse(await readFile(saved.path, "utf8"));
  assert.equal(stored.claims.acquisition_authorized, false); validateMnConstructionPreflight(stored);
  await assert.rejects(writeMnConstructionPreflight(stored, { outputRoot: path.join(root, "releases", "unsafe") }), /immutable/);
  for (const segment of ["Releases", ".STAGING", "Releases "]) await assert.rejects(writeMnConstructionPreflight(stored, { outputRoot: path.join(root, "must-not-create", segment, "unsafe") }), /immutable/);
  await assert.rejects(writeMnConstructionPreflight(stored, { outputRoot: root, signal: AbortSignal.abort() }), { name: "AbortError" });
  assert.deepEqual(await readdir(root), [path.basename(saved.path)]);
});
