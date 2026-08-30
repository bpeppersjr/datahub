#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { buildUspsOperationalZipAssignments } from "../runner/usps-operational-zip-assignments.mjs";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";

function usage() {
  return `Build a governed local USPS operational ZIP assignment release.

Usage:
  node scripts/build-usps-operational-zip-assignments.mjs --use-basis <basis> [options]

Required:
  --use-basis <basis>           personal-noncommercial-home-use or usps-written-permission

Options:
  --permission-reference <id>   Non-secret written-permission reference; required with usps-written-permission
  --output <path>               Output root (default: data/zip-validity/usps-operational-zips)
  --help                        Show this help

This command does not grant USPS use or redistribution rights. Confirm that the selected basis is true before running it.
`;
}

function parseArguments(args) {
  const options = {
    output: "data/zip-validity/usps-operational-zips",
    useBasis: null,
    permissionReference: null,
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help") return { help: true };
    if (["--output", "--use-basis", "--permission-reference"].includes(argument)) {
      const value = args[index + 1];
      if (!value) throw new Error(`${argument} requires a value.`);
      index += 1;
      if (argument === "--output") options.output = value;
      if (argument === "--use-basis") options.useBasis = value;
      if (argument === "--permission-reference") options.permissionReference = value;
      continue;
    }
    throw new Error(`Unknown argument ${argument}.`);
  }
  return options;
}

try {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    process.exit(0);
  }
  const result = await buildUspsOperationalZipAssignments({
    outputRoot: assertInsideApp(path.resolve(APP_ROOT, options.output)),
    useAuthorization: {
      basis: options.useBasis,
      permissionReference: options.permissionReference,
    },
  });
  process.stdout.write(`${JSON.stringify({
    release_id: result.manifest.release_id,
    release_directory: result.releaseDirectory,
    manifest: path.join(result.releaseDirectory, "manifest.json"),
    source_month: result.manifest.source_month,
    coverage: result.manifest.coverage,
    export_policy: result.manifest.export_policy,
  }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`USPS operational ZIP build failed: ${error.message}\n`);
  process.exitCode = 1;
}
