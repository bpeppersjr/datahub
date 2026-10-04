#!/usr/bin/env node

import process from "node:process";
import { previewBenchmarkLabelFinalization, publishBenchmarkLabelFinalization } from "../runner/benchmark-label-finalization.mjs";

function parseArguments(args) {
  const options = {};
  const seen = new Set();
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (["--preview", "--publish"].includes(argument)) {
      if (seen.has("action")) throw new Error("Choose exactly one of --preview or --publish.");
      seen.add("action");
      if (options.action) throw new Error("Choose exactly one of --preview or --publish.");
      options.action = argument.slice(2);
    } else if (["--operator-id", "--expected-revision", "--preview-token", "--confirm"].includes(argument)) {
      if (seen.has(argument)) throw new Error(`${argument} may only be provided once.`);
      const value = args[index + 1];
      if (!value) throw new Error(`${argument} requires a value.`);
      index += 1;
      seen.add(argument);
      options[{ "--operator-id": "operatorId", "--expected-revision": "expectedRevision", "--preview-token": "previewToken", "--confirm": "confirmation" }[argument]] = value;
    } else throw new Error(`Unknown argument ${argument}.`);
  }
  if (!options.action || !options.operatorId || !options.expectedRevision) throw new Error("Provide one action, --operator-id, and --expected-revision.");
  if (options.action === "publish" && (!options.previewToken || options.confirmation !== "PUBLISH LABEL SNAPSHOT")) throw new Error("Publishing requires --preview-token and --confirm \"PUBLISH LABEL SNAPSHOT\".");
  if (options.action === "preview" && (options.previewToken || options.confirmation)) throw new Error("Preview does not accept publish confirmation fields.");
  return options;
}

try {
  const options = parseArguments(process.argv.slice(2));
  const result = options.action === "preview"
    ? await previewBenchmarkLabelFinalization(options)
    : await publishBenchmarkLabelFinalization(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (options.action === "preview" && !result.ready) process.exitCode = 2;
} catch (error) {
  process.stderr.write(`Entity-resolution benchmark label finalization failed: ${error.message}\n`);
  if (error.inspection_required) process.stderr.write("Publication state requires local inspection; do not retry with a new token.\n");
  process.exitCode = 1;
}
