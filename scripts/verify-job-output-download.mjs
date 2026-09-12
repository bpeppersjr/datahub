import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { _electron } from 'playwright';
import electronPath from 'electron';

const root = process.cwd();
await mkdir(path.join(root, 'data', 'tmp'), { recursive: true });
const runtime = await mkdtemp(path.join(root, 'data', 'tmp', 'download-verification-'));
await mkdir(path.join(runtime, 'data', 'outputs'), { recursive: true });
const output = { result: { data: [{ name: 'Synthetic local verification', count: 2 }] } };
const now = new Date().toISOString();
const jobs = ['available', 'missing'].map(id => ({ id, name: `Download ${id} fixture`, type: 'transform', enabled: false, status: 'completed', lastRunId: id, config: {}, createdAt: now, updatedAt: now }));
const runs = jobs.map(job => ({ id: job.id, jobId: job.id, status: 'completed', outputPath: `data/outputs/${job.id}.json`, queuedAt: now, startedAt: now, completedAt: now, logs: [], progress: 100 }));
await writeFile(path.join(runtime, 'data', 'jobs.json'), JSON.stringify(jobs));
await writeFile(path.join(runtime, 'data', 'runs.json'), JSON.stringify(runs));
await writeFile(path.join(runtime, 'data', 'outputs', 'available.json'), JSON.stringify(output));
const app = await _electron.launch({ executablePath: electronPath, args: [path.join(root, 'desktop/main.mjs')], cwd: root, env: { ...process.env, DATAHUB_ROOT: runtime, DATAHUB_DESKTOP_TEST_MODE: '1' } });
try {
  const page = await app.firstWindow();
  await page.getByTitle('Download JSON output').first().waitFor();
  await page.route('**/api/activity*', route => route.fulfill({ json: [{ id: 'download-test', runId: 'available', kind: 'completed', jobName: 'Download available fixture', message: 'Synthetic completed run', at: now }] }));
  await page.reload();
  const row = name => page.locator('.job-row').filter({ hasText: name });
  await row('Download available fixture').getByTitle('Download JSON output').waitFor();

  const toast = selector => page.locator('.toast', selector).first();

  await row('Download available fixture').getByTitle('Download JSON output').click();
  await toast({ hasText: /JSON saved to/ }).waitFor({ timeout: 15000 });
  const message = await toast({ hasText: /JSON saved to/ }).innerText();
  const marker = 'JSON saved to ';
  const savedPath = message.slice(message.indexOf(marker) + marker.length).trim();
  assert.equal(await readFile(savedPath, 'utf8').then(value => value.trim()), JSON.stringify(output));
  assert.equal(savedPath, path.join(runtime, 'downloads', 'available.json'));

  await row('Download available fixture').getByTitle('Download JSON output').click();
  await page.waitForFunction(() => document.querySelector('.toast')?.textContent?.includes('available-1.json'));
  assert.equal(await readFile(path.join(runtime, 'downloads', 'available-1.json'), 'utf8'), JSON.stringify(output));
  assert.equal(await readFile(savedPath, 'utf8'), JSON.stringify(output));

  await page.getByRole('button', { name: /Synthetic completed run/ }).click();
  await page.getByRole('button', { name: 'Download output', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.toast')?.textContent?.includes('available-2.json'));
  assert.equal(await readFile(path.join(runtime, 'downloads', 'available-2.json'), 'utf8'), JSON.stringify(output));
  await mkdir(path.join(root, 'data', 'ui-verification'), { recursive: true });
  await page.screenshot({ path: path.join(root, 'data', 'ui-verification', 'job-download-saved.png') });
  await page.getByRole('button', { name: 'Close', exact: true }).click();

  const previousMessage = await toast().innerText();
  await row('Download missing fixture').getByTitle('Download JSON output').click();
  await page.waitForFunction((previous) => {
    const current = document.querySelector('.toast')?.textContent ?? '';
    return current.length > 0 && current !== previous;
  }, previousMessage);
  const failureText = await toast().innerText();
  assert.match(failureText, /Artifact request failed|Output not found/i);
  assert.match(failureText, /HTTP 404/i);
  assert.doesNotMatch(failureText, /ENOENT|data[\\/]outputs/i);
  await page.screenshot({ path: path.join(root, 'data', 'ui-verification', 'job-download-missing.png') });
  console.log(`PASS: completed-job native path download saved to ${savedPath}; missing artifact shows explicit status notice.`);
} finally {
  await app.close();
}
