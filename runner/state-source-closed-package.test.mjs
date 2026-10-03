import test from "node:test";
import assert from "node:assert/strict";
import { link, mkdtemp, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { verifyClosedStateSourcePackage, STATE_SOURCE_AUTHORIZATION_REGISTRY_VERSION } from "./state-source-closed-package.mjs";

const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const encode = value => Buffer.from(`${JSON.stringify(value)}\n`);

async function fixture(mutator = () => {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "state-source-closed-"));
  const values = {
    "source.json": { schema_version: "state-source-declaration@1.0.0", source_id: "il-official-organizations", state: "IL", publisher: "Illinois Secretary of State", dataset: "organization projection", observed_at: "2026-10-03T00:00:00.000Z" },
    "schema.json": { schema_version: "state-source-projection-schema@1.0.0", schema_id: "il-org-projection@1", fields: ["source_record_id", "organization_name", "state", "zip5", "zip4", "latitude", "longitude"], zip5_field: "zip5", zip4_field: "zip4", latitude_field: "latitude", longitude_field: "longitude", business_geometry_allowed: false },
    "policy.json": { schema_version: "state-source-policy@1.0.0", policy_id: "il-org-policy@1", allowed_use: "Local review of organization assertions.", retention: "Retain governed evidence locally.", redistribution: "Not authorized by this contract.", required_exclusions: ["natural-person data", "registered-agent data", "direct contact data", "sensitive identifiers", "filing documents", "free text"], business_geometry_allowed: false, production_admission_authorized: false },
    "records.jsonl": [{ source_record_id: "1", organization_name: "Example LLC", state: "IL", zip5: "00100", zip4: "1234", latitude: 40, longitude: -89 }],
  };
  mutator(values);
  const bytes = {};
  for (const name of ["source.json", "schema.json", "policy.json"]) bytes[name] = encode(values[name]);
  bytes["records.jsonl"] = Buffer.from(values["records.jsonl"].length ? values["records.jsonl"].map(row => JSON.stringify(row)).join("\n") + "\n" : "");
  const authorization = { schema_version: "state-source-offline-authorization@1.0.0", authorization_id: "il-offline-001", authorized_at: "2026-10-03T00:00:00.000Z", authorized_by: "data-governance", source_id: values["source.json"].source_id, state: values["source.json"].state, source_sha256: hash(bytes["source.json"]), schema_sha256: hash(bytes["schema.json"]), policy_sha256: hash(bytes["policy.json"]), offline_files_authorized: true, network_acquisition_authorized: false, production_pointer_change_authorized: false, broad_layer_admission_authorized: false };
  bytes["authorization.json"] = encode(authorization);
  const manifest = { schema_version: "state-source-closed-package@1.0.0", source_id: values["source.json"].source_id, state: values["source.json"].state, record_count: values["records.jsonl"].length, artifacts: ["authorization.json", "policy.json", "records.jsonl", "schema.json", "source.json"].map(name => ({ path: name, bytes: bytes[name].length, sha256: hash(bytes[name]) })), claims: { network_requests: 0, production_pointer_written: false, broad_layer_admission_performed: false, business_geometry_present: false, zip5_zip4_joined: false } };
  bytes["manifest.json"] = encode(manifest);
  for (const [name, content] of Object.entries(bytes)) await writeFile(path.join(directory, name), content);
  const registry = { schema_version: STATE_SOURCE_AUTHORIZATION_REGISTRY_VERSION, status: "closed", approved_sources: [{ authorization_id: authorization.authorization_id, authorization_sha256: hash(bytes["authorization.json"]), source_id: authorization.source_id, state: authorization.state, source_sha256: authorization.source_sha256, schema_sha256: authorization.schema_sha256, policy_sha256: authorization.policy_sha256 }] };
  return { directory, registry };
}

test("verifies a pinned closed package without admitting it", async t => {
  const value = await fixture(); t.after(() => rm(value.directory, { recursive: true, force: true }));
  assert.deepEqual(await verifyClosedStateSourcePackage(value.directory, { authorizationRegistry: value.registry, root: path.dirname(value.directory) }), { verified: true, source_specific_authorization_satisfied: false, source_id: "il-official-organizations", state: "IL", record_count: 1, package_manifest_sha256: await (async () => hash(await import("node:fs/promises").then(fs => fs.readFile(path.join(value.directory, "manifest.json")))))(), network_requests: 0, production_pointer_written: false, broad_layer_admission_performed: false });
});

test("fails closed without the exact registry pin", async t => {
  const value = await fixture(); t.after(() => rm(value.directory, { recursive: true, force: true })); value.registry.approved_sources = [];
  await assert.rejects(verifyClosedStateSourcePackage(value.directory, { authorizationRegistry: value.registry, root: path.dirname(value.directory) }), /pinned authorization/);
});

test("rejects joined ZIP and business geometry schemas", async t => {
  const value = await fixture(values => { values["schema.json"].fields = ["source_record_id", "organization_name", "state", "zip5", "zip4", "geometry"]; });
  t.after(() => rm(value.directory, { recursive: true, force: true }));
  await assert.rejects(verifyClosedStateSourcePackage(value.directory, { authorizationRegistry: value.registry, root: path.dirname(value.directory) }), /coordinate field pair|forbidden or geometry/);
});

