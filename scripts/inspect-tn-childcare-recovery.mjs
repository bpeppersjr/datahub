#!/usr/bin/env node
import { inspectTnChildcareRecovery } from "../runner/tn-childcare-recovery-inspection.mjs";
import { createCliCancellation } from "../runner/cli-cancellation.mjs";

const cancellation = createCliCancellation();
try {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") process.stdout.write("Usage: node scripts/inspect-tn-childcare-recovery.mjs --receipt <failed receipt> --staging <exact UUID staging directory> --receipt-sha256 <hash> --selected-sha256 <hash> --observation-sha256 <hash> --xml-sha256 <hash>\nRead-only offline review; prints aggregate reasons and provenance pins, never rows. No network, writes, recovery publication or normalization override.\n");
  else {
    const names = { "--receipt": "receiptPath", "--staging": "stagingPath", "--receipt-sha256": "receipt", "--selected-sha256": "selectedFeatures", "--observation-sha256": "sourceObservation", "--xml-sha256": "publisherMetadata" }, parsed = {};
    for (let index = 0; index < args.length; index++) {
      const key = names[args[index]], value = args[++index];
      if (!key || Object.hasOwn(parsed, key) || !value || value.startsWith("--")) throw new Error("Invalid options"); parsed[key] = value;
    }
    if (Object.keys(parsed).length !== 6) throw new Error("Missing options");
    const { receiptPath, stagingPath, ...expectedHashes } = parsed;
    const result = await inspectTnChildcareRecovery({ receiptPath, stagingPath, expectedHashes, signal: cancellation.signal });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
} catch { process.stderr.write("Tennessee recovery inspection rejected; use --help and verify the exact failed-run evidence pins.\n"); process.exitCode = 1; }
finally { cancellation.dispose(); }
