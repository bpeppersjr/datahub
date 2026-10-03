#!/usr/bin/env node
import { inspectAcsZctaDemographicPrerequisites } from "../runner/acs-zcta-demographic-admission.mjs";
const args = process.argv.slice(2);
if (args.shift() !== "inspect")
  throw new Error(
    "Usage: node scripts/build-acs-zcta-demographic-admission.mjs inspect [--config <file>]",
  );
let configPath;
for (let index = 0; index < args.length; index += 2) {
  const flag = args[index],
    value = args[index + 1];
  if (
    flag !== "--config" ||
    configPath !== undefined ||
    !value ||
    value.startsWith("--")
  )
    throw new Error(
      `Invalid, duplicate, or missing inspect flag: ${flag ?? "<missing>"}`,
    );
  configPath = value;
}
process.stdout.write(
  `${JSON.stringify(await inspectAcsZctaDemographicPrerequisites({ configPath }), null, 2)}\n`,
);
