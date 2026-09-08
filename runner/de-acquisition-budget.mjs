const CEILINGS = Object.freeze({ maximumRequests: 1000, maximumBytes: 1_000_000_000, maximumRows: 1_000_000 });

function invalid() {
  return Object.assign(new Error("Delaware acquisition budget is invalid or exceeded."), { code: "DE_ACQUISITION_BUDGET" });
}

/** In-memory accounting only; callers charge every request attempt and decoded chunk. */
export function createDeAcquisitionBudget(options = {}) {
  if (options === null || typeof options !== "object" || ![Object.prototype, null].includes(Object.getPrototypeOf(options))) throw invalid();
  const limits = { ...CEILINGS };
  for (const key of Reflect.ownKeys(options)) {
    if (typeof key !== "string" || !Object.hasOwn(CEILINGS, key)) throw invalid();
    const descriptor = Object.getOwnPropertyDescriptor(options, key);
    if (!Object.hasOwn(descriptor, "value")) throw invalid();
    const value = descriptor.value;
    if (!Number.isSafeInteger(value) || value < 1 || value > CEILINGS[key]) throw invalid();
    limits[key] = value;
  }
  Object.freeze(limits);
  let requests = 0, bytes = 0, rows = 0;
  const validateCount = (value) => {
    if (!Number.isSafeInteger(value) || value < 0) throw invalid();
  };
  return Object.freeze({
    beforeRequest() {
      if (requests >= limits.maximumRequests) throw invalid();
      requests++;
    },
    consumeBytes(value) {
      validateCount(value);
      if (value > limits.maximumBytes - bytes) throw invalid();
      bytes += value;
    },
    assertRows(value) {
      validateCount(value);
      if (value > limits.maximumRows) throw invalid();
      rows = value;
    },
    snapshot() {
      return Object.freeze({ counts: Object.freeze({ requests, bytes, rows }), limits: Object.freeze({ ...limits }) });
    },
  });
}
