#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { auditBusinessTemporalConservation } from '../runner/business-temporal-conservation-audit.mjs';

export async function main(argv = process.argv.slice(2)) {
  if (argv.length) throw Error('This read-only audit accepts no arguments.');
  const result = await auditBusinessTemporalConservation(); process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
