import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdir, rm } from "node:fs/promises";
import { APP_ROOT } from "./paths.mjs";
import { createManagedOperations } from "./managed-operations.mjs";
import { COLLECTION_SUPERVISOR_CANCEL_GRACE_MS } from "./collection-cancellation.mjs";

const operationId = "11111111-1111-4111-8111-111111111111";
const successId = "22222222-2222-4222-8222-222222222222";
const selection = "data/imports/illinois-business-registry/packages/managed-fixture/selection.json";

test("Illinois managed operation is native, closed, private, cancellable, and uses fixed app dispatch", async t => {
  const operationDirectory = path.join(APP_ROOT, "data", "managed-operations", operationId);
  await rm(operationDirectory, { recursive: true, force: true });
  await mkdir(path.dirname(operationDirectory), { recursive: true });
  t.after(() => rm(operationDirectory, { recursive: true, force: true }));

  const isolated = createManagedOperations({ root: `data/managed-operations-il-test-${process.pid}` });
  t.after(async () => { await isolated.close(); await rm(isolated.root, { recursive: true, force: true }); });
  await assert.rejects(isolated.startIllinoisBusinessRegistry({ selection }), /native operation storage/);

  let dispatched, started;
  const running = new Promise(resolve => { started = resolve; });
  const service = createManagedOperations({
    idFactory: () => operationId,
    executor: async options => {
      dispatched = options; started();
      await new Promise(resolve => options.signal.addEventListener("abort", resolve, { once: true }));
      return { code: 1, forcedTerminationRequested: false, stdout: "" };
    },
  });
  t.after(() => service.close());
  for (const input of [{}, { selection, output: "data/elsewhere" }, { selection, url: "https://example.com" }, { selection: "config/connectors/il-business-registry-app.json" }, { selection: "data/imports/illinois-business-registry/packages/bad package/selection.json" }]) {
    await assert.rejects(service.startIllinoisBusinessRegistry(input), { statusCode: 400 });
  }
  const accepted = await service.startIllinoisBusinessRegistry({ selection });
  await running;
  assert.equal(accepted.kind, "il-business-registry");
  assert.deepEqual(dispatched.args, ["--selection", selection]);
  assert.equal(dispatched.script, "scripts/run-il-business-app.mjs");
  assert.equal(dispatched.cancelGraceMs, COLLECTION_SUPERVISOR_CANCEL_GRACE_MS);
  await assert.rejects(service.startIllinoisBusinessRegistry({ selection }), { statusCode: 409 });
  await service.cancel(accepted.id); await service.running.get(accepted.id)?.done;
  const final = await service.get(accepted.id);
  assert.equal(final.status, "CANCELLED");
  assert.deepEqual(final.artifacts, []);
  assert.equal(await service.artifact(accepted.id, "receipt.json"), null);
});

test("Illinois managed operation independently verifies before projecting a successful private result", async t => {
  const operationDirectory = path.join(APP_ROOT, "data", "managed-operations", successId);
  await rm(operationDirectory, { recursive: true, force: true });
  t.after(() => rm(operationDirectory, { recursive: true, force: true }));
  const workerDirectory = path.join(APP_ROOT, "data", "imports", "illinois-business-registry", "operations", "33333333-3333-4333-8333-333333333333");
  const receiptPath = path.join(workerDirectory, "receipt.json");
  const receipt = {
    status: "SUCCEEDED", network_requests: 0, source_pointer_changed: false,
    national_admission_performed: false, export_policy: "local-review-only",
    source: { release_id: "il-fixture-release", source_release_id: "il-fixture-source", coverage: { selected_organizations: 2 } },
  };
  let verification;
  const service = createManagedOperations({
    idFactory: () => successId,
    executor: async () => ({ code: 0, stdout: JSON.stringify({ operationDirectory: workerDirectory, receiptPath, receipt }) }),
    illinoisAppVerifier: async (candidate, options) => { verification = { candidate, signal: options.signal }; return { receipt }; },
  });
  t.after(() => service.close());
  const accepted = await service.startIllinoisBusinessRegistry({ selection });
  await service.running.get(accepted.id)?.done;
  const final = await service.get(accepted.id);
  assert.equal(verification.candidate, receiptPath);
  assert.ok(verification.signal instanceof AbortSignal);
  assert.equal(final.status, "SUCCEEDED");
  assert.deepEqual(final.artifacts, []);
  assert.deepEqual(final.result, {
    sourceId: "il-business-registry", releaseId: "il-fixture-release", sourceReleaseId: "il-fixture-source",
    coverage: { selected_organizations: 2 }, receiptIntegrityVerified: true, inspectionRequired: false,
    localReviewOnly: true, networkRequests: 0, currentPointerWritten: false, nationalAdmissionPerformed: false,
  });
});
