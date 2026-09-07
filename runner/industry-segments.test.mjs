import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { buildIndustryPlan, loadIndustryConfig, runIndustryPlan, validateIndustryConfig } from "./industry-segments.mjs";
import { APP_ROOT, assertInsideApp } from "./paths.mjs";

function offlineConfig(concurrency = 2) {
  return {
    version: 1,
    max_concurrency: concurrency,
    states: ["CA", "NY", "TX"],
    industries: { retail: ["state-fixture", "ny-fixture", "tx-fixture"] },
    sources: {
      "state-fixture": {
        script: "scripts/build-ca-abc-active-license-sites.mjs",
        scope: "state",
        states: ["CA"],
        state_filter_supported: false,
        prerequisites: [],
      },
      "ny-fixture": { script: "scripts/build-ny-retail-food-stores.mjs", scope: "state", states: ["NY"], state_filter_supported: false, prerequisites: [] },
      "tx-fixture": { script: "scripts/build-tx-active-sales-tax-permits.mjs", scope: "state", states: ["TX"], state_filter_supported: false, prerequisites: [] },
    },
  };
}

async function withRunDirectory(callback) {
  const temporaryRoot = assertInsideApp(path.join(APP_ROOT, "data", "tmp"));
  await mkdir(temporaryRoot, { recursive: true });
  const parent = assertInsideApp(await mkdtemp(path.join(temporaryRoot, "industry-segment-test-")));
  try { return await callback(path.join(parent, "run"), parent); }
  finally { await rm(assertInsideApp(parent), { recursive: true, force: true }); }
}

test("plan deduplicates shared national sources and does not claim state filtering", async () => {
  const config = await loadIndustryConfig();
  const plan = buildIndustryPlan(config, { industries: ["retail-consumer", "health-care"], states: ["NY", "TX"] });
  assert.equal(plan.tasks.filter((task) => task.sourceId === "national-snap-retailers").length, 1);
  assert.ok(plan.warnings.some((warning) => warning.includes("without a state filter")));
});

test("three state tasks actually overlap with concurrency two and retain a failed task", async () => {
  const config = offlineConfig(2);
  const plan = buildIndustryPlan(config);
  await withRunDirectory(async (outputRoot) => {
    let active = 0; let maximum = 0; let launched = 0; let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const watchdog = setTimeout(release, 2000);
    try {
      const result = await runIndustryPlan(config, plan, { outputRoot, executor: async (task) => {
        active += 1; launched += 1; maximum = Math.max(maximum, active);
        if (launched === 2) release();
        await gate;
        active -= 1;
        return { code: task.state === "NY" ? 7 : 0 };
      } });
      assert.equal(maximum, 2, "must overlap two tasks and never exceed configured concurrency");
      assert.equal(launched, 3);
      assert.equal(result.receipt.status, "failed");
      assert.equal(result.receipt.tasks.find((task) => task.state === "NY").status, "failed");
      assert.equal(result.receipt.tasks.filter((task) => task.status === "succeeded").length, 2);
      assert.deepEqual(JSON.parse(await readFile(result.receiptPath, "utf8")), result.receipt);
    } finally { clearTimeout(watchdog); release(); }
  });
});

test("every prerequisite is checked before any executor starts", async () => {
  await withRunDirectory(async (outputRoot, parent) => {
    const config = offlineConfig();
    config.sources["state-fixture"].states = ["CA"];
    config.sources["missing-fixture"] = { ...config.sources["state-fixture"], states: ["NY"], prerequisites: [path.join(parent, "missing-prerequisite.json")] };
    config.industries.retail = ["state-fixture", "missing-fixture"];
    const plan = buildIndustryPlan(config);
    let calls = 0;
    const result = await runIndustryPlan(config, plan, { outputRoot, executor: async () => { calls += 1; return { code: 0 }; } });
    assert.equal(calls, 0);
    assert.equal(result.receipt.status, "failed");
    assert.match(result.receipt.tasks.find((task) => task.source_id === "missing-fixture").error, /prerequisite is missing/);
    assert.equal(result.receipt.tasks.find((task) => task.source_id === "state-fixture").status, "cancelled");
  });
});

test("duplicate run refuses to overwrite the original receipt or execute again", async () => {
  await withRunDirectory(async (outputRoot) => {
    const config = offlineConfig();
    const plan = buildIndustryPlan(config);
    let calls = 0;
    const options = { outputRoot, executor: async () => { calls += 1; return { code: 0 }; } };
    const first = await runIndustryPlan(config, plan, options);
    const receiptBytes = await readFile(first.receiptPath);
    await assert.rejects(runIndustryPlan(config, plan, options), /EEXIST|exist|already/i);
    assert.equal(calls, plan.tasks.length);
    assert.deepEqual(await readFile(first.receiptPath), receiptBytes);
  });
});

