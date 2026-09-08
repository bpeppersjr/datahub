import assert from "node:assert/strict";
import { readFile, mkdtemp, rm, readdir, mkdir, symlink } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import test from "node:test";
import { APP_ROOT } from "./paths.mjs";
import { acquirePaChildcarePreflight, validatePaChildcarePreflight, writePaChildcarePreflight, PA_CHILDCARE_FIELDS, PA_CHILDCARE_DESCRIPTION, PA_CHILDCARE_URLS } from "./pa-childcare-preflight.mjs";

const policyPath = path.join(APP_ROOT, "data/tmp/pa-data-policy-fragment.html");
let policy;
try { policy = (await readFile(policyPath, "utf8")).trim(); }
catch (error) { if (error.code !== "ENOENT") throw error; }
const fixtureOptions = { skip: !policy && "Ignored public policy fragment fixture is unavailable; no network fallback." };
const digest = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function fixture(mutate = () => {}) {
  const calls = [];
  return { calls, now: () => new Date("2026-09-08T12:00:00.000Z"), fetchImpl: async (url, options) => {
    calls.push({url, options});
    const kind = Object.keys(PA_CHILDCARE_URLS).find(key => PA_CHILDCARE_URLS[key] === url);
    assert.ok(kind, "Only the fixed metadata endpoints are requested");
    const value = kind === "policy" ? `<div>${policy}</div>` : kind === "aggregate" ? [{ source_count: "4995", distinct_location_keys: "4995", point_count: "4930", license_count: "4990" }] : {
      id: "ajn5-kaxt", name: "Child Care Providers including Early Learning Programs Listing Current Monthly Facility County Human Services",
      attribution: "Department of Human Services", license: { name: "Public Domain U.S. Government", termsLink: "https://www.usa.gov/government-works" },
      description: PA_CHILDCARE_DESCRIPTION, rowsUpdatedAt: Date.parse("2026-08-13T14:32:18Z") / 1000,
      columns: [...PA_CHILDCARE_FIELDS.map(fieldName => ({ fieldName, dataTypeName: fieldName === "geocoded_column" ? "point" : fieldName.startsWith("license_") && fieldName.endsWith("date") ? "calendar_date" : "text", description: "", cachedContents: { top: [{ item: "PRIVATE_SYNTHETIC_SAMPLE" }] } })), { fieldName: "contact_phone", cachedContents: { top: ["PRIVATE_SYNTHETIC_CONTACT"] } }], cachedContents: { samples: ["PRIVATE_SYNTHETIC_SAMPLE"] },
    };
    const replacement = mutate(value, kind, calls.length);
    if (replacement instanceof Response) return replacement;
    return kind === "policy" ? new Response(replacement ?? value, { headers: { "content-type": "text/html" } }) : Response.json(value);
  }};
}
const run = f => acquirePaChildcarePreflight({ fetchImpl: f.fetchImpl, now: f.now });
let retained;
const goodReceipt = () => retained ??= run(fixture());

test("PA preflight rejects unsupported options before requesting", async () => {
  let requests = 0;
  for (const extra of [{ url: "https://example.invalid" }, { rows: true }, { sourceId: "private" }]) await assert.rejects(acquirePaChildcarePreflight({ fetchImpl: async () => { requests++; throw new Error("no request expected"); }, ...extra }));
  assert.equal(requests, 0);
});

test("PA policy rejects altered/incomplete HTML and service deferral without requesting records", async () => {
  for (const body of ["<html>unreviewed</html>", "<section><h1>PA Data Policy</h1></section></div>"]) {
    let calls = 0;
    await assert.rejects(acquirePaChildcarePreflight({ fetchImpl: async () => { calls++; return new Response(body, { headers: { "content-type": "text/html" } }); } }), { code: "PA_CHILDCARE_PREFLIGHT_FAILED" });
    assert.equal(calls, 1);
  }
  let calls = 0;
  await assert.rejects(acquirePaChildcarePreflight({ fetchImpl: async () => { calls++; return new Response(null, { status: 429, headers: { "Retry-After": "300" } }); } }), { code: "PA_CHILDCARE_DEFERRED" });
  assert.equal(calls, 1);
});

test("PA treats padded uppercase identity encoding as uncompressed for declared length", fixtureOptions, async () => {
  const body = `<div>${policy}</div>`;
  let calls = 0;
  await assert.rejects(acquirePaChildcarePreflight({fetchImpl: async () => {
    calls++;
    return new Response(body, {headers:{
      "content-type":"text/html", "content-encoding":" IDENTITY ",
      "content-length":String(Buffer.byteLength(body) + 1),
    }});
  }}), {code:"PA_CHILDCARE_PREFLIGHT_FAILED"});
  assert.equal(calls, 1);
});

test("PA paired metadata retains selected schema and aggregate gaps, never cached contact samples", fixtureOptions, async () => {
  const receipt = await goodReceipt();
  assert.equal(validatePaChildcarePreflight(receipt), receipt);
  assert.equal(receipt.source.record_count, 4995);
  assert.equal(receipt.source.point_count, 4930);
  assert.equal(receipt.source.license_count, 4990);
  assert.equal(receipt.readiness.acquisition_authorized, false);
  assert.equal(receipt.claims.facility_rows_retained, 0);
  assert.equal(receipt.claims.full_http_bodies_replayable, false);
  assert.equal(JSON.stringify(receipt).includes("PRIVATE_SYNTHETIC"), false);
  const columns = receipt.observations[1].payload.columns;
  assert.equal(columns.length, 18);
  assert.equal(columns.find(c => c.fieldName === "capacity").dataTypeName, "text");
  assert.equal(columns.find(c => c.fieldName === "license_issue_date").dataTypeName, "calendar_date");
  for (const o of receipt.observations) assert.equal(o.url, PA_CHILDCARE_URLS[o.kind]);
});

