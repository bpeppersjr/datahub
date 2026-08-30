#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { buildNcuaQuarterly } from "../runner/ncua-quarterly.mjs";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";

function usage() {
  return `Build the governed NCUA final quarterly credit-union release.

Usage:
  node scripts/build-ncua-quarterly.mjs [options]

Options:
  --output <path>  Output root (default: data/business-sources/ncua-quarterly-credit-unions)
  --zbp <path>     Census ZBP current.json prerequisite
  --source <url>   Exact official quarterly ZIP URL; otherwise discover the newest posted release
  --help           Show this help
`;
}

function parseArguments(args) {
  const options = {
    output: "data/business-sources/ncua-quarterly-credit-unions",
    zbp: "data/business-baselines/census-zbp/current.json",
    source: null,
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help") return { help: true };
    if (["--output", "--zbp", "--source"].includes(argument)) {
      const value = args[index + 1];
      if (!value) throw new Error(`${argument} requires a value.`);
      index += 1;
      if (argument === "--output") options.output = value;
      if (argument === "--zbp") options.zbp = value;
      if (argument === "--source") options.source = value;
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
  const result = await buildNcuaQuarterly({
    outputRoot: assertInsideApp(path.resolve(APP_ROOT, options.output)),
    zbpPointer: assertInsideApp(path.resolve(APP_ROOT, options.zbp)),
    sourceUrl: options.source,
    logger: (message) => process.stdout.write(`${message}\n`),
  });
  process.stdout.write(`${JSON.stringify({
    release_id: result.manifest.release_id,
    release_directory: result.releaseDirectory,
    manifest: path.join(result.releaseDirectory, "manifest.json"),
    coverage: result.manifest.coverage,
  }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`NCUA quarterly build failed: ${error.message}\n`);
  process.exitCode = 1;
}
