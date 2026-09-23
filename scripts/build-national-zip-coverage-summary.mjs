#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import {
  publishNationalZipCoverageSummary,
  verifyNationalZipCoverageSummary,
} from "../runner/national-zip-coverage-summary.mjs";
import { APP_ROOT } from "../runner/paths.mjs";

const ENROLLMENT_PATH = path.join(APP_ROOT, "config", "zip-quality-view-enrollment.json");

try {
  if (process.argv.includes("--help")) {
    process.stdout.write("Build and independently replay-verify one immutable, local-review-only national ZIP evidence summary from the currently enrolled registry. No downloads or production pointer changes.\n");
  } else {
    if (process.argv.length !== 2) throw new Error("This command accepts no arguments.");
    const enrollment = JSON.parse(await readFile(ENROLLMENT_PATH, "utf8"));
    const cohort = { cohort_id: enrollment.cohort_id, pointer: enrollment.pointer_path };
    const result = await publishNationalZipCoverageSummary({ cohort });
    const verified = await verifyNationalZipCoverageSummary(path.join(result.directory, "manifest.json"), { cohort });
    process.stdout.write(`${JSON.stringify(verified, null, 2)}\n`);
  }
} catch (error) {
  process.stderr.write(`National ZIP coverage summary failed: ${error.message}\n`);
  process.exitCode = 1;
}
