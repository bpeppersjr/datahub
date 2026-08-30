#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { buildFdicBankfind } from "../runner/fdic-bankfind.mjs";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";

function usage() {
  return `Build the governed FDIC BankFind current institution/location release.

Usage:
  node scripts/build-fdic-bankfind.mjs [options]

Options:
  --output <path>      Output root (default: data/business-sources/fdic-bankfind)
  --zbp <path>         Census ZBP current.json prerequisite
  --page-size <count>  API page size, maximum 10000 (default: 10000)
  --help               Show this help
`;
}

function parseArguments(args) {
  const options = {
    output: "data/business-sources/fdic-bankfind",
    zbp: "data/business-baselines/census-zbp/current.json",
    pageSize: 10_000,
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help") return { help: true };
    if (["--output", "--zbp", "--page-size"].includes(argument)) {
      const value = args[index + 1];
      if (!value) throw new Error(`${argument} requires a value.`);
      index += 1;
      if (argument === "--output") options.output = value;
      if (argument === "--zbp") options.zbp = value;
      if (argument === "--page-size") options.pageSize = Number(value);
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
  const result = await buildFdicBankfind({
    outputRoot: assertInsideApp(path.resolve(APP_ROOT, options.output)),
    zbpPointer: assertInsideApp(path.resolve(APP_ROOT, options.zbp)),
    pageSize: options.pageSize,
    logger: (message) => process.stdout.write(`${message}\n`),
  });
  process.stdout.write(`${JSON.stringify({
    release_id: result.manifest.release_id,
    release_directory: result.releaseDirectory,
    manifest: path.join(result.releaseDirectory, "manifest.json"),
    coverage: result.manifest.coverage,
  }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`FDIC BankFind build failed: ${error.message}\n`);
  process.exitCode = 1;
}
