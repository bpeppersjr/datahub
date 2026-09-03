import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  CANONICAL_CONNECTOR_LIFECYCLE,
  CONNECTOR_REGISTRY_VERSION,
  createConnectorRegistry,
  validateConnectorConfiguration,
} from "./connector-registry.mjs";

const validPolicy = {
  policy_id: "fixture",
  version: "1.0.0",
  ownership: "Fixture publisher.",
  allowed_use: ["testing"],
  prohibited_use: ["production publication"],
  attribution: "Retain fixture provenance.",
  retention: "Delete after testing.",
  redistribution: "Not authorized.",
};

const validManifest = {
  connector_id: "fixture",
  version: "1.0.0",
  description: "A test connector.",
  lifecycle: [...CANONICAL_CONNECTOR_LIFECYCLE],
  configuration_schema: {
    type: "object",
    additionalProperties: false,
    required: ["date"],
    properties: {
      limit: { type: "integer", minimum: 1, maximum: 10, default: 3 },
      date: { type: "string", format: "date" },
      mode: { type: "string", enum: ["full", "sample"], default: "sample" },
    },
  },
  named_secret_references: [{ name: "FIXTURE_TOKEN", purpose: "Authentication", storage: "environment-only" }],
  input_artifact_types: [],
  output_artifact_types: ["fixture-jsonl"],
  allowed_hosts: ["data.example.gov"],
  redirect_policy: "same-host-only",
  provider_budget_key: "fixture-budget",
  resource_class: "network",
  execution_limits: { max_requests: 1 },
  retry: "Retry once.",
  checkpoint: "Use run-scoped staging.",
  idempotency: "Hash the immutable input.",
  cancellation: "Abort the active request.",
  source_policy: "config/source-policies/fixture.json",
  retention_profile: "Fixture only.",
  produced_entities: ["fixture-record"],
  produced_identifiers: ["fixture-id"],
};

async function fixtureRoot(context, manifest = validManifest, policy = validPolicy) {
  const root = await mkdtemp(path.join(os.tmpdir(), "datahub-connector-registry-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "config", "connectors"), { recursive: true });
  await mkdir(path.join(root, "config", "source-policies"), { recursive: true });
  await writeFile(path.join(root, "config", "connectors", "fixture.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(path.join(root, "config", "source-policies", "fixture.json"), `${JSON.stringify(policy, null, 2)}\n`);
  return root;
}

test("loads the complete repository registry deterministically without secret values", async () => {
  const registry = await createConnectorRegistry();
  const entries = registry.list();
  assert.equal(registry.version, CONNECTOR_REGISTRY_VERSION);
  assert.equal(registry.connectorCount, 37);
  assert.equal(registry.policyProfileCount, 35);
  assert.deepEqual(entries.map((entry) => entry.connector_id), entries.map((entry) => entry.connector_id).toSorted());
  assert(entries.every((entry) => /^[a-f0-9]{64}$/.test(entry.manifest_sha256)));
  assert(entries.every((entry) => /^[a-f0-9]{64}$/.test(entry.source_policy.sha256)));
  assert.equal(JSON.stringify(entries).includes("FL_SUNBIZ_PUBLIC_PASSWORD"), true);
  assert.equal(JSON.stringify(entries).toLowerCase().includes('"value"'), false);

  const florida = registry.get("fl-business-registry");
  assert.deepEqual(florida.named_secret_references, [{ name: "FL_SUNBIZ_PUBLIC_PASSWORD" }]);
  florida.allowed_hosts.push("mutation.example");
  assert.equal(registry.get("fl-business-registry").allowed_hosts.includes("mutation.example"), false);
});

test("validates and defaults connector configuration without accepting undeclared properties", async () => {
  const registry = await createConnectorRegistry();
  const defaults = registry.validateConfiguration("us-census-geography", {});
  assert.equal(defaults.valid, true);
  assert.equal(defaults.configuration.page_size, 500);
  assert.equal(defaults.configuration.geometry_offset_degrees, 0.0001);

  const invalid = registry.validateConfiguration("us-census-geography", {
    page_size: 2001,
    geometry_offset_degrees: 0,
    undeclared_secret: "must-not-be-returned-by-the-api",
  });
  assert.equal(invalid.valid, false);
  assert.deepEqual(invalid.errors.map((failure) => failure.code).toSorted(), ["additional-property", "exclusiveMinimum", "maximum"]);
  assert.equal(registry.validateConfiguration("missing", {}).errors[0].code, "unknown");

  assert.equal(registry.validateConfiguration("fl-business-registry", {
    remote_path: "/Public/doc/quarterly/cor/cordata.zip",
  }).valid, true);
  assert.equal(registry.validateConfiguration("fl-business-registry", {
    remote_path: "/unapproved/path.zip",
  }).errors[0].code, "const");
});

test("applies required, enum, range, and date rules", () => {
  const result = validateConnectorConfiguration(validManifest, {
    date: "2026-02-30",
    limit: 0,
    mode: "unsafe",
    extra: true,
  });
  assert.equal(result.valid, false);
  assert.deepEqual(result.errors.map((failure) => failure.code).toSorted(), ["additional-property", "enum", "format", "minimum"]);

  const missing = validateConnectorConfiguration(validManifest, {});
  assert.equal(missing.valid, false);
  assert.equal(missing.errors[0].code, "required");
  assert.deepEqual(missing.configuration, { limit: 3, mode: "sample" });
});

test("rejects manifest identity, lifecycle, policy-path, and embedded-secret drift", async (context) => {
  const manifest = structuredClone(validManifest);
  manifest.connector_id = "wrong-name";
  manifest.lifecycle = ["preflight", "publish", "finalize"];
  manifest.source_policy = "https://example.com/policy.json";
  manifest.named_secret_references[0].value = "embedded-secret";
  delete manifest.execution_limits;
  const root = await fixtureRoot(context, manifest);

  await assert.rejects(createConnectorRegistry({ root }), (caught) => {
    assert.equal(caught.name, "ConnectorRegistryValidationError");
    const codes = caught.failures.map((failure) => failure.code);
    for (const code of ["filename", "lifecycle-stage", "path", "secret-value", "type"]) assert(codes.includes(code), code);
    assert.equal(JSON.stringify(caught.failures).includes("embedded-secret"), false);
    return true;
  });
});

test("loads a valid isolated registry and exposes only secret reference metadata", async (context) => {
  const root = await fixtureRoot(context);
  const registry = await createConnectorRegistry({ root });
  assert.equal(registry.connectorCount, 1);
  assert.equal(registry.policyProfileCount, 1);
  assert.deepEqual(registry.get("fixture").named_secret_references, [{
    name: "FIXTURE_TOKEN",
    purpose: "Authentication",
    storage: "environment-only",
  }]);
});
