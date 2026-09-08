import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, mkdir, symlink } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { APP_ROOT } from "./paths.mjs";
import { OH_FIELDS, OH_WHERE, preflightOhChildcare, validateOhChildcarePreflight, writeOhChildcarePreflight } from "./oh-childcare-preflight.mjs";
import { ohioFixture } from "./fixtures/oh-childcare.mjs";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const rehash = (entry) => { entry.payload_sha256 = hash(JSON.stringify(entry.payload)); };
test("Ohio fixed requests conserve publisher statuses without row acquisition or private metadata", async () => {
  const f = ohioFixture(), receipt = await preflightOhChildcare(f.options);
  assert.equal(validateOhChildcarePreflight(receipt), receipt);
  assert.equal(f.calls.length, 10); assert.deepEqual(f.waits, Array(9).fill(1000));
  assert.equal(receipt.source.where, OH_WHERE); assert.equal(receipt.source.source_record_count, 4237);
  assert.deepEqual(receipt.source.excluded_status_counts, { Inactive: 102, Enforcement: 5 });
  assert.equal(receipt.source.center_directory_count, 4344); assert.equal(receipt.acquisition.row_data_requests, 0);
  assert.equal(receipt.acquisition.acquisition_authorized, false); assert.equal(receipt.acquisition.connector_ready, false);
  assert.equal(JSON.stringify(receipt).includes("DO-NOT-RETAIN"), false);
  assert.deepEqual(OH_FIELDS, ["objectid", "county", "program_type", "program_number", "program_name", "street_address", "city", "state", "zip_code", "program_status"]);
  for (const { url, options } of f.calls) {
    assert.equal(options.redirect, "error"); const u = new URL(url); assert.equal(u.origin, "https://maps.ohio.gov");
    if (u.pathname.endsWith("/query")) { assert.equal(u.searchParams.get("returnGeometry"), "false"); assert.ok(u.searchParams.has("returnCountOnly") || u.searchParams.has("outStatistics")); assert.equal(u.searchParams.has("outFields"), false); }
  }
});
test("Ohio rejects wrong service, owner, source WKT and full-schema drift", async () => {
  for (const change of [
    (v, k) => { if (k === "layer") v.serviceItemId = "other"; },
    (v, k) => { if (k === "item") v.owner = "other"; },
    (v, k) => { if (k === "layer") v.sourceSpatialReference.wkt = v.sourceSpatialReference.wkt.replace('"False_Easting",0.0', '"False_Easting",1.0'); },
    (v, k) => { if (k === "layer") v.fields.find((f) => f.name === "zip_code").type = "esriFieldTypeDouble"; },
    (v, k) => { if (k === "layer") v.fields.find((f) => f.name === "program_status").domain = { codedValues: [] }; },
    (v, k) => { if (k === "layer") v.fields.pop(); },
  ]) await assert.rejects(preflightOhChildcare(ohioFixture(change).options), /Ohio/);
});
test("Ohio rejects unknown/null/duplicate statuses and invalid count conservation", async () => {
  for (const change of [
    (v, k) => { if (k === "statuses") v.features[0].attributes.program_status = null; },
    (v, k) => { if (k === "statuses") v.features[0].attributes.program_status = "Active"; },
    (v, k) => { if (k === "statuses") v.features[0].attributes.program_status = "Open"; },
    (v, k) => { if (k === "statuses") v.features[0].attributes.source_count = -1; },
    (v, k) => { if (k === "selected") v.count = 4237.5; },
    (v, k) => { if (k === "selected") v.count++; },
    (v, k) => { if (k === "centers") v.count++; },
    (v, k) => { if (k === "statuses") v.exceededTransferLimit = true; },
  ]) await assert.rejects(preflightOhChildcare(ohioFixture(change).options), /Ohio/);
  const changed = await preflightOhChildcare(ohioFixture((v, k) => { if (k === "selected" || k === "centers") v.count++; if (k === "statuses") v.features[2].attributes.source_count++; }).options);
  assert.equal(changed.source.source_record_count, 4238);
});
test("Ohio rejects facility data hidden in aggregate/count envelopes", async () => {
  for (const change of [
    (v, k) => { if (k === "statuses") v.features[0].geometry = { x: 0, y: 0 }; },
    (v, k) => { if (k === "statuses") v.features[0].attributes.phone_number = "PRIVATE"; },
    (v, k) => { if (k === "statuses") v.objectIds = [1]; },
    (v, k) => { if (k === "selected") v.features = []; },
    (v, k) => { if (k === "layer") v.features = []; },
    (v, k) => { if (k === "layer") v.fields.find((f) => f.name === "program_number").length = { contact: "PRIVATE" }; },
    (v, k) => { if (k === "statuses") v.fields[0].length = { contact: "PRIVATE" }; },
  ]) await assert.rejects(preflightOhChildcare(ohioFixture(change).options), /Ohio/);
});
test("Ohio rejects paired notices/status drift, rehashed tampering and inflated claims", async () => {
  for (const change of [
    (v, k, n) => { if (k === "item" && n > 5) v.licenseInfo += " amended"; },
    (v, k, n) => { if (k === "statuses" && n > 5) { v.features[0].attributes.source_count++; v.features[1].attributes.source_count--; } },
  ]) await assert.rejects(preflightOhChildcare(ohioFixture(change).options), /drift/);
  const receipt = await preflightOhChildcare(ohioFixture().options);
  for (const change of [
    (r) => { r.acquisition.acquisition_authorized = true; },
    (r) => { r.xml_retained = true; },
    (r) => { r.source.excluded_status_counts.Enforcement = 0; },
    (r) => { r.observations[2].payload.features[0].attributes.source_count++; rehash(r.observations[2]); },
    (r) => { r.observations[0].observed_at = "2000-01-01T00:00:00.000Z"; },
    (r) => { r.observations[0].url = "https://example.com"; },
  ]) { const copy = structuredClone(receipt); change(copy); assert.throws(() => validateOhChildcarePreflight(copy), /Ohio/); }
});
test("Ohio fails closed on malformed, oversized, redirected or HTTP-error responses", async () => {
  for (const response of [Response.json({ error: { message: "PRIVATE" } }), new Response("<html>PRIVATE</html>"), new Response("x".repeat(131073)), new Response("{}", { headers: { "content-length": "131073" } }), new Response("", { status: 302, headers: { location: "https://example.com" } }), new Response("PRIVATE", { status: 403 })]) {
    const f = ohioFixture(() => response);
    await assert.rejects(preflightOhChildcare(f.options), (error) => !error.message.includes("PRIVATE") && /Ohio/.test(error.message)); assert.equal(f.calls.length, 1);
  }
});
test("Ohio bounded retry honors Retry-After and defers long publisher cooldown", async () => {
  const f = ohioFixture((v, k, n) => n === 1 ? new Response("", { status: 429, headers: { "retry-after": "2" } }) : undefined);
  await preflightOhChildcare(f.options); assert.equal(f.calls.length, 11); assert.equal(f.waits[0], 2000);
  const long = ohioFixture(() => new Response("", { status: 429, headers: { "retry-after": "120" } }));
  await assert.rejects(preflightOhChildcare(long.options), (error) => error.code === "SOURCE_RETRY_DEFERRED"); assert.equal(long.calls.length, 1);
  const failing = ohioFixture(() => new Response("", { status: 503 }));
  await assert.rejects(preflightOhChildcare(failing.options)); assert.equal(failing.calls.length, 3);
});
test("Ohio request body deadlines and cancellation stop further requests", async () => {
  let cancelled = 0;
  const f = ohioFixture(() => new Response(new ReadableStream({ cancel() { cancelled++; } })));
  await assert.rejects(preflightOhChildcare({ ...f.options, timeoutMs: 10 }), /Ohio/); assert.equal(f.calls.length, 3); assert.equal(cancelled, 3);
  const controller = new AbortController(), before = ohioFixture(); controller.abort();
  await assert.rejects(preflightOhChildcare({ ...before.options, signal: controller.signal })); assert.equal(before.calls.length, 0);
  const mid = new AbortController(), during = ohioFixture(() => { queueMicrotask(() => mid.abort()); return new Response(new ReadableStream({})); });
  await assert.rejects(preflightOhChildcare({ ...during.options, signal: mid.signal })); assert.equal(during.calls.length, 1);
  await assert.rejects(preflightOhChildcare({ ...ohioFixture().options, timeoutMs: 0 }));
  await assert.rejects(preflightOhChildcare({ url: "https://example.com" }));
});
test("Ohio immutable receipt storage replays without overwrites or redirected paths", async () => {
  const root = await mkdtemp(path.join(APP_ROOT, "data", "tmp", "oh-preflight-")), receipt = await preflightOhChildcare(ohioFixture().options);
  const [first, second] = await Promise.all([writeOhChildcarePreflight(receipt, { outputRoot: root }), writeOhChildcarePreflight(receipt, { outputRoot: root })]);
  assert.notEqual(first.path, second.path); const bytes = await readFile(first.path); assert.equal(hash(bytes), first.sha256); assert.equal(bytes.length, first.bytes); validateOhChildcarePreflight(JSON.parse(bytes));
  assert.equal((await readdir(root)).length, 2);
  await assert.rejects(writeOhChildcarePreflight(receipt, { outputRoot: path.join(root, "releases", "forbidden") }), /immutable/);
  await assert.rejects(writeOhChildcarePreflight(receipt, { outputRoot: APP_ROOT }), /canonical/);
  const target = path.join(root, "target"), junction = path.join(root, "junction"); await mkdir(target); await symlink(target, junction, "junction");
  await assert.rejects(writeOhChildcarePreflight(receipt, { outputRoot: path.join(junction, "child") }), /redirected/); assert.deepEqual(await readdir(target), []);
  const controller = new AbortController(); controller.abort(); await assert.rejects(writeOhChildcarePreflight(receipt, { outputRoot: root, signal: controller.signal }));
  assert.equal(hash(await readFile(first.path)), first.sha256);
});
test("Ohio CLI help does not acquire and rejects arbitrary endpoints", () => {
  const cli = path.join(APP_ROOT, "scripts", "preflight-oh-childcare.mjs");
  assert.match(execFileSync(process.execPath, [cli, "--help"], { encoding: "utf8" }), /No facility downloads/);
  assert.throws(() => execFileSync(process.execPath, [cli, "https://example.com"], { stdio: "pipe" }), (error) => error.status === 1 && !error.stderr.toString().includes("https://example.com"));
});
