import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, mkdir, mkdtemp, readdir, rm, writeFile, link, unlink, symlink } from "node:fs/promises";
import path from "node:path";
import { APP_ROOT, assertInsideApp } from "./paths.mjs";
import { MI_CHILDCARE_ITEM, MI_CHILDCARE_ORG, MI_CHILDCARE_LAYER, MI_CHILDCARE_SCHEMA, MI_CHILDCARE_SOURCE_CRS, MI_CHILDCARE_EXTENT_WKT, preflightMiChildcare } from "./mi-childcare-preflight.mjs";
import { MI_CHILDCARE_METADATA_URL } from "./mi-childcare-metadata.mjs";
import { acquireMiChildcare } from "./mi-childcare-acquisition.mjs";
const terms = '<div>This dataset is a public record and, as more fully described below, there are no restrictions on the use, reproduction, or distribution of this dataset. Notwithstanding the foregoing, the public release of this dataset should not be construed, expressed or implied, as to whether any use constitutes a legally permissible purpose. It is the sole responsibility of the user to determine if the data is usable for their purposes.This dataset is provided “AS IS” and on an “AS AVAILABLE” basis. The State of Michigan (“State”) makes no warranties, express or implied, regarding the accuracy, adequacy, reliability, timeliness, or completeness of this dataset. The State also does not make any warranties, express or implied, for the continued quality, accuracy, or currency of this dataset after it has been downloaded, nor the quality or accuracy of any analyses or re-uses of this dataset. THE STATE DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS DATASET AND ANY INFORMATION PROVIDED TO YOU, INCLUDING THE IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NONINFRINGEMENT OF PROPRIETARY RIGHTS. THE STATE WILL NOT BE LIABLE, REGARDLESS OF THE FORM OF ACTION, WHETHER IN CONTRACT, TORT, NEGLIGENCE, STRICT LIABILITY OR BY STATUTE OR OTHERWISE, FOR ANY CLAIM FOR CONSEQUENTIAL, INCIDENTAL, INDIRECT, OR SPECIAL DAMAGES, INCLUDING WITHOUT LIMITATION LOST PROFITS AND LOST BUSINESS OPPORTUNITIES, RELATED TO THE ACCESS OR USE OF THIS DATASET. IN NO EVENT WILL THE STATE BE LIABLE FOR ANY AMOUNTS THAT MAY RESULT FROM THE ACCESS OR USE OF THIS DATASET, REGARDLESS OF THE FORM OF ACTION, WHETHER IN CONTRACT, TORT, NEGLIGENCE, STRICT LIABILITY, OR BY STATUTE OR OTHERWISE. You forever release the State, its departments, subdivisions, officers, and employees from all claims, rights, actions, demands, damages, liabilities, expenses and fees, which arise out of or relate to your access or use of this dataset. You must defend, indemnify and hold the State, its departments, subdivisions, officers, and employees harmless, without limitation, from and against all actions, claims, losses, liabilities, damages, costs, attorney fees, and expenses (including those required to establish the right to indemnification) arising out of or relating to your access or use of this dataset. The State reserves the right to modify or remove this dataset for any reason, without notice, at any time. Nothing in these terms constitutes or is intended to be a limitation upon, or waiver of, any privileges and immunities that apply to the State. These terms are governed by and interpreted under the laws of the State of Michigan without regard to conflict of laws provisions. These terms do not apply to other materials or content, including maps or logos, that may be located on the site or portal containing this dataset and that may be protected by intellectual property rights such copyright, trademark, or patent. Nothing in these terms should be construed, expressed or implied, as impacting any existing rights or licenses in such materials or content, if any.</div><div><br /></div>';
const sha = v => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const metadataPath = process.env.MI_CHILDCARE_METADATA_TEST_FIXTURE;
const metadata = metadataPath ? await readFile(assertInsideApp(metadataPath)) : null;
const needsXml = { skip: metadata === null ? "Requires explicitly provided private local XML fixture; no network fallback." : false };
function fixture({ count = 103, mutate = () => {} } = {}) {
  const calls = [], waits = [], kinds = {};
  const now = () => new Date("2026-09-08T02:00:00.000Z");
  const fetchImpl = async (url, options) => {
    const u = new URL(url), kind = url === MI_CHILDCARE_METADATA_URL ? "xml" : u.searchParams.has("returnIdsOnly") ? "inventory"
      : u.searchParams.has("objectIds") ? "features" : u.pathname.endsWith("/query") ? "count" : url.includes("sharing/rest/content") ? "item" : "metadata";
    kinds[kind] = (kinds[kind] ?? 0) + 1; calls.push({ url, options, kind });
    let value = kind === "xml" ? null : kind === "count" ? { count } : kind === "inventory" ? { objectIdFieldName: "OBJECTID", objectIds: Array.from({ length: count }, (_, i) => count - i) }
      : kind === "features" ? { features: u.searchParams.get("objectIds").split(",").map(Number).map(id => ({ attributes: {
        OBJECTID: id, LicenseNumber: "000" + id, FacilityName: "Clearly Synthetic Center", StreetAddress: "1 Synthetic Street", City: "Synthetic City",
        State: "MI", ZIPCode: id === 1 ? null : "49901-0023", CountyCode: "SOURCE-ONLY", FacilityTypeCode: "DC", FacilityType: "Center", Capacity: 30, Latitude: 47.2, Longitude: -88.4
      } })) } : kind === "item" ? {
        id: MI_CHILDCARE_ITEM, owner: "michigan_admin", orgId: MI_CHILDCARE_ORG, access: "public", title: "Child Care", type: "Feature Service", url: MI_CHILDCARE_LAYER,
        sourceUrl: "https://gisagocss.state.mi.us/arcgis/rest/services/CSS/CSS_LARA/MapServer/5", created: 1657216578000, modified: 1775850938000, licenseInfo: terms, numViews: calls.length
      } : { id: 5, name: "BCHS_Child_Care", type: "Feature Layer", displayField: "FacilityName", geometryType: "esriGeometryPoint",
        sourceSpatialReference: { ...MI_CHILDCARE_SOURCE_CRS }, extent: { spatialReference: { wkt: MI_CHILDCARE_EXTENT_WKT } }, capabilities: "Map,Query,Data",
        maxRecordCount: 1000, hasAttachments: false, hasMetadata: true, supportsStatistics: true,
        advancedQueryCapabilities: { supportsPagination: true, supportsOrderBy: true, supportsStatistics: true },
        fields: MI_CHILDCARE_SCHEMA.map(([name, type, length]) => ({ name, type, ...(length === null ? {} : { length }), domain: null })) };
    const overridden = mutate(value, kind, kinds[kind], u, options);
    if (overridden instanceof Response) return overridden;
    if (kind === "xml") { assert.ok(metadata, "Explicit private XML fixture required"); return new Response(metadata, { headers: { "content-type": "application/xml" } }); }
    return Response.json(value);
  };
  return { calls, waits, fetchImpl, now, sleep: async ms => { waits.push(ms); } };
}
async function prepare(f) {
  const preflight = await preflightMiChildcare({ fetchImpl: f.fetchImpl, sleep: f.sleep, now: f.now });
  return { preflight, callerAuthorization: { mode: "explicit-reviewed-center-acquisition", reviewReference: "synthetic-test-review-not-real-approval",
    metadataReceiptSha256: sha(preflight) }, maximumPreflightAgeMs: 60_000, fetchImpl: f.fetchImpl, sleep: f.sleep, now: f.now };
}import { buildMiChildcareRelease, verifyMiChildcareRelease } from "./mi-childcare-release.mjs";

