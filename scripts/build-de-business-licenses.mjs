#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { buildDeBusinessLicenses, publishDeBusinessLicensesStaging } from "../runner/de-business-licenses.mjs";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";
import { createCliCancellation } from "../runner/cli-cancellation.mjs";

function usage() {
  return `Build the governed Delaware Division of Revenue current business-license release.

Usage:
  node scripts/build-de-business-licenses.mjs [options]

Options:
  --output <path>       Output root (default: data/business-sources/de-business-licenses-current)
  --zbp <path>          Census ZBP current.json prerequisite
  --page-size <number>  Socrata ordered page size (default: 50000; maximum: 50000)
  --minimum-license-rows <number>
                        Source-row quality floor (default: 60000)
  --maximum-quarantine-rate <number>
                        Maximum rejected source-row share (default: 0.05)
  --resume-staging-run <UUID>
                        Verify and publish one complete unpublished staging run without downloading again
  --help                Show this help
`;
}

function parseArguments(args) {
  const options = {
    output: "data/business-sources/de-business-licenses-current",
    zbp: "data/business-baselines/census-zbp/current.json",
    pageSize: 50_000,
    minimumLicenseRows: 60_000,
    maximumQuarantineRate: 0.05,
    resumeStagingRun: null,
  };
  const seen = new Set();
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help") return { help: true };
    if (["--output", "--zbp", "--page-size", "--minimum-license-rows", "--maximum-quarantine-rate", "--resume-staging-run"].includes(argument)) {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value.`);
      if (seen.has(argument)) throw new Error(`${argument} may only be supplied once.`);
      seen.add(argument);
      index += 1;
      if (argument === "--output") options.output = value;
      if (argument === "--zbp") options.zbp = value;
      if (argument === "--page-size") options.pageSize = Number(value);
      if (argument === "--minimum-license-rows") options.minimumLicenseRows = Number(value);
      if (argument === "--maximum-quarantine-rate") options.maximumQuarantineRate = Number(value);
      if (argument === "--resume-staging-run") options.resumeStagingRun = value;
      continue;
    }
    throw new Error(`Unknown argument ${argument}.`);
  }
  return options;
}

const cancellation = createCliCancellation();
try {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
  } else {
    const outputRoot = assertInsideApp(path.resolve(APP_ROOT, options.output));
    const result = options.resumeStagingRun
      ? await publishDeBusinessLicensesStaging({ outputRoot, stagingRunId: options.resumeStagingRun, signal: cancellation.signal })
      : await buildDeBusinessLicenses({
        outputRoot,
        zbpPointer: assertInsideApp(path.resolve(APP_ROOT, options.zbp)),
        pageSize: options.pageSize,
        minimumLicenseRows: options.minimumLicenseRows,
        maximumQuarantineRate: options.maximumQuarantineRate,
        signal: cancellation.signal,
        logger: (message) => process.stdout.write(`${message}\n`),
      });
    process.stdout.write(`${JSON.stringify({
      release_id: result.manifest.release_id,
      release_directory: result.releaseDirectory,
      manifest: path.join(result.releaseDirectory, "manifest.json"),
      coverage: result.manifest.coverage,
    }, null, 2)}\n`);
  }
} catch (error) {
  if (error.code === 'DE_PUBLICATION_INCOMPLETE') {
    process.stderr.write('Delaware publication did not finalize cleanly; a release or pointer may already exist. Preserve and inspect publication evidence before another build or resume.\n');
    process.stderr.write(`${JSON.stringify({
      status: 'PUBLICATION_INCOMPLETE',
      phase: ['release-rename','pointer-write','pointer-rename','post-publication'].includes(error.phase) ? error.phase : null,
      release_id: typeof error.releaseId === 'string' && /^de-business-licenses-[0-9TZ-]+-[0-9a-f]{8}$/.test(error.releaseId) ? error.releaseId : null,
    })}\n`);
  } else {
    process.stderr.write(cancellation.signal.aborted ? 'Delaware business-license build cancelled; inspect retained run evidence before resuming.\n' : `Delaware business-license build failed: ${error.message}\n`);
  }
  process.exitCode = 1;
} finally {
  cancellation.dispose();
}
