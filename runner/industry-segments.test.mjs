import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, rmdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { buildIndustryPlan, loadIndustryConfig, runIndustryPlan, validateIndustryConfig, industryPlanFingerprint } from "./industry-segments.mjs";
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

test("explicit manual sources narrow MN without altering omitted selections", async () => {
  const config = await loadIndustryConfig(), input = {industries:['construction'],states:['MN'],runId:'selection-test'};
  const legacy = buildIndustryPlan(config,input), selected = buildIndustryPlan(config,{...input,sourceIds:['state-mn-contractor-registrations']});
  assert.equal(legacy.taskCount,2);assert.equal(Object.hasOwn(legacy,'sourceIds'),false);
  assert.equal(industryPlanFingerprint(legacy),industryPlanFingerprint(buildIndustryPlan(config,{...input,sourceIds:undefined})));
  assert.deepEqual(selected.tasks.map(t=>t.sourceId),['state-mn-contractor-registrations']);
  assert.notEqual(industryPlanFingerprint(legacy),industryPlanFingerprint(selected));
  for(const sourceIds of [[],null,'state-mn-contractor-registrations',['unknown'],['state-mn-contractor-registrations','state-mn-contractor-registrations'],['state-wa-contractors'],['state-oh-childcare']])assert.throws(()=>buildIndustryPlan(config,{...input,sourceIds}));
  assert.throws(()=>buildIndustryPlan(config,{...input,states:['WI'],sourceIds:['state-mn-contractor-registrations']}),/not applicable/);
});

test("Alaska app plan selects only its publisher and preserves reuse limitations", async () => {
  const config = await loadIndustryConfig();
  const plan = buildIndustryPlan(config, { industries: ["local-business-licenses"], states: ["AK", "PA"], sourceIds: ["state-ak-business-licenses"] });
  assert.equal(plan.tasks.length, 1);
  assert.equal(plan.tasks[0].state, "AK");
  assert.equal(plan.tasks[0].script, "scripts/run-ak-business-app.mjs");
  assert.ok(plan.gaps.some(gap => gap.state === "PA"));
  assert.ok(plan.warnings.some(note => note.includes("retained-manifest")));
  assert.ok(plan.warnings.some(note => note.includes("provisional physical sites")));
  assert.ok(plan.tasks[0].prerequisites.includes("config/connectors/ak-active-business-licenses-app.json"));
});

test("Delaware app plan isolates its publisher and preserves reuse and non-site limitations", async () => {
  const config = await loadIndustryConfig();
  const plan = buildIndustryPlan(config, { industries: ["local-business-licenses"], states: ["DE", "PA"], sourceIds: ["state-de-business-licenses"] });
  assert.equal(plan.tasks.length, 1);
  assert.equal(plan.tasks[0].state, "DE");
  assert.equal(plan.tasks[0].script, "scripts/run-de-business-app.mjs");
  assert.ok(plan.gaps.some(gap => gap.state === "PA"));
  assert.ok(plan.warnings.some(note => note.includes("retained-manifest")));
  assert.ok(plan.warnings.some(note => note.includes("physical sites")));
  assert.ok(plan.tasks[0].prerequisites.includes("config/connectors/de-business-licenses-app.json"));
});

test("selected source run conserves selected tasks and rejects expanded canonical plans", async () => {
  const config=offlineConfig(),plan=buildIndustryPlan(config,{sourceIds:['state-fixture'],runId:'source-selection'});
  await withRunDirectory(async outputRoot=>{
    await assert.rejects(runIndustryPlan(config,{...plan,sourceIds:['ny-fixture']},{outputRoot,executor:async()=>{throw Error('must not launch');}}),/Plan does not match/);
    const launched=[];const result=await runIndustryPlan(config,plan,{outputRoot,executor:async task=>{launched.push(task.sourceId);return {code:0};}});
    assert.deepEqual(launched,['state-fixture']);assert.deepEqual(result.receipt.plan.sourceIds,['state-fixture']);
    assert.equal(result.receipt.source_locks.length,2); // selected source + its executable
    assert.doesNotMatch(JSON.stringify(result.receipt.source_locks),/ny-fixture|tx-fixture/);
  });
});

