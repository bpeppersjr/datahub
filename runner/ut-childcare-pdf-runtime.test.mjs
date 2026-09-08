import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile, rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {APP_ROOT} from './paths.mjs';
import {runPdfDecoderProcess} from './pdf-decoder-process.mjs';
import {runUtChildcarePdfPrerequisite, retainUtChildcarePdfPrerequisite} from './ut-childcare-pdf-runtime.mjs';

const sha256 = '85af831248bac41ffae8eef23145ce8935d58d31c66ce92caa3c99519358e8fa';
const input = {sourcePath: `data/business-sources/ut-childcare/assessments/${sha256}/source.pdf`,
  sourceSha256: sha256, reportEdition: 'September 2026'};
test('UT PDF CLI help and malformed options require no runtime or acquisition', () => {
  const cli = path.join(APP_ROOT, 'scripts/process-ut-childcare-pdf.mjs');
  assert.equal(spawnSync(process.execPath, [cli, '--help'], {encoding: 'utf8', timeout: 5000}).status, 0);
  assert.equal(spawnSync(process.execPath, [cli, '--unknown'], {encoding: 'utf8', timeout: 5000}).status, 1);
});
test('UT app PDF wrapper rejects unapproved settings and pre-cancel without runtime work', async () => {
  for (const options of [{}, {...input, python: 'elsewhere'}, {...input, reportEdition: 'arbitrary'},
    {...input, sourceSha256: 'bad'}, {...input, sourcePath: '../../outside'}]) {
    await assert.rejects(runUtChildcarePdfPrerequisite(options), /prerequisite rejected/);
  }
  await assert.rejects(runUtChildcarePdfPrerequisite({...input, signal: AbortSignal.abort()}), {name: 'AbortError'});
  await assert.rejects(retainUtChildcarePdfPrerequisite({}), /prerequisite rejected/);
});
test('UT app-owned runtime validates and retains internal observations without acquisition',
  {skip: process.env.DATAHUB_TEST_APP_PDF !== '1'}, async () => {
    const result = await runUtChildcarePdfPrerequisite(input);
    assert.equal(result.selected.selected_rows, 422);
    assert.equal(result.selected.total_rows, 1961);
    assert.equal(result.receipt.runtime.python_version, '3.14.7');
    assert.equal(/codex/i.test(result.receipt.runtime.base_prefix), false);
    assert.equal(result.receipt.resource_guard.backend, 'windows-job-process-commit');
    assert.equal(result.receipt.process.exitCode, 0);
    assert.equal(result.receipt.process.stderrBytes, 0);
    assert.equal(Object.values(result.receipt.claims).every(value => value === false), true);
    await assert.rejects(retainUtChildcarePdfPrerequisite(structuredClone(result)), /prerequisite rejected/);
    const saved = await retainUtChildcarePdfPrerequisite(result);
    try {
      const receipt = JSON.parse(await readFile(saved.path, 'utf8'));
      const artifact = await readFile(path.join(path.dirname(saved.path), receipt.artifact.path));
      assert.equal(createHash('sha256').update(artifact).digest('hex'), receipt.artifact.sha256);
      assert.equal(receipt.export_policy, 'internal-prerequisite-only');
      assert.equal(JSON.parse(artifact).observations.length, 422);
      await assert.rejects(retainUtChildcarePdfPrerequisite(result), /prerequisite rejected/);
    } finally {
      await rm(path.dirname(saved.path), {recursive: true, force: true});
    }
  });
test('UT actual managed PDF decoder cancels and closes without exposing source payload',
  {skip: process.env.DATAHUB_TEST_APP_PDF !== '1'}, async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 300);
    try {
      await assert.rejects(runPdfDecoderProcess({
        executable: path.join(APP_ROOT, 'data/runtimes/pdf-decoder-1/Scripts/python.exe'),
        args: ['-B', '-E', '-s', path.join(APP_ROOT, 'scripts/decode-ut-childcare-pdf.py'), '--managed',
          path.join(APP_ROOT, input.sourcePath), sha256, input.reportEdition],
        cwd: APP_ROOT, env: {SystemRoot: process.env.SystemRoot, TEMP: path.join(APP_ROOT, 'data/tmp'), TMP: path.join(APP_ROOT, 'data/tmp')},
        signal: controller.signal,
      }), error => {
        assert.equal(error.code, 'ABORTED');
        assert.ok(error.evidence.elapsedMs < 10_000);
        assert.throws(() => process.kill(error.evidence.pid, 0), {code: 'ESRCH'});
        assert.equal(Object.hasOwn(error, 'stdout'), false);
        return true;
      });
    } finally { clearTimeout(timer); }
  });
