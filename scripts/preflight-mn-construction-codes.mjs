#!/usr/bin/env node
import { createCliCancellation } from "../runner/cli-cancellation.mjs";
import { relativeToApp } from "../runner/paths.mjs";
import { preflightMnConstructionCodes, writeMnConstructionPreflight } from "../runner/mn-construction-preflight.mjs";
const cancellation = createCliCancellation();
try {
  if (process.argv.length !== 2) throw new Error("No arguments supported. Inspects two fixed 4096-byte prefixes for aggregate codes only.");
  const receipt = await preflightMnConstructionCodes({ signal: cancellation.signal });
  const saved = await writeMnConstructionPreflight(receipt, { signal: cancellation.signal });
  process.stdout.write(JSON.stringify({ ...saved, path: relativeToApp(saved.path), observations: receipt.observations.map((o) => ({ url: o.url, observed_at: o.observed_at, code_profile: o.code_profile })), claims: receipt.claims }, null, 2) + "\n");
} catch (error) { process.stderr.write(error.message + "\n"); process.exitCode = 1; }
finally { cancellation.dispose(); }
