import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import addFormats from "ajv-formats";
import { APP_ROOT } from "./paths.mjs";
import { gatedTransport } from "./fixtures/oh-childcare-gated-transport.mjs";
import { runOhChildcareAppJobWithTransport } from "./oh-childcare-app.mjs";
import { loadOhChildcareRegistryCandidates as load } from "./oh-childcare-registry-adapter.mjs";

async function fixture(change) {
  const transport = await gatedTransport(change);
  let ticks = 0;
  const result = await runOhChildcareAppJobWithTransport({ ...transport.options,
    now: () => new Date(Date.parse("2026-09-08T07:05:00.000Z") + ticks++),
    outputRoot: path.join(APP_ROOT, "data/tmp", `oh-candidates-${randomUUID()}`) });
  return { result, transport };
}
test("Ohio candidates retain source-row identity, observations, separate ZIPs and restricted provenance", async () => {
  const { result, transport } = await fixture(), calls = transport.calls.length;
  const loaded = await load(result.receipt_path), again = await load(result.receipt_path);
  assert.deepEqual(loaded, again); assert.equal(transport.calls.length, calls);
  assert.equal(loaded.contributions.length, 3);
  const ids = new Set();
  for (const candidate of loaded.contributions) {
    assert.deepEqual(candidate.entities.map(e => e.entity_type), ["physical_site", "establishment"]);
    candidate.entities.forEach(e => ids.add(e.entity_id));
    assert.deepEqual(candidate.matchProfiles, []);
    assert.equal(candidate.governedGeographicAssignmentEligible, false);
    assert.equal(candidate.exportPolicy, "local-review-only");
    const p = candidate.evidence.normalized_provenance;
    assert.ok(p.observed_at < loaded.source.observedAt);
    assert.ok(p.observed_at < p.processed_at);
    assert.ok(candidate.assertions.every(a => a.observed_at === p.observed_at && a.first_seen === p.observed_at && a.last_seen === p.observed_at
      && a.valid_from === null && a.valid_to === null && a.export_policy === "local-review-only" && a.value_type !== "geometry"));
    assert.equal(candidate.relationships[0].observed_at, p.observed_at);
    assert.equal(candidate.evidence.processed_at, p.processed_at);
    assert.equal(candidate.evidence.app_receipt_sha256, result.receipt_sha256);
    assert.equal(candidate.evidence.acquisition_manifest_sha256, result.acquisition.sha256);
    assert.equal(candidate.evidence.execution_mode, "injected-test-transport");
    const address = candidate.assertions.find(a => a.predicate === "site.address").value;
    assert.equal(candidate.zipCode, address.zip_code);
    assert.equal(candidate.assertions.some(a => a.predicate === "site.zip-code"), address.zip_code !== null);
    if (p.source_object_id === 1) { assert.equal(address.zip_code, "43215"); assert.equal(address.zip4, "0123"); }
    else { assert.equal(address.zip_code, null); assert.equal(address.zip4, null); }
  }
  assert.equal(ids.size, 6);
  const require = createRequire(import.meta.url), Ajv2020 = createRequire(require.resolve("ajv-formats/package.json"))("ajv/dist/2020.js").default;
  const ajv = new Ajv2020({ strict: false, allErrors: true }); addFormats(ajv);
  for (const [schemaName, field] of [["business-entity", "entities"], ["business-assertion", "assertions"], ["business-relationship", "relationships"]]) {
    const validate = ajv.compile(JSON.parse(await readFile(new URL(`../config/schemas/${schemaName}.schema.json`, import.meta.url), "utf8")));
    for (const c of loaded.contributions) for (const row of c[field]) assert.ok(validate(row), JSON.stringify(validate.errors));
  }
});
test("Ohio candidates conserve quarantine and invalid postal reasons without inventing identifiers", async () => {
  const { result } = await fixture(({ payload }) => {
    for (const f of payload?.features ?? []) {
      if (f.attributes?.objectid === 1) f.attributes.program_number = 1.5;
      if (f.attributes?.objectid === 2) { f.attributes.zip_code = "bad-format"; f.attributes.program_number = null; }
      if (f.attributes?.objectid === 3) f.attributes.zip_code = "00000";
    }
  });
  const loaded = await load(result.receipt_path);
  assert.deepEqual(loaded.counts, { selected: 3, accepted: 2, quarantined: 1 });
  assert.equal(loaded.contributions.length, 2);
  assert.deepEqual(loaded.contributions.map(c => c.evidence.zip_unavailable_reason).sort(), ["invalid-source-zip-format", "invalid-source-zip-placeholder"]);
  const missing = loaded.contributions.find(c => c.evidence.normalized_provenance.source_object_id === 2);
  assert.equal(missing.assertions.some(a => a.predicate === "establishment.external-identifier"), false);
  assert.ok(loaded.contributions.every(c => c.zipCode === null));
});
test("Ohio candidate entry accepts only verified receipts and cancellation, not injected records or public policy", async () => {
  for (const options of [{ records: [] }, { exportPolicy: "public" }, { signal: {} }]) await assert.rejects(load("SECRET", options));
  await assert.rejects(load("SECRET", { signal: AbortSignal.abort() }), { name: "AbortError" });
  const { result } = await fixture(), loaded = await load(result.receipt_path);
  const file = path.join(path.dirname(loaded.source.manifestPath), "normalized.jsonl");
  const lines = (await readFile(file, "utf8")).trimEnd().split("\n").map(JSON.parse);
  lines[0].affiliation.parent_company = "Invented";
  await writeFile(file, lines.map(v => `${JSON.stringify(v)}\n`).join(""));
  await assert.rejects(load(result.receipt_path));
});
