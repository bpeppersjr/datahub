// Test-only preload: no network access, wait for the actual CLI's IPC abort.
globalThis.fetch = async (_url, { signal }) => new Promise((_resolve, reject) => {
  signal.throwIfAborted();
  signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  process.send({ type: "fixture-request" });
  // The CLI deliberately unrefs IPC; this fixture represents pending socket I/O.
  const pending = setInterval(() => {}, 1000);
  signal.addEventListener("abort", () => clearInterval(pending), { once: true });
});
