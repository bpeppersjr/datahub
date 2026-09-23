import { buildBroadOrganizationZipEvidence } from "../runner/broad-organization-zip-evidence.mjs";

try {
  const controller = new AbortController();
  process.once("SIGINT", () => controller.abort()); process.once("SIGTERM", () => controller.abort());
  const output = process.argv.indexOf("--output");
  if (output >= 0 && !process.argv[output + 1]) throw new Error("--output requires a directory.");
  for (const arg of process.argv.slice(2)) if (arg !== "--output" && arg !== process.argv[output + 1]) throw new Error(`Unknown option ${arg}.`);
  const result = await buildBroadOrganizationZipEvidence({ ...(output >= 0 ? { outputRoot: process.argv[output + 1] } : {}), signal: controller.signal });
  process.stdout.write(JSON.stringify({ release_id: result.manifest.release_id, release_directory: result.releaseDirectory, conservation: result.manifest.conservation }) + "\n");
} catch (error) {
  process.stderr.write(`Broad organization ZIP evidence build failed: ${error.message}\n`); process.exitCode = 1;
}
