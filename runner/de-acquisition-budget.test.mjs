import assert from "node:assert/strict";
import test from "node:test";
import { createDeAcquisitionBudget } from "./de-acquisition-budget.mjs";

const fails = (work) => assert.throws(work, (error) => error.code === "DE_ACQUISITION_BUDGET" && error.message === "Delaware acquisition budget is invalid or exceeded.");

test("Delaware budget defaults and exact ceilings, with no mutation on overrun", () => {
  const budget = createDeAcquisitionBudget();
  assert.deepEqual(budget.snapshot().limits, { maximumRequests: 1000, maximumBytes: 1_000_000_000, maximumRows: 1_000_000 });
  for (let index = 0; index < 1000; index++) budget.beforeRequest();
  budget.consumeBytes(1_000_000_000); budget.assertRows(1_000_000);
  const before = budget.snapshot();
  fails(() => budget.beforeRequest()); fails(() => budget.consumeBytes(1)); fails(() => budget.assertRows(1_000_001));
  assert.deepEqual(budget.snapshot(), before);
});

test("Delaware budget lowered limits charge retry attempts and partial decoded consumption", () => {
  const budget = createDeAcquisitionBudget({ maximumRequests: 2, maximumBytes: 10, maximumRows: 3 });
  budget.beforeRequest(); budget.consumeBytes(4); // Failed partial attempt remains charged.
  budget.beforeRequest(); budget.consumeBytes(6);
  budget.assertRows(3); budget.assertRows(3); // Repeated observations do not accumulate.
  budget.consumeBytes(0);
  assert.deepEqual(budget.snapshot().counts, { requests: 2, bytes: 10, rows: 3 });
  fails(() => budget.beforeRequest()); fails(() => budget.consumeBytes(1));
});

test("Delaware budget rejects invalid options without evaluating accessors or disclosing values", () => {
  for (const value of [0, -1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1, "1", undefined, null]) {
    for (const key of ["maximumRequests", "maximumBytes", "maximumRows"]) fails(() => createDeAcquisitionBudget({ [key]: value }));
  }
  for (const options of [null, [], 1, "secret", { unknown: "secret" }, { maximumRequests: 1001 }, { maximumBytes: 1_000_000_001 }, { maximumRows: 1_000_001 }, { [Symbol("secret")]: 1 }]) fails(() => createDeAcquisitionBudget(options));
  let accessed = false;
  fails(() => createDeAcquisitionBudget({ get maximumRows() { accessed = true; return 1; } }));
  assert.equal(accessed, false);
});

test("Delaware budget validates counts before mutation and snapshots are isolated and frozen", () => {
  const options = { maximumBytes: 10 };
  const budget = createDeAcquisitionBudget(options);
  options.maximumBytes = 100;
  const first = budget.snapshot();
  for (const value of [-1, NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1, "1", null, undefined]) {
    fails(() => budget.consumeBytes(value)); fails(() => budget.assertRows(value));
    assert.deepEqual(budget.snapshot(), first);
  }
  assert.throws(() => { first.counts.bytes = 10; }, TypeError);
  assert.throws(() => { first.limits.maximumBytes = 100; }, TypeError);
  assert.throws(() => { budget.consumeBytes = () => {}; }, TypeError);
  budget.consumeBytes(1); budget.assertRows(0);
  assert.equal(first.counts.bytes, 0);
  assert.equal(budget.snapshot().counts.bytes, 1);
  assert.equal(budget.snapshot().limits.maximumBytes, 10);
  assert.notEqual(first.limits, budget.snapshot().limits);
});
