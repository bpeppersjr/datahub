#!/usr/bin/env node
import path from "node:path";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";
import { createCliCancellation } from "../runner/cli-cancellation.mjs";
import { readOhChildcareAcquiredEvidence } from "../runner/oh-childcare-acquired-release.mjs";
import { buildOhChildcareRelease } from "../runner/oh-childcare-release.mjs";

const cancellation = createCliCancellation();
try {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") process.stdout.write("Usage: node scripts/reprocess-oh-childcare.mjs <acquisition-manifest.json> [--output <datahub path>]\nVerifies and normalizes an existing Ohio acquisition into an offline local-review release without downloading again.\n");
  else {
    if (![1, 3].includes(args.length) || !args[0] || args[0].startsWith("--") || args.length === 3 && (args[1] !== "--output" || !args[2] || args[2].startsWith("--"))) throw new Error("Invalid arguments.");
    const manifest = assertInsideApp(path.resolve(APP_ROOT, args[0]));
    const source = await readOhChildcareAcquiredEvidence(manifest, { signal: cancellation.signal });
    const outputRoot = args[2] ? assertInsideApp(path.resolve(APP_ROOT, args[2])) : undefined;
    const release = await buildOhChildcareRelease({ evidence: source.evidence, outputRoot, signal: cancellation.signal });
    process.stdout.write(`${JSON.stringify({ ...release, acquisition_manifest_path: source.verification.manifest_path, acquisition_manifest_sha256: source.verification.manifest_sha256 }, null, 2)}\n`);
  }
} catch (error) {
  const detail = typeof error.message === "string" && error.message.startsWith("Ohio ") ? error.message : "Supply an intact immutable acquisition manifest and a writable output inside datahub.";
  process.stderr.write(`Ohio reprocessing failed: ${detail} No acquisition performed.\n`); process.exitCode = 1;
} finally { cancellation.dispose(); }