test("a mutated executable in a plan is rejected before execution", async () => {
  await withRunDirectory(async (outputRoot) => {
    const config = offlineConfig();
    const plan = buildIndustryPlan(config);
    plan.tasks[0].script = "scripts/build-ny-retail-food-stores.mjs";
    let calls = 0;
    await assert.rejects(runIndustryPlan(config, plan, { outputRoot, executor: async () => { calls += 1; return { code: 0 }; } }), /Plan does not match/);
    assert.equal(calls, 0);
  });
});

test("cancellation retains a receipt and launches no subsequent tasks", async () => {
  await withRunDirectory(async (outputRoot) => {
    const config = offlineConfig(2);
    const plan = buildIndustryPlan(config);
    const controller = new AbortController();
    const launched = [];
    const result = await runIndustryPlan(config, plan, { outputRoot, signal: controller.signal, executor: async (task) => {
      launched.push(task.id);
      controller.abort();
      return { code: 0 };
    } });
    assert.deepEqual(launched, [plan.tasks[0].id]);
    assert.equal(result.receipt.status, "cancelled");
    for (const task of plan.tasks.slice(1)) assert.equal(result.receipt.tasks.find((row) => row.task_id === task.id).status, "cancelled");
    assert.deepEqual(JSON.parse(await readFile(result.receiptPath, "utf8")), result.receipt);
  });
});

test("an empty task plan fails and preserves explicit state coverage gaps", async () => {
  await withRunDirectory(async (outputRoot) => {
    const config = offlineConfig();
    config.sources["state-fixture"].states = ["CA"];
    config.industries.retail = ["state-fixture"];
    const plan = buildIndustryPlan(config, { states: ["TX"] });
    assert.equal(plan.tasks.length, 0);
    assert.equal(plan.gaps.length, 1);
    let calls = 0;
    const result = await runIndustryPlan(config, plan, { outputRoot, executor: async () => { calls += 1; return { code: 0 }; } });
    assert.equal(calls, 0);
    assert.equal(result.receipt.status, "failed");
    assert.match(result.receipt.error, /no executable tasks/);
    assert.deepEqual(result.receipt.plan.gaps, plan.gaps);
    assert.equal(result.receipt.plan.gaps[0].state, "TX");
  });
});

test("invalid config is rejected before execution", () => {
  assert.throws(() => validateIndustryConfig({ version: 1, max_concurrency: 11, states: [], industries: {}, sources: {} }), /max_concurrency/);
});

test("IRS standalone plan preserves cross-industry and filing-address limitations without state-filter claims", async () => {
  const config = await loadIndustryConfig();
  const plan = buildIndustryPlan(config, { industries: ['tax-exempt-organizations'], states: ['NY', 'CA'] });
  assert.equal(plan.taskCount, 1);
  assert.equal(plan.tasks[0].sourceId, 'national-irs-eo-bmf');
  assert.equal(plan.tasks[0].scope, 'national');
  assert.equal(plan.tasks[0].script, 'scripts/build-irs-eo-bmf.mjs');
  assert.deepEqual(plan.tasks[0].prerequisites, ['data/business-baselines/census-zbp/current.json']);
  assert.equal(plan.gaps.length, 2);
  assert.ok(plan.warnings.some((warning) => /cross-industry/i.test(warning) && /not proof/i.test(warning)));
  assert.ok(plan.warnings.some((warning) => /without a state filter/.test(warning)));
  assert.ok(plan.warnings.some((warning) => /raw.*internal/i.test(warning)));
});

test("source limitation notes are validated and preserved in the durable run plan", async () => {
  const config = offlineConfig();
  config.sources['state-fixture'].coverage_notes = ['License evidence only; not proof of operations.'];
  const plan = buildIndustryPlan(config);
  assert.ok(plan.warnings.includes('state-fixture: License evidence only; not proof of operations.'));
  await withRunDirectory(async (outputRoot) => {
    const result = await runIndustryPlan(config, plan, { outputRoot, executor: async () => ({ code: 0 }) });
    assert.deepEqual(result.receipt.plan.warnings, plan.warnings);
    assert.deepEqual(JSON.parse(await readFile(path.join(outputRoot, 'plan.json'), 'utf8')).warnings, plan.warnings);
  });
  config.sources['state-fixture'].coverage_notes = [null];
  assert.throws(() => validateIndustryConfig(config), /coverage_notes/);
  config.sources['state-fixture'].coverage_notes = [''];
  assert.throws(() => validateIndustryConfig(config), /coverage_notes/);
  config.sources['state-fixture'].coverage_notes = ['x'.repeat(501)];
  assert.throws(() => validateIndustryConfig(config), /coverage_notes/);
});

test("a plan cannot drop source policy limitations before execution", async () => {
  const config = offlineConfig();
  config.sources['state-fixture'].coverage_notes = ['Filing address only; not a verified business site.'];
  const plan = buildIndustryPlan(config);
  plan.warnings = [];
  await withRunDirectory(async (outputRoot) => {
    let calls = 0;
    await assert.rejects(runIndustryPlan(config, plan, { outputRoot, executor: async () => { calls += 1; return { code: 0 }; } }), /Plan does not match/);
    assert.equal(calls, 0);
  });
});
