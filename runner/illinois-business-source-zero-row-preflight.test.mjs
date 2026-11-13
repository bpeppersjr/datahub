import test from "node:test";
import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readIllinoisBusinessSourceZeroRowPreflight, validateIllinoisBusinessSourceZeroRowPreflight } from "./illinois-business-source-zero-row-preflight.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("Illinois zero-row preflight binds the offline connector without granting source authority", async () => {
  const result = await readIllinoisBusinessSourceZeroRowPreflight();
  assert.equal(result.status, "hold");
  assert.equal(result.source_rows_read, 0);
  assert.equal(result.network_requests, 0);
  assert.equal(result.required_offline_source_files, 5);
  assert.equal(result.unresolved_gates.length, 7);
  assert.equal(result.broad_layer_gap_resolved, false);
  assert.deepEqual(Object.values(result.authority), Array(10).fill(false));
});

test("Illinois zero-row semantic validator rejects rehashed widening and binding substitution", async () => {
  const load = async relative => JSON.parse(await readFile(path.join(ROOT, relative), "utf8"));
  const values = {
    assessment: await load("config/state-business-source-assessments/il-2026-11-12.json"),
    connector: await load("config/connectors/il-business-registry.json"),
    policy: await load("config/source-policies/il-business-registry.json"),
    predecessor: await load("config/state-business-source-assessments/il-2026-10-03.json"),
  };
  const pins = {
    assessment: "a".repeat(64),
    connector: values.assessment.connector_binding.sha256,
    policy: values.assessment.policy_binding.sha256,
    predecessor: values.assessment.predecessor_binding.sha256,
  };
  assert.equal(validateIllinoisBusinessSourceZeroRowPreflight(structuredClone(values), pins).status, "hold");
  for (const mutate of [
    input => { input.assessment.extra_authority = true; },
    input => { input.assessment.state.abbreviation = "IN"; },
    input => { input.assessment.connector_binding.required_source_files = 4; },
    input => { input.assessment.policy_binding.redistribution = "authorized"; },
    input => { input.assessment.predecessor_binding.path = "config/other.json"; },
    input => { input.assessment.verified_contract.acquisition_authorized = true; },
    input => { input.assessment.established_metadata[0] = "Network access is allowed."; },
    input => { input.assessment.unresolved_gates[0] = "resolved"; },
    input => { input.assessment.strongest_bounded_next_action = "Acquire now."; },
    input => { input.connector.allowed_hosts = ["www.ilsos.gov"]; },
    input => { input.policy.redistribution = "Redistribution is authorized."; },
  ]) {
    const tampered = structuredClone(values);
    mutate(tampered);
    assert.throws(() => validateIllinoisBusinessSourceZeroRowPreflight(tampered, pins), /evidence is unavailable/);
  }
});

test("Illinois zero-row preflight fails closed on tampered governed metadata", async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "il-zero-row-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const relative of [
    "config/state-business-source-assessments/il-2026-11-12.json",
    "config/state-business-source-assessments/il-2026-10-03.json",
    "config/connectors/il-business-registry.json",
    "config/source-policies/il-business-registry.json",
  ]) {
    await cp(path.join(ROOT, relative), path.join(root, relative), { recursive: true });
  }
  const connector = path.join(root, "config/connectors/il-business-registry.json");
  await writeFile(connector, `${await readFile(connector, "utf8")} `);
  await assert.rejects(readIllinoisBusinessSourceZeroRowPreflight({ root }), /evidence is unavailable/);
});

test("Illinois zero-row preflight rejects linked governed metadata when symlinks are available", async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "il-zero-row-link-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const relative of [
    "config/state-business-source-assessments/il-2026-11-12.json",
    "config/state-business-source-assessments/il-2026-10-03.json",
    "config/connectors/il-business-registry.json",
    "config/source-policies/il-business-registry.json",
  ]) {
    await cp(path.join(ROOT, relative), path.join(root, relative), { recursive: true });
  }
  const connector = path.join(root, "config/connectors/il-business-registry.json");
  await rm(connector);
  try {
    await symlink(path.join(ROOT, "config/connectors/il-business-registry.json"), connector, "file");
  } catch (error) {
    if (error.code === "EPERM") return t.skip("Windows symlink privilege is unavailable; tamper rejection was verified.");
    throw error;
  }
  await assert.rejects(readIllinoisBusinessSourceZeroRowPreflight({ root }), /evidence is unavailable/);
});
