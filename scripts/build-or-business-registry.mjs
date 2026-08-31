#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { readFile } from "node:fs/promises";
import {
  buildOrBusinessRegistry,
  OR_BUSINESS_REGISTRY_SCHEMA,
  publishOrBusinessRegistryStaging,
} from "../runner/or-business-registry.mjs";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";

function usage() {
  return `Build the governed Oregon active business-registration release.

Usage:
  node scripts/build-or-business-registry.mjs [options]

Options:
  --output <path>       Output root (default: data/business-sources/or-business-registry-active-registrations)
  --zbp <path>          Census ZBP current.json prerequisite
  --page-size <number>  Socrata keyset page size (default: 25000; maximum: 50000)
  --minimum-registrations <number>
                        Distinct-registration quality floor (default: 500000)
  --resume-staging-run <UUID>
                        Verify and publish one complete unpublished staging run without downloading again
  --resume-source-staging-run <UUID>
                        Revalidate and normalize a complete staged source snapshot into a new run
  --help                Show this help
`;
}

function parseArguments(args) {
  const options = {
    output: "data/business-sources/or-business-registry-active-registrations",
    zbp: "data/business-baselines/census-zbp/current.json",
    pageSize: 25_000,
    minimumRegistrations: 500_000,
    resumeStagingRun: null,
    resumeSourceStagingRun: null,
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help") return { help: true };
    if (["--output", "--zbp", "--page-size", "--minimum-registrations", "--resume-staging-run", "--resume-source-staging-run"].includes(argument)) {
      const value = args[index + 1];
      if (!value) throw new Error(`${argument} requires a value.`);
      index += 1;
      if (argument === "--output") options.output = value;
      if (argument === "--zbp") options.zbp = value;
      if (argument === "--page-size") options.pageSize = Number(value);
      if (argument === "--minimum-registrations") options.minimumRegistrations = Number(value);
      if (argument === "--resume-staging-run") options.resumeStagingRun = value;
      if (argument === "--resume-source-staging-run") options.resumeSourceStagingRun = value;
      continue;
    }
    throw new Error(`Unknown argument ${argument}.`);
  }
  if (options.resumeStagingRun && options.resumeSourceStagingRun) throw new Error("Only one resume mode may be selected.");
  return options;
}

function validUuid(value, argument) {
  if (value && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`${argument} requires a UUID.`);
  }
}

async function resumedCatalogMetadata(outputRoot, runId) {
  if (!runId) return null;
  const metadataPath = assertInsideApp(path.join(outputRoot, ".staging", runId, "source", "release-metadata.json"));
  const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
  return {
    id: metadata.dataset_id,
    name: metadata.dataset_name,
    description: "All Active businesses - Principal Place of Business address, Mailing address, Registered Agent, Authorized Representative.",
    license: metadata.catalog_license,
    rowsUpdatedAt: metadata.source_rows_updated_at_unix,
    selectedSourceRowCount: metadata.expected_selected_source_row_count,
    distinctRegistrationCount: metadata.expected_distinct_registration_count,
    columns: OR_BUSINESS_REGISTRY_SCHEMA
      .filter(([field]) => field !== ":id")
      .map(([fieldName, dataTypeName]) => ({ fieldName, dataTypeName })),
  };
}

try {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    process.exit(0);
  }
  validUuid(options.resumeStagingRun, "--resume-staging-run");
  validUuid(options.resumeSourceStagingRun, "--resume-source-staging-run");
  const outputRoot = assertInsideApp(path.resolve(APP_ROOT, options.output));
  const sourceSnapshotPath = options.resumeSourceStagingRun
    ? assertInsideApp(path.join(outputRoot, ".staging", options.resumeSourceStagingRun, "source", "active-business-principal-place-rows.jsonl.gz"))
    : null;
  const catalogMetadata = await resumedCatalogMetadata(outputRoot, options.resumeSourceStagingRun);
  const result = options.resumeStagingRun
    ? await publishOrBusinessRegistryStaging({ outputRoot, stagingRunId: options.resumeStagingRun })
    : await buildOrBusinessRegistry({
      outputRoot,
      zbpPointer: assertInsideApp(path.resolve(APP_ROOT, options.zbp)),
      pageSize: options.pageSize,
      minimumRegistrations: options.minimumRegistrations,
      sourceSnapshotPath,
      catalogMetadata,
      logger: (message) => process.stdout.write(`${message}\n`),
    });
  process.stdout.write(`${JSON.stringify({
    release_id: result.manifest.release_id,
    release_directory: result.releaseDirectory,
    manifest: path.join(result.releaseDirectory, "manifest.json"),
    coverage: result.manifest.coverage,
  }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`Oregon Business Registry build failed: ${error.message}\n`);
  process.exitCode = 1;
}
