#!/usr/bin/env node
import process from "node:process";
import { createCliCancellation } from "../runner/cli-cancellation.mjs";
import { importIndustryCandidate, INDUSTRY_CANDIDATE_SOURCE_KEYS } from "../runner/import-industry-candidate.mjs";

function usage() { return `Import one verified industry refresh into its isolated postal-migration candidate root.\n\nUsage:\n  node scripts/import-industry-candidate.mjs --source-key <key> --source-pointer <path> --expected-release-id <id> --expected-manifest-sha256 <sha256>\n\nAllowed keys: ${INDUSTRY_CANDIDATE_SOURCE_KEYS.join(", ")}\n`; }
function parse(argv) {
  const values = {}; const names = new Set(["--source-key", "--source-pointer", "--expected-release-id", "--expected-manifest-sha256"]);
  for (let index = 0; index < argv.length; index += 1) { const flag = argv[index]; if (flag === "--help") return { help: true }; if (!names.has(flag)) throw new Error(`Unknown argument: ${flag}`); const value = argv[++index]; if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value.`); if (Object.hasOwn(values, flag)) throw new Error(`${flag} may be specified only once.`); values[flag] = value; }
  for (const flag of names) if (!values[flag]) throw new Error(`${flag} is required.`);
  return { sourceKey: values["--source-key"], sourcePointer: values["--source-pointer"], expectedReleaseId: values["--expected-release-id"], expectedManifestSha256: values["--expected-manifest-sha256"] };
}

const cancellation = createCliCancellation();
try {
  const input = parse(process.argv.slice(2)); if (input.help) process.stdout.write(usage());
  else { const result = await importIndustryCandidate({ ...input, signal: cancellation.signal }); process.stdout.write(`${JSON.stringify({ status: result.receipt.status, source_key: result.receipt.source_key, release_id: result.receipt.release_id, candidate_pointer: result.receipt.candidate_pointer, receipt: result.receiptPath }, null, 2)}\n`); }
} catch (error) { process.stderr.write(`Industry candidate import failed: ${error.message}\n`); process.exitCode = 1; }
finally { cancellation.dispose(); }
