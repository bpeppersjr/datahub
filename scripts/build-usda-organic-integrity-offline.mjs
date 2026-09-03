#!/usr/bin/env node

import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { buildUsdaOrganicIntegrityOffline, USDA_INTEGRITY_OFFLINE_ACKNOWLEDGEMENT } from "../runner/usda-organic-integrity.mjs";
import { APP_ROOT, assertInsideApp, relativeToApp } from "../runner/paths.mjs";

function usage() {
  return `Build a local-review-only USDA Organic INTEGRITY offline staging run against the pinned conformance profile.

Usage:
  node scripts/build-usda-organic-integrity-offline.mjs --source <fixture.xlsx> --source-sha256 <hash> --preflight <receipt.json> --acknowledgement <exact-value> [options]

Required acknowledgement:
  ${USDA_INTEGRITY_OFFLINE_ACKNOWLEDGEMENT}

Options:
  --output <path>  Staging root (default: data/business-sources/usda-organic-integrity)
  --help           Show this help

The exact sheets and headers are a conformance profile, not a claim of compatibility with the uninspected live workbook. The archive cap is 128 MiB, with separate expanded-part limits. No current.json is written.
`;
}

function parseArguments(arguments_) {
  const result = { source: null, sourceSha256: null, preflight: null, acknowledgement: null, output: "data/business-sources/usda-organic-integrity" };
  const names = new Set(["--source", "--source-sha256", "--preflight", "--acknowledgement", "--output"]);
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--help") return { help: true };
    if (!names.has(argument)) throw new Error(`Unknown argument ${argument}.`);
    const value = arguments_[index + 1];
    if (!value) throw new Error(`${argument} requires a value.`);
    index += 1;
    if (argument === "--source") result.source = value;
    if (argument === "--source-sha256") result.sourceSha256 = value;
    if (argument === "--preflight") result.preflight = value;
    if (argument === "--acknowledgement") result.acknowledgement = value;
    if (argument === "--output") result.output = value;
  }
  if (!result.source || !result.sourceSha256 || !result.preflight || !result.acknowledgement) throw new Error("--source, --source-sha256, --preflight, and --acknowledgement are required.");
  return result;
}

function assertContained(root, candidate, label) {
  const relative = path.relative(root, candidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`${label} resolves outside datahub.`);
}

async function existingInsideApp(value, label) {
  const lexical = assertInsideApp(path.resolve(APP_ROOT, value));
  const [root, candidate] = await Promise.all([realpath(APP_ROOT), realpath(lexical)]);
  assertContained(root, candidate, label);
  return candidate;
}

async function writableInsideApp(value, label) {
  const lexical = assertInsideApp(path.resolve(APP_ROOT, value));
  const root = await realpath(APP_ROOT);
  let ancestor = lexical;
  while (true) {
    try {
      assertContained(root, await realpath(ancestor), label);
      return lexical;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      const parent = path.dirname(ancestor);
      if (parent === ancestor) throw new Error(`${label} has no existing in-datahub ancestor.`);
      ancestor = parent;
    }
  }
}

try {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
  } else {
    const sourcePath = await existingInsideApp(options.source, "Offline source");
    const preflightPath = await existingInsideApp(options.preflight, "Preflight receipt");
    const outputRoot = await writableInsideApp(options.output, "Staging output");
    const preflight = JSON.parse(await readFile(preflightPath, "utf8"));
    const result = await buildUsdaOrganicIntegrityOffline({
      sourcePath,
      outputRoot,
      preflight,
      acknowledgement: options.acknowledgement,
      expectedSourceSha256: options.sourceSha256,
    });
    process.stdout.write(`${JSON.stringify({
      dataset_id: result.manifest.dataset_id,
      release_id: result.manifest.release_id,
      status: result.manifest.status,
      manifest: relativeToApp(result.manifestPath),
      production_pointer_published: false,
      coverage: result.manifest.coverage,
    }, null, 2)}\n`);
  }
} catch (error) {
  process.stderr.write(`USDA Organic INTEGRITY offline build failed: ${error.message}\n`);
  if (error.failures) process.stderr.write(`${JSON.stringify(error.failures, null, 2)}\n`);
  process.exitCode = 1;
}
