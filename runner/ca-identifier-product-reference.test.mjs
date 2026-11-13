import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { loadBroadOfflineConnectorReadinessWave } from "./broad-organization-offline-connector-readiness-wave.mjs";
import { loadCaIdentifierProductReference, preserveSyntheticCaIdentifier, validateCaIdentifierProductReference, verifyCaIdentifierProductReferenceBytes } from "./ca-identifier-product-reference.mjs";
import { APP_ROOT } from "./paths.mjs";

test("CA reference preserves documentary and zero-authority boundaries", async () => {
  const reference = await loadCaIdentifierProductReference();
  assert.equal(reference.decision, "hold");
  for (const key of ["current_schema_compatibility_verified", "connector_ready", "acquisition_authorized"]) assert.equal(reference[key], false);
  for (const key of ["required_source_files", "source_records_acquired", "broad_layer_gaps_resolved"]) assert.equal(reference[key], 0);
  assert.ok(Object.values(reference.authority).every(value => value === false));
  assert.equal(reference.controls.source_files_retained, 0);
  assert.match(reference.evidence.bizfile.identifier_observations, /12 characters beginning with B/);
  assert.match(reference.evidence.manual.boundary, /Pages 133-134 concern UCC/);
  assert.match(reference.evidence.manual.boundary, /full PDF was not inspected/);
});

test("CA remains absent from the readiness wave and its historical assessment is unchanged", async () => {
  const wave = await loadBroadOfflineConnectorReadinessWave();
  assert.ok(!wave.states.some(row => row.state === "CA"));
  const prior = await readFile(path.join(APP_ROOT, "config/state-business-source-assessments/ca-2026-10-03.json"));
  assert.equal(createHash("sha256").update(prior).digest("hex"), "75ca6ba47e63232f7eda5c18ae73ff614cfefa26288e0814f5d17b3cfaf02a9f");
  assert.equal(JSON.parse(prior).decision, "hold");
});

test("CA reference rejects content, authority, citation and bytes drift", async () => {
  const reference = await loadCaIdentifierProductReference();
  const mutations = [
    value => { value.decision = "ready"; },
    value => { value.state = "CO"; },
    value => { value.current_schema_compatibility_verified = true; },
    value => { value.connector_ready = true; },
    value => { value.acquisition_authorized = true; },
    value => { value.source_records_acquired = 1; },
    value => { value.controls.source_files_retained = 1; },
    ...Object.keys(reference.authority).map(key => value => { value.authority[key] = true; }),
    value => { delete value.authority.order; },
    value => { value.evidence.bizfile.url = "https://example.com/"; },
    value => { value.evidence.manual.boundary = "Full PDF inspected"; },
    value => { value.unresolved_gates.pop(); },
    value => { value.extra = true; },
  ];
  for (const mutate of mutations) {
    const changed = structuredClone(reference);
    mutate(changed);
    assert.throws(() => validateCaIdentifierProductReference(changed), /CA identifier-product reference rejected/);
  }
  for (const invalid of [null, [], {}, "CA"]) assert.throws(() => validateCaIdentifierProductReference(invalid), /CA identifier-product reference rejected/);
  assert.throws(() => verifyCaIdentifierProductReferenceBytes(Buffer.from(JSON.stringify(reference))), /file bytes drifted/);
  assert.throws(() => verifyCaIdentifierProductReferenceBytes(Buffer.from("{")), /file bytes drifted/);
  await assert.rejects(loadCaIdentifierProductReference({ root: `${APP_ROOT}/missing-ca-reference` }), /ENOENT/);
});

test("synthetic identifiers remain exact opaque nonblank strings", () => {
  for (const value of ["B12345678901", "000012345", "  000012345  ", "any opaque value"]) assert.equal(preserveSyntheticCaIdentifier(value), value);
  for (const value of [12345, 0, null, undefined, {}, "", " \t\n"]) assert.throws(() => preserveSyntheticCaIdentifier(value), /nonblank string/);
});
