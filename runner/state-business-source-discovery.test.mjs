import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { validateStateBusinessSourceDiscoveryQueue } from "../scripts/check-state-business-source-discovery.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const QUEUE_PATH = path.join(ROOT, "config", "state-business-source-discovery-queue-4.json");
const WAVE_2_PATH = path.join(ROOT, "config", "state-business-source-discovery-queue-4-wave-2.json");
const WAVE_3_PATH = path.join(ROOT, "config", "state-business-source-discovery-queue-4-wave-3.json");

async function queueFixture() {
  return JSON.parse(await readFile(QUEUE_PATH, "utf8"));
}

test("accepts the governed Queue 4 source-discovery decision", async () => {
  const queue = await queueFixture();
  assert.equal(validateStateBusinessSourceDiscoveryQueue(queue), queue);
});

test("accepts the governed Queue 4 wave 2 decision", async () => {
  const queue = JSON.parse(await readFile(WAVE_2_PATH, "utf8"));
  assert.equal(validateStateBusinessSourceDiscoveryQueue(queue), queue);
});

test("accepts the final wave's bounded connector decisions", async () => {
  const queue = JSON.parse(await readFile(WAVE_3_PATH, "utf8"));
  assert.equal(validateStateBusinessSourceDiscoveryQueue(queue), queue);
  assert.deepEqual(
    queue.states.filter((state) => state.bounded_connector_implementation_authorized).map((state) => state.state_abbreviation),
    ["DC", "AK"],
  );
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

test("rejects unsafe final-wave stream accounting and acquisition language", async () => {
  const queue = JSON.parse(await readFile(WAVE_3_PATH, "utf8"));
  queue.controls.bounded_source_stream_bytes_read = Number.MAX_SAFE_INTEGER;
  assert.throws(
    () => validateStateBusinessSourceDiscoveryQueue(queue),
    /bounded source-stream accounting drifted/,
  );

  const actionQueue = JSON.parse(await readFile(WAVE_3_PATH, "utf8"));
  actionQueue.states[4].strongest_bounded_next_action = "Download the full source and promote it to production.";
  assert.throws(
    () => validateStateBusinessSourceDiscoveryQueue(actionQueue),
    /AK next action omits the full-acquisition authorization boundary/,
  );
});
