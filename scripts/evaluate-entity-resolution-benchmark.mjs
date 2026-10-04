#!/usr/bin/env node

import process from "node:process";
import path from "node:path";
import { open, lstat, realpath } from "node:fs/promises";
import { parseBenchmarkLabelImport } from "../runner/benchmark-label-import.mjs";
import { getBenchmarkReviewState } from "../runner/benchmark-review-store.mjs";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";

async function readLabelFile(filename) {
  const absolute = assertInsideApp(path.resolve(APP_ROOT, filename));
  let cursor = path.parse(absolute).root;
  for (const segment of absolute.slice(cursor.length).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, segment);
    const info = await lstat(cursor);
    if (info.isSymbolicLink() || (cursor === absolute ? !info.isFile() || info.nlink !== 1 : !info.isDirectory())) throw new Error("Label diagnostic input must be a regular file without linked ancestors.");
  }
  const handle = await open(absolute, "r");
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.nlink !== 1 || before.size > 4 * 1024 * 1024) throw new Error("Label diagnostic input exceeds the bounded regular-file contract.");
    const bytes = await handle.readFile();
    const after = await handle.stat();
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || bytes.length !== after.size || await realpath(absolute) !== absolute) throw new Error("Label diagnostic input changed during bounded read.");
    return bytes;
  } finally { await handle.close(); }
}

try {
  const args = process.argv.slice(2);
  let labelsPath = null;
  if (args.length) {
    if (args.length !== 2 || args[0] !== "--labels" || !args[1]) throw new Error("Usage: evaluate-entity-resolution-benchmark.mjs [--labels <bounded-local-jsonl>]");
    labelsPath = args[1];
  }
  const state = await getBenchmarkReviewState({ limit: 1 });
  if (!state.available) throw new Error("No registered benchmark review sample is available.");
  let assessment = state.assessment;
  if (labelsPath) {
    const parsed = parseBenchmarkLabelImport(await readLabelFile(labelsPath));
    // The first review page is not the full sample; reload it in bounded pages
    // so external diagnostics still bind to the registered candidate universe.
    const candidates = [];
    for (let offset = 0; offset < state.pagination.total; offset += 100) {
      const page = await getBenchmarkReviewState({ offset, limit: 100 });
      candidates.push(...page.candidates);
    }
    const completeIds = new Set(candidates.map((row) => row.candidate_id));
    if (parsed.rows.some((row) => !completeIds.has(row.candidate_id))) throw new Error("Diagnostic labels include a candidate outside the registered sample.");
    const { evaluateBenchmarkLabels } = await import("../runner/entity-resolution-benchmark.mjs");
    assessment = evaluateBenchmarkLabels(candidates, parsed.rows);
  }
  process.stdout.write(`${JSON.stringify(assessment, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`Entity-resolution benchmark evaluation failed: ${error.message}\n`);
  process.exitCode = 1;
}
