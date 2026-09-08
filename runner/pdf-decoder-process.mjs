import {spawn} from 'node:child_process';
import path from 'node:path';
import {performance} from 'node:perf_hooks';

const LIMITS = Object.freeze({timeoutMs: 60_000, cancellationGraceMs: 2_000,
  maxStdoutBytes: 64 * 1024 * 1024, maxStderrBytes: 4_096});

function failure(code, evidence) {
  const error = new Error(`PDF decoder process failed: ${code}`);
  error.code = code;
  if (evidence) error.evidence = evidence;
  return error;
}

// Transport primitive only: callers must authorize and validate the runtime,
// arguments, working directory, environment keys, and input artifacts first.
// Children must not create descendants: termination supervises this child only.
export async function runPdfDecoderProcess(options) {
  const {executable, args, cwd, env, signal} = options ?? {};
  if (typeof executable !== 'string' || !path.isAbsolute(executable) ||
      !Array.isArray(args) || args.some(value => typeof value !== 'string') ||
      typeof cwd !== 'string' || !path.isAbsolute(cwd) || !env ||
      typeof env !== 'object' || Array.isArray(env) ||
      Object.entries(env).some(([key, value]) => !key || /[=\0]/.test(key) ||
        typeof value !== 'string' || value.includes('\0')) ||
      (signal && (typeof signal.addEventListener !== 'function' ||
        typeof signal.removeEventListener !== 'function'))) {
    throw failure('INVALID_OPTIONS');
  }
  const limits = {};
  for (const [key, ceiling] of Object.entries(LIMITS)) {
    const value = options[key] ?? ceiling;
    if (!Number.isSafeInteger(value) || value < 1 || value > ceiling) {
      throw failure('INVALID_LIMIT');
    }
    limits[key] = value;
  }
  if (signal?.aborted) throw failure('ABORTED');
  const started = performance.now();
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(executable, [...args], {cwd, env: {...env}, shell: false,
        windowsHide: true, stdio: ['pipe', 'pipe', 'pipe']});
    } catch {
      reject(failure('SPAWN_FAILED'));
      return;
    }
    let reason;
    let graceTimer;
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let forcedTermination = false;
    const chunks = [];
    const stop = code => {
      if (reason) return;
      reason = code;
      chunks.length = 0;
      // The decoder guard treats this line (or EOF) as cooperative cancellation.
      // Leave stdin open on the ordinary decode path.
      if (!child.stdin.destroyed) child.stdin.end('cancel\n');
      graceTimer = setTimeout(() => {
        forcedTermination = true;
        child.kill('SIGKILL');
      }, limits.cancellationGraceMs);
    };
    const abort = () => stop('ABORTED');
    const timeout = setTimeout(() => stop('TIMEOUT'), limits.timeoutMs);
    child.once('error', () => stop('SPAWN_FAILED'));
    child.stdin.on('error', () => { if (!reason) stop('STDIN_FAILED'); });
    child.stdout.on('error', () => stop('STDOUT_FAILED'));
    child.stderr.on('error', () => stop('STDERR_FAILED'));
    child.stdout.on('data', chunk => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > limits.maxStdoutBytes) stop('STDOUT_LIMIT');
      else if (!reason) chunks.push(chunk);
    });
    // Count and drain stderr; never retain or return potentially sensitive text.
    child.stderr.on('data', chunk => {
      stderrBytes += chunk.length;
      if (stderrBytes > limits.maxStderrBytes) stop('STDERR_LIMIT');
    });
    child.once('close', (exitCode, exitSignal) => {
      clearTimeout(timeout);
      clearTimeout(graceTimer);
      signal?.removeEventListener('abort', abort);
      const evidence = {stdoutBytes, stderrBytes,
        elapsedMs: Math.ceil(performance.now() - started), exitCode,
        signal: exitSignal, pid: child.pid ?? null, forcedTermination};
      if (reason || exitCode !== 0) reject(failure(reason ?? 'EXIT_NONZERO', evidence));
      else resolve({stdout: Buffer.concat(chunks, stdoutBytes), evidence});
    });
    signal?.addEventListener('abort', abort, {once: true});
    if (signal?.aborted) abort();
  });
}
