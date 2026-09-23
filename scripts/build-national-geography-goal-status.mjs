#!/usr/bin/env node
import { publishNationalGeographyGoalStatus } from "../runner/national-geography-goal-status.mjs";
try { if (process.argv.length !== 2) throw new Error("This command accepts no arguments."); const result = await publishNationalGeographyGoalStatus(); process.stdout.write(`${JSON.stringify({ release_id: result.manifest.release_id, artifact_sha256: result.manifest.artifacts[0].sha256 }, null, 2)}\n`); }
catch (error) { process.stderr.write(`National geography goal status build failed: ${error.message}\n`); process.exitCode = 1; }
