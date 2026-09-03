import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  validateQueue6RankedSelection,
  validateStateBusinessSourceDiscoveryQueue,
} from "../scripts/check-state-business-source-discovery.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const QUEUE_PATH = path.join(ROOT, "config", "state-business-source-discovery-queue-4.json");
const WAVE_2_PATH = path.join(ROOT, "config", "state-business-source-discovery-queue-4-wave-2.json");
const WAVE_3_PATH = path.join(ROOT, "config", "state-business-source-discovery-queue-4-wave-3.json");
const QUEUE_5_PATH = path.join(ROOT, "config", "state-business-source-discovery-queue-5.json");
const QUEUE_6_PATH = path.join(ROOT, "config", "state-business-source-discovery-queue-6.json");

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

test("accepts the governed four-workstream Queue 5 decision", async () => {
  const queue = JSON.parse(await readFile(QUEUE_5_PATH, "utf8"));
  assert.equal(validateStateBusinessSourceDiscoveryQueue(queue), queue);
  assert.deepEqual(queue.scope, ["OH", "NC", "NJ", "VA"]);
  assert.equal(queue.states.every((state) => state.decision === "hold"), true);
  assert.equal(queue.states.some((state) => state.autonomous_acquisition_authorized || state.production_ready), false);
});

test("rejects Queue 5 parallel, evidence, candidate, and extended-authority drift", async () => {
  const parallel = JSON.parse(await readFile(QUEUE_5_PATH, "utf8"));
  parallel.parallel_execution.assignments[0].ran_in_parallel = false;
  assert.throws(() => validateStateBusinessSourceDiscoveryQueue(parallel), /Parallel queue execution evidence drifted/);

  const evidence = JSON.parse(await readFile(QUEUE_5_PATH, "utf8"));
  evidence.states[1].observed_evidence.length = 0;
  assert.throws(() => validateStateBusinessSourceDiscoveryQueue(evidence), /NC observed evidence is incomplete/);

  const candidate = JSON.parse(await readFile(QUEUE_5_PATH, "utf8"));
  candidate.states[2].candidate.price = "Free";
  assert.throws(() => validateStateBusinessSourceDiscoveryQueue(candidate), /NJ candidate identity drifted/);

  const authority = JSON.parse(await readFile(QUEUE_5_PATH, "utf8"));
  authority.states[3].complete_source_acquisition_authorized = true;
  assert.throws(() => validateStateBusinessSourceDiscoveryQueue(authority), /VA extended authorization boundary drifted/);
});

test("rejects Queue 5 date, coverage, URL, and forbidden-operation drift", async () => {
  const date = JSON.parse(await readFile(QUEUE_5_PATH, "utf8"));
  date.observed_at = "2026-02-31";
  assert.throws(() => validateStateBusinessSourceDiscoveryQueue(date), /observation date is invalid/);

  const coverage = JSON.parse(await readFile(QUEUE_5_PATH, "utf8"));
  coverage.states[0].current_coverage.reported_profiles += 1;
  coverage.states[0].current_coverage.baseline_minus_profiles -= 1;
  coverage.states[0].current_coverage.diagnostic_profile_percent = Number(((coverage.states[0].current_coverage.reported_profiles / coverage.states[0].current_coverage.nonemployer_baseline_2023) * 100).toFixed(1));
  assert.throws(() => validateStateBusinessSourceDiscoveryQueue(coverage), /OH pinned coverage evidence drifted/);

  const coverageRelease = JSON.parse(await readFile(QUEUE_5_PATH, "utf8"));
  coverageRelease.coverage_release_id = "national-business-coverage-views-fabricated";
  assert.throws(() => validateStateBusinessSourceDiscoveryQueue(coverageRelease), /coverage release is not pinned/);

  const url = JSON.parse(await readFile(QUEUE_5_PATH, "utf8"));
  url.states[2].official_urls[0] = "https://example.gov/not-the-source";
  assert.throws(() => validateStateBusinessSourceDiscoveryQueue(url), /NJ official evidence URLs drifted/);

  const operation = JSON.parse(await readFile(QUEUE_5_PATH, "utf8"));
  operation.forbidden_operations.pop();
  assert.throws(() => validateStateBusinessSourceDiscoveryQueue(operation), /Parallel queue forbidden operation boundary drifted/);
});

