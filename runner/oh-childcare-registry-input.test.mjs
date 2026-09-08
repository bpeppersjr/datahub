import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";
import { gatedTransport } from "./fixtures/oh-childcare-gated-transport.mjs";
import { runOhChildcareAppJobWithTransport } from "./oh-childcare-app.mjs";
import { loadOhChildcareRegistryInput as load } from "./oh-childcare-registry-input.mjs";

async function fixture() {
  const transport = await gatedTransport();
  const result = await runOhChildcareAppJobWithTransport({ ...transport.options,
    outputRoot: path.join(APP_ROOT, "data/tmp", `oh-registry-input-${randomUUID()}`) });
  return { result, transport };
}
test("Ohio verified input conserves exact accepted records and app lineage without acquisition", async () => {
  const { result, transport } = await fixture(), before = transport.calls.length;
  const loaded = await load(result.receipt_path);
  assert.equal(transport.calls.length, before);
  assert.equal(loaded.source.receiptSha256, result.receipt_sha256);
  assert.equal(loaded.source.acquisitionManifestSha256, result.acquisition.sha256);
  assert.equal(loaded.source.executionMode, "injected-test-transport");
  const original = (await readFile(path.join(path.dirname(loaded.source.manifestPath), "normalized.jsonl"), "utf8")).trimEnd().split("\n").map(JSON.parse);
  assert.deepEqual(loaded.records, original);
  assert.equal(loaded.counts.accepted, 3);
  assert.equal(loaded.counts.selected, loaded.counts.accepted + loaded.counts.quarantined);
  assert.equal(loaded.governedGeographicAssignmentEligible, false);
  assert.equal(loaded.identityMatchingApplied, false);
  assert.equal(loaded.publicExportAuthorized, false);
  assert.equal(loaded.nationalReportingIntegrated, false);
  assert.equal(loaded.exportPolicy, "local-review-only");
  assert.ok(loaded.records.every(record => record.provenance.processed_at === loaded.source.processedAt));
});
test("Ohio input rejects overrides and cancellation before accessing files", async () => {
  for (const options of [null, [], { fetchImpl: fetch }, { signal: {} }, { allowExport: true }]) await assert.rejects(load("SECRET", options), /Ohio registry input rejected/);
  await assert.rejects(load("SECRET", { signal: AbortSignal.abort() }), { name: "AbortError" });
});
test("Ohio input rejects modified records and receipt claims", async () => {
  const { result } = await fixture();
  const loaded = await load(result.receipt_path), file = path.join(path.dirname(loaded.source.manifestPath), "normalized.jsonl");
  const raw = await readFile(file), records = loaded.records;
  records[0].physical_address.zip4 = "1234";
  await writeFile(file, records.map(record => `${JSON.stringify(record)}\n`).join(""));
  await assert.rejects(load(result.receipt_path));
  await writeFile(file, raw);
  const receipt = JSON.parse(await readFile(result.receipt_path, "utf8"));
  receipt.public_export_authorized = true;
  await writeFile(result.receipt_path, `${JSON.stringify(receipt)}\n`);
  await assert.rejects(load(result.receipt_path));
});
