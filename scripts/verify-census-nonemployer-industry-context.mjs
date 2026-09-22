import process from 'node:process';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { APP_ROOT, assertInsideApp } from '../runner/paths.mjs';
import { verifyCensusNonemployerIndustryContext } from '../runner/census-nonemployer-industry-context.mjs';

try {
  const requested = process.argv[2];
  if (!requested) throw new Error('Usage: node scripts/verify-census-nonemployer-industry-context.mjs <manifest-or-pointer>');
  const file = assertInsideApp(path.resolve(APP_ROOT, requested));
  const value = JSON.parse(await readFile(file, 'utf8'));
  const manifestPath = value.manifest ? assertInsideApp(path.resolve(path.dirname(file), value.manifest)) : file;
  process.stdout.write(`${JSON.stringify(await verifyCensusNonemployerIndustryContext(manifestPath), null, 2)}\n`);
} catch (error) {
  process.stderr.write(`Census Nonemployer industry context verification failed: ${error.message}\n`);
  process.exitCode = 1;
}
