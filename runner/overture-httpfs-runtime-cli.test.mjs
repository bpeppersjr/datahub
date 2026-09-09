import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import test from 'node:test';
import { APP_ROOT } from './paths.mjs';

const preload = 'data:text/javascript,' + encodeURIComponent('globalThis.fetch = () => { process.stdout.write("UNEXPECTED_NETWORK"); process.exit(77); };');
function run(args) {
  const result = spawnSync(process.execPath, ['--import', preload, 'scripts/prepare-overture-httpfs-runtime.mjs', ...args], {
    cwd: APP_ROOT, encoding: 'utf8', timeout: 15000,
    env: { ...process.env, TEMP: path.join(APP_ROOT, 'data/tmp'), TMP: path.join(APP_ROOT, 'data/tmp') },
  });
  assert.ifError(result.error);
  return result;
}

test('runtime CLI is offline for help and rejects caller URL/version/authorization and malformed bindings', () => {
  const help = run(['--help']);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /No Overture place acquisition/);
  const id = randomUUID(), output = path.join(APP_ROOT, 'data/managed-operations', id, 'output');
  const invalid = [
    [], ['--output'], ['--output', output], ['--operation-id', id],
    ['--output', output, '--output', output],
    ['--output', output, '--operation-id', id, '--version', 'private-value'],
    ['--output', output, '--url', 'https://private.invalid'],
    ['--help', '--operation-id', id],
    ['--output', 'relative/output', '--operation-id', id],
    ['--output', output, '--operation-id', randomUUID()],
    ['--output', path.join(path.dirname(APP_ROOT), id, 'output'), '--operation-id', id],
    ['--output', output, '--operation-id', 'invalid-private-id'],
  ];
  for (const args of invalid) {
    const result = run(args);
    assert.equal(result.status, 1, JSON.stringify(args));
    assert.equal(result.stdout, '');
    assert.doesNotMatch(result.stderr, /UNEXPECTED_NETWORK|private-value|private\.invalid|invalid-private-id/);
  }
});
