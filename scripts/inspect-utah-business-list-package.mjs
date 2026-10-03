import path from "node:path";
import { inspectUtahBusinessListPackage } from "../runner/utah-business-list-offline.mjs";
import { APP_ROOT } from "../runner/paths.mjs";

const usage = "Usage: node scripts/inspect-utah-business-list-package.mjs data/imports/utah-business-list/packages/<package-id>";
try {
  if (process.argv.length !== 3 || process.argv[2] === "--help") throw new Error(usage);
  const input = path.resolve(APP_ROOT, process.argv[2]);
  const result = await inspectUtahBusinessListPackage(input);
  process.stdout.write(`${JSON.stringify({ ...result, records: undefined })}\n`);
} catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
