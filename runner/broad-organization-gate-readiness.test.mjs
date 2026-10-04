import assert from "node:assert/strict";
import test from "node:test";

import {
  BROAD_ORGANIZATION_GATE_READINESS_TAXONOMY,
  classifyBroadOrganizationGateReadiness,
  validateBroadOrganizationGateReadinessTaxonomyKeys,
} from "./broad-organization-gate-readiness.mjs";
import { loadBroadOrganizationAuthorizationProgramManagementView } from "./broad-organization-authorization-program-view.mjs";
import { projectBroadOrganizationAuthorizationProgram } from "./broad-organization-authorization-program-view.mjs";
import { readAuthorizationViewReleases } from "./authorization-view-release-selection.mjs";
import { BROAD_ORGANIZATION_AUTHORIZATION_PROGRAM_DATASET_ID, DEFAULT_BROAD_ORGANIZATION_AUTHORIZATION_PROGRAM_ROOT } from "./broad-organization-authorization-program.mjs";

test("versioned taxonomy exactly covers the current 121 gate keys and fails closed on additions", async () => {
  const view = await loadBroadOrganizationAuthorizationProgramManagementView();
  const keys = [...new Set(view.states.flatMap((state) => state.gate_items.map((item) => item.gate_key)))];
  assert.equal(Object.keys(BROAD_ORGANIZATION_GATE_READINESS_TAXONOMY.entries).length, 121);
  assert.deepEqual(validateBroadOrganizationGateReadinessTaxonomyKeys(keys), { distinct_gate_key_count: 121, exhaustive: true });
  assert.throws(() => classifyBroadOrganizationGateReadiness("future-unreviewed-gate"), /Unknown broad-organization gate key/);
  assert.throws(() => validateBroadOrganizationGateReadinessTaxonomyKeys([...keys, "future-unreviewed-gate"]), /taxonomy\/program key mismatch/);
  assert.equal(view.metadata.gate_readiness.taxonomy_exhaustive, true);
  assert.equal(view.metadata.gate_readiness.unresolved_gate_item_count, 371);
});

test("readiness projection separates documentary, authorization, package, execution, and admission requirements", async () => {
  const view = await loadBroadOrganizationAuthorizationProgramManagementView();
  const byState = new Map(view.states.map((state) => [state.state_abbreviation, state]));
  const gate = (state, key) => byState.get(state).gate_items.find((item) => item.gate_key === key);

  for (const state of ["CA", "ID", "OH", "NH"]) {
    const item = gate(state, "separate-acquisition-authorization");
    assert.equal(item.effective_gate_kind, "authenticated-operator-authorization");
    assert.equal(item.document_closable, false);
  }
  for (const state of ["IL", "MS"]) {
    const item = gate(state, "separate-national-admission");
    assert.equal(item.effective_gate_kind, "national-admission-decision");
    assert.equal(item.document_closable, false);
  }
  assert.equal(gate("IL", "operator-supplied-complete-same-run-package").effective_gate_kind, "retained-source-package-evidence");
  assert.equal(gate("IL", "independent-package-verification").effective_gate_kind, "reproducible-execution-verification-evidence");
  assert.equal(gate("IL", "actual-package-freshness").effective_gate_kind, "reproducible-execution-verification-evidence");
  assert.equal(gate("MS", "source-authenticity-and-reproducible-extraction").effective_gate_kind, "reproducible-execution-verification-evidence");
  for (const key of ["deterministic-workbook-extraction", "source-authenticity"]) {
    assert.equal(gate("UT", key).effective_gate_kind, "reproducible-execution-verification-evidence");
  }

  const all = view.states.flatMap((state) => state.gate_items);
  assert.equal(all.length, 371);
  assert.ok(all.every((item) => item.closure_state === "unresolved" && item.readiness_uplift === false
    && item.row_bearing === false && item.authority_implication === false && item.document_closable !== undefined));
  assert.equal(view.authority.approval_granted, false);
  assert.equal(view.authority.acquisition_authorized, false);
  assert.equal(view.authority.source_actions_performed, 0);
  assert.equal(view.authority.network_requests, 0);
  assert.ok(all.filter((item) => item.effective_gate_kind !== "contract-evidence").every((item) => item.document_closable === false));
});

test("projection rejects changed source lineage instead of manufacturing a compatible view", async () => {
  const view = await loadBroadOrganizationAuthorizationProgramManagementView();
  const rows = await readAuthorizationViewReleases(DEFAULT_BROAD_ORGANIZATION_AUTHORIZATION_PROGRAM_ROOT,
    BROAD_ORGANIZATION_AUTHORIZATION_PROGRAM_DATASET_ID, "authorization-program.json");
  const release = rows.find((row) => row.manifest.release_id === view.metadata.release_id);
  assert.ok(release);
  const tampered = structuredClone(release.manifest);
  tampered.source_backlog_manifest_sha256 = "0".repeat(64);
  assert.throws(() => projectBroadOrganizationAuthorizationProgram(release.artifact, tampered, release.manifestSha256), /lineage|identity/i);
});

