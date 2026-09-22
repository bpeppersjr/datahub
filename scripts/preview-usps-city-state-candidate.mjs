#!/usr/bin/env node

import process from "node:process";
import { previewUspsCityStateCandidate } from "../runner/usps-city-state-registry-preview.mjs";

function usage() {
  return `Read-only preview of a verified USPS City State candidate.

Usage:
  node scripts/preview-usps-city-state-candidate.mjs --candidate-manifest <path> --admission-manifest <path> --input <path> --status-mapping <path> [options]

Options:
  --zip-universe <path>  Optional JSON file containing an array of ZIP5 strings for absence comparison
  --zip-prefix <digits>  Filter returned ZIP5 rows by prefix
  --zip-class <class>    Filter by standard, po-box, unique, or military
  --source-status <id>   Filter by source status
  --membership-status <id> Filter by listed/not-listed candidate membership
  --offset <n>           Page offset (default 0)
  --limit <n>            Page size, maximum 500 (default 100)
`;
}

function parse(args) {
  const result = {};
  const keys = {
    "--candidate-manifest": "candidateManifestPath",
    "--admission-manifest": "admissionManifestPath",
    "--input": "inputPath",
    "--status-mapping": "statusMappingPath",
    "--zip-prefix": "zipPrefix",
    "--zip-class": "zipClass",
    "--source-status": "sourceStatus",
    "--membership-status": "membershipStatus",
    "--offset": "offset",
    "--limit": "limit",
    "--zip-universe": "zip5UniversePath",
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help") return { help: true };
    const key = keys[argument];
    if (!key) throw new Error(`Unknown or misplaced argument ${argument}.`);
    const value = args[++index];
    if (!value || value.startsWith("--") || result[key] !== undefined) throw new Error(`${argument} requires one value and may appear only once.`);
    result[key] = value;
  }
  for (const required of ["candidateManifestPath", "admissionManifestPath", "inputPath", "statusMappingPath"]) if (!result[required]) throw new Error(`Missing required ${required}.`);
  return result;
}

try {
  const options = parse(process.argv.slice(2));
  if (options.help) { process.stdout.write(usage()); process.exit(0); }
  const result = await previewUspsCityStateCandidate(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`USPS City State preview failed: ${error.message}\n`);
  process.exitCode = 1;
}
