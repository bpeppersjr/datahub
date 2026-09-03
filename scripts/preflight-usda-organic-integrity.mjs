#!/usr/bin/env node

import { realpath } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { preflightUsdaOrganicIntegrity, writeUsdaIntegrityPreflightReceipt } from "../runner/usda-organic-integrity.mjs";
import { APP_ROOT, assertInsideApp, relativeToApp } from "../runner/paths.mjs";

function usage() {
  return `Run the governed USDA Organic INTEGRITY metadata-only preflight.

Usage:
  node scripts/preflight-usda-organic-integrity.mjs --workbook-url <exact-official-url> [options]

Required:
  --workbook-url <url>  Exact https://organic.ams.usda.gov/Integrity/MonthlyReports/INTEGRITY_Data_YYYYMM01.xlsx URL

Options:
  --output <path>       Receipt directory inside datahub
                        (default: data/business-sources/usda-organic-integrity/preflights)
  --stdout-only         Print the receipt without writing it
  --help                Show this help

The command downloads only bounded history HTML and requires the exact expected monthly workbook link to appear there. It makes zero requests to the workbook URL and never writes current.json.
`;
}

function parseArguments(arguments_) {
  const result = { workbookUrl: null, output: "data/business-sources/usda-organic-integrity/preflights", stdoutOnly: false };
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--help") return { help: true };
    if (argument === "--stdout-only") { result.stdoutOnly = true; continue; }
    if (!["--workbook-url", "--output"].includes(argument)) throw new Error(`Unknown argument ${argument}.`);
    const value = arguments_[index + 1];
    if (!value) throw new Error(`${argument} requires a value.`);
    index += 1;
    if (argument === "--workbook-url") result.workbookUrl = value;
    if (argument === "--output") result.output = value;
  }
  if (!result.workbookUrl) throw new Error("--workbook-url is required.");
  return result;
}

function assertContained(root, candidate) {
  const relative = path.relative(root, candidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Receipt output resolves outside datahub.");
}

async function writableInsideApp(value) {
  const lexical = assertInsideApp(path.resolve(APP_ROOT, value));
  const root = await realpath(APP_ROOT);
  let ancestor = lexical;
  while (true) {
    try {
      assertContained(root, await realpath(ancestor));
      return lexical;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      const parent = path.dirname(ancestor);
      if (parent === ancestor) throw new Error("Receipt output has no existing in-datahub ancestor.");
      ancestor = parent;
    }
  }
}

try {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
  } else {
    const receipt = await preflightUsdaOrganicIntegrity({ workbookUrl: options.workbookUrl });
    if (options.stdoutOnly) {
      process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
    } else {
      const outputRoot = await writableInsideApp(options.output);
      const artifact = await writeUsdaIntegrityPreflightReceipt({ receipt, outputRoot });
      process.stdout.write(`${JSON.stringify({
        status: receipt.status,
        candidate_monthly_workbook: receipt.candidate_monthly_workbook,
        workbook_network_requests: 0,
        full_workbook_body_requests: 0,
        source_records_acquired: 0,
        receipt: relativeToApp(artifact.path),
        receipt_sha256: artifact.sha256,
      }, null, 2)}\n`);
    }
  }
} catch (error) {
  process.stderr.write(`USDA Organic INTEGRITY preflight failed: ${error.message}\n`);
  process.exitCode = 1;
}
