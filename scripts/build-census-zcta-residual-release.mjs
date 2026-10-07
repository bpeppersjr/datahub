import { buildCensusZctaResidualRelease, verifyCensusZctaResidualRelease } from '../runner/census-zcta-residual-release.mjs';

if (process.argv.includes('--help')) {
  process.stdout.write('Build and independently replay-verify the immutable 56-state-equivalent Census non-ZCTA residual geometry release from retained governed Census inputs. No network request, pointer write, production enrollment, ZIP/postal claim, or land classification.\n');
} else {
  try {
    const createdAt = new Date().toISOString();
    const result = await buildCensusZctaResidualRelease({ createdAt, progress: row => process.stderr.write(`${row.completed}/56 ${row.state} ${row.elapsed_ms}ms\n`) });
    const verified = await verifyCensusZctaResidualRelease({ manifestPath: result.manifest, replay: true });
    process.stdout.write(`${JSON.stringify({ ...result, verification: { release_id: verified.release_id, manifest_sha256: verified.manifest_sha256, state_artifacts: verified.state_artifacts, replayed: verified.replayed, claims: verified.claims } }, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`Census residual release failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
