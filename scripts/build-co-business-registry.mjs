#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { buildCoBusinessRegistry, publishCoBusinessRegistryStaging } from "../runner/co-business-registry.mjs";
import { createCliCancellation } from "../runner/cli-cancellation.mjs";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";

function usage() {
  return `Build the governed Colorado Good Standing or Delinquent Business Entities organization release.

Usage:
  node scripts/build-co-business-registry.mjs [options]

Options:
  --output <path>       Output root (default: data/business-sources/co-business-registry-good-standing-or-delinquent-organizations)
  --zbp <path>          Census ZBP current.json prerequisite
  --page-size <number>  Socrata keyset page size (default: 25000; maximum: 50000)
  --resume-staging-run <UUID>
                        Verify and publish one complete unpublished staging run without downloading again
  --resume-source-staging-run <UUID>
                        Revalidate and normalize a complete staged source snapshot into a new run
  --help                Show this help
`;
}

function parseArguments(args) {
  const options = {
    output: "data/business-sources/co-business-registry-good-standing-or-delinquent-organizations",
    zbp: "data/business-baselines/census-zbp/current.json",
    pageSize: 25_000,
    resumeStagingRun: null,
    resumeSourceStagingRun: null,
  };
  const seen = new Set();
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help") return { help: true };
    if (["--output", "--zbp", "--page-size", "--resume-staging-run", "--resume-source-staging-run"].includes(argument)) {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value.`);
      if (seen.has(argument)) throw new Error(`${argument} may only be supplied once.`);
      seen.add(argument);
      index += 1;
      if (argument === "--output") options.output = value;
      if (argument === "--zbp") options.zbp = value;
      if (argument === "--page-size") options.pageSize = Number(value);
      if (argument === "--resume-staging-run") options.resumeStagingRun = value;
      if (argument === "--resume-source-staging-run") options.resumeSourceStagingRun = value;
      continue;
    }
    throw new Error(`Unknown argument ${argument}.`);
  }
  if (options.resumeStagingRun && options.resumeSourceStagingRun) throw new Error("Only one resume mode may be selected.");
  return options;
}

const cancellation = createCliCancellation();
try {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
  } else {
  const outputRoot = assertInsideApp(path.resolve(APP_ROOT, options.output));
  for (const [value, argument] of [[options.resumeStagingRun, "--resume-staging-run"], [options.resumeSourceStagingRun, "--resume-source-staging-run"]]) {
    if (value && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new Error(`${argument} requires a UUID.`);
  }
  const sourceSnapshotPath = options.resumeSourceStagingRun
    ? assertInsideApp(path.join(outputRoot, ".staging", options.resumeSourceStagingRun, "source", "good-standing-or-delinquent-business-entities.jsonl.gz"))
    : null;
  const result = options.resumeStagingRun
    ? await publishCoBusinessRegistryStaging({ outputRoot, stagingRunId: options.resumeStagingRun, signal: cancellation.signal })
    : await buildCoBusinessRegistry({
      outputRoot,
      zbpPointer: assertInsideApp(path.resolve(APP_ROOT, options.zbp)),
      pageSize: options.pageSize,
      sourceSnapshotPath,
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
  process.stderr.write(cancellation.signal.aborted ? "Colorado Business Registry build cancelled; inspect retained run evidence before resuming.\n" : `Colorado Business Registry build failed: ${error.message}\n`);
  process.exitCode = 1;
} finally {
  cancellation.dispose();
}
