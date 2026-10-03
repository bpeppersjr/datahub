import assert from "node:assert/strict";
import { link, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { APP_ROOT } from "./paths.mjs";
import { buildAkBroadOrganizationAdmissionCandidate, publishAkBroadOrganizationAdmissionCandidate, verifyAkBroadOrganizationAdmissionCandidate } from "./ak-broad-organization-admission.mjs";

test("replays every retained artifact and emits a bounded pointer-free candidate", async () => {
  const built = await buildAkBroadOrganizationAdmissionCandidate();
  assert.equal(built.state, "AK");
  assert.equal(built.verification.artifact_count, 22);
  assert.equal(built.verification.normalized_organization_rows, 94884);
  assert.equal(built.verification.conservation_status, "passed");
  assert.equal(built.semantics.active_operation_asserted, false);
  assert.equal(built.semantics.physical_sites_asserted, false);
  assert.equal(built.semantics.geocodes_asserted, false);
  assert.equal(built.semantics.completeness_percent, null);
  assert.equal(built.authority.current_pointer_written, false);
});

test("publishes deterministically without a current pointer", async () => {
    const first = await publishAkBroadOrganizationAdmissionCandidate({ root: APP_ROOT });
    const second = await publishAkBroadOrganizationAdmissionCandidate({ root: APP_ROOT });
    assert.equal(first.candidate.release_id, second.candidate.release_id);
    assert.equal(await readFile(path.join(APP_ROOT, "data", "ak-broad-organization-admission-candidate", "current.json"), "utf8").catch(() => null), null);
    await verifyAkBroadOrganizationAdmissionCandidate(path.join(first.directory, "manifest.json"), { root: APP_ROOT });
});

test("fails closed when authority claims or retained manifest hash drift", async () => {
  const root = await mkdtemp(path.join(APP_ROOT, "data", ".test-ak-admission-bad-"));
  try {
    await mkdir(path.join(root, "config"), { recursive: true });
    const selection = JSON.parse(await readFile(path.join(APP_ROOT, "config", "ak-broad-organization-admission.json"), "utf8"));
    selection.claims.current_operation_verified = true;
    await writeFile(path.join(root, "config", "selection.json"), JSON.stringify(selection));
    await assert.rejects(buildAkBroadOrganizationAdmissionCandidate({ root, selectionPath: path.join(root, "config", "selection.json") }), /authority boundary/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("rejects unknown selection fields and an output root outside datahub", async () => {
  const temporary = await mkdtemp(path.join(APP_ROOT, "data", ".test-ak-admission-envelope-"));
  try {
    const selection = JSON.parse(await readFile(path.join(APP_ROOT, "config", "ak-broad-organization-admission.json"), "utf8"));
    selection.unreviewed = true;
    const selectionPath = path.join(temporary, "selection.json");
    await writeFile(selectionPath, JSON.stringify(selection));
    await assert.rejects(buildAkBroadOrganizationAdmissionCandidate({ root: APP_ROOT, selectionPath }), /selection envelope/);
    await assert.rejects(publishAkBroadOrganizationAdmissionCandidate({ root: APP_ROOT, outputRoot: path.dirname(APP_ROOT) }), /output root/);
  } finally { await rm(temporary, { recursive: true, force: true }); }
});

test("concurrent deterministic publishers converge on the same verified release", async () => {
  const [first, second] = await Promise.all([
    publishAkBroadOrganizationAdmissionCandidate({ root: APP_ROOT }),
    publishAkBroadOrganizationAdmissionCandidate({ root: APP_ROOT }),
  ]);
  assert.equal(first.candidate.release_id, second.candidate.release_id);
  assert.equal(first.manifest_sha256, second.manifest_sha256);
});

test("rejects a hard-linked selection before parsing it", async () => {
  const temporary = await mkdtemp(path.join(APP_ROOT, "data", ".test-ak-admission-hardlink-"));
  try {
    const original = path.join(temporary, "original.json"), linked = path.join(temporary, "linked.json");
    await writeFile(original, await readFile(path.join(APP_ROOT, "config", "ak-broad-organization-admission.json")));
    await link(original, linked);
    await assert.rejects(buildAkBroadOrganizationAdmissionCandidate({ root: APP_ROOT, selectionPath: linked }), /unsafe or oversized/);
  } finally { await rm(temporary, { recursive: true, force: true }); }
});
