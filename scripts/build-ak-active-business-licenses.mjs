#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { buildAkActiveBusinessLicenses, publishAkActiveBusinessLicensesStaging } from "../runner/ak-active-business-licenses.mjs";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";
import { createCliCancellation } from "../runner/cli-cancellation.mjs";

function usage() {
  return `Build the governed Alaska DCCED active business-license release.

Usage:
  node scripts/build-ak-active-business-licenses.mjs [options]

Options:
  --output <path>       Output root (default: data/business-sources/ak-active-business-licenses)
  --zbp <path>          Census ZBP current.json prerequisite
  --minimum-license-rows <number>
                        Source-row quality floor (default: 80000)
  --maximum-quarantine-rate <number>
                        Maximum rejected source-row share (default: 0.01)
  --minimum-naics-coverage-rate <number>
                        Minimum share of license IDs represented in NAICS download (default: 0.99)
  --resume-staging-run <UUID>
                        Verify and publish one complete unpublished staging run without downloading again
  --help                Show this help
`;
}

function parseArguments(args) {
  const options = {
    output: "data/business-sources/ak-active-business-licenses",
    zbp: "data/business-baselines/census-zbp/current.json",
    minimumLicenseRows: 80_000,
    maximumQuarantineRate: 0.01,
    minimumNaicsCoverageRate: 0.99,
    resumeStagingRun: null,
  };
  const seen = new Set();
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help") { if (args.length !== 1) throw new Error("--help must be used alone."); return { help: true }; }
    if (["--output", "--zbp", "--minimum-license-rows", "--maximum-quarantine-rate", "--minimum-naics-coverage-rate", "--resume-staging-run"].includes(argument)) {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value.`);
      if (seen.has(argument)) throw new Error(`${argument} may only be supplied once.`);
      seen.add(argument);
      index += 1;
      if (argument === "--output") options.output = value;
      if (argument === "--zbp") options.zbp = value;
      if (argument === "--minimum-license-rows") options.minimumLicenseRows = Number(value);
      if (argument === "--maximum-quarantine-rate") options.maximumQuarantineRate = Number(value);
      if (argument === "--minimum-naics-coverage-rate") options.minimumNaicsCoverageRate = Number(value);
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
    ? await publishAkActiveBusinessLicensesStaging({ outputRoot, stagingRunId: options.resumeStagingRun, signal: cancellation.signal })
    : await buildAkActiveBusinessLicenses({
      outputRoot,
      zbpPointer: assertInsideApp(path.resolve(APP_ROOT, options.zbp)),
      minimumLicenseRows: options.minimumLicenseRows,
      maximumQuarantineRate: options.maximumQuarantineRate,
      minimumNaicsCoverageRate: options.minimumNaicsCoverageRate,
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
  if (error.code === "AK_PUBLICATION_INCOMPLETE") {
    process.stderr.write("Alaska publication did not finalize cleanly; a release or pointer may already exist. Preserve and inspect evidence before another build or resume.\n");
    process.stderr.write(JSON.stringify({ status: "PUBLICATION_INCOMPLETE", phase: ["release-rename", "pointer-write", "pointer-rename", "post-publication"].includes(error.phase) ? error.phase : null, release_id: typeof error.releaseId === "string" && /^ak-active-business-licenses-[0-9TZ-]+-[a-f0-9]{8}$/.test(error.releaseId) ? error.releaseId : null }) + "\n");
  } else if (cancellation.signal.aborted) {
    process.stderr.write("Alaska build cancelled; inspect retained run evidence before resuming.\n");
  } else {
    process.stderr.write("Alaska build failed. Check arguments and prerequisites, and inspect retained run evidence before retrying; publication may require inspection.\n");
  }
  process.exitCode = 1;
} finally {
  cancellation.dispose();
}
