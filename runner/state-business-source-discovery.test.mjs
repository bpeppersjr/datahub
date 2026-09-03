import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { validateStateBusinessSourceDiscoveryQueue } from "../scripts/check-state-business-source-discovery.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const QUEUE_PATH = path.join(ROOT, "config", "state-business-source-discovery-queue-4.json");

async function queueFixture() {
  return JSON.parse(await readFile(QUEUE_PATH, "utf8"));
}

test("accepts the governed Queue 4 source-discovery decision", async () => {
  const queue = await queueFixture();
  assert.equal(validateStateBusinessSourceDiscoveryQueue(queue), queue);
});

test("rejects accidental acquisition authorization", async () => {
  const queue = await queueFixture();
  queue.states[0].autonomous_acquisition_authorized = true;
  assert.throws(
    () => validateStateBusinessSourceDiscoveryQueue(queue),
    /ID authorization boundary drifted/,
  );
});

test("rejects coverage arithmetic drift", async () => {
  const queue = await queueFixture();
  queue.states[1].current_coverage.baseline_minus_profiles += 1;
  assert.throws(
    () => validateStateBusinessSourceDiscoveryQueue(queue),
    /NM diagnostic gap does not reconcile/,
  );
});

test("rejects an incomplete production gate set", async () => {
  const queue = await queueFixture();
  queue.states[2].unresolved_gates.pop();
  assert.throws(
    () => validateStateBusinessSourceDiscoveryQueue(queue),
    /ME unresolved gates drifted/,
  );
});
