import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { APP_ROOT } from './paths.mjs';
import { acquireIndustrySourceLocks } from './industry-source-locks.mjs';

const national = (states = ['TX']) => ({ id: 'national-fixture:national', sourceId: 'national-fixture', scope: 'national', states });
const state = (code) => ({ id: `state-fixture:${code}`, sourceId: 'state-fixture', scope: 'state', state: code, states: [code] });
async function fixture(t) {
  const temp = path.join(APP_ROOT, 'data/tmp'); await mkdir(temp, { recursive: true });
  const root = await mkdtemp(path.join(temp, 'source-lock-test-')); t.after(() => rm(root, { recursive: true, force: true }));
  return { root, directory: path.join(root, 'data/industry-segments/source-locks') };
}
test('source lock excludes a shared national source irrespective of state selection', async (t) => {
  const f = await fixture(t), first = await acquireIndustrySourceLocks([national(['TX'])], { root: f.root, runId: 'first' });
  try { await assert.rejects(acquireIndustrySourceLocks([national(['GA'])], { root: f.root, runId: 'second' }), /lock|busy|owned|acquir/i); }
  finally { await first.release(); }
  const next = await acquireIndustrySourceLocks([national(['GA'])], { root: f.root, runId: 'next' }); await next.release();
});
test('source lock permits independent state tasks and different source publishers', async (t) => {
  const f = await fixture(t), a = await acquireIndustrySourceLocks([state('TX')], { root: f.root, runId: 'texas' });
  const b = await acquireIndustrySourceLocks([state('GA')], { root: f.root, runId: 'georgia' });
  const c = await acquireIndustrySourceLocks([{ ...national(), sourceId: 'another-national', id: 'another-national:national' }], { root: f.root, runId: 'another' });
  await Promise.all([a.release(), b.release(), c.release()]); assert.deepEqual(await readdir(f.directory), []);
});
test('failed multi-source reservation unwinds only its newly acquired locks', async (t) => {
  const f = await fixture(t), owner = await acquireIndustrySourceLocks([national()], { root: f.root, runId: 'owner' });
  const before = await readdir(f.directory); const bytes = await readFile(path.join(f.directory, before[0]));
  await assert.rejects(acquireIndustrySourceLocks([state('AL'), national()], { root: f.root, runId: 'conflict' }));
  assert.deepEqual(await readdir(f.directory), before); assert.deepEqual(await readFile(path.join(f.directory, before[0])), bytes);
  await owner.release();
});
test('a second actual Node process cannot acquire the parent-owned source', async (t) => {
  const f = await fixture(t), held = await acquireIndustrySourceLocks([national()], { root: f.root, runId: 'parent' });
  const moduleUrl = pathToFileURL(path.join(APP_ROOT, 'runner/industry-source-locks.mjs')).href;
  const code = `import { acquireIndustrySourceLocks } from ${JSON.stringify(moduleUrl)}; try { const held = await acquireIndustrySourceLocks(${JSON.stringify([national(['NY'])])}, { root: process.argv[1], runId: 'child' }); await held.release(); process.exitCode = 1; } catch (error) { if (/lock|busy|owned|acquir/i.test(error.message)) process.exitCode = 73; else { console.error(error.message); process.exitCode = 2; } }`;
  try {
    const result = await new Promise((resolve, reject) => { const child = spawn(process.execPath, ['--input-type=module', '-e', code, f.root], { cwd: APP_ROOT, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] }); let stderr = ''; child.stderr.on('data', (chunk) => { stderr += chunk; }); child.once('error', reject); child.once('close', (exitCode) => resolve({ exitCode, stderr })); });
    assert.equal(result.exitCode, 73, result.stderr);
  } finally { await held.release(); }
});
test('release refuses to remove a lock whose owner token was replaced', async (t) => {
  const f = await fixture(t), held = await acquireIndustrySourceLocks([national()], { root: f.root, runId: 'owner' });
  const file = path.join(f.directory, (await readdir(f.directory))[0]), record = JSON.parse(await readFile(file));
  record.token = 'different-owner'; await writeFile(file, JSON.stringify(record));
  await assert.rejects(held.release(), /owner|token|changed/i); assert.equal(JSON.parse(await readFile(file)).token, 'different-owner');
});
test('source lock never reclaims dead-looking or malformed ownership automatically', async (t) => {
  const f = await fixture(t), held = await acquireIndustrySourceLocks([national()], { root: f.root, runId: 'owner' });
  const file = path.join(f.directory, (await readdir(f.directory))[0]), bytes = await readFile(file), record = JSON.parse(bytes);
  record.pid = 99999999; await writeFile(file, JSON.stringify(record));
  await assert.rejects(acquireIndustrySourceLocks([national()], { root: f.root, runId: 'retry' }));
  await writeFile(file, '{'); await assert.rejects(acquireIndustrySourceLocks([national()], { root: f.root, runId: 'retry-malformed' }));
  await writeFile(file, bytes); await held.release();
});
test('source locks reject redirected storage and malformed task identities', async (t) => {
  const f = await fixture(t), other = path.join(f.root, 'elsewhere'); await mkdir(other); await mkdir(path.dirname(f.directory), { recursive: true });
  await symlink(other, f.directory, 'junction');
  await assert.rejects(acquireIndustrySourceLocks([national()], { root: f.root, runId: 'linked' }), /link|junction|redirect/i);
  assert.deepEqual(await readdir(other), []);
  const good = await fixture(t);
  for (const task of [{ ...national(), sourceId: '../outside' }, { ...state('TX'), state: '../' }, { ...national(), scope: 'unknown' }]) await assert.rejects(acquireIndustrySourceLocks([task], { root: good.root, runId: 'invalid' }));
});

test('repeated owner release cannot delete a successor reservation', async (t) => {
  const f = await fixture(t), first = await acquireIndustrySourceLocks([national()], { root: f.root, runId: 'first' });
  await first.release();
  const next = await acquireIndustrySourceLocks([national()], { root: f.root, runId: 'next' });
  await first.release();
  await assert.rejects(acquireIndustrySourceLocks([national()], { root: f.root, runId: 'third' }));
  await next.release();
});
