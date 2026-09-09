// Internal query adapter. The worker owns the connection, query authorization,
// engine settings and final handle closure; no user SQL should reach this API.
const failure = () => new Error('Overture JSON stream failed; query details redacted.');

export function streamOvertureJsonRows(options) {
  if (!options || Object.getPrototypeOf(options) !== Object.prototype
    || Reflect.ownKeys(options).some(key => !['connection', 'query', 'signal'].includes(key))
    || Object.values(Object.getOwnPropertyDescriptors(options)).some(d => !Object.hasOwn(d, 'value'))) throw failure();
  const { connection, query, signal } = options;
  if (!connection || typeof connection.stream !== 'function' || typeof connection.interrupt !== 'function'
    || typeof query !== 'string' || !query.length || Buffer.byteLength(query) > 1024 * 1024
    || (signal !== undefined && !(signal instanceof AbortSignal))) throw failure();
  const stream = connection.stream.bind(connection), interrupt = connection.interrupt.bind(connection);
  return (async function* () {
    let exhausted = false, interruptFailed = false, started = false;
    const cancel = () => { try { interrupt(); } catch { interruptFailed = true; } };
    const check = () => { if (signal?.aborted || interruptFailed) throw failure(); };
    try {
      check(); signal?.addEventListener('abort', cancel, { once: true }); check();
      started = true;
      const result = await stream(query); check();
      if (result.columnCount !== 1 || result.columnName(0) !== 'record_json') throw failure();
      for (;;) {
        const chunk = await result.fetchChunk(); check();
        if (!chunk || chunk.rowCount === 0) { exhausted = true; return; }
        if (chunk.columnCount !== 1 || !Number.isSafeInteger(chunk.rowCount) || chunk.rowCount < 1 || chunk.rowCount > 8192) throw failure();
        const vector = chunk.getColumnVector(0);
        for (let index = 0; index < chunk.rowCount; index++) {
          check();
          const value = vector.getItem(index);
          if (typeof value !== 'string' || Buffer.byteLength(value) > 16 * 1024 ** 2) throw failure();
          yield value;
        }
      }
    } catch { throw failure(); }
    finally {
      signal?.removeEventListener('abort', cancel);
      // Pending stream/fetch calls are awaited, never detached. An early consumer
      // return interrupts the unused query; the worker must then close its handles.
      if (started && !exhausted) cancel();
      if (interruptFailed) throw failure();
    }
  })();
}
