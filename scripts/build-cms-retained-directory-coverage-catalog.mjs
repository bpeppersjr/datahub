import { createCliCancellation } from "../runner/cli-cancellation.mjs";
import { buildCmsRetainedDirectoryCoverageCatalog } from "../runner/cms-retained-directory-coverage-catalog.mjs";

if (process.argv.length !== 2) throw new Error("Usage: node scripts/build-cms-retained-directory-coverage-catalog.mjs");
const cancellation = createCliCancellation();
try {
  const result = await buildCmsRetainedDirectoryCoverageCatalog({ signal: cancellation.signal });
  process.stdout.write(`${JSON.stringify({ release_id: result.manifest.release_id, release_directory: result.releaseDirectory, manifest: `${result.releaseDirectory}/manifest.json`, manifest_sha256: result.manifestSha256, jurisdiction_count: result.manifest.jurisdiction_count, source_count: result.manifest.source_count, denominators: result.manifest.denominators, reused_existing_release: result.reused_existing_release, network_requests_performed: 0, production_enrollment: false, national_reporting_denominator_enrollment: false, current_pointer_written: false }, null, 2)}\n`);
} finally {
  cancellation.dispose();
}
