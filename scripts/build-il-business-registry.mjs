#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { buildIllinoisBusinessRegistry, publishIllinoisBusinessRegistryStaging } from "../runner/il-business-registry.mjs";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";

function usage() {
  return `Build the governed offline Illinois corporation and LLC organization release.

Place the five official files inside datahub first. Each input can be one ZIP containing
one fixed-width file, or the extracted fixed-width file itself.

Usage:
  node scripts/build-il-business-registry.mjs [options]

Options:
  --corporation-master <path>  Corporation master input
  --corporation-name <path>    Corporation company-name input
  --corporation-annual <path>  Corporation annual-report input
  --llc-master <path>          LLC master input
  --llc-name <path>            LLC name input
  --output <path>              Output root
  --zbp <path>                 Census ZBP current.json prerequisite
  --minimum <number>           Minimum selected organizations (default: 500000)
  --resume-staging-run <UUID>  Verify and publish one complete staging run
  --help                       Show this help
`;
}

function parseArguments(args) {
  const options = {
    corporationMaster: "downloads/illinois/corporation-master.zip",
    corporationName: "downloads/illinois/corporation-name.zip",
    corporationAnnual: "downloads/illinois/corporation-annual-report.zip",
    llcMaster: "downloads/illinois/llc-master.zip",
    llcName: "downloads/illinois/llc-name.zip",
    output: "data/business-sources/il-business-registry-active-organizations",
    zbp: "data/business-baselines/census-zbp/current.json",
    minimum: 500_000,
    resumeStagingRun: null,
  };
  const names = new Set(["--corporation-master", "--corporation-name", "--corporation-annual", "--llc-master", "--llc-name", "--output", "--zbp", "--minimum", "--resume-staging-run"]);
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help") return { help: true };
    if (!names.has(argument)) throw new Error(`Unknown argument ${argument}.`);
    const value = args[index + 1];
    if (!value) throw new Error(`${argument} requires a value.`);
    index += 1;
    if (argument === "--corporation-master") options.corporationMaster = value;
    if (argument === "--corporation-name") options.corporationName = value;
    if (argument === "--corporation-annual") options.corporationAnnual = value;
    if (argument === "--llc-master") options.llcMaster = value;
    if (argument === "--llc-name") options.llcName = value;
    if (argument === "--output") options.output = value;
    if (argument === "--zbp") options.zbp = value;
    if (argument === "--minimum") options.minimum = Number(value);
    if (argument === "--resume-staging-run") options.resumeStagingRun = value;
  }
  return options;
}

try {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    process.exit(0);
  }
  const outputRoot = assertInsideApp(path.resolve(APP_ROOT, options.output));
  const result = options.resumeStagingRun
    ? await publishIllinoisBusinessRegistryStaging({ outputRoot, stagingRunId: options.resumeStagingRun })
    : await buildIllinoisBusinessRegistry({
      outputRoot,
      zbpPointer: assertInsideApp(path.resolve(APP_ROOT, options.zbp)),
      sourcePaths: {
        corporation_master: assertInsideApp(path.resolve(APP_ROOT, options.corporationMaster)),
        corporation_name: assertInsideApp(path.resolve(APP_ROOT, options.corporationName)),
        corporation_annual: assertInsideApp(path.resolve(APP_ROOT, options.corporationAnnual)),
        llc_master: assertInsideApp(path.resolve(APP_ROOT, options.llcMaster)),
        llc_name: assertInsideApp(path.resolve(APP_ROOT, options.llcName)),
      },
      allowedRoot: APP_ROOT,
      minimumOrganizations: options.minimum,
      logger: (message) => process.stdout.write(`${message}\n`),
    });
  process.stdout.write(`${JSON.stringify({ release_id: result.manifest.release_id, release_directory: result.releaseDirectory, manifest: path.join(result.releaseDirectory, "manifest.json"), coverage: result.manifest.coverage }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`Illinois Business Registry build failed: ${error.message}\n`);
  process.exitCode = 1;
}
