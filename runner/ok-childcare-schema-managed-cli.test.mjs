import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, readdir, symlink, unlink } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { APP_ROOT } from './paths.mjs';

const script = 'scripts/probe-ok-childcare-schema.mjs';
const preload = 'data:text/javascript,' + encodeURIComponent('globalThis.fetch = () => { process.stdout.write("OFFLINE_FETCH_BOUNDARY"); process.exit(77); };');
function run(args) {
  const result = spawnSync(process.execPath, ['--import', preload, script, ...args], {
    cwd: APP_ROOT, encoding: 'utf8', timeout: 15000,
    env: { ...process.env, TEMP: path.join(APP_ROOT, 'data/tmp'), TMP: path.join(APP_ROOT, 'data/tmp') },
  });
  assert.ifError(result.error);
  return result;
}

test('Oklahoma managed CLI rejects malformed flags and bindings before fetch', () => {
  const id = randomUUID(), output = path.join(APP_ROOT, 'data/managed-operations', id, 'output');
  const invalid = [
    ['--output'], ['--operation-id', id], ['--output', output],
    ['--output', output, '--output', output], ['--operation-id', id, '--operation-id', id],
    ['--help', '--output', output], ['--output', output, '--operation-id', id, '--help'],
    ['--output', 'relative/output', '--operation-id', id],
    ['--output', path.join(path.dirname(APP_ROOT), id, 'output'), '--operation-id', id],
    ['--output', output, '--operation-id', randomUUID()],
    ['--output', output, '--operation-id', 'not-a-uuid'],
    ['--output', output, '--operation-id', '00000000-0000-0000-0000-000000000000'],
    ['--output', output + path.sep, '--operation-id', id],
    ['--output', output, '--url', 'https://invalid.example/private'],
    ['--output=', output, '--operation-id', id],
    ['--output', '', '--operation-id', id],
  ];
  for (const args of invalid) {
    const result = run(args);
    assert.equal(result.status, 1, JSON.stringify(args));
    assert.match(result.stderr, /Invalid Oklahoma schema prerequisite arguments/);
    assert.doesNotMatch(result.stdout + result.stderr, /OFFLINE_FETCH_BOUNDARY|invalid\.example|not-a-uuid/);
    assert.equal(result.stdout, '');
  }
});

test('Oklahoma managed CLI help stays offline and advertises fixed managed arguments', () => {
  const result = run(['--help']);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /--output ABSOLUTE_OPERATION_OUTPUT --operation-id UUID/);
  assert.doesNotMatch(result.stdout + result.stderr, /OFFLINE_FETCH_BOUNDARY/);
  const standalone = run([]);
  assert.equal(standalone.status, 77);
  assert.equal(standalone.stdout, 'OFFLINE_FETCH_BOUNDARY');
});

test('Oklahoma valid managed CLI reaches only an offline fetch trap after validation', async () => {
  const testRoot = await mkdtemp(path.join(APP_ROOT, 'data/tmp/ok-managed-cli-test-'));
  const id = randomUUID(), directory = path.join(testRoot, id);
  const output = path.join(directory, 'output');
  await mkdir(directory, { recursive: true });
  try {
    for (const args of [
      ['--output', output, '--operation-id', id],
      ['--operation-id', id, '--output', output],
    ]) {
      const result = run(args);
      assert.equal(result.status, 77, result.stderr);
      assert.equal(result.stdout, 'OFFLINE_FETCH_BOUNDARY');
      assert.doesNotMatch(result.stderr, /Invalid Oklahoma/);
    }
    assert.deepEqual(await readdir(directory), []);
  } finally {
    assert.equal(path.dirname(path.resolve(testRoot)), path.join(APP_ROOT, 'data/tmp'));
    assert.equal(path.dirname(path.resolve(directory)), testRoot);
    assert.equal(path.basename(directory), id);
    await rm(testRoot, { recursive: true, force: true });
  }
});

test('Oklahoma managed CLI rejects directory aliases before fetch', async () => {
  const root = await mkdtemp(path.join(APP_ROOT, 'data/tmp/ok-managed-cli-alias-test-'));
  const actual = path.join(root, 'actual'), alias = path.join(root, 'alias'), id = randomUUID();
  let linked = false;
  try {
    await mkdir(path.join(actual, id), { recursive: true });
    await symlink(actual, alias, process.platform === 'win32' ? 'junction' : 'dir'); linked = true;
    const result = run(['--output', path.join(alias, id, 'output'), '--operation-id', id]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Invalid Oklahoma schema prerequisite arguments/);
    assert.doesNotMatch(result.stdout + result.stderr, /OFFLINE_FETCH_BOUNDARY/);
    assert.deepEqual(await readdir(path.join(actual, id)), []);
  } finally {
    assert.equal(path.dirname(path.resolve(root)), path.join(APP_ROOT, 'data/tmp'));
    if (linked) await unlink(alias);
    await rm(root, { recursive: true, force: true });
  }
});
