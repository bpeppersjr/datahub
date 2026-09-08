import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, symlink } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";
import { TN_CHILDCARE_LAYER, TN_CHILDCARE_ITEM, TN_CHILDCARE_ORG, TN_CHILDCARE_SCHEMA, TN_CHILDCARE_TERMS_TEXT,
  TN_CHILDCARE_WHERE, preflightTnChildcare, writeTnChildcarePreflight } from "./tn-childcare-preflight.mjs";

const clock = () => new Date("2026-09-07T20:00:00.000Z"), noSleep = async () => {};
const xml = Buffer.from('\ufeff \n<?xml version="1.0"?><metadata><title>Active_ChildCare_Locations</title></metadata>\n');
function metadata() { return { id: 0, name: "Active_ChildCare_Master", type: "Feature Layer", serviceItemId: TN_CHILDCARE_ITEM,
  objectIdField: "OBJECTID", displayField: "Provider_Name", geometryType: "esriGeometryPoint", spatialReference: { wkid: 4326, latestWkid: 4326 },
  extent: { spatialReference: { wkid: 4326, latestWkid: 4326 } }, capabilities: "Query,Extract", maxRecordCount: 2000, hasMetadata: true, hasAttachments: false,
  editingInfo: { lastEditDate: 1788460779896, schemaLastEditDate: 1788460779896, dataLastEditDate: 1788460779896 },
  advancedQueryCapabilities: { supportsPagination: true, supportsOrderBy: true, supportsStatistics: true },
  fields: TN_CHILDCARE_SCHEMA.map(([name, type, length, nullable]) => ({ name, type, ...(length === null ? {} : { length }), nullable, domain: null })) }; }
function item() { return { id: TN_CHILDCARE_ITEM, owner: "kwinchester_sts", orgId: TN_CHILDCARE_ORG, access: "public", type: "Feature Service",
  title: "Active Statewide Childcare Locations", url: TN_CHILDCARE_LAYER.slice(0, -2).replace("/ArcGIS/", "/arcgis/"), accessInformation: "TN Department of Human Services",
  created: 1732643560000, modified: 1788460782000, licenseInfo: `<span>${TN_CHILDCARE_TERMS_TEXT.replace('"AS IS"', "\\u201cAS IS\\u201d")}<\\/span>`, numViews: 3 }; }
function source(mutate = () => {}) {
  const calls = [], counts = {};
  const fetchImpl = async (url, options) => {
    const kind = url.includes("metadata.xml") ? "xml" : url.includes("/query?") ? "count" : url.includes("/portals/") ? "organization" : url.includes("/items/") ? "item" : "metadata";
    const payload = kind === "metadata" ? metadata() : kind === "item" ? item() : kind === "organization" ? { id: TN_CHILDCARE_ORG, name: "State of Tennessee STS GIS", urlKey: "tnmap" } : { count: 1863 };
    counts[kind] = (counts[kind] ?? 0) + 1; calls.push({ kind, url, options });
    const replacement = mutate(payload, kind, counts[kind], options);
    if (replacement) return replacement;
    return kind === "xml" ? new Response(xml, { headers: { "content-type": "application/xml" } }) : new Response(JSON.stringify(payload));
  };
  return { calls, fetchImpl };
}
const run = (stub = source(), options = {}) => preflightTnChildcare({ fetchImpl: stub.fetchImpl, sleep: noSleep, now: clock, ...options });

