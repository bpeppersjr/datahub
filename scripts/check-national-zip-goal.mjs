#!/usr/bin/env node
import { readNationalZipGoalAcceptance, NATIONAL_ZIP_GOAL_CLAIMS } from '../runner/national-zip-goal-acceptance.mjs';

const controller = new AbortController(), cancel = () => controller.abort();
process.once('SIGINT', cancel); process.once('SIGTERM', cancel);
try {
  const args = process.argv.slice(2);
  if (args.length !== 0 && (args.length !== 2 || args[0] !== '--claim' || !NATIONAL_ZIP_GOAL_CLAIMS.includes(args[1]))) {
    throw Error(`Usage: check-national-zip-goal.mjs [--claim ${NATIONAL_ZIP_GOAL_CLAIMS.join('|')}]`);
  }
  const report = await readNationalZipGoalAcceptance({ signal: controller.signal, claim: args[1] ?? 'report-only' });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.acceptance.accepted) process.exitCode = 2;
} catch (error) {
  process.stderr.write(`${error.message}\n`); process.exitCode = 1;
} finally {
  process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel);
}
