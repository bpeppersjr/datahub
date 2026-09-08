#!/usr/bin/env node
import path from "node:path";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";
import { recoverTnChildcareRelease } from "../runner/tn-childcare-recovered-release.mjs";
import { createCliCancellation } from "../runner/cli-cancellation.mjs";

const cancellation = createCliCancellation();
try {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") process.stdout.write("Usage: node scripts/recover-tn-childcare.mjs --receipt <failed receipt> --staging <exact UUID staging> --receipt-sha256 <hash> --selected-sha256 <hash> --observation-sha256 <hash> --xml-sha256 <hash> [--output <separate datahub path>]\nOffline recovery of pinned failed-acquisition evidence using the fixed versioned recovery transformation. Preserves original bytes; publishes an independently verified local-review release. No network, freshness claim, caller transform/scope override or quality-gate relaxation.\n");
  else {
    const names = { "--receipt": "receiptPath", "--staging": "stagingPath", "--receipt-sha256": "receipt", "--selected-sha256": "selectedFeatures", "--observation-sha256": "sourceObservation", "--xml-sha256": "publisherMetadata", "--output": "outputRoot" }, parsed = {};
    for (let index = 0; index < args.length; index++) {
      const key = names[args[index]], value = args[++index];
      if (!key || Object.hasOwn(parsed, key) || !value || value.startsWith("--")) throw new Error("Invalid arguments"); parsed[key] = value;
    }
    const { receiptPath, stagingPath, outputRoot, ...expectedHashes } = parsed;
    if (!receiptPath || !stagingPath || Object.keys(expectedHashes).length !== 4 || Object.values(expectedHashes).some(value => !/^[a-f0-9]{64}$/.test(value))) throw new Error("Missing paths or provenance pins");
    const resolve = value => assertInsideApp(path.resolve(APP_ROOT, value));
    const result = await recoverTnChildcareRelease({ receiptPath: resolve(receiptPath), stagingPath: resolve(stagingPath), expectedHashes,
      ...(outputRoot === undefined ? {} : { outputRoot: resolve(outputRoot) }), signal: cancellation.signal });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
} catch { process.stderr.write("Tennessee childcare recovery failed; verify provenance pins, retained evidence, separate output path and cancellation status. No source reacquisition was attempted.\n"); process.exitCode = 1; }
finally { cancellation.dispose(); }
