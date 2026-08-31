#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { readFile } from "node:fs/promises";
import {
  buildIaBusinessRegistry,
  IA_BUSINESS_REGISTRY_SELECTED_SCHEMA,
  publishIaBusinessRegistryStaging,
} from "../runner/ia-business-registry.mjs";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";

function usage() {
  return `Build the governed Iowa active business-entity release.

Usage:
  node scripts/build-ia-business-registry.mjs [options]

Options:
  --output <path>       Output root (default: data/business-sources/ia-business-registry-active-entities)
  --zbp <path>          Census ZBP current.json prerequisite
  --minimum-entities <number>
                        Active-entity quality floor (default: 300000)
  --resume-staging-run <UUID>
                        Verify and publish one complete unpublished staging run without downloading again
  --resume-source-staging-run <UUID>
                        Revalidate a complete staged archive and normalize it into a new run
  --help                Show this help
`;
}

function parseArguments(args) {
  const options = {
    output: "data/business-sources/ia-business-registry-active-entities",
    zbp: "data/business-baselines/census-zbp/current.json",
    minimumEntities: 300_000,
    resumeStagingRun: null,
    resumeSourceStagingRun: null,
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help") return { help: true };
    if (["--output", "--zbp", "--minimum-entities", "--resume-staging-run", "--resume-source-staging-run"].includes(argument)) {
      const value = args[index + 1];
      if (!value) throw new Error(`${argument} requires a value.`);
      index += 1;
      if (argument === "--output") options.output = value;
      if (argument === "--zbp") options.zbp = value;
      if (argument === "--minimum-entities") options.minimumEntities = Number(value);
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

async function resumedSource(outputRoot, runId) {
  if (!runId) return null;
  const sourceDirectory = assertInsideApp(path.join(outputRoot, ".staging", runId, "source"));
  const preflight = JSON.parse(await readFile(path.join(sourceDirectory, "preflight.json"), "utf8"));
  return {
    sourceArchivePath: assertInsideApp(path.join(sourceDirectory, "active_iowa_business_entities_554_rows.zip")),
    metadataResponse: {
      data: {
        id: preflight.dataset_number,
        title: preflight.dataset_title,
        tableBaseName: preflight.table_name,
        status: preflight.status,
        audience: preflight.audience,
        columnUniqueIdentifier: preflight.unique_identifier,
        updateFrequency: preflight.update_frequency,
        numRows: preflight.expected_source_rows,
        modifiedAt: preflight.source_modified_at,
        metadata: { metadatafield15: `[CC BY](${preflight.license_url})` },
      },
    },
    columns: preflight.selected_schema.map(([name, type]) => ({ name, type })),
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
  const resumed = await resumedSource(outputRoot, options.resumeSourceStagingRun);
  if (resumed && JSON.stringify(resumed.columns.map(({ name, type }) => [name, type])) !== JSON.stringify(IA_BUSINESS_REGISTRY_SELECTED_SCHEMA)) {
    throw new Error("Staged Iowa selected schema does not match the current connector contract.");
  }
  const result = options.resumeStagingRun
    ? await publishIaBusinessRegistryStaging({ outputRoot, stagingRunId: options.resumeStagingRun })
    : await buildIaBusinessRegistry({
      outputRoot,
      zbpPointer: assertInsideApp(path.resolve(APP_ROOT, options.zbp)),
      minimumEntities: options.minimumEntities,
      ...resumed,
      logger: (message) => process.stdout.write(`${message}\n`),
    });
  process.stdout.write(`${JSON.stringify({
    release_id: result.manifest.release_id,
    release_directory: result.releaseDirectory,
    manifest: path.join(result.releaseDirectory, "manifest.json"),
    coverage: result.manifest.coverage,
  }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`Iowa Business Registry build failed: ${error.message}\n`);
  process.exitCode = 1;
}
