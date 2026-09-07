// Offline preload for the real Alaska CLI; no provider access is permitted.
globalThis.fetch = async (_url, { signal }) => new Promise((_resolve, reject) => {
  signal.throwIfAborted();
  const pending = setInterval(() => {}, 1000);
  signal.addEventListener("abort", () => { clearInterval(pending); reject(signal.reason); }, { once: true });
  process.send({ type: "fixture-request" });
});
