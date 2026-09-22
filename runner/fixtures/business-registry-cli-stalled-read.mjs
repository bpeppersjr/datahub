// Offline --import fixture for exercising real CLI IPC cancellation during I/O.
import fs from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";

fs.readFile = async (_filename, options) => {
  const signal = options?.signal;
  if (!signal) throw new Error("Fixture read lacks cancellation signal.");
  signal.throwIfAborted();
  process.send?.({ type: "fixture-read-started" });
  return new Promise((_resolve, reject) => {
    const handle = setInterval(() => {}, 1_000);
    signal.addEventListener("abort", () => {
      clearInterval(handle);
      reject(signal.reason);
    }, { once: true });
  });
};
syncBuiltinESMExports();
