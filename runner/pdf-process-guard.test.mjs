import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import test from 'node:test';
import {APP_ROOT} from './paths.mjs';

// Explicit test override only; never installs Python or depends on Codex runtime.
const python = process.env.DATAHUB_TEST_PDF_PYTHON;
const prelude = `import sys, time\nsys.path.insert(0, 'scripts')\nfrom pdf_process_guard import ProcessGuard, GuardCancelled, GuardUnavailable\n`;
function run(body, control) {
  return new Promise((resolve, reject) => {
    const child = spawn(python, ['-B', '-u', '-c', prelude + body], {
      cwd: APP_ROOT, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '', stderr = '', controlled = false;
    const deadline = setTimeout(() => { child.kill(); reject(new Error('test child timeout')); }, 10_000);
    child.stdout.on('data', data => {
      stdout += data.toString().replaceAll('\r\n', '\n');
      if (stdout.includes('ready\n') && !controlled) { controlled = true; control?.(child); }
    });
    child.stderr.on('data', data => { stderr += data; });
    child.stdin.on('error', () => {});
    child.on('error', error => { clearTimeout(deadline); reject(error); });
    child.on('close', (code, signal) => { clearTimeout(deadline); resolve({code, signal, stdout, stderr}); });
  });
}

test('PDF process guard initializes and verifies the real platform memory cap', {skip: !python}, async () => {
  const result = await run("g = ProcessGuard().start()\nprint(g.backend)\ng.close()\n");
  assert.equal(result.code, 0);
  assert.equal(result.stderr, '');
  assert.equal(result.stdout.trim(), process.platform === 'win32' ? 'windows-job-process-commit' : 'linux-rlimit-address-space');
});

for (const action of ['EOF', 'cancel byte']) {
  test(`PDF process guard cooperatively cancels on ${action}`, {skip: !python}, async () => {
    const result = await run(`g = ProcessGuard().start()
print('ready')
try:
    while True:
        g.check_cancelled()
        time.sleep(0.01)
except GuardCancelled as exc:
    print(exc.code)
finally:
    g.close()
`, child => action === 'EOF' ? child.stdin.end() : child.stdin.write('cancel\n'));
    assert.equal(result.code, 0);
    assert.equal(result.stderr, '');
    assert.equal(result.stdout.trim(), 'ready\ncancelled');
  });
}

test('PDF process guard hard deadline terminates a non-cooperative Python loop', {skip: !python}, async () => {
  const result = await run("g = ProcessGuard(timeout_seconds=0.3).start()\nprint('ready')\nwhile True: time.sleep(0.01)\n");
  assert.equal(result.code, 124);
  assert.equal(result.stderr, '');
});

test('PDF process guard marks a cooperative timeout before hard termination', {skip: !python}, async () => {
  const result = await run(`g = ProcessGuard(timeout_seconds=0.3).start()
try:
    while True:
        g.check_cancelled()
        time.sleep(0.005)
except GuardCancelled as exc:
    print(exc.code)
finally:
    g.close()
`);
  assert.equal(result.code, 0);
  assert.equal(result.stdout.trim(), 'timeout');
  assert.equal(result.stderr, '');
});

test('PDF process guard rejects an allocation above its hard cap', {skip: !python}, async () => {
  const result = await run(`g = ProcessGuard(memory_bytes=128 * 1024 * 1024).start()
try:
    data = bytearray(256 * 1024 * 1024)
    print('unexpected allocation')
except MemoryError:
    print('memory limited')
finally:
    g.close()
`);
  assert.equal(result.code, 0);
  assert.equal(result.stdout.trim(), 'memory limited');
  assert.equal(result.stderr, '');
});

test('PDF process guard rejects unbounded budgets and unsupported platforms', {skip: !python}, async () => {
  const result = await run(`for options in ({'memory_bytes': 1073741825}, {'memory_bytes': True}, {'timeout_seconds': 61}, {'timeout_seconds': float('nan')}):
    try:
        ProcessGuard(**options)
        raise AssertionError('accepted invalid budget')
    except ValueError:
        pass
sys.platform = 'unsupported'
try:
    ProcessGuard().start()
    raise AssertionError('accepted unsupported platform')
except GuardUnavailable:
    print('rejected')
`);
  assert.equal(result.code, 0);
  assert.equal(result.stdout.trim(), 'rejected');
  assert.equal(result.stderr, '');
});
