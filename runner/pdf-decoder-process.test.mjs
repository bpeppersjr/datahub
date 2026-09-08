import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {runPdfDecoderProcess} from './pdf-decoder-process.mjs';

const cwd = path.dirname(fileURLToPath(import.meta.url));
const run = (code, overrides = {}) => runPdfDecoderProcess({executable: process.execPath,
  args: ['-e', code], cwd, env: {}, ...overrides});
const notAlive = pid => {
  assert.equal(typeof pid, 'number');
  assert.throws(() => process.kill(pid, 0), error => error.code === 'ESRCH');
};
const rejected = async (promise, expected) => {
  let caught;
  await assert.rejects(promise, error => { caught = error; return error.code === expected; });
  assert.doesNotMatch(JSON.stringify(caught) + caught.message + caught.stack, /SECRET_PAYLOAD/);
  if (caught.evidence?.pid) notAlive(caught.evidence.pid);
  return caught;
};

test('PDF process returns bounded bytes after close with explicit environment and open stdin', async () => {
  const previous = process.env.PDF_TEST_PARENT_SECRET;
  process.env.PDF_TEST_PARENT_SECRET = 'SECRET_PAYLOAD';
  let result;
  try {
    result = await run(`process.stdin.on('end',()=>process.exit(9));
    process.stdin.resume(); setTimeout(()=>{process.stdout.write(JSON.stringify({
    cwd:process.cwd(), secret:process.env.PDF_TEST_PARENT_SECRET??null,
    supplied:process.env.PDF_EXPLICIT}));process.exit(0)},40)`,
    {env: {PDF_EXPLICIT: 'yes'}});
  } finally {
    if (previous === undefined) delete process.env.PDF_TEST_PARENT_SECRET;
    else process.env.PDF_TEST_PARENT_SECRET = previous;
  }
  assert.deepEqual(JSON.parse(result.stdout), {cwd, secret: null, supplied: 'yes'});
  assert.equal(result.evidence.stdoutBytes, result.stdout.length);
  assert.equal(result.evidence.exitCode, 0);
  assert.equal(result.evidence.stderrBytes, 0);
  notAlive(result.evidence.pid);
});

test('PDF process passes shell metacharacters as literal arguments', async () => {
  const literal = 'literal & | > < %NOT_AN_ENV% $(not-a-command)';
  const result = await run('', {args: ['-e', 'process.stdout.write(process.argv[1])', literal]});
  assert.equal(result.stdout.toString(), literal);
  notAlive(result.evidence.pid);
});

test('PDF process rejects pre-abort before trying a missing executable', async () => {
  const controller = new AbortController(); controller.abort('SECRET_PAYLOAD');
  const error = await rejected(run('', {executable: path.join(cwd, 'missing-pdf-runtime'),
    signal: controller.signal}), 'ABORTED');
  assert.equal(error.evidence, undefined);
});

test('PDF process rejects malformed options and raised resource ceilings', async () => {
  await rejected(run('', {env: undefined}), 'INVALID_OPTIONS');
  await rejected(run('', {timeoutMs: 60_001}), 'INVALID_LIMIT');
  await rejected(run('', {maxStdoutBytes: 64 * 1024 * 1024 + 1}), 'INVALID_LIMIT');
});

test('PDF process spawn failure is redacted and closes', async () => {
  const error = await rejected(run('', {executable: path.join(cwd, 'SECRET_PAYLOAD-missing')}), 'SPAWN_FAILED');
  assert.equal(error.evidence.pid, null);
});

test('PDF process nonzero stderr and stdout are never included in errors', async () => {
  const error = await rejected(run(`process.stdout.write('SECRET_PAYLOAD');
    process.stderr.write('SECRET_PAYLOAD');process.exitCode=3`), 'EXIT_NONZERO');
  assert.equal(error.evidence.stderrBytes, 14);
});

test('PDF process stdout flood is cancelled without retaining payload or orphan', async () => {
  await rejected(run(`process.stdin.resume();process.stdin.on('data',()=>process.exit(0));
    process.stdout.write('SECRET_PAYLOAD'.repeat(1000));`, {maxStdoutBytes: 128}), 'STDOUT_LIMIT');
});

test('PDF process stderr flood is counted, bounded and redacted', async () => {
  await rejected(run(`process.stdin.resume();process.stdin.on('data',()=>process.exit(0));
    process.stderr.write('SECRET_PAYLOAD'.repeat(1000));`, {maxStderrBytes: 128}), 'STDERR_LIMIT');
});

test('PDF process timeout asks for cooperative cancellation and waits for close', async () => {
  const error = await rejected(run(`process.stdin.resume();
    process.stdin.on('data',data=>{if(data.toString()==='cancel\\n')process.exit(0)});`,
  {timeoutMs: 1000}), 'TIMEOUT');
  assert.equal(error.evidence.forcedTermination, false);
  assert.equal(error.evidence.exitCode, 0);
});

test('PDF process timeout force terminates an uncooperative child before rejection', async () => {
  const error = await rejected(run('setInterval(()=>{},1000)',
    {timeoutMs: 1000, cancellationGraceMs: 100}), 'TIMEOUT');
  assert.equal(error.evidence.forcedTermination, true);
  assert.ok(error.evidence.elapsedMs >= 1100);
});

test('PDF process abort is redacted and force terminates before rejection', async () => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort('SECRET_PAYLOAD'), 500);
  try {
    const error = await rejected(run('setInterval(()=>{},1000)',
      {signal: controller.signal, cancellationGraceMs: 100}), 'ABORTED');
    assert.equal(error.evidence.forcedTermination, true);
  } finally { clearTimeout(timer); }
});
