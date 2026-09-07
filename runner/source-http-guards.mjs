// Shared acquisition guards. Exceeding a publisher wait budget must defer,
// never shorten the requested wait or overflow a native timer.
export function publisherRetryDelay(header, { fallbackMs, now = () => new Date(), maximumWaitMs = 86_400_000 } = {}) {
  const value = header?.trim();
  if (!value) return fallbackMs;
  let milliseconds;
  if (/^\d+$/.test(value)) milliseconds = Number(value) * 1000;
  else {
    if (!/[a-z]/i.test(value)) return fallbackMs;
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp)) return fallbackMs;
    const clock = now().getTime();
    if (!Number.isFinite(clock)) throw new Error("Publisher retry clock is invalid.");
    milliseconds = Math.max(0, timestamp - clock);
  }
  if (!Number.isFinite(milliseconds) || milliseconds > maximumWaitMs) {
    throw Object.assign(new Error("Publisher retry delay exceeds the local wait budget; defer this acquisition."), { code: "SOURCE_RETRY_DEFERRED" });
  }
  return Math.max(fallbackMs, milliseconds);
}

export async function boundedJson(response, { signal, maximumBytes }) {
  signal?.throwIfAborted();
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maximumBytes) throw new Error("Source JSON response exceeds the configured byte limit.");
  if (!response.body) throw new Error("Source JSON response body is missing.");
  const reader = response.body.getReader();
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal?.addEventListener("abort", abort, { once: true });
  const chunks = []; let bytes = 0, complete = false;
  try {
    signal?.throwIfAborted();
    while (true) {
      const { done, value } = await reader.read();
      signal?.throwIfAborted();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maximumBytes) throw new Error("Source JSON response exceeds the configured byte limit.");
      chunks.push(value);
    }
    const payload = JSON.parse(Buffer.concat(chunks, bytes).toString("utf8"));
    complete = true;
    return payload;
  } finally {
    signal?.removeEventListener("abort", abort);
    if (!complete) void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
