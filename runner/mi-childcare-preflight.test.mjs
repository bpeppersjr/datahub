import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rm, symlink } from "node:fs/promises";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";
import { MI_CHILDCARE_ITEM, MI_CHILDCARE_ORG, MI_CHILDCARE_LAYER, MI_CHILDCARE_SCHEMA, MI_CHILDCARE_WHERE, MI_CHILDCARE_SOURCE_CRS, MI_CHILDCARE_EXTENT_WKT, preflightMiChildcare, validateMiChildcarePreflight, writeMiChildcarePreflight } from "./mi-childcare-preflight.mjs";

// Publisher notice is a pinned metadata fixture, not permission or legal approval.
const terms = '<div>This dataset is a public record and, as more fully described below, there are no restrictions on the use, reproduction, or distribution of this dataset. Notwithstanding the foregoing, the public release of this dataset should not be construed, expressed or implied, as to whether any use constitutes a legally permissible purpose. It is the sole responsibility of the user to determine if the data is usable for their purposes.This dataset is provided “AS IS” and on an “AS AVAILABLE” basis. The State of Michigan (“State”) makes no warranties, express or implied, regarding the accuracy, adequacy, reliability, timeliness, or completeness of this dataset. The State also does not make any warranties, express or implied, for the continued quality, accuracy, or currency of this dataset after it has been downloaded, nor the quality or accuracy of any analyses or re-uses of this dataset. THE STATE DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS DATASET AND ANY INFORMATION PROVIDED TO YOU, INCLUDING THE IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NONINFRINGEMENT OF PROPRIETARY RIGHTS. THE STATE WILL NOT BE LIABLE, REGARDLESS OF THE FORM OF ACTION, WHETHER IN CONTRACT, TORT, NEGLIGENCE, STRICT LIABILITY OR BY STATUTE OR OTHERWISE, FOR ANY CLAIM FOR CONSEQUENTIAL, INCIDENTAL, INDIRECT, OR SPECIAL DAMAGES, INCLUDING WITHOUT LIMITATION LOST PROFITS AND LOST BUSINESS OPPORTUNITIES, RELATED TO THE ACCESS OR USE OF THIS DATASET. IN NO EVENT WILL THE STATE BE LIABLE FOR ANY AMOUNTS THAT MAY RESULT FROM THE ACCESS OR USE OF THIS DATASET, REGARDLESS OF THE FORM OF ACTION, WHETHER IN CONTRACT, TORT, NEGLIGENCE, STRICT LIABILITY, OR BY STATUTE OR OTHERWISE. You forever release the State, its departments, subdivisions, officers, and employees from all claims, rights, actions, demands, damages, liabilities, expenses and fees, which arise out of or relate to your access or use of this dataset. You must defend, indemnify and hold the State, its departments, subdivisions, officers, and employees harmless, without limitation, from and against all actions, claims, losses, liabilities, damages, costs, attorney fees, and expenses (including those required to establish the right to indemnification) arising out of or relating to your access or use of this dataset. The State reserves the right to modify or remove this dataset for any reason, without notice, at any time. Nothing in these terms constitutes or is intended to be a limitation upon, or waiver of, any privileges and immunities that apply to the State. These terms are governed by and interpreted under the laws of the State of Michigan without regard to conflict of laws provisions. These terms do not apply to other materials or content, including maps or logos, that may be located on the site or portal containing this dataset and that may be protected by intellectual property rights such copyright, trademark, or patent. Nothing in these terms should be construed, expressed or implied, as impacting any existing rights or licenses in such materials or content, if any.</div><div><br /></div>';
const digest = (v) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
function fixture(mutate = () => {}) {
  const calls = [], waits = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    const parsed = new URL(url), kind = parsed.pathname.endsWith("/query") ? "count" : url.includes("sharing/rest/content") ? "item" : "metadata";
    const value = kind === "count" ? { count: 4549 } : kind === "item" ? {
      id: MI_CHILDCARE_ITEM, owner: "michigan_admin", orgId: MI_CHILDCARE_ORG, access: "public", title: "Child Care", type: "Feature Service", url: MI_CHILDCARE_LAYER,
      sourceUrl: "https://gisagocss.state.mi.us/arcgis/rest/services/CSS/CSS_LARA/MapServer/5", created: 1657216578000, modified: 1775850938000, licenseInfo: terms, numViews: calls.length,
    } : {
      id: 5, name: "BCHS_Child_Care", type: "Feature Layer", displayField: "FacilityName", geometryType: "esriGeometryPoint", sourceSpatialReference: { ...MI_CHILDCARE_SOURCE_CRS },
      extent: { spatialReference: { wkt: MI_CHILDCARE_EXTENT_WKT } },
      capabilities: "Map,Query,Data", maxRecordCount: 1000, hasAttachments: false, hasMetadata: true, supportsStatistics: true,
      advancedQueryCapabilities: { supportsPagination: true, supportsOrderBy: true, supportsStatistics: true },
      fields: MI_CHILDCARE_SCHEMA.map(([name, type, length]) => ({ name, type, ...(length === null ? {} : { length }), domain: null })),
    };
    const override = mutate(value, kind, calls.length, options);
    return override instanceof Response ? override : Response.json(value);
  };
  return { calls, waits, fetchImpl, sleep: async (ms) => { waits.push(ms); }, now: () => new Date("2026-09-07T12:00:00.000Z") };
}
const run = (f, extra = {}) => preflightMiChildcare({ fetchImpl: f.fetchImpl, sleep: f.sleep, now: f.now, ...extra });

