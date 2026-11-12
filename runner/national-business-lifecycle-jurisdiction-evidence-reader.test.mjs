import assert from "node:assert/strict";
import { cp, link, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { readNationalBusinessLifecycleJurisdictionEvidence, readNationalBusinessLifecycleJurisdictionSummary, validateNationalBusinessLifecycleJurisdictionRowForTest } from "./national-business-lifecycle-jurisdiction-evidence-reader.mjs";
import { APP_ROOT } from "./paths.mjs";

test("runtime summary validates and orders the complete governed roster", async () => {
  const view = await readNationalBusinessLifecycleJurisdictionSummary();
  assert.equal(view.schema_version, "national-business-lifecycle-jurisdiction-evidence-runtime-summary@1.0.0");
  assert.deepEqual([view.scopes.states.length, view.scopes.territories.length, view.scopes.special.length], [51, 5, 4]);
  assert.deepEqual(view.scopes.special.map(row => row.scope_id), ["multi-state-material", "zcta-overlay-unresolved", "non-zcta-unassigned", "explicit-placeholder"]);
  assert.equal(view.summary.zip5_rows, 48_194);
  assert.equal(view.summary.profile_membership_count, 8_011_213);
  assert.equal(view.claims.unique_business_count, null);
  assert.equal(view.claims.usps_zip_state_assignment, false);
});

test("exact lookup accepts state or governed scope without inference", async () => {
  const state = await readNationalBusinessLifecycleJurisdictionEvidence({ state: "MN" });
  assert.equal(state.schema_version, "national-business-lifecycle-jurisdiction-evidence-runtime-lookup@1.0.0");
  assert.equal(state.scope.scope_id, "state:27");
  assert.equal(state.status, "governed-source-relative-memberships");
  const special = await readNationalBusinessLifecycleJurisdictionEvidence({ scopeId: "multi-state-material" });
  assert.equal(special.scope.scope_kind, "multi-state-material");
  await assert.rejects(() => readNationalBusinessLifecycleJurisdictionEvidence({ state: "PR" }), /runtime evidence rejected/);
  await assert.rejects(() => readNationalBusinessLifecycleJurisdictionEvidence({ state: "MN", scopeId: "state:27" }), /runtime evidence rejected/);
});

test("row validator fails closed on lifecycle and source conservation drift", async () => {
  const view = await readNationalBusinessLifecycleJurisdictionEvidence({ state: "MN" }), sourceIds = view.scope.sources.map(source => source.source_id);
  assert.doesNotThrow(() => validateNationalBusinessLifecycleJurisdictionRowForTest(view.scope, sourceIds));
  const changed = structuredClone(view.scope); changed.profile_membership_count++;
  assert.throws(() => validateNationalBusinessLifecycleJurisdictionRowForTest(changed, sourceIds), /^Error: Lifecycle jurisdiction runtime evidence rejected\.$/);
});

async function fixture(t) {
  const root = await import("node:fs/promises").then(fs => fs.mkdtemp(path.join(os.tmpdir(), "lifecycle-jurisdiction-reader-")));
  t.after(() => import("node:fs/promises").then(fs => fs.rm(root, { recursive: true, force: true })));
  const registration = JSON.parse(await readFile(path.join(APP_ROOT, "config/datasets/national-business-lifecycle-jurisdiction-evidence.json"), "utf8"));
  await mkdir(path.join(root, "config/datasets"), { recursive: true });
  await writeFile(path.join(root, "config/datasets/national-business-lifecycle-jurisdiction-evidence.json"), JSON.stringify(registration, null, 2) + "\n");
  const release = path.dirname(registration.retained_release.manifest);
  await mkdir(path.join(root, release), { recursive: true });
  await cp(path.join(APP_ROOT, release), path.join(root, release), { recursive: true });
  return { root, registration, release };
}

test("runtime rejects pinned artifact tampering with a generic error", async t => {
  const value = await fixture(t), target = path.join(value.root, value.release, "jurisdictions.json");
  const rows = JSON.parse(await readFile(target, "utf8")); rows[0].zip5_rows++;
  await writeFile(target, JSON.stringify(rows) + "\n");
  await assert.rejects(() => readNationalBusinessLifecycleJurisdictionSummary({ root: value.root }), /^Error: Lifecycle jurisdiction runtime evidence rejected\.$/);
});

test("runtime rejects registration pin tampering before release access", async t => {
  const value = await fixture(t), target = path.join(value.root, "config/datasets/national-business-lifecycle-jurisdiction-evidence.json");
  value.registration.retained_release.profile_membership_count--;
  await writeFile(target, JSON.stringify(value.registration, null, 2) + "\n");
  await assert.rejects(() => readNationalBusinessLifecycleJurisdictionSummary({ root: value.root }), /^Error: Lifecycle jurisdiction runtime evidence rejected\.$/);
});

test("runtime rejects symlinked artifact ancestry", { skip: process.platform === "win32" }, async t => {
  const value = await fixture(t), target = path.join(value.root, value.release, "jurisdictions.json"), moved = `${target}.real`;
  await import("node:fs/promises").then(fs => fs.rename(target, moved)); await symlink(moved, target);
  await assert.rejects(() => readNationalBusinessLifecycleJurisdictionSummary({ root: value.root }), /^Error: Lifecycle jurisdiction runtime evidence rejected\.$/);
});

test("runtime rejects multiply linked release files", async t => {
  const value = await fixture(t), target = path.join(value.root, value.release, "jurisdictions.json");
  await link(target, `${target}.alias`);
  await assert.rejects(() => readNationalBusinessLifecycleJurisdictionSummary({ root: value.root }), /^Error: Lifecycle jurisdiction runtime evidence rejected\.$/);
});