test("TN preserves exact metadata terms and XML bytes; only fixed metadata/count queries", async () => {
  const stub = source((p, kind, n) => { if (kind === "item") p.numViews += n; }), waits = [];
  const receipt = await run(stub, { sleep: async (ms) => waits.push(ms) });
  assert.equal(receipt.source.record_count, 1863); assert.equal(receipt.source.where, TN_CHILDCARE_WHERE);
  assert.equal(receipt.transformation_version, "tn-childcare-preflight@1.0.0");
  assert.equal(receipt.observations[1].payload.licenseInfo, item().licenseInfo);
  assert.deepEqual(Buffer.from(receipt.observations[3].payload.base64, "base64"), xml);
  assert.equal(receipt.policy.metadata_xml_retained, true); assert.equal(receipt.policy.terms_presence_is_legal_approval, false);
  assert.equal(receipt.readiness.connector_ready, false); assert.equal(receipt.readiness.scheduled, false); assert.equal(receipt.readiness.export_authorized, false);
  assert.equal(receipt.acquisition.row_data_requests, 0); assert.deepEqual(waits, Array(9).fill(1000));
  for (const call of stub.calls) {
    assert.equal(call.options.redirect, "manual"); const params = new URL(call.url).searchParams;
    for (const key of ["outFields", "returnIdsOnly", "objectIds", "outStatistics"]) assert.equal(params.has(key), false);
    if (call.kind === "count") { assert.equal(params.get("where"), TN_CHILDCARE_WHERE); assert.equal(params.get("returnCountOnly"), "true"); assert.equal(params.get("returnGeometry"), "false"); }
  }
});
test("TN fails closed on identity schema privacy policy count and temporal drift", async () => {
  for (const mutate of [
    (p, k) => { if (k === "metadata") p.fields.push({ name: "owner" }); },
    (p, k) => { if (k === "metadata") p.fields[2].length = 9000; },
    (p, k) => { if (k === "metadata") p.fields[1].nullable = false; },
    (p, k) => { if (k === "metadata") p.spatialReference.wkid = 3857; },
    (p, k) => { if (k === "metadata") p.advancedQueryCapabilities.supportsPagination = false; },
    (p, k, n) => { if (k === "metadata" && n === 2) p.editingInfo.lastEditDate++; },
    (p, k) => { if (k === "item") p.url += "?token=invalid"; },
    (p, k) => { if (k === "item") p.owner = "other"; },
    (p, k) => { if (k === "item") p.licenseInfo += " new permission"; },
    (p, k) => { if (k === "item") p.features = []; },
    (p, k) => { if (k === "organization") p.urlKey = "other"; },
    (p, k) => { if (k === "count") p.count = 20_001; },
    (p, k, n) => { if (k === "count" && n === 2) p.count++; },
    (p, k) => { if (k === "count") p.objectIds = [1]; },
  ]) await assert.rejects(run(source(mutate)));
  await assert.rejects(run(source(), { now: () => new Date(NaN) }));
  let n = 0; await assert.rejects(run(source(), { now: () => new Date(clock().getTime() - n++ * 1000) }));
});
test("TN retains explicit unavailable XML but rejects unsafe or changed XML", async () => {
  const missing = await run(source((p, k) => k === "xml" ? new Response(null, { status: 404 }) : undefined));
  assert.equal(missing.policy.metadata_xml_retained, false); assert.equal(missing.policy.metadata_xml_unavailable_http_status, 404); assert.equal(missing.readiness.connector_ready, false);
  for (const body of ['<html>login</html>', '{}', '<!DOCTYPE metadata><metadata>Active_ChildCare</metadata>', '<metadata><!ENTITY x "owner">Active_ChildCare</metadata>', '<metadata>Active_ChildCare &private;</metadata>', '<other>Active_ChildCare</other>', '<metadata>different</metadata>', Buffer.from([0xff])]) {
    await assert.rejects(run(source((p, k) => k === "xml" ? new Response(body, { headers: { "content-type": "application/xml" } }) : undefined)));
  }
  await assert.rejects(run(source((p, k) => k === "xml" ? new Response(xml, { headers: { "content-type": "text/html" } }) : undefined)));
  await assert.rejects(run(source((p, k, n) => k === "xml" && n === 2 ? new Response(Buffer.concat([xml, Buffer.from("\n")]), { headers: { "content-type": "application/xml" } }) : undefined)));
});
test("TN bounds retries redirect bodies and strict injection options", async () => {
  const waits = [], stub = source((p, k, n) => k === "metadata" && n === 1 ? new Response(null, { status: 429, headers: { "retry-after": "2" } }) : undefined);
  await run(stub, { sleep: async (ms) => waits.push(ms) }); assert.equal(waits[0], 2000);
  const deferred = source(() => new Response(null, { status: 503, headers: { "retry-after": "61" } }));
  await assert.rejects(run(deferred), { code: "SOURCE_RETRY_DEFERRED" }); assert.equal(deferred.calls.length, 1);
  for (const response of [() => new Response(null, { status: 302 }), () => new Response("{"), () => new Response("x".repeat(1_000_001)), () => new Response("{}", { headers: { "content-length": "1000001" } })]) await assert.rejects(run(source(response)));
  const outage = source(() => new Response(null, { status: 503 })); await assert.rejects(run(outage)); assert.equal(outage.calls.length, 3);
  for (const options of [{ url: TN_CHILDCARE_LAYER }, { where: "1=1" }, { fetchImpl: 1 }, { sleep: null }, { timeoutMs: 60001 }]) await assert.rejects(run(source(), options));
});
test("TN timeout and cancellation cover headers and streamed JSON/XML", async () => {
  await assert.rejects(run({ fetchImpl: (url, { signal }) => new Promise((resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true })) }, { timeoutMs: 5 }));
  for (const target of ["metadata", "xml"]) {
    let cancelled = 0;
    await assert.rejects(run(source((p, k) => k === target ? new Response(new ReadableStream({ cancel() { cancelled++; } }), { headers: { "content-type": "application/xml" } }) : undefined), { timeoutMs: 5 }));
    assert.equal(cancelled, 3);
  }
  const signal = AbortSignal.abort(new Error("cancelled")), untouched = source(); await assert.rejects(run(untouched, { signal }), /cancelled/); assert.equal(untouched.calls.length, 0);
  const controller = new AbortController(); await assert.rejects(run(source(), { signal: controller.signal, sleep: async () => controller.abort(new Error("cancelled")) }), /cancelled/);
});
test("TN receipt writer is immutable validates replay and refuses redirected paths", async (t) => {
  const root = await mkdtemp(path.join(APP_ROOT, "data", "tmp", "tn-preflight-")); t.after(() => rm(root, { recursive: true, force: true }));
  const receipt = await run(), outputRoot = path.join(root, "receipts");
  const [a, b] = await Promise.all([writeTnChildcarePreflight(receipt, { outputRoot }), writeTnChildcarePreflight(receipt, { outputRoot })]);
  assert.notEqual(a.path, b.path); assert.deepEqual(JSON.parse(await readFile(a.path, "utf8")), receipt); assert.equal((await readdir(outputRoot)).length, 2);
  const bad = structuredClone(receipt); bad.readiness.connector_ready = true; await assert.rejects(writeTnChildcarePreflight(bad, { outputRoot }));
  for (const mutate of [
    (observation) => { if (observation.kind === "item") observation.payload.licenseInfo += "Private new policy"; },
    (observation) => { if (observation.kind === "metadata") observation.payload.fields[2].length++; },
    (observation) => { if (observation.kind === "count") observation.payload.count = 20001; },
    (observation) => { observation.url += "&outFields=*"; },
  ]) {
    const forged = structuredClone(receipt);
    for (const observation of forged.observations) { mutate(observation); observation.payload_sha256 = createHash("sha256").update(JSON.stringify(observation.payload)).digest("hex"); }
    await assert.rejects(writeTnChildcarePreflight(forged, { outputRoot }));
  }
  await assert.rejects(writeTnChildcarePreflight(receipt, { outputRoot: APP_ROOT }));
  await assert.rejects(writeTnChildcarePreflight(receipt, { outputRoot: path.dirname(APP_ROOT) }));
  await assert.rejects(writeTnChildcarePreflight(receipt, { outputRoot, signal: AbortSignal.abort() }));
  const finalCheck = path.relative(APP_ROOT, outputRoot).split(path.sep).length + 3; let checks = 0;
  await assert.rejects(writeTnChildcarePreflight(receipt, { outputRoot, signal: { throwIfAborted() { if (++checks === finalCheck) throw new Error("abort immediately before commit"); } } }), /immediately before commit/);
  assert.equal(checks, finalCheck); assert.equal((await readdir(outputRoot)).length, 2);
  const alias = path.join(root, "alias"); await symlink(outputRoot, alias, "junction"); await assert.rejects(writeTnChildcarePreflight(receipt, { outputRoot: path.join(alias, "child") }));
  assert.equal((await readdir(outputRoot)).length, 2);
  const sourceCode = await readFile(new URL("./tn-childcare-preflight.mjs", import.meta.url), "utf8");
  for (const [call, args] of sourceCode.matchAll(/(?:\blstat|\.stat)\(([^)]*)\)/g)) assert.match(args, /bigint:\s*true/, call);
  assert.match(sourceCode, /current\.nlink === 1n/); assert.match(sourceCode, /await link\(temporary, destination\)/);
});
test("TN CLI help and unknown arguments do not invoke transport", () => {
  for (const [args, status] of [[["--help"], 0], [["--url", "https://invalid.example"], 1]]) {
    const result = spawnSync(process.execPath, [path.join(APP_ROOT, "scripts", "preflight-tn-childcare.mjs"), ...args], { encoding: "utf8" });
    assert.equal(result.status, status); assert.match(result.stdout + result.stderr, status ? /Unsupported/ : /metadata\/count only/);
  }
});