test("MI fixed metadata/count only, full terms retained and all acquisition/legal readiness false", async () => {
  const f = fixture(), receipt = await run(f);
  assert.equal(validateMiChildcarePreflight(receipt), receipt);
  assert.equal(receipt.source.record_count, 4549); assert.equal(receipt.source.selected_fields.length, 13);
  assert.equal(receipt.transformation_version, "mi-childcare-preflight@1.0.0");
  assert.equal(receipt.observations[1].payload.licenseInfo, terms);
  assert.equal(receipt.policy.legal_approval, false); assert.equal(receipt.policy.agreement_acceptance_performed, false);
  assert.equal(receipt.policy.metadata_xml_retained, false); assert.equal(receipt.readiness.connector_ready, false);
  assert.equal(receipt.readiness.acquisition_authorized, false); assert.equal(receipt.acquisition.id_roster_requests, 0);
  assert.equal(f.calls.length, 6); assert.deepEqual(f.waits, [1000, 1000, 1000, 1000, 1000]);
  for (const { url, options } of f.calls) {
    const u = new URL(url); assert.equal(options.redirect, "manual");
    assert.ok(!u.searchParams.has("outFields") && !u.searchParams.has("returnIdsOnly"));
    if (u.pathname.endsWith("/query")) { assert.equal(u.searchParams.get("where"), MI_CHILDCARE_WHERE); assert.equal(u.searchParams.get("returnCountOnly"), "true"); assert.equal(u.searchParams.get("returnGeometry"), "false"); }
  }
});

test("MI rejects fixed source/schema/CRS/capability/policy changes and provider error without fallback", async () => {
  for (const mutate of [
    (v, k) => { if (k === "metadata") v.fields[1].length++; },
    (v, k) => { if (k === "metadata") v.fields[0].nullable = false; },
    (v, k) => { if (k === "metadata") v.fields.push({ name: "OwnerPhone", type: "esriFieldTypeString", length: 50, domain: null }); },
    (v, k) => { if (k === "metadata") v.sourceSpatialReference.wkid = 4326; },
    (v, k) => { if (k === "metadata") v.extent.spatialReference.wkt = 'GEOGCS["WGS84"]'; },
    (v, k) => { if (k === "metadata") v.extent.spatialReference.wkt = v.extent.spatialReference.wkt.replace("0.9996", "0.9999"); },
    (v, k) => { if (k === "metadata") v.sourceSpatialReference.wkt = "unreviewed"; },
    (v, k) => { if (k === "metadata") v.advancedQueryCapabilities.supportsPagination = false; },
    (v, k) => { if (k === "metadata") v.error = { code: 500, messageCode: "CONT_0044", message: "Error generating token" }; },
    (v, k) => { if (k === "item") v.owner = "other"; },
    (v, k) => { if (k === "item") v.licenseInfo += " altered"; },
    (v, k) => { if (k === "count") v.count = 20_001; },
    (v, k) => { if (k === "count") v.objectIds = [1]; },
    (v, k) => { if (k === "count") v.features = [{ attributes: { Owner: "private" } }]; },
    (v, k, n) => { if (k === "count" && n === 4) v.count++; },
  ]) { const f = fixture(mutate); await assert.rejects(run(f)); assert.ok(f.calls.length <= 6); }
});