test("rejects cross-state records even when package hashes are pinned", async t => {
  const value = await fixture(values => { values["records.jsonl"][0].state = "IN"; }); t.after(() => rm(value.directory, { recursive: true, force: true }));
  await assert.rejects(verifyClosedStateSourcePackage(value.directory, { authorizationRegistry: value.registry, root: path.dirname(value.directory) }), /record state binding/);
});

test("rejects an extra package file", async t => {
  const value = await fixture(); t.after(() => rm(value.directory, { recursive: true, force: true })); await writeFile(path.join(value.directory, "extra.txt"), "x");
  await assert.rejects(verifyClosedStateSourcePackage(value.directory, { authorizationRegistry: value.registry, root: path.dirname(value.directory) }), /exactly the closed inventory/);
});

test("snapshots a plain registry and rejects accessor, prototype, and sparse-array inputs", async t => {
  const value = await fixture(); t.after(() => rm(value.directory, { recursive: true, force: true }));
  const originalRegistry = structuredClone(value.registry);
  const pending = verifyClosedStateSourcePackage(value.directory, { authorizationRegistry: value.registry, root: path.dirname(value.directory) });
  value.registry.approved_sources.length = 0;
  assert.equal((await pending).verified, true);
  value.registry = originalRegistry;
  const accessor = { ...value.registry };
  Object.defineProperty(accessor, "status", { enumerable: true, configurable: true, get() { return "closed"; } });
  await assert.rejects(verifyClosedStateSourcePackage(value.directory, { authorizationRegistry: accessor, root: path.dirname(value.directory) }), /accessor/);
  const inherited = Object.create({ approved_sources: value.registry.approved_sources }); inherited.schema_version = value.registry.schema_version; inherited.status = "closed";
  await assert.rejects(verifyClosedStateSourcePackage(value.directory, { authorizationRegistry: inherited, root: path.dirname(value.directory) }), /unsafe prototype/);
  const sparse = { ...value.registry, approved_sources: new Array(2) }; sparse.approved_sources[1] = value.registry.approved_sources[0];
  await assert.rejects(verifyClosedStateSourcePackage(value.directory, { authorizationRegistry: sparse, root: path.dirname(value.directory) }), /sparse/);
  await assert.rejects(verifyClosedStateSourcePackage(value.directory, { authorizationRegistry: new Proxy(value.registry, {}), root: path.dirname(value.directory) }), /proxy/);
});

test("rejects prototype-control names in an otherwise exact row schema", async t => {
  const value = await fixture(values => {
    values["schema.json"].fields[0] = "__proto__";
    values["records.jsonl"] = [{ __proto__: "1", organization_name: "Example LLC", state: "IL", zip5: "00100", zip4: "1234", latitude: 40, longitude: -89 }];
  });
  t.after(() => rm(value.directory, { recursive: true, force: true }));
  await assert.rejects(verifyClosedStateSourcePackage(value.directory, { authorizationRegistry: value.registry, root: path.dirname(value.directory) }), /forbidden or geometry field/);
});

test("rejects the root itself, hardlinked artifacts, and non-closed registries", async t => {
  const value = await fixture(); t.after(() => rm(value.directory, { recursive: true, force: true }));
  await assert.rejects(verifyClosedStateSourcePackage(path.dirname(value.directory), { authorizationRegistry: value.registry, root: path.dirname(value.directory) }), /inside datahub/);
  value.registry.status = "open";
  await assert.rejects(verifyClosedStateSourcePackage(value.directory, { authorizationRegistry: value.registry, root: path.dirname(value.directory) }), /authorization registry/);
  value.registry.status = "closed";
  const linkName = path.join(path.dirname(value.directory), `hardlink-${Date.now()}.json`);
  await link(path.join(value.directory, "source.json"), linkName);
  t.after(() => rm(linkName, { force: true }));
  await assert.rejects(verifyClosedStateSourcePackage(value.directory, { authorizationRegistry: value.registry, root: path.dirname(value.directory) }), /unsafe or oversized input/);
});

test("bounds records before decoding and gives zero rows one exact representation", async t => {
  const empty = await fixture(values => { values["records.jsonl"] = []; }); t.after(() => rm(empty.directory, { recursive: true, force: true }));
  assert.equal((await verifyClosedStateSourcePackage(empty.directory, { authorizationRegistry: empty.registry, root: path.dirname(empty.directory) })).record_count, 0);
  const value = await fixture(); t.after(() => rm(value.directory, { recursive: true, force: true }));
  await assert.rejects(verifyClosedStateSourcePackage(value.directory, { authorizationRegistry: value.registry, root: path.dirname(value.directory), maximumRecords: 0 }), /manifest/);
  await assert.rejects(verifyClosedStateSourcePackage(value.directory, { authorizationRegistry: value.registry, root: path.dirname(value.directory), maximumLineBytes: 8 }), /line byte ceiling/);
});
