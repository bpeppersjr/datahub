#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import { buildCityStateDenominatorCandidate } from "../runner/usps-city-state-denominator-candidate.mjs";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";

function usage() {
  process.stdout.write("Usage: node scripts/build-usps-city-state-denominator-candidate.mjs --admission-manifest <manifest.json> --input <city-state.jsonl> --status-mapping <mapping.json> [--source-profile config/source-profiles/usps-city-state-operational-denominator.json] [--output data/zip-validity/usps-city-state-operational-denominator]\nOffline only: requires the verified City State admission and exact same operator-managed JSONL; publishes a local-restricted candidate with no pointer or production admission.\n");
}
function parseArguments(args) {
  const allowed = new Set(["--admission-manifest", "--input", "--status-mapping", "--source-profile", "--output"]);
  const values = {};
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i];
    if (!allowed.has(flag)) throw new Error(`Unknown or misplaced argument ${flag ?? "<missing>"}.`);
    if (Object.hasOwn(values, flag)) throw new Error(`Argument ${flag} was supplied more than once.`);
    const value = args[i + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`Argument ${flag} requires one value.`);
    values[flag] = value;
  }
  for (const required of ["--admission-manifest", "--input", "--status-mapping"]) if (!values[required]) throw new Error(`Missing required argument ${required}.`);
  return values;
}
const args = process.argv.slice(2);
if (args.length === 1 && args[0] === "--help") { usage(); process.exit(0); }
try {
  const values = parseArguments(args);
  const result = await buildCityStateDenominatorCandidate({
    admissionManifestPath: assertInsideApp(path.resolve(APP_ROOT, values["--admission-manifest"] ?? "")),
    inputPath: assertInsideApp(path.resolve(APP_ROOT, values["--input"] ?? "")),
    statusMappingPath: assertInsideApp(path.resolve(APP_ROOT, values["--status-mapping"] ?? "")),
    sourceProfilePath: assertInsideApp(path.resolve(APP_ROOT, values["--source-profile"] ?? "config/source-profiles/usps-city-state-operational-denominator.json")),
    outputRoot: assertInsideApp(path.resolve(APP_ROOT, values["--output"] ?? "data/zip-validity/usps-city-state-operational-denominator")),
  });
  process.stdout.write(`${JSON.stringify({ release_id: result.releaseId, release_directory: result.releaseDirectory, manifest: result.manifestPath }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`USPS City State denominator candidate failed: ${error.message}\n`);
  process.exitCode = 1;
}
