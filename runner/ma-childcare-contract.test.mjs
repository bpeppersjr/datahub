import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";
import { createConnectorRegistry } from "./connector-registry.mjs";
import { MA_CHILDCARE_LAYER, MA_CHILDCARE_ITEM, MA_CHILDCARE_SCHEMA } from "./ma-childcare-preflight.mjs";
import { buildMaChildcareRelease, verifyMaChildcareRelease } from "./ma-childcare-release.mjs";

const readJson = async (file) => JSON.parse(await readFile(path.join(APP_ROOT, file), "utf8"));
const connectorPath = "config/connectors/ma-licensed-center-based-childcare.json";

test("MA registered contract exposes only CLI output and preserves fixed provider/resource bounds", async () => {
  const registry = await createConnectorRegistry(), contract = await readJson(connectorPath);
  const entry = registry.get(contract.connector_id);
  assert.equal(entry.version, "1.0.1");
  assert.deepEqual(entry.allowed_hosts, [new URL(MA_CHILDCARE_LAYER).hostname]);
  assert.deepEqual(entry.named_secret_references, []);
  assert.deepEqual(Object.keys(entry.configuration_schema.properties), ["output"]);
  assert.deepEqual(registry.validateConfiguration(entry.connector_id, {}).configuration, {
    output: "data/business-sources/ma-licensed-center-based-childcare",
  });
  for (const override of [{ url: "https://example.com" }, { where: "1=1" }, { page_size: 1000 }, { maximum_quarantine_rate: 1 }, { timeoutMs: 60001 }]) {
    assert.equal(registry.validateConfiguration(entry.connector_id, override).valid, false);
  }
  assert.deepEqual(contract.execution_limits, {
    max_parallel_requests: 1, maximum_source_records: 20000, maximum_batch_records: 100, maximum_request_url_bytes: 2000,
    maximum_response_bytes: 8000000, request_timeout_ms: 30000, maximum_injected_request_timeout_ms: 60000,
    maximum_request_attempts: 3, minimum_observation_spacing_ms: 1000, maximum_retry_after_ms: 60000,
    maximum_quarantine_rate: 0.05, minimum_accepted_records: 1,
    maximum_verification_artifact_bytes: 100000000, maximum_verification_manifest_bytes: 100000,
  });
  assert.match(contract.checkpoint, /No acquisition resume checkpoint or automatic crash recovery/);
  assert.match(contract.cancellation, /stale locks are never automatically reclaimed/);
});

test("MA contract and policy agree with an offline published and independently verified release", async (t) => {
  const contract = await readJson(connectorPath), policy = await readJson(contract.source_policy);
  const temp = path.join(APP_ROOT, "data/tmp"); await mkdir(temp, { recursive: true });
  const root = await mkdtemp(path.join(temp, "ma-contract-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const calls = [], waits = [];
  const result = await buildMaChildcareRelease({ outputRoot: root,
    now: () => new Date("2026-09-07T20:00:00.000Z"), sleep: async (ms) => { waits.push(ms); },
    fetchImpl: async (url, options) => {
      calls.push(url); assert.equal(options.redirect, "manual");
      assert.ok(Buffer.byteLength(url) <= contract.execution_limits.maximum_request_url_bytes);
      const parsed = new URL(url), query = parsed.searchParams;
      assert.equal(parsed.origin, new URL(policy.source_dataset).origin);
      assert.ok([new URL(policy.source_dataset).pathname, `${new URL(policy.source_dataset).pathname}/query`].includes(parsed.pathname));
      const payload = !parsed.pathname.endsWith("/query") ? {
        id: 0, name: "Licensed Child Care Programs", type: "Feature Layer", serviceItemId: MA_CHILDCARE_ITEM,
        objectIdField: "OBJECTID", geometryType: "esriGeometryPoint", spatialReference: { wkid: 26986 }, extent: { spatialReference: { wkid: 26986 } },
        capabilities: "Query", maxRecordCount: 500, advancedQueryCapabilities: { supportsPagination: true, supportsOrderBy: true },
        fields: MA_CHILDCARE_SCHEMA.map(([name, type, length]) => ({ name, type, length, nullable: name !== "OBJECTID" })),
        editingInfo: { lastEditDate: 1778802655030, schemaLastEditDate: 1778802655030, dataLastEditDate: 1777567917233 },
      } : query.has("returnCountOnly") ? { count: 1 }
        : query.has("returnIdsOnly") ? { objectIdFieldName: "OBJECTID", objectIds: [1] }
          : { spatialReference: { wkid: 4326 }, features: [{ attributes: {
            OBJECTID: 1, PROV_NUM: "P-fixture", PROG_NAME: "Fixture Center", ADDRESS: "10 Main Street", CITY: "Boston", ZIPCODE: "02108-1234",
            LICENSED_STATUS: "Current", PROG_TYPE: "Center-based Care", CAPACITY: 20, PROG_UM: null, LICENSED_FUNDED: "Licensed", MAD_ID: null,
          }, geometry: { x: -71, y: 42 } }] };
      if (query.has("outFields")) {
        assert.ok(query.get("objectIds").split(",").length <= contract.execution_limits.maximum_batch_records);
        assert.deepEqual(query.get("outFields").split(","), MA_CHILDCARE_SCHEMA.map(([name]) => name));
        assert.equal(query.get("outFields").includes("PHONE"), false);
      }
      return new Response(JSON.stringify(payload));
    },
  });
  const manifest = JSON.parse(await readFile(result.manifest_path, "utf8"));
  assert.equal((await verifyMaChildcareRelease(result.manifest_path)).status, "verified");
  assert.equal(manifest.connector_id, contract.connector_id);
  assert.equal(manifest.connector_version, contract.version);
  assert.equal(manifest.schema_version, contract.output_schema_contract.schema_version);
  assert.equal(manifest.transformation_version, contract.output_schema_contract.transformation_version);
  assert.equal(manifest.policy.profile, `${policy.policy_id}@${policy.version}`);
  assert.equal(manifest.policy.export, policy.export_policy);
  assert.equal(manifest.policy.attribution, policy.attribution);
  assert.equal(manifest.policy.terms_url, policy.terms_url);
  assert.equal(manifest.source_url, policy.source_dataset);
  assert.deepEqual(manifest.artifacts.map((artifact) => artifact.path), contract.output_schema_contract.artifacts);
  assert.equal(manifest.quarantine_max_fraction, contract.execution_limits.maximum_quarantine_rate);
  assert.ok(Object.values(manifest.claims).every((value) => value === false));
  assert.equal(calls.length, 7); assert.deepEqual(waits, Array(6).fill(contract.execution_limits.minimum_observation_spacing_ms));
  assert.equal(policy.catalog_license, null);
  assert.equal(policy.field_export_policy.PHONE, "excluded-at-query-time");
  const record = JSON.parse((await readFile(path.join(path.dirname(result.manifest_path), "normalized.jsonl"), "utf8")).trim());
  assert.equal(record.physical_address.zip_code, "02108"); assert.equal(record.physical_address.zip4, "1234");
  assert.equal(record.physical_address.postal_code, "02108"); assert.equal(record.geometry, undefined);
  assert.equal(record.geocode.latitude, 42); assert.equal(record.license.active_business_verified, false);
});
