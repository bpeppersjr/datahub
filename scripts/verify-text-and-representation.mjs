import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { _electron } from 'playwright';
import electronPath from 'electron';

const root = process.cwd();
await mkdir(path.join(root, 'data', 'ui-verification'), { recursive: true });
const launch = () => _electron.launch({ executablePath: electronPath, args: [path.join(root, 'desktop/main.mjs')], cwd: root, env: { ...process.env, DATAHUB_DESKTOP_TEST_MODE: '1' } });
let app = await launch();
try {
  const page = await app.firstWindow();
  await page.getByLabel('Text size', { exact: true }).waitFor();
  const schedules = await page.evaluate(async () => {
    const connection = await window.cotiveCollector.getRunnerConnection();
    const response = await fetch(`${connection.runnerUrl}/api/data-operations/schedules`, { headers: { Authorization: `Bearer ${connection.controlToken}` } });
    return { status: response.status, body: await response.json() };
  });
  assert.equal(schedules.status, 200);
  assert.ok(Array.isArray(schedules.body));
  const size = page.getByLabel('Text size', { exact: true });
  await size.selectOption('100');
  await page.locator('#representation-state').waitFor();
  const representation = await page.evaluate(async () => {
    const connection = await window.cotiveCollector.getRunnerConnection();
    const response = await fetch(`${connection.runnerUrl}/api/dataset-representation`, { headers: { Authorization: `Bearer ${connection.controlToken}` } });
    if (!response.ok) throw new Error(`Representation API: ${response.status}`);
    return response.json();
  });
  const assertState = async code => {
    const state = representation.states.find(row => row.code === code);
    assert.ok(state);
    const result = await page.locator('.representation-result').innerText();
    assert.ok(result.includes(state.percent === null ? 'Unmeasured' : `${state.percent.toFixed(1)}%`));
    assert.ok(result.includes(`${state.represented}/${state.expected} configured nationwide datasets represented`));
    assert.ok(await page.getByText('All-business completeness: Unknown', { exact: true }).isVisible());
    const unconfigured = state.industries.filter(row => row.expected === 0);
    assert.ok(await page.getByText(`${state.industries.length - unconfigured.length} of ${state.industries.length} configured industry groups have nationwide datasets.`, { exact: true }).isVisible());
    for (const industry of unconfigured) {
      const row = page.locator('.representation-table tbody tr').filter({ has: page.getByRole('rowheader', { name: industry.id.replaceAll('-', ' '), exact: true }) });
      assert.equal(await row.locator('td').nth(1).innerText(), 'Not configured');
    }
  };
  const samples = ['h1', '.table-head', '#text-size', '.representation-table th', '.rail-link', '#coverage h2', '#business-intelligence h2', '#connectors h2', '#data-operations h2', '#benchmark h2'];
  const fonts = () => page.evaluate(selectors => selectors.map(selector => parseFloat(getComputedStyle(document.querySelector(selector)).fontSize)), samples);
  const baselineFonts = await fonts();
  const baseline = await page.locator('h1').evaluate(el => parseFloat(getComputedStyle(el).fontSize));
  await size.selectOption('200');
  await page.waitForFunction(() => document.documentElement.dataset.textSize === '200');
  assert.equal(await page.locator('h1').evaluate(el => parseFloat(getComputedStyle(el).fontSize)), baseline * 2);
  assert.deepEqual(await fonts(), baselineFonts.map(value => value * 2));
  await page.getByRole('button', { name: 'New job', exact: false }).click();
  assert.equal(await page.locator('.editor-body textarea').evaluate(el => parseFloat(getComputedStyle(el).fontSize)), 20);
  await page.locator('.modal-close').click();
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.textSize === '200');
  assert.equal(await size.inputValue(), '200');
  await size.focus();
  await page.keyboard.press('Home');
  await page.keyboard.press('Enter');
  assert.equal(await size.inputValue(), '100');
  await size.selectOption('200');
  await page.locator('#representation-state').selectOption('IL');
  await assertState('IL');
  await page.locator('.dataset-representation').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(root, 'data/ui-verification/representation-200.png') });
  await page.locator('#representation-state').selectOption('');
  assert.equal(await page.locator('.representation-table tbody tr').count(), 51);
  const california = page.getByRole('button', { name: /^California;/ });
  await california.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('#representation-state')?.value === 'CA');
  await assertState('CA');
  await page.evaluate(() => {
    localStorage.setItem('collector-text-size', '125');
    window.dispatchEvent(new StorageEvent('storage', { key: 'collector-text-size', newValue: '125' }));
  });
  await page.waitForFunction(() => document.documentElement.dataset.textSize === '125');
  assert.equal(await size.inputValue(), '125');
  await size.selectOption('200');
  // No document-wide overflow; bounded table scroll is intentional.
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2));
  await page.getByRole('button', { name: 'Reset text size' }).click();
  await page.waitForFunction(() => document.documentElement.dataset.textSize === '100');
  await page.getByRole('button', { name: 'New job', exact: false }).click();
  await page.locator('.editor-modal').waitFor();
  await page.locator('.modal-close').click();
  await page.screenshot({ path: path.join(root, 'data/ui-verification/collector-100.png') });
  await size.selectOption('200');
  await app.close();
  app = await launch();
  const reopened = await app.firstWindow();
  await reopened.waitForFunction(() => document.documentElement.dataset.textSize === '200');
  assert.equal(await reopened.getByLabel('Text size', { exact: true }).inputValue(), '200');
  await reopened.getByRole('button', { name: 'Reset text size' }).click();
  console.log('PASS: desktop all-section 100/200% scaling, keyboard selection, storage sync, reload/relaunch persistence, reset, 51 state rows, API-derived fixed denominator, explicit unknown completeness, document width, job editor.');
} finally { await app.close(); }
