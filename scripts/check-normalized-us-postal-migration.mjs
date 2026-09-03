#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { realpath, writeFile } from "node:fs/promises";

import {
  DEFAULT_NORMALIZED_US_POSTAL_MIGRATION_DEFINITION,
  formatNormalizedUsPostalMigrationReport,
  inspectNormalizedUsPostalMigration,
} from "../runner/normalized-us-postal-migration.mjs";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";

function usage() {
  return `Inspect the ordered ZIP5/ZIP4 source migration without rebuilding data.

Usage:
  node scripts/check-normalized-us-postal-migration.mjs [options]

Options:
  --json               Emit the machine-readable report.
  --allow-pending      Return success when rebuilds are still required.
  --definition <path>  Migration definition inside datahub.
  --pointer <key=path> Inspect an alternate current.json for one source key.
  --write-plan <path>  Exclusively create a frozen JSON readiness plan inside datahub.
  --help               Show this help.
`;
}

function parseArguments(args) {
  const options = {
    allowPending: false,
    json: false,
    definitionPath: DEFAULT_NORMALIZED_US_POSTAL_MIGRATION_DEFINITION,
    pointerOverrides: {},
    writePlan: null,
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help") return { help: true };
    if (argument === "--json") {
      options.json = true;
      continue;
    }
    if (argument === "--allow-pending") {
      options.allowPending = true;
      continue;
    }
    if (argument === "--definition") {
      const value = args[index + 1];
      if (!value) throw new Error("--definition requires a path.");
      options.definitionPath = value;
      index += 1;
      continue;
    }
    if (argument === "--pointer") {
      const value = args[index + 1];
      if (!value?.includes("=")) throw new Error("--pointer requires key=path.");
      const separator = value.indexOf("=");
      const key = value.slice(0, separator);
      const pointer = value.slice(separator + 1);
      if (!key || !pointer) throw new Error("--pointer requires non-empty key=path values.");
      options.pointerOverrides[key] = assertInsideApp(path.resolve(APP_ROOT, pointer));
      index += 1;
      continue;
    }
    if (argument === "--write-plan") {
      const value = args[index + 1];
      if (!value) throw new Error("--write-plan requires a path.");
      options.writePlan = assertInsideApp(path.resolve(APP_ROOT, value));
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument ${argument}.`);
  }
  return options;
}

async function assertWriteParentInsideApp(filePath) {
  const [realRoot, realParent] = await Promise.all([realpath(APP_ROOT), realpath(path.dirname(filePath))]);
  const relative = path.relative(realRoot, realParent);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("--write-plan parent crosses a link or junction outside the datahub folder.");
  }
}

try {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    process.exit(0);
  }
  const report = await inspectNormalizedUsPostalMigration({
    definitionPath: options.definitionPath,
    pointerOverrides: options.pointerOverrides,
  });
  if (options.writePlan) {
    await assertWriteParentInsideApp(options.writePlan);
    await writeFile(options.writePlan, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
  }
  process.stdout.write(options.json ? `${JSON.stringify(report, null, 2)}\n` : formatNormalizedUsPostalMigrationReport(report));
  if (!report.ready_for_registry_2_10 && !options.allowPending) process.exitCode = 1;
} catch (error) {
  process.stderr.write(`Normalized U.S. postal migration check failed: ${error.message}\n`);
  process.exitCode = 1;
}
