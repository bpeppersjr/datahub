import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {mkdtemp, readFile, rm, readdir} from 'node:fs/promises';
import {APP_ROOT} from './paths.mjs';
import {buildIndustryPlan, loadIndustryConfig, runIndustryPlan} from './industry-segments.mjs';
import {verifyUtChildcareAppJob} from './ut-childcare-app.mjs';
import {setTimeout as delay} from 'node:timers/promises';

const hash = value => createHash('sha256').update(value).digest('hex');
test('UT actual industry executor passes output and run identity to offline adoption without changing retained evidence',
  {skip: process.env.DATAHUB_TEST_APP_PDF !== '1', timeout: 180_000}, async () => {
    const root = await mkdtemp(path.join(APP_ROOT, 'data/tmp/ut-managed-test-'));
    const retained = path.join(APP_ROOT, 'data/business-sources/ut-childcare/normalized/6aaca68b-f0cc-4ada-a301-0ada860574b8');
    const files = ['manifest.json', 'normalized.jsonl', 'summary.json'];
    const original = await Promise.all(files.map(async file => hash(await readFile(path.join(retained, file)))));
    try {
      const config = await loadIndustryConfig();
      const plan = buildIndustryPlan(config, {industries: ['childcare'], states: ['UT'],
        sourceIds: ['state-ut-childcare-centers-retained'], runId: randomUUID()});
      const result = await runIndustryPlan(config, plan, {outputRoot: path.join(root, 'industry-segments', 'runs', plan.runId)});
      assert.equal(result.receipt.status, 'succeeded');
      assert.equal(result.receipt.tasks.length, 1);
      const task = result.receipt.tasks[0];
      assert.equal(task.status, 'succeeded');
      assert.equal(task.source_id, 'state-ut-childcare-centers-retained');
      const log = await readFile(path.join(APP_ROOT, task.log));
      assert.equal(hash(log), result.receipt.log_sha256[task.task_id]);
      const printed = JSON.parse(log.toString('utf8').trim());
      const verified = await verifyUtChildcareAppJob(printed.receiptPath);
      assert.equal(verified.receipt_sha256, printed.receipt_sha256);
      assert.equal(verified.receipt.industry_run_id, plan.runId);
      assert.equal(verified.receipt.execution_mode, 'retained-local-adoption');
      assert.equal(verified.receipt.status, 'SUCCEEDED');
      assert.deepEqual(await Promise.all(files.map(async file => hash(await readFile(path.join(retained, file))))), original);
      const lockDirectory = path.join(APP_ROOT, 'data/industry-segments/source-locks');
      for (const file of await readdir(lockDirectory)) {
        if (!file.endsWith('.json')) continue;
        const lock = JSON.parse(await readFile(path.join(lockDirectory, file), 'utf8'));
        assert.notEqual(lock.run_id, plan.runId, 'completed task must release its source reservations');
      }
    } finally {
      // Only this test's freshly allocated directory is removed; retained releases are untouched.
      assert.equal(path.dirname(root), path.join(APP_ROOT, 'data/tmp'));
      assert.ok(path.basename(root).startsWith('ut-managed-test-'));
      await rm(root, {recursive: true, force: true});
    }
  });

test('UT real industry IPC cancellation drains its worker and persists linked cancellation evidence',
  {skip: process.env.DATAHUB_TEST_APP_PDF !== '1', timeout: 120_000}, async () => {
    const root = await mkdtemp(path.join(APP_ROOT, 'data/tmp/ut-managed-cancel-'));
    const controller = new AbortController();
    let running;
    try {
      const config = await loadIndustryConfig();
      const plan = buildIndustryPlan(config, {industries: ['childcare'], states: ['UT'],
        sourceIds: ['state-ut-childcare-centers-retained'], runId: randomUUID()});
      const outputRoot = path.join(root, 'industry-segments', 'runs', plan.runId);
      const jobs = path.join(outputRoot, 'state-ut-childcare-centers-retained-UT', 'jobs');
      running = runIndustryPlan(config, plan, {outputRoot, signal: controller.signal});
      let terminal = false;
      void running.then(() => {terminal = true;}, () => {terminal = true;});
      let appId;
      const deadline = Date.now() + 30_000;
      while (!appId && !terminal && Date.now() < deadline) {
        try {
          for (const id of await readdir(jobs)) {
            await readFile(path.join(jobs, id, 'start.json'));
            appId = id;
            break;
          }
        } catch (error) {if (error.code !== 'ENOENT') throw error;}
        if (!appId) await delay(20);
      }
      assert.ok(appId, 'app must persist start evidence before test requests cancellation');
      controller.abort();
      const result = await running;
      assert.equal(result.receipt.status, 'cancelled');
      assert.equal(result.receipt.tasks[0].status, 'cancelled');
      assert.equal(result.receipt.tasks[0].forcedTerminationRequested, false);
      const app = JSON.parse(await readFile(path.join(jobs, appId, 'receipt.json'), 'utf8'));
      assert.equal(app.status, 'CANCELLED');
      assert.equal(app.industry_run_id, plan.runId);
      assert.equal(app.output_state, 'inspection-required');
      assert.ok(!(await readdir(path.dirname(jobs))).includes('.owner.lock'));
    } finally {
      controller.abort();
      if (running) await running.catch(() => {});
      assert.equal(path.dirname(root), path.join(APP_ROOT, 'data/tmp'));
      assert.ok(path.basename(root).startsWith('ut-managed-cancel-'));
      await rm(root, {recursive: true, force: true});
    }
  });
