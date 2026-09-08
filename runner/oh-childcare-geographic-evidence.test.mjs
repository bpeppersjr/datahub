import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";
import { gatedTransport } from "./fixtures/oh-childcare-gated-transport.mjs";
import { runOhChildcareAppJobWithTransport } from "./oh-childcare-app.mjs";
import { loadOhChildcareGeographicInput as load, validateOhChildcareGeographicEvidence as validate,
  verifyOhChildcareGeographicMembership as verify } from "./oh-childcare-geographic-evidence.mjs";

async function fixture(allMissing = false) {
  const f = await gatedTransport(({ payload }) => {
    if (allMissing) for (const feature of payload?.features ?? []) if (feature.attributes?.program_name) feature.attributes.zip_code = null;
  });
  const job = await runOhChildcareAppJobWithTransport({ ...f.options,
    outputRoot: path.join(APP_ROOT, "data/tmp", `oh-geographic-${randomUUID()}`) });
  return load(job.receipt_path);
}
test("Ohio geographic rows preserve points and ZIPs but prohibit identity and boundary assignment", async () => {
  const input = await fixture();
  const proof = await verify(input.rows, input.verificationContext);
  assert.equal(proof.rows, 3); assert.equal(proof.withSourceZip, 1); assert.equal(proof.withoutSourceZip, 2);
  assert.equal(proof.source.receiptSha256, input.source.receiptSha256);
  for (const row of input.rows) {
    assert.deepEqual(validate(row, input.verificationContext), row);
    assert.equal(row.governed_geographic_assignment_eligible, false);
    assert.equal(row.identity_matching_eligible, false);
    assert.equal(row.export_policy, "local-review-only");
    assert.equal(row.zip_code, row.address.zip_code);
    assert.equal(row.observed_at, row.evidence.normalized_provenance.observed_at);
    assert.equal(row.evidence.execution_mode, "injected-test-transport");
  }
  const point = input.rows.find(row => row.zip_code !== null);
  assert.deepEqual(point.location, { latitude: 40, longitude: -83 });
  assert.equal(point.address.zip4, "0123");
});
test("Ohio geography rejects forged contexts, mutated expected rows, rehashed substitutions and duplicates", async () => {
  const input = await fixture(), row = input.rows[0];
  assert.throws(() => validate(row, {}), /trusted input context/);
  assert.throws(() => validate(row, structuredClone(input.verificationContext)), /trusted input context/);
  for (const change of [r => { r.governed_geographic_assignment_eligible = true; }, r => { r.names[0].raw = "Invented"; },
    r => { r.evidence.app_receipt_sha256 = "a".repeat(64); }, r => { r.evidence.assertions_sha256 = "b".repeat(64); },
    r => { r.source.source_id = "tn-dhs-active-childcare-centers"; }, r => { r.address.zip4 = "9999"; }, r => { r.county_fips = "39049"; }]) {
    const altered = structuredClone(row); change(altered); assert.throws(() => validate(altered, input.verificationContext), /source snapshot/);
  }
  await assert.rejects(verify(input.rows.slice(1), input.verificationContext), /membership/);
  await assert.rejects(verify([input.rows[0], input.rows[0], input.rows[2]], input.verificationContext), /duplicate/);
  input.rows[0].names[0].raw = "Mutated exposed row";
  assert.throws(() => validate(input.rows[0], input.verificationContext), /source snapshot/);
});
test("Ohio geography conserves all-null ZIP cohorts and checks retained dependencies at verification end", async () => {
  const input = await fixture(true);
  const proof = await verify(input.rows, input.verificationContext);
  assert.equal(proof.withSourceZip, 0); assert.equal(proof.withoutSourceZip, 3);
  await assert.rejects(verify(input.rows, input.verificationContext, { signal: AbortSignal.abort() }), { name: "AbortError" });
  await assert.rejects(load("SECRET", { records: [] }));
  const file = path.join(path.dirname(input.source.manifestPath), "normalized.jsonl");
  const raw = await readFile(file); await writeFile(file, Buffer.concat([raw, Buffer.from("\n")]));
  await assert.rejects(verify(input.rows, input.verificationContext));
});
