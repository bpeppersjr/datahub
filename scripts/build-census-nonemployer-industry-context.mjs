import process from 'node:process';
import { buildCensusNonemployerIndustryContext } from '../runner/census-nonemployer-industry-context.mjs';
import { createCliCancellation } from '../runner/cli-cancellation.mjs';

const cancellation = createCliCancellation();
try {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') {
    process.stdout.write('Build an offline, versioned selected-industry context from the fixed verified retained Census release.\n');
  } else if (args.length === 0) {
    const result = await buildCensusNonemployerIndustryContext({ signal: cancellation.signal });
    process.stdout.write(`${JSON.stringify({ release_id: result.manifest.release_id, manifest: result.manifestPath, coverage: result.manifest.coverage }, null, 2)}\n`);
  } else throw new Error('Usage: node scripts/build-census-nonemployer-industry-context.mjs [--help]');
} catch (error) {
  process.stderr.write(`Census Nonemployer industry context build failed: ${error.message}\n`);
  process.exitCode = 1;
} finally {
  cancellation.dispose();
}