test("PA fails closed on paired drift, schema duplication/type changes and malformed aggregate integers", fixtureOptions, async () => {
  await Promise.all([
    (v,k,n) => { if(k === "metadata" && n === 5) v.rowsUpdatedAt++; },
    (v,k,n) => { if(k === "aggregate" && n === 4) v[0].point_count = "4931"; },
    (v,k) => { if(k === "metadata") v.columns.push({...v.columns[0]}); },
    (v,k) => { if(k === "metadata") v.columns.find(c => c.fieldName === "capacity").dataTypeName = "number"; },
    (v,k) => { if(k === "metadata") v.columns.find(c => c.fieldName === "license_exp_date").dataTypeName = "text"; },
    ...["04995", "-1", "1.5", "NaN", "20001", 4995].map(bad => (v,k) => { if(k === "aggregate") v[0].source_count = bad; }),
    (v,k) => { if(k === "aggregate") v.push({...v[0]}); },
    (v,k) => { if(k === "aggregate") v[0].distinct_location_keys = "4994"; },
  ].map(async mutate => assert.rejects(run(fixture(mutate)), { code: "PA_CHILDCARE_PREFLIGHT_FAILED" })));
});

test("PA offline validation rejects rehashed payload drift, forged approval and invalid chronology", fixtureOptions, async () => {
  const receipt = await goodReceipt();
  for (const mutate of [
    r => { r.observations[4].payload.rowsUpdatedAt++; r.observations[4].payload_sha256 = digest(r.observations[4].payload); },
    r => { r.observations[3].payload[0].license_count = "4989"; r.observations[3].payload_sha256 = digest(r.observations[3].payload); },
    r => { r.readiness.acquisition_authorized = true; },
    r => { r.claims.full_http_bodies_replayable = true; },
    r => { r.observations[0].observed_at = "2026-09-08T11:59:59.000Z"; },
    r => { r.observations[1].payload.columns[0].cachedContents = {}; r.observations[1].payload_sha256 = digest(r.observations[1].payload); },
  ]) { const changed = structuredClone(receipt); mutate(changed); assert.throws(() => validatePaChildcarePreflight(changed)); }
});

test("PA writer publishes immutable separate receipts and rejects cancellation and unsafe roots", fixtureOptions, async () => {
  const receipt = await goodReceipt();
  const root = await mkdtemp(path.join(APP_ROOT, "data/tmp/pa-preflight-test-"));
  try {
    const outputRoot = path.join(root, "receipts");
    const first = await writePaChildcarePreflight(receipt, {outputRoot});
    const firstBytes = await readFile(first.path);
    const second = await writePaChildcarePreflight(receipt, {outputRoot});
    assert.notEqual(first.path, second.path);
    assert.deepEqual(await readFile(first.path), firstBytes);
    assert.deepEqual(JSON.parse(firstBytes), receipt);
    assert.equal((await readdir(outputRoot)).length, 2);
    const controller = new AbortController(); controller.abort();
    await assert.rejects(writePaChildcarePreflight(receipt, {outputRoot,signal:controller.signal}), {name:"AbortError"});
    await assert.rejects(writePaChildcarePreflight(receipt, {outputRoot:APP_ROOT}));
    await assert.rejects(writePaChildcarePreflight(receipt, {outputRoot:path.dirname(APP_ROOT)}));
    await mkdir(path.join(root, "target"));
    await symlink(path.join(root, "target"), path.join(root, "alias"), "junction");
    await assert.rejects(writePaChildcarePreflight(receipt, {outputRoot:path.join(root, "alias")}));
    assert.equal((await readdir(outputRoot)).length, 2);
  } finally { await rm(root, {recursive:true,force:true}); }
});

test("PA preflight handles early abort and noncooperative pending request cancellation", async () => {
  const early = new AbortController(); early.abort();
  await assert.rejects(acquirePaChildcarePreflight({ signal: early.signal, fetchImpl: () => assert.fail("pre-aborted must not fetch") }), { name: "AbortError" });
  const controller = new AbortController();
  await assert.rejects(acquirePaChildcarePreflight({ signal: controller.signal, fetchImpl: () => { controller.abort(); return new Promise(() => {}); } }), { name: "AbortError" });
});

test("PA cancels late fetch bodies and aborts pacing before the second request", fixtureOptions, async () => {
  const controller = new AbortController();
  let resolveFetch, cancelled = 0;
  const pending = acquirePaChildcarePreflight({ signal: controller.signal, fetchImpl: () => new Promise(resolve => { resolveFetch = resolve; controller.abort(); }) });
  await assert.rejects(pending, {name:"AbortError"});
  resolveFetch(new Response(new ReadableStream({cancel(){ cancelled++; }})));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(cancelled, 1);
  const pacing = new AbortController();
  let calls = 0;
  await assert.rejects(acquirePaChildcarePreflight({ signal:pacing.signal, fetchImpl:async () => {
    calls++;
    setImmediate(() => pacing.abort());
    return new Response(`<div>${policy}</div>`, {headers:{"content-type":"text/html"}});
  }}), {name:"AbortError"});
  assert.equal(calls, 1);
});