test("MI bounded retries, waits, redirects, malformed and oversized responses", async () => {
  const retry = fixture((v, k, n) => n === 1 ? new Response("", { status: 429, headers: { "retry-after": "2" } }) : undefined);
  await run(retry); assert.equal(retry.calls.length, 7); assert.equal(retry.waits[0], 2000);
  for (const response of [new Response("", { status: 302 }), new Response("not-json"), new Response("", { status: 429, headers: { "retry-after": "61" } }), new Response("x", { headers: { "content-length": "1000001" } }), new Response("x".repeat(1_000_001))]) {
    const f = fixture(() => response); await assert.rejects(run(f)); assert.equal(f.calls.length, 1);
  }
  const always = fixture(() => new Response("", { status: 503 })); await assert.rejects(run(always)); assert.equal(always.calls.length, 3);
});

test("MI cancellation and total response-body deadline", async () => {
  const controller = new AbortController(); controller.abort(); const pre = fixture(); await assert.rejects(run(pre, { signal: controller.signal })); assert.equal(pre.calls.length, 0);
  let cancelled = 0;
  const deadline = fixture(() => new Response(new ReadableStream({ cancel() { cancelled++; } })));
  await assert.rejects(run(deadline, { timeoutMs: 5 })); assert.equal(deadline.calls.length, 3); assert.equal(cancelled, 3);
  const during = new AbortController();
  const f = fixture(() => new Response(new ReadableStream({ start() { setTimeout(() => during.abort(), 5); }, cancel() { cancelled++; } })));
  await assert.rejects(run(f, { signal: during.signal })); assert.equal(f.calls.length, 1); assert.equal(cancelled, 4);
  for (const extra of [{ url: "https://example.com" }, { where: "1=1" }, { timeoutMs: 30_001 }, { fetchImpl: null }]) await assert.rejects(run(fixture(), extra));
});

test("MI receipt replay rejects self-rehashed unsafe evidence and altered claims", async () => {
  const original = await run(fixture());
  for (const mutate of [
    (r) => { r.observations[1].payload.licenseInfo = r.observations[4].payload.licenseInfo = "permission"; },
    (r) => { r.observations[0].payload.fields[0].name = r.observations[5].payload.fields[0].name = "Owner"; },
    (r) => { r.observations[2].payload.count = r.observations[3].payload.count = 99_999; },
    (r) => { r.observations[2].url += "&returnIdsOnly=true"; },
    (r) => { r.readiness.connector_ready = true; },
  ]) { const r = structuredClone(original); mutate(r); for (const o of r.observations) o.payload_sha256 = digest(o.payload); assert.throws(() => validateMiChildcarePreflight(r)); }
});

test("MI immutable receipt writer stays inside datahub and rejects aliases/cancelled writes", async () => {
  const tmpRoot = path.join(APP_ROOT, "data", "tmp"); await mkdir(tmpRoot, { recursive: true }); const tmp = await mkdtemp(path.join(tmpRoot, "mi-preflight-"));
  try {
    const receipt = await run(fixture()), outputRoot = path.join(tmp, "receipts");
    const first = await writeMiChildcarePreflight(receipt, { outputRoot }), before = await readFile(first.path);
    const second = await writeMiChildcarePreflight(receipt, { outputRoot }); assert.notEqual(first.path, second.path);
    assert.deepEqual(await readFile(first.path), before); assert.equal(first.bytes, before.length);
    assert.equal(first.sha256, createHash("sha256").update(before).digest("hex")); assert.equal((await readdir(outputRoot)).length, 2);
    await assert.rejects(writeMiChildcarePreflight(receipt, { outputRoot: path.dirname(APP_ROOT) }));
    await assert.rejects(writeMiChildcarePreflight(receipt, { outputRoot: APP_ROOT }));
    await assert.rejects(writeMiChildcarePreflight(receipt, { outputRoot: "relative" }));
    const alias = path.join(tmp, "alias"); await symlink(outputRoot, alias, process.platform === "win32" ? "junction" : "dir");
    await assert.rejects(writeMiChildcarePreflight(receipt, { outputRoot: alias }));
    const controller = new AbortController(); controller.abort(); await assert.rejects(writeMiChildcarePreflight(receipt, { outputRoot, signal: controller.signal }));
    assert.equal((await readdir(outputRoot)).length, 2);
  } finally { await rm(tmp, { recursive: true, force: true }); }
});
