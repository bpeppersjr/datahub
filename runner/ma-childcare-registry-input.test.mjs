import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";
import { MA_CHILDCARE_SCHEMA, MA_CHILDCARE_ITEM } from "./ma-childcare-preflight.mjs";
import { buildMaChildcareRelease } from "./ma-childcare-release.mjs";
import { loadMaChildcareRegistryInput } from "./ma-childcare-registry-input.mjs";

async function fixture(t) {
  const tmp = path.join(APP_ROOT, "data/tmp"); await mkdir(tmp, { recursive: true });
  const root = await mkdtemp(path.join(tmp, "ma-registry-input-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const result = await buildMaChildcareRelease({ outputRoot: root, sleep: async () => {},
    now: () => new Date("2026-09-07T20:00:00.000Z"), fetchImpl: async (url) => {
      const u = new URL(url), q = u.searchParams;
      const payload = !u.pathname.endsWith("/query") ? {
        id: 0, name: "Licensed Child Care Programs", type: "Feature Layer", serviceItemId: MA_CHILDCARE_ITEM,
        objectIdField: "OBJECTID", geometryType: "esriGeometryPoint", spatialReference: { wkid: 26986 }, extent: { spatialReference: { wkid: 26986 } },
        capabilities: "Query", maxRecordCount: 500, advancedQueryCapabilities: { supportsPagination: true, supportsOrderBy: true },
        fields: MA_CHILDCARE_SCHEMA.map(([name, type, length]) => ({ name, type, length, nullable: name !== "OBJECTID" })),
        editingInfo: { lastEditDate: 1778802655030, schemaLastEditDate: 1778802655030, dataLastEditDate: 1777567917233 },
      } : q.has("returnCountOnly") ? { count: 1 }
        : q.has("returnIdsOnly") ? { objectIdFieldName: "OBJECTID", objectIds: [1] }
          : { spatialReference: { wkid: 4326 }, features: [{ attributes: {
            OBJECTID: 1, PROV_NUM: "P-FIXTURE", PROG_NAME: "Fixture Program", ADDRESS: "10 Main Street", CITY: "Boston", ZIPCODE: "02108-1234",
            LICENSED_STATUS: "Expired", PROG_TYPE: "Center-based Care", CAPACITY: 20, PROG_UM: null, LICENSED_FUNDED: "Licensed", MAD_ID: null,
          }, geometry: { x: -71, y: 42 } }] };
      return new Response(JSON.stringify(payload));
    },
  });
  return { root, ...result };
}

test("MA local registry input verifies existing release without changing its evidence", async (t) => {
  const f = await fixture(t), pointer = await readFile(path.join(f.root, "current.json"));
  const manifest = await readFile(f.manifest_path);
  const result = await loadMaChildcareRegistryInput(f.manifest_path);
  assert.equal(result.source.manifestSha256, f.manifest_sha256);
  assert.equal(result.contributions.length, 1);
  assert.deepEqual(result.counts, { selected: 1, accepted: 1, quarantined: 0 });
  assert.equal(result.exportPolicy, "local-review-only");
  assert.equal(result.nationalReportingIntegrated, false);
  assert.deepEqual(await readFile(f.manifest_path), manifest);
  assert.deepEqual(await readFile(path.join(f.root, "current.json")), pointer);
  assert.match(JSON.stringify(result.contributions), /Expired/);
});

test("MA registry input rejects changed artifacts instead of converting unchecked rows", async (t) => {
  const f = await fixture(t);
  const artifact = path.join(path.dirname(f.manifest_path), "normalized.jsonl");
  const text = await readFile(artifact, "utf8");
  await writeFile(artifact, text.replace("Expired", "Current"));
  await assert.rejects(loadMaChildcareRegistryInput(f.manifest_path), /reproduction|integrity|differ/);
});

test("MA registry input cancellation and pointer misuse never return contributions", async (t) => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(loadMaChildcareRegistryInput("does-not-exist.json", { signal: controller.signal }), { name: "AbortError" });
  const f = await fixture(t);
  await assert.rejects(loadMaChildcareRegistryInput(path.join(f.root, "current.json")), /manifest filename/);
});
