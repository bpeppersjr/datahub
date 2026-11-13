import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { loadIlAccessVsReuseReference, validateIlAccessVsReuseReference, verifyIlAccessVsReuseReferenceBytes } from "./il-access-vs-reuse-reference.mjs";
import { loadBroadOfflineConnectorReadinessWave } from "./broad-organization-offline-connector-readiness-wave.mjs";
import { APP_ROOT } from "./paths.mjs";

test("IL separates positive statutory reuse evidence from prohibited automated access", async () => {
  const ref = await loadIlAccessVsReuseReference();
  assert.equal(ref.decision, "hold");
  assert.ok(Object.values(ref.authority).every(value => value === false));
  assert.ok(Object.values(ref.controls).every(value => value === 0));
  assert.equal(ref.source_files_retained, 0);
  assert.equal(ref.source_rows_retained, 0);
  assert.match(ref.official_sos_evidence.page_facts, /strictly prohibits automated queries/);
  assert.equal(ref.official_sos_evidence.layout_version, "004");
  assert.equal(ref.official_sos_evidence.layout_date, "2024-04-04");
  assert.match(ref.official_sos_evidence.layout_facts, /160, 197 and 126.*136 and 128/);
  assert.match(ref.statutory_evidence.evidence_origin, /search results.*timeouts or 502/);
  assert.match(ref.statutory_evidence.interpretation, /Positive evidence for reuse.*not authorization for automated website access/);
  assert.equal(ref.statutory_evidence.direct_live_page_retrieval_verified, false);
  assert.equal(ref.reuse_reconciled, false);
  assert.match(ref.privacy_discrepancy, /potentially residential.*remains unresolved/);
});

test("IL readiness wave keeps its existing HOLD binding and both assessments remain byte-identical", async () => {
  const ref = await loadIlAccessVsReuseReference();
  const wave = await loadBroadOfflineConnectorReadinessWave();
  const il = wave.states.find(row => row.state === "IL");
  assert.equal(wave.decision, "hold");
  assert.equal(il.assessment_path, "config/state-business-source-assessments/il-2026-10-03.json");
  assert.equal(il.required_source_files, 5);
  assert.ok(il.unresolved_gates.includes("automated-retrieval-authorization"));
  for (const prior of ref.prior_bindings) {
    const bytes = await readFile(path.join(APP_ROOT, prior.path));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), prior.sha256);
    assert.equal(JSON.parse(bytes).decision, "hold");
  }
});

test("IL rejects changed authority, provenance, facts, omissions and bytes", async () => {
  const ref = await loadIlAccessVsReuseReference();
  const mutations = [
    value => { value.state = "IN"; },
    value => { value.decision = "ready"; },
    ...Object.keys(ref.authority).map(key => value => { value.authority[key] = true; }),
    ...Object.keys(ref.controls).map(key => value => { value.controls[key] = 1; }),
    value => { value.reuse_reconciled = true; },
    value => { value.source_rows_retained = 1; },
    value => { value.official_sos_evidence.automation_authorized = true; },
    value => { value.statutory_evidence.direct_live_page_retrieval_verified = true; },
    value => { value.statutory_evidence.interpretation = "Automation is authorized."; },
    value => { value.official_sos_evidence.layout_version = "005"; },
    value => { delete value.authority.payment; },
    value => { value.unexpected = true; },
  ];
  for (const mutate of mutations) {
    const changed = structuredClone(ref);
    mutate(changed);
    assert.throws(() => validateIlAccessVsReuseReference(changed), /IL access-vs-reuse reference rejected/);
  }
  for (const invalid of [null, [], {}, "IL"]) assert.throws(() => validateIlAccessVsReuseReference(invalid), /IL access-vs-reuse reference rejected/);
  assert.throws(() => verifyIlAccessVsReuseReferenceBytes(Buffer.from(JSON.stringify(ref))), /file bytes drifted/);
  assert.throws(() => verifyIlAccessVsReuseReferenceBytes(Buffer.from("{")), /file bytes drifted/);
  await assert.rejects(loadIlAccessVsReuseReference({ root: `${APP_ROOT}/missing-il-reference` }), /ENOENT/);
});
