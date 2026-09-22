import assert from "node:assert/strict";
import test from "node:test";
import { getNyBusinessRegistryRefreshReadiness } from "./ny-business-registry-refresh-readiness.mjs";

test("New York refresh readiness is deterministic, evidence-bound, complete, and held", async () => {
  const first = await getNyBusinessRegistryRefreshReadiness();
  const second = await getNyBusinessRegistryRefreshReadiness();
  assert.deepEqual(first, second);
  assert.equal(first.sourceId, "ny-business-registry");
  assert.equal(first.readinessStatus, "HOLD");
  assert.equal(first.dispatchAvailable, false);
  assert.equal(first.freshAcquisitionAuthorized, false);
  assert.equal(first.autonomousAcquisitionAuthorized, false);
  assert.equal(first.productionPointerChangeAuthorized, false);
  assert.equal(first.plan.networkRequestCount, 0);
  assert.equal(first.plan.allocationCount, 0);
  assert.equal(first.plan.operationCreated, false);
  assert.equal(first.plan.evidence.length, 6);
  assert.ok(first.plan.evidence.every(item => /^[a-f0-9]{64}$/.test(item.sha256)));
  assert.equal(first.observedAssessment.currentRetainedReleaseMatchesAssessment, true);
  assert.equal(first.observedAssessment.catalogRetainedReleaseMatchesAssessment, false);
  assert.equal(first.retainedRelease.releaseId, "ny-business-registry-20260903-005209518Z-d9e3551f");
  assert.equal(first.retainedRelease.sourceActiveExtractRecords, 4273072);
  assert.equal(first.retainedRelease.organizationsPublished, 4273072);
  assert.equal(first.retainedRelease.quarantinedSourceRecords, 0);
  assert.equal(first.retainedRelease.artifactCount, 22);
});
