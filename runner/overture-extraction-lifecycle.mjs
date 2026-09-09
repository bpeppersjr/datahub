import { rm } from "node:fs/promises";

// This lifecycle owns handles, not source authorization or filesystem admission.
// The caller supplies an authorized query and a unique run-scoped database path.
export async function runOvertureExtraction({ createInstance, databasePath, query, signal, removeFile = rm }) {
  let instance;
  let connection;
  let closeFailed = false;
  const failures = [];
  const interrupt = () => {
    try {
      connection.interrupt();
    } catch (error) {
      // Event listeners must not throw outside the awaited worker promise.
      failures.push(error);
    }
  };
  try {
    signal?.throwIfAborted();
    instance = await createInstance(databasePath);
    signal?.throwIfAborted();
    connection = await instance.connect();
    signal?.addEventListener("abort", interrupt, { once: true });
    // Abort may have arrived while either asynchronous handle was opening.
    signal?.throwIfAborted();
    await connection.run(query);
    signal?.throwIfAborted();
  } catch (error) {
    failures.unshift(error);
  } finally {
    signal?.removeEventListener("abort", interrupt);
    // Never close a handle while the query promise is still unsettled.
    for (const handle of [connection, instance]) {
      if (!handle) continue;
      try {
        handle.closeSync();
      } catch (error) {
        closeFailed = true;
        failures.push(error);
      }
    }
    // A failed open may refer to a file we never owned. A failed close may
    // leave a live handle. In either case preserve files for inspection.
    if (instance && !closeFailed) {
      for (const filename of [databasePath, `${databasePath}.wal`]) {
        try {
          await removeFile(filename, { force: true });
        } catch (error) {
          failures.push(error);
        }
      }
    }
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) throw new AggregateError(failures, "Overture extraction or cleanup failed; inspect the retained run staging directory.");
}
