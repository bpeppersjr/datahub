#!/usr/bin/env node
import { createCliCancellation } from "../runner/cli-cancellation.mjs";
import { relativeToApp } from "../runner/paths.mjs";
import { preflightMnConstruction, writeMnConstructionPreflight } from "../runner/mn-construction-preflight.mjs";
const cancellation = createCliCancellation();
try {
  if (process.argv.length !== 2) throw new Error("No arguments supported. This command checks two fixed Minnesota CSV prefixes and retains headers only.");
  const receipt = await preflightMnConstruction({ signal: cancellation.signal });
  const saved = await writeMnConstructionPreflight(receipt, { signal: cancellation.signal });
  process.stdout.write(JSON.stringify({ ...saved, path: relativeToApp(saved.path), observations: receipt.observations, claims: receipt.claims }, null, 2) + "\n");
} catch (error) { process.stderr.write(error.message + "\n"); process.exitCode = 1; }
finally { cancellation.dispose(); }
