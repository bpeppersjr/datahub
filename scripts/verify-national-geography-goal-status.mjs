#!/usr/bin/env node
import path from "node:path";
import { verifyNationalGeographyGoalStatus } from "../runner/national-geography-goal-status.mjs";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";
try { if (process.argv.length !== 3) throw new Error("Supply exactly one immutable manifest path."); const result = await verifyNationalGeographyGoalStatus(assertInsideApp(path.resolve(APP_ROOT, process.argv[2]))); process.stdout.write(`${JSON.stringify({ status: result.status, release_id: result.release_id, manifest_sha256: result.manifest_sha256, artifact_sha256: result.artifact_sha256 }, null, 2)}\n`); }
catch (error) { process.stderr.write(`National geography goal status verification failed: ${error.message}\n`); process.exitCode = 1; }