test("accepts the governed four-workstream Queue 6 decision", async () => {
  const queue = JSON.parse(await readFile(QUEUE_6_PATH, "utf8"));
  assert.equal(validateStateBusinessSourceDiscoveryQueue(queue), queue);
  assert.deepEqual(queue.scope, ["MI", "TN", "MA", "AZ"]);
  assert.equal(queue.states.every((state) => state.decision === "hold"), true);
  assert.equal(queue.states.some((state) => state.autonomous_acquisition_authorized || state.production_ready), false);
});

test("rejects Queue 6 provenance, coverage, candidate, URL, and authority drift", async () => {
  const parallel = JSON.parse(await readFile(QUEUE_6_PATH, "utf8"));
  parallel.parallel_execution.assignments[2].worker = "root";
  assert.throws(() => validateStateBusinessSourceDiscoveryQueue(parallel), /Parallel queue execution evidence drifted/);

  const coverage = JSON.parse(await readFile(QUEUE_6_PATH, "utf8"));
  coverage.states[0].current_coverage.coordinate_profiles += 1;
  assert.throws(() => validateStateBusinessSourceDiscoveryQueue(coverage), /MI pinned coverage evidence drifted/);

  const candidate = JSON.parse(await readFile(QUEUE_6_PATH, "utf8"));
  candidate.states[1].candidate.price = "$0";
  assert.throws(() => validateStateBusinessSourceDiscoveryQueue(candidate), /TN candidate identity drifted/);

  const url = JSON.parse(await readFile(QUEUE_6_PATH, "utf8"));
  url.states[2].official_urls[0] = "https://example.gov/not-the-source";
  assert.throws(() => validateStateBusinessSourceDiscoveryQueue(url), /MA official evidence URLs drifted/);

  const authority = JSON.parse(await readFile(QUEUE_6_PATH, "utf8"));
  authority.states[3].row_bearing_preflight_authorized = true;
  assert.throws(() => validateStateBusinessSourceDiscoveryQueue(authority), /AZ extended authorization boundary drifted/);

  const evidence = JSON.parse(await readFile(QUEUE_6_PATH, "utf8"));
  evidence.states[0].observed_evidence = Array(4).fill("fabricated");
  assert.throws(() => validateStateBusinessSourceDiscoveryQueue(evidence), /content digest drifted/);

  const exclusions = JSON.parse(await readFile(QUEUE_6_PATH, "utf8"));
  exclusions.states[0].required_exclusions = Array(4).fill("x");
  assert.throws(() => validateStateBusinessSourceDiscoveryQueue(exclusions), /content digest drifted/);
});

test("proves Queue 6 is the next ranked eligible state wave", async () => {
  const queue = JSON.parse(await readFile(QUEUE_6_PATH, "utf8"));
  const row = (stateAbbreviation, profiles, baseline) => ({
    postal_abbreviation: stateAbbreviation,
    is_50_states_or_dc: true,
    registry_evidence: {
      reported_address_profile_count: profiles,
      coordinate_assigned_profile_count: 0,
      source_profile_counts_by_reported_address_state: {},
    },
    nonemployer_baseline: { nonemployer_establishments: baseline },
  });
  const stateRows = [
    row("OH", 163604, 909227),
    ...queue.states.map((state) => row(state.state_abbreviation, state.current_coverage.reported_profiles, state.current_coverage.nonemployer_baseline_2023)),
    row("MD", 132909, 599050),
  ];
  assert.equal(validateQueue6RankedSelection(queue, stateRows, ["OH"]), queue);

  const reranked = structuredClone(queue);
  [reranked.scope[0], reranked.scope[1]] = [reranked.scope[1], reranked.scope[0]];
  assert.throws(() => validateQueue6RankedSelection(reranked, stateRows, ["OH"]), /not the next ranked eligible state wave/);
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

test("rejects Queue 4 evidence and bounded-action content drift", async () => {
  for (const mutate of [
    (queue) => { queue.states[3].candidate.publisher = "Altered publisher"; },
    (queue) => { queue.states[3].candidate.published_price = "$1"; },
    (queue) => { queue.states[3].official_urls[0] = "https://example.gov/altered"; },
    (queue) => { queue.states[3].required_exclusions[0] = "allow all contacts"; },
    (queue) => { queue.states[3].strongest_bounded_next_action += " Altered."; },
  ]) {
    const queue = JSON.parse(await readFile(WAVE_3_PATH, "utf8"));
    mutate(queue);
    assert.throws(() => validateStateBusinessSourceDiscoveryQueue(queue), /content digest drifted/);
  }
});