async function sample(t, mutate) {
  // All facility rows come from the synthetic transport above; no publisher business records are acquired.
  const f = fixture({ count: 20, mutate }), options = await prepare(f), acquired = await acquireMiChildcare(options);
  await mkdir(path.join(APP_ROOT, "data/tmp"), { recursive: true });
  const outputRoot = await mkdtemp(path.join(APP_ROOT, "data/tmp/mi-release-"));
  t.after(() => rm(outputRoot, { recursive: true, force: true }));
  return { evidence: acquired.evidence, outputRoot, now: () => new Date("2026-09-09T00:00:00.000Z") };
}
test("MI offline builder rejects transport options, absent evidence and precancellation", async () => {
  for (const options of [{}, { fetchImpl() {} }, { evidence: {}, acquisition_authorized: true }]) await assert.rejects(buildMiChildcareRelease(options));
  await assert.rejects(buildMiChildcareRelease({ signal: AbortSignal.abort() }), { name: "AbortError" });
});
test("MI source release retains five exact artifacts, missing ZIP and original observations without network", needsXml, async t => {
  const f = await sample(t, (p,k) => { if (k === "features") { p.features[1].attributes.ZIPCode = "invalid"; p.features[2].attributes.Latitude = null; p.features[2].attributes.Longitude = null; } });
  const original = JSON.stringify(f.evidence), prior = globalThis.fetch; globalThis.fetch = () => { throw new Error("Network forbidden"); };
  let result, verified;
  try { result = await buildMiChildcareRelease(f); verified = await verifyMiChildcareRelease(result.manifest_path); } finally { globalThis.fetch = prior; }
  assert.deepEqual(result.counts, { selected: 20, accepted: 19, quarantined: 1 }); assert.equal(verified.artifact_count, 5);
  assert.equal(verified.manifest_sha256, result.manifest_sha256); assert.equal(JSON.stringify(f.evidence), original);
  const m = JSON.parse(await readFile(result.manifest_path));
  assert.equal(m.status, "published-partial"); assert.equal(m.policy_status, "pending-review"); assert.equal(m.policy.status, "pending-review");
  assert.equal(m.nationalReportingIntegrated, false); assert.equal(m.acquisition_performed, false); assert.equal(m.claims.acquisition_authorized, false);
  assert.equal(m.claims.legal_approval, false); assert.equal(m.claims.export_authorized, false);
  assert.equal(m.observed_at, f.evidence.observed_at); assert.equal(m.processed_at, f.now().toISOString());
  assert.deepEqual(m.quality, { missing_source_zip: 1, missing_source_point: 1, coordinate_reference_unverified: 19, governed_geographic_assignment_eligible: 0 });
  const selected = (await readFile(path.join(path.dirname(result.manifest_path), "selected-features.jsonl"), "utf8")).trim().split("\n").map(JSON.parse);
  assert.equal(selected[1].attributes.ZIPCode, "invalid");
  const normalized = (await readFile(path.join(path.dirname(result.manifest_path), "normalized.jsonl"), "utf8")).trim().split("\n").map(JSON.parse);
  assert.equal(normalized[0].physical_address.zip_code, null); assert.ok(normalized.every(r => r.geocode.crs === null && r.provenance.observed_at === m.observed_at));
  assert.deepEqual(await readdir(path.join(f.outputRoot, ".staging")), []);
  const second = await buildMiChildcareRelease({ ...f, now: () => new Date("2026-09-10T00:00:00.000Z") });
  const m2 = JSON.parse(await readFile(second.manifest_path)); assert.equal(m2.source_release_id, m.source_release_id); assert.notEqual(m2.run_id, m.run_id);
  await verifyMiChildcareRelease(result.manifest_path); // Prior immutable release survives pointer advancement.
});
test("MI verifier rejects rehashed normalization policy counts times and XML", needsXml, async t => {
  const f = await sample(t), result = await buildMiChildcareRelease(f), manifestBytes = await readFile(result.manifest_path), clean = JSON.parse(manifestBytes), directory = path.dirname(result.manifest_path);
  const normalized = await readFile(path.join(directory, "normalized.jsonl")), xml = await readFile(path.join(directory, "publisher-metadata.xml"));
  for (const kind of ["normalized", "policy", "counts", "time", "xml", "roster"]) {
    const m = structuredClone(clean);
    if (kind === "normalized") {
      const rows = normalized.toString().trim().split("\n").map(JSON.parse); rows[0].geocode.crs = "EPSG:4326";
      const bytes = Buffer.from(rows.map(JSON.stringify).join("\n") + "\n"), a = m.artifacts.find(a => a.path === "normalized.jsonl");
      await writeFile(path.join(directory, a.path), bytes); a.bytes = bytes.length; a.sha256 = createHash("sha256").update(bytes).digest("hex");
    }
    if (kind === "policy") m.policy.legal_approval = true;
    if (kind === "counts") m.quality.coordinate_reference_unverified--;
    if (kind === "time") m.processed_at = "2000-01-01T00:00:00.000Z";
    if (kind === "xml") await writeFile(path.join(directory, "publisher-metadata.xml"), "<metadata>changed</metadata>");
    if (kind === "roster") await writeFile(path.join(directory, "unexpected.json"), "{}");
    await writeFile(result.manifest_path, JSON.stringify(m)); await assert.rejects(verifyMiChildcareRelease(result.manifest_path));
    await writeFile(result.manifest_path, manifestBytes); await writeFile(path.join(directory, "normalized.jsonl"), normalized); await writeFile(path.join(directory, "publisher-metadata.xml"), xml);
    if (kind === "roster") await unlink(path.join(directory, "unexpected.json"));
  }
  const alias = path.join(f.outputRoot, "hardlinked-manifest"); await link(result.manifest_path, alias);
  await assert.rejects(verifyMiChildcareRelease(result.manifest_path)); await unlink(alias);
  await assert.rejects(verifyMiChildcareRelease(path.join(f.outputRoot, "current.json")));
});
test("MI release quality failure retains source bytes and cancellation cleans only owned staging", needsXml, async t => {
  const bad = await sample(t, (p,k) => { if (k === "features") for (const row of p.features) row.attributes.ZIPCode = "invalid"; });
  await assert.rejects(buildMiChildcareRelease(bad), /quarantine/);
  const stages = await readdir(path.join(bad.outputRoot, ".staging")); assert.equal(stages.length, 1);
  assert.deepEqual((await readdir(path.join(bad.outputRoot, ".staging", stages[0]))).sort(), ["publisher-metadata.xml", "selected-features.jsonl", "source-observation.json"]);
  await assert.rejects(readFile(path.join(bad.outputRoot, ".publish.lock")), { code: "ENOENT" });
  for (const stage of ["retained-evidence", "normalize", "verify", "before-commit"]) {
    const f = await sample(t), controller = new AbortController();
    await assert.rejects(buildMiChildcareRelease({ ...f, signal: controller.signal, logger: s => { if (s === stage) controller.abort(); } }), { name: "AbortError" });
    assert.deepEqual(await readdir(path.join(f.outputRoot, ".staging")), []); assert.deepEqual(await readdir(path.join(f.outputRoot, "releases")), []);
    await assert.rejects(readFile(path.join(f.outputRoot, ".publish.lock")), { code: "ENOENT" });
    await assert.rejects(readFile(path.join(f.outputRoot, "current.json")), { code: "ENOENT" });
  }
});
test("MI release rejects linked roots, owned lock conflicts and prior pointer corruption", needsXml, async t => {
  const f = await sample(t), foreign = path.join(f.outputRoot, "foreign"); await mkdir(foreign);
  const alias = path.join(f.outputRoot, "alias"); await symlink(foreign, alias, "junction");
  await assert.rejects(buildMiChildcareRelease({ ...f, outputRoot: alias }), /alias/); await unlink(alias);
  await writeFile(path.join(f.outputRoot, ".publish.lock"), "foreign-owner");
  await assert.rejects(buildMiChildcareRelease(f), { code: "EEXIST" });
  assert.equal(await readFile(path.join(f.outputRoot, ".publish.lock"), "utf8"), "foreign-owner"); await unlink(path.join(f.outputRoot, ".publish.lock"));
  await writeFile(path.join(f.outputRoot, "current.json"), '{"unexpected":true}');
  await assert.rejects(buildMiChildcareRelease(f), /pointer/);
  assert.equal(await readFile(path.join(f.outputRoot, "current.json"), "utf8"), '{"unexpected":true}');
  for (const content of ["null", "false", "0"]) {
    await writeFile(path.join(f.outputRoot, "current.json"), content); await assert.rejects(buildMiChildcareRelease(f));
    assert.equal(await readFile(path.join(f.outputRoot, "current.json"), "utf8"), content);
  }
});

test("MI final precommit verification rejects staging mutations without publishing", needsXml, async t => {
  const f = await sample(t), original = JSON.stringify(f.evidence);
  await assert.rejects(buildMiChildcareRelease({ ...f, logger: async stage => {
    if (stage !== "before-commit") return;
    const [id] = await readdir(path.join(f.outputRoot, ".staging"));
    const staged = await verifyMiChildcareRelease(path.join(f.outputRoot, ".staging", id, "manifest.json"));
    assert.equal(staged.storage_state, "staged-not-published");
    const file = path.join(f.outputRoot, ".staging", id, "normalized.jsonl");
    const rows = (await readFile(file, "utf8")).trim().split("\n").map(JSON.parse); rows[0].physical_address.zip_code = "49901";
    await writeFile(file, rows.map(JSON.stringify).join("\n") + "\n");
  } }), /replay/);
  await assert.rejects(readFile(path.join(f.outputRoot, "current.json")), { code: "ENOENT" });
  assert.deepEqual(await readdir(path.join(f.outputRoot, "releases")), []);
  assert.equal(JSON.stringify(f.evidence), original);
});