test('manual source CLI plans only requested source and rejects malformed source flags',async()=>{
  const execute=promisify(execFile),base=['scripts/run-industry-segments.mjs','plan','--industry','construction','--state','MN'];
  const {stdout}=await execute(process.execPath,[...base,'--sources','state-mn-contractor-registrations'],{cwd:APP_ROOT});
  const plan=JSON.parse(stdout);assert.deepEqual(plan.tasks.map(t=>t.sourceId),['state-mn-contractor-registrations']);
  for(const flags of [['--sources',''],['--sources','state-mn-contractor-registrations,'],['--sources','state-mn-contractor-registrations','--sources','state-mn-residential-contractors']])await assert.rejects(execute(process.execPath,[...base,...flags],{cwd:APP_ROOT}));
});

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
    config.sources["missing-fixture"] = { ...config.sources["ny-fixture"], prerequisites: [path.join(parent, "missing-prerequisite.json")] };
    delete config.sources["ny-fixture"];
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

test("independent industry runs cannot acquire an overlapping source until its owner finishes", async () => {
  await withRunDirectory(async (outputRoot, parent) => {
    const config = offlineConfig(1); config.industries.retail = ["state-fixture"];
    const firstPlan = buildIndustryPlan(config, { runId: "source-owner" });
    let started, finish; const begun = new Promise((resolve) => { started = resolve; }), gate = new Promise((resolve) => { finish = resolve; });
    const first = runIndustryPlan(config, firstPlan, { outputRoot, executor: async () => { started(); await gate; return { code: 0 }; } });
    await begun;
    try {
      let calls = 0;
      const second = await runIndustryPlan(config, buildIndustryPlan(config, { runId: "source-conflict" }), { outputRoot: path.join(parent, "second"), executor: async () => { calls += 1; return { code: 0 }; } });
      assert.equal(second.receipt.status, "failed"); assert.equal(calls, 0);
      assert.deepEqual(JSON.parse(await readFile(second.receiptPath)), second.receipt);
    } finally { finish(); }
    assert.equal((await first).receipt.status, "succeeded");
    let calls = 0;
    const third = await runIndustryPlan(config, buildIndustryPlan(config, { runId: "source-next" }), { outputRoot: path.join(parent, "third"), executor: async () => { calls += 1; return { code: 0 }; } });
    assert.equal(third.receipt.status, "succeeded"); assert.equal(calls, 1);
  });
});

test("different config source names cannot bypass exclusion for the same acquisition script", async () => {
  await withRunDirectory(async (outputRoot, parent) => {
    const config = offlineConfig(1); config.industries.retail = ["state-fixture"];
    const alias = structuredClone(config); alias.sources["aliased-source"] = alias.sources["state-fixture"]; delete alias.sources["state-fixture"]; alias.industries.retail = ["aliased-source"];
    let started, finish; const begun = new Promise((resolve) => { started = resolve; }), gate = new Promise((resolve) => { finish = resolve; });
    const first = runIndustryPlan(config, buildIndustryPlan(config, { runId: "script-owner" }), { outputRoot, executor: async () => { started(); await gate; return { code: 0 }; } });
    await begun;
    try {
      let calls = 0;
      const other = await runIndustryPlan(alias, buildIndustryPlan(alias, { runId: "script-alias" }), { outputRoot: path.join(parent, "alias"), executor: async () => { calls += 1; return { code: 0 }; } });
      assert.equal(other.receipt.status, "failed"); assert.equal(calls, 0);
    } finally { finish(); }
    assert.equal((await first).receipt.status, "succeeded");
  });
});

test("one industry configuration cannot name the same executable as multiple source aliases", () => {
  const config = offlineConfig(); config.sources["duplicate-source"] = { ...config.sources["state-fixture"] };
  assert.throws(() => validateIndustryConfig(config), /script|duplicate|alias/i);
});

