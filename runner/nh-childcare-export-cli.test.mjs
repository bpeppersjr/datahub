import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { APP_ROOT } from './paths.mjs';

test('NH export CLI requires explicit fixed run and rejects caller URL/ZIP/path overrides without leaking them', () => {
  const script = path.join(APP_ROOT, 'scripts/probe-nh-childcare-search-export.mjs');
  for (const args of [[], ['--zip', 'PRIVATE'], ['--run', '--url', 'PRIVATE'], ['--output', 'PRIVATE'], ['--run', '--run']]) {
    const result = spawnSync(process.execPath, [script, ...args], { cwd: APP_ROOT, encoding: 'utf8', timeout: 5000 });
    assert.equal(result.status, 1); assert.equal(result.stdout, '');
    assert.equal(result.stderr.trim(), 'Explicit --run is required for the fixed New Hampshire export prerequisite.');
  }
  const help = spawnSync(process.execPath, [script, '--help'], { cwd: APP_ROOT, encoding: 'utf8', timeout: 5000 });
  assert.equal(help.status, 0); assert.match(help.stdout, /ZIP 03755/); assert.equal(help.stderr, '');
});
