#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import { verifyCityStateDenominatorCandidate } from "../runner/usps-city-state-denominator-candidate.mjs";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";

function parseArguments(args) {
  const values = {};
  const allowed = new Set(["--admission-manifest", "--input", "--status-mapping", "--source-profile"]);
  if (!args[0] || args[0].startsWith("--")) throw new Error("A manifest path is required as the first argument.");
  for (let i = 1; i < args.length; i += 2) {
    const flag = args[i];
    if (!allowed.has(flag)) throw new Error(`Unknown or misplaced argument ${flag ?? "<missing>"}.`);
    if (Object.hasOwn(values, flag)) throw new Error(`Argument ${flag} was supplied more than once.`);
    const value = args[i + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`Argument ${flag} requires one value.`);
    values[flag] = value;
  }
  return { manifest: args[0], values };
}
const args = process.argv.slice(2);
if (args.length === 1 && args[0] === "--help") {
  process.stdout.write("Usage: node scripts/verify-usps-city-state-denominator-candidate.mjs <manifest.json> [--admission-manifest <manifest.json>] [--input <city-state.jsonl>] [--status-mapping <mapping.json>] [--source-profile <profile.json>]\n");
  process.exit(0);
}
try {
  const parsed = parseArguments(args);
  const manifestPath = assertInsideApp(path.resolve(APP_ROOT, parsed.manifest));
  const values = parsed.values;
  const result = await verifyCityStateDenominatorCandidate(manifestPath, {
    admissionManifestPath: values["--admission-manifest"] ? assertInsideApp(path.resolve(APP_ROOT, values["--admission-manifest"])) : undefined,
    inputPath: values["--input"] ? assertInsideApp(path.resolve(APP_ROOT, values["--input"])) : undefined,
    statusMappingPath: values["--status-mapping"] ? assertInsideApp(path.resolve(APP_ROOT, values["--status-mapping"])) : undefined,
    sourceProfilePath: values["--source-profile"] ? assertInsideApp(path.resolve(APP_ROOT, values["--source-profile"])) : undefined,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`USPS City State denominator candidate verification failed: ${error.message}\n`);
  process.exitCode = 1;
}
