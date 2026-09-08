const MAXIMUM_MS = 1_800_000;

/** Cooperative elapsed-time budget. It cannot interrupt synchronous or OS work. */
export function createDeExecutionDeadline({ signal, timeoutMs = MAXIMUM_MS } = {}) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAXIMUM_MS
    || signal !== undefined && !(signal instanceof AbortSignal)) throw new Error('Invalid Delaware execution deadline.');
  const controller = new AbortController();
  const deadline = performance.now() + timeoutMs;
  let disposed = false, timer;
  const expire = () => {
    if (!disposed && !controller.signal.aborted) controller.abort(Object.assign(new Error('Delaware execution deadline exceeded.'), { code: 'DE_EXECUTION_DEADLINE' }));
  };
  const parentAbort = () => controller.abort(signal.reason);
  if (signal?.aborted) parentAbort();
  else signal?.addEventListener('abort', parentAbort, { once: true });
  // Intentionally referenced: pending cooperative work must keep the deadline alive.
  if (!controller.signal.aborted) timer = setTimeout(expire, timeoutMs);
  return {
    signal: controller.signal,
    check() {
      if (!disposed && performance.now() >= deadline) expire();
      controller.signal.throwIfAborted();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', parentAbort);
    },
  };
}
