import { verifyBenchmarkLabelSnapshot } from "./benchmark-label-finalization.mjs";

export const BENCHMARK_LABEL_RELEASE_SCHEMA_VERSION = "1.0.0";

// Direct path-based publication was intentionally removed. Label snapshots can
// only be installed after a current, registration-bound preview is confirmed.
export async function buildEntityResolutionBenchmarkLabelRelease() {
  throw new Error("Direct label-release building is disabled; use the preview and explicit publish workflow.");
}

export async function verifyEntityResolutionBenchmarkLabelRelease(manifestPath, options = {}) {
  return verifyBenchmarkLabelSnapshot(manifestPath, options);
}
