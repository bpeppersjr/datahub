#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { verifyZctaGdpExecutionReadiness } from "../runner/zcta-gdp-execution-readiness.mjs";
const args = process.argv.slice(2);
let manifest;
if (args.length === 0) {
  const registration = JSON.parse(await readFile(new URL("../config/datasets/zcta-gdp-execution-readiness.json", import.meta.url), "utf8"));
  if (typeof registration?.retained_release?.manifest !== "string") throw Error("Registered readiness manifest is unavailable");
  manifest = registration.retained_release.manifest;
} else if (args.length === 2 && args[0] === "--manifest" && args[1] && !args[1].startsWith("--")) {
  manifest = args[1];
} else {
  throw Error("Usage: verify-zcta-gdp-execution-readiness [--manifest <manifest.json>]");
}
console.log(
  JSON.stringify(
    await verifyZctaGdpExecutionReadiness(manifest),
    null,
    2,
  ),
);
