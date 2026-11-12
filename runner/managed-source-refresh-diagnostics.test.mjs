import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { executeManagedChild, ManagedOperations } from "./managed-operations.mjs";
import { APP_ROOT } from "./paths.mjs";
import { writeReconciliationReceipt } from "./reconciliation-receipt.mjs";

const alaska = "ak-active-business-licenses";
const privateText = "REDACTME access-token raw-license-8675309 C:\\private\\publisher-records.csv";
const publicationWarning = "Alaska publication did not finalize cleanly; a release or pointer may already exist. Preserve and inspect evidence before another build or resume.";

function syntheticChild(options, stdout, stderr, exitCode = 1) {
  return executeManagedChild({
    ...options,
    script: "--eval",
    args: [`process.stdout.write(${JSON.stringify(stdout)}); process.stderr.write(${JSON.stringify(stderr)}); process.exitCode = ${exitCode};`],
  });
}

async function fixture(t, options = {}) {
  const sourceId = options.sourceId ?? alaska;
  const temporaryParent = path.join(APP_ROOT, "data", "tmp");
  await mkdir(temporaryParent, { recursive: true });
  assert.equal(await realpath(temporaryParent), temporaryParent);
  const root = await mkdtemp(path.join(temporaryParent, "managed-refresh-diagnostic-"));
  const dispatch = new Map([[sourceId, {
    readiness: async () => ({
      sourceId, dispatchAvailable: true,
      plan: { status: "AUTHORIZED", implementation: { builder: "offline-test-fixture" } },
    }),
  }]]);
  const service = new ManagedOperations({
    root, sourceRefreshDispatch: dispatch, executor: options.executor, receiptWriter: options.receiptWriter,
    governedSourceValidator: options.verifier ?? (() => assert.fail("Failed child must never verify or publish.")),
  });
  t.after(async () => {
    await service.close();
    assert.equal(path.dirname(await realpath(root)), temporaryParent);
    await rm(root, { recursive: true });
  });
  return { service, root, sourceId };
}

async function terminal(service, id) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const operation = await service.get(id);
    if (["FAILED", "CANCELLED", "SUCCEEDED"].includes(operation.status)) return operation;
    await delay(15);
  }
  assert.fail("Expected a terminal managed receipt.");
}

test("managed Alaska refresh records the last recognized milestone and discards all child text", async (t) => {
  let launches = 0;
  const { service, root, sourceId } = await fixture(t, {
    executor: (options) => {
      launches++;
      assert.equal(options.sourceId, alaska);
      return syntheticChild(options,
        `Acquired 25,000 Alaska active business licenses.\r\nAcquired 100,000 Alaska license NAICS rows.\n${privateText}\n`,
        `${privateText}\nAlaska build failed. Check arguments and prerequisites, and inspect retained run evidence before retrying; publication may require inspection.\n`,
        7);
    },
  });
  const started = await service.startSourceRefresh({ sourceId });
  const operation = await terminal(service, started.id);
  assert.equal(operation.status, "FAILED");
  assert.deepEqual(operation.result, {
    sourceId, failureCode: "SOURCE_REFRESH_CHILD_FAILED", childExitCode: 7,
    lastBuilderMilestone: "naics-download-progress", receiptIntegrityVerified: false, inspectionRequired: true,
  });
  assert.match(operation.error, /retained staging, and the current pointer before retrying.*NAICS download progress/);
  assert.deepEqual(operation.artifacts, []);
  assert.equal(launches, 1);
  const receipt = await readFile(path.join(root, started.id, "receipt.json"), "utf8");
  for (const representation of [receipt, JSON.stringify(operation)]) {
    assert.doesNotMatch(representation, /REDACTME|raw-license|publisher-records|100,000|stdout|stderr/);
  }
  assert.deepEqual(JSON.parse(receipt).result, operation.result);
  const restored = new ManagedOperations({ root });
  try {
    assert.deepEqual(await restored.get(started.id), operation);
  } finally {
    await restored.close();
  }
});

