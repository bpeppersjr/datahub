#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { readFile } from "node:fs/promises";
import { verifyAkActiveBusinessLicenses } from "../runner/ak-active-business-licenses.mjs";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";
import { createCliCancellation } from "../runner/cli-cancellation.mjs";

const cancellation = createCliCancellation();
try {
  if (process.argv.length === 3 && process.argv[2] === "--help") {
    process.stdout.write("Usage: node scripts/verify-ak-active-business-licenses.mjs [manifest-or-pointer]\nRead-only verification; no source acquisition.\n");
  } else {
  if (process.argv.length > 3 || process.argv[2]?.startsWith("--")) throw new Error("Provide at most one manifest or pointer path.");
  const requested = process.argv[2] ?? "data/business-sources/ak-active-business-licenses/current.json";
  const requestedPath = assertInsideApp(path.resolve(APP_ROOT, requested));
  const input = JSON.parse(await readFile(requestedPath, { encoding: "utf8", signal: cancellation.signal }));
  const manifestPath = input.manifest
    ? assertInsideApp(path.resolve(path.dirname(requestedPath), input.manifest))
    : requestedPath;
  const result = await verifyAkActiveBusinessLicenses(manifestPath, { signal: cancellation.signal });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
} catch {
  process.stderr.write(cancellation.signal.aborted ? "Alaska verification cancelled; retained evidence was not changed.\n" : "Alaska verification failed. Check the requested path and inspect retained evidence; no acquisition was performed.\n");
  process.exitCode = 1;
} finally {
  cancellation.dispose();
}