test("receipt write failure drains active siblings and holds source reservations until terminal persistence recovers", async () => {
  await withRunDirectory(async (outputRoot, parent) => {
    const config = offlineConfig(2); config.industries.retail = ["state-fixture", "ny-fixture"];
    let bothStarted, firstFinish, secondFinish, sawAbort, starts = 0;
    const begun = new Promise((resolve) => { bothStarted = resolve; });
    const firstGate = new Promise((resolve) => { firstFinish = resolve; }), secondGate = new Promise((resolve) => { secondFinish = resolve; });
    const aborted = new Promise((resolve) => { sawAbort = resolve; });
    const first = runIndustryPlan(config, buildIndustryPlan(config, { runId: "persistence-owner" }), { outputRoot, executor: async (task, { signal }) => {
      starts += 1; if (starts === 2) bothStarted();
      signal.addEventListener("abort", sawAbort, { once: true });
      await (task.state === "CA" ? firstGate : secondGate); return { code: 0 };
    } });
    await begun;
    const receiptPath = path.join(outputRoot, "receipt.json"), original = await readFile(receiptPath);
    let obstructed = false;
    try {
      await unlink(receiptPath); await mkdir(receiptPath); obstructed = true; firstFinish();
      let watchdog;
      try { await Promise.race([aborted, new Promise((_, reject) => { watchdog = setTimeout(() => reject(new Error("Expected internal cancellation after persistence failure")), 3000); })]); }
      finally { clearTimeout(watchdog); }
      let calls = 0;
      const conflict = await runIndustryPlan(config, buildIndustryPlan(config, { runId: "persistence-conflict" }), { outputRoot: path.join(parent, "conflict"), executor: async () => { calls += 1; return { code: 0 }; } });
      assert.equal(conflict.receipt.status, "failed"); assert.equal(calls, 0);
    } finally {
      if (obstructed) { await rmdir(receiptPath); await writeFile(receiptPath, original); }
      firstFinish(); secondFinish();
    }
    const result = await first;
    assert.equal(result.receipt.status, "failed"); assert.ok(result.receipt.tasks.every((task) => task.status !== "running"));
    assert.deepEqual(JSON.parse(await readFile(receiptPath)), result.receipt);
    const next = await runIndustryPlan(config, buildIndustryPlan(config, { runId: "persistence-recovered" }), { outputRoot: path.join(parent, "recovered"), executor: async () => ({ code: 0 }) });
    assert.equal(next.receipt.status, "succeeded");
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

test('Texas app plan is a scoped cross-industry sales-tax task, not a nationwide retail claim', async () => {
  const config = await loadIndustryConfig();
  const plan = buildIndustryPlan(config, { industries: ['sales-tax-outlets'], states: ['TX', 'GA'] });
  assert.equal(plan.taskCount, 1); assert.equal(plan.tasks[0].sourceId, 'state-tx-sales-tax');
  assert.equal(plan.tasks[0].state, 'TX');
  assert.equal(plan.tasks[0].script, 'scripts/build-tx-active-sales-tax-permits.mjs');
  assert.ok(plan.gaps.some(gap => gap.state === 'GA'));
  assert.ok(plan.warnings.some(warning => /cross-industry/i.test(warning)));
  assert.ok(plan.warnings.some(warning => /local-review-only/i.test(warning)));
});

test('DC app enrollment isolates publisher scope and preserves cross-industry privacy limits', async () => {
  const config=await loadIndustryConfig();
  const plan=buildIndustryPlan(config,{industries:['local-business-licenses'],states:['DC','MD','VA']});
  assert.equal(plan.taskCount,1);
  assert.equal(plan.tasks[0].sourceId,'state-dc-basic-licenses');
  assert.equal(plan.tasks[0].state,'DC');
  assert.equal(config.sources['state-dc-basic-licenses'].state_filter_supported,false);
  assert.equal(plan.tasks[0].script,'scripts/build-dc-basic-business-licenses.mjs');
  assert.deepEqual(plan.tasks[0].prerequisites,['data/business-baselines/census-zbp/current.json']);
  assert.deepEqual(plan.gaps.map(gap=>gap.state).sort(),['MD','VA']);
  for(const pattern of [/cross-industry/i,/out-of-district/i,/local-review-only/i,/CC BY 4.0/i])assert.ok(plan.warnings.some(warning=>pattern.test(warning)));
  const contract=JSON.parse(await readFile(path.join(APP_ROOT,'config/connectors/dc-basic-business-licenses.json'),'utf8'));
  assert.equal(contract.version,'1.0.2');
  assert.equal(contract.execution_limits.maximum_request_attempts,4);
  assert.equal(contract.execution_limits.request_timeout_ms,60000);
  assert.match(contract.cancellation,/remove only this run/);
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