test("Alaska publication warning receives a separate code while the child descriptor stays private", async (t) => {
  const { service, sourceId } = await fixture(t, {
    executor: (options) => syntheticChild(options,
      "Verifying Alaska staged release.\nPublishing Alaska verified release.\n",
      `${publicationWarning}\n${JSON.stringify({ status: "PUBLICATION_INCOMPLETE", release_id: privateText })}\n`),
  });
  const started = await service.startSourceRefresh({ sourceId });
  const operation = await terminal(service, started.id);
  assert.equal(operation.status, "FAILED");
  assert.equal(operation.result.failureCode, "SOURCE_REFRESH_PUBLICATION_INCOMPLETE");
  assert.equal(operation.result.lastBuilderMilestone, "publication-started");
  assert.match(operation.error, /Inspect the retained release and current pointer/);
  assert.doesNotMatch(JSON.stringify(operation), /REDACTME|release_id|productionPointerChanged/);
});

test("source refresh only recognizes complete allowlisted lines within the input budget", async () => {
  const options = { kind: "source-refresh", sourceId: alaska, signal: new AbortController().signal };
  const execution = await syntheticChild(options,
    `${privateText} Acquired 100,000 Alaska license NAICS rows.\n${"x".repeat(8_192)}\nPublishing Alaska verified release.\n`,
    `${publicationWarning} ${privateText}\n${"x".repeat(4_096)}\n${publicationWarning}\n`);
  assert.deepEqual(execution.refreshDiagnostic, {
    lastMilestone: null, publicationIncomplete: false, childReportedCancellation: false,
  });
  assert.equal(execution.stdout, "");
  assert.doesNotMatch(JSON.stringify(execution), /REDACTME|100,000|stdout.*Publishing/);
  const other = await syntheticChild({ ...options, sourceId: "co-business-registry" }, "Publishing Alaska verified release.\n", publicationWarning + "\n");
  assert.equal(other.refreshDiagnostic, undefined);
  assert.equal(other.stdout, "");
  const descriptor = '{"existing":"governed descriptor — preserved"}\n';
  const exportResult = await syntheticChild({ ...options, kind: "export" }, descriptor, privateText, 0);
  assert.equal(exportResult.stdout, descriptor);
  assert.equal(exportResult.refreshDiagnostic, undefined);
});

test("launch, post-exit verification, and cancellation have distinct safe failure codes", async (t) => {
  for (const [label, failureCode, executor, verifier] of [
    ["launch", "SOURCE_REFRESH_CHILD_LAUNCH_FAILED", () => { throw new Error(privateText); }],
    ["verification", "SOURCE_REFRESH_VERIFICATION_FAILED", async () => ({ code: 0, stdout: privateText }), () => { throw new Error(privateText); }],
    ["cancel", "SOURCE_REFRESH_CHILD_CANCELLED", ({ signal }) => delay(10_000, undefined, { signal })],
  ]) {
    await t.test(label, async (t) => {
      const { service, sourceId } = await fixture(t, { sourceId: "co-business-registry", executor, verifier });
      const started = await service.startSourceRefresh({ sourceId });
      if (label === "cancel") await service.cancel(started.id);
      const operation = await terminal(service, started.id);
      assert.equal(operation.status, label === "cancel" ? "CANCELLED" : "FAILED");
      assert.equal(operation.result.failureCode, failureCode);
      assert.equal(operation.result.inspectionRequired, true);
      assert.doesNotMatch(JSON.stringify(operation), /REDACTME|publisher-records/);
    });
  }
});

test("source refresh terminal receipt write failure does not expose a local path", async (t) => {
  const { promise: attempted, resolve } = Promise.withResolvers();
  const { service, sourceId } = await fixture(t, {
    executor: async () => ({ code: 1 }),
    receiptWriter: async (file, record) => {
      if (record.status === "FAILED") {
        resolve();
        throw new Error(privateText);
      }
      await writeReconciliationReceipt(file, record);
    },
  });
  const started = await service.startSourceRefresh({ sourceId });
  await attempted;
  await assert.rejects(service.get(started.id), {
    message: "Source refresh receipt could not be saved. Inspect retained evidence before retrying.",
  });
});
