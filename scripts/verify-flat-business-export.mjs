import path from "node:path";
import process from "node:process";
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createInterface } from "node:readline";
import { parse } from "csv-parse";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";

try {
  if (!process.argv[2]) throw new Error("Provide a flat-file export manifest path.");
  const manifestPath = assertInsideApp(path.resolve(APP_ROOT, process.argv[2]));
  const root = path.dirname(manifestPath);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.dataset_id !== "flat-business-export" || manifest.status !== "published-local" || !Array.isArray(manifest.artifacts)) throw new Error("Expected a published flat-file export manifest.");
  let jsonlRows = null;
  let csvRows = null;
  for (const artifact of manifest.artifacts) {
    if (typeof artifact.path !== "string" || path.basename(artifact.path) !== artifact.path) throw new Error("Artifact must be a file within the export directory.");
    const file = path.join(root, artifact.path);
    const hash = createHash("sha256"); let bytes = 0;
    for await (const chunk of createReadStream(file)) { hash.update(chunk); bytes += chunk.length; }
    if (bytes !== artifact.bytes || hash.digest("hex") !== artifact.sha256) throw new Error(`Checksum mismatch: ${artifact.path}`);
    if (artifact.artifact_type === "flat-business-jsonl") {
      jsonlRows = 0;
      for await (const line of createInterface({ input: createReadStream(file), crlfDelay: Infinity })) {
        if (!line.trim()) continue;
        const row = JSON.parse(line);
        for (const field of manifest.fields) if (!Object.hasOwn(row, field)) throw new Error(`Missing selected field: ${field}`);
        if (row.zip_code != null && !/^\d{5}$/.test(row.zip_code)) throw new Error("Invalid ZIP5 output.");
        if (row.zip4 != null && !/^\d{4}$/.test(row.zip4)) throw new Error("Invalid separate ZIP4 output.");
        if (Object.hasOwn(row, "latitude") && Object.hasOwn(row, "longitude")) {
          if ((row.latitude == null) !== (row.longitude == null)) throw new Error("Unpaired coordinates.");
          if (row.latitude != null && (!Number.isFinite(row.latitude) || Math.abs(row.latitude) > 90 || !Number.isFinite(row.longitude) || Math.abs(row.longitude) > 180)) throw new Error("Invalid coordinates.");
        }
        jsonlRows += 1;
      }
      if (jsonlRows !== artifact.records) throw new Error("JSONL row count mismatch.");
    }
    if (artifact.artifact_type === "flat-business-csv") {
      csvRows = 0;
      for await (const row of createReadStream(file).pipe(parse({ columns: true }))) {
        for (const field of manifest.fields) if (!Object.hasOwn(row, field)) throw new Error(`Missing CSV field: ${field}`);
        csvRows += 1;
      }
      if (csvRows !== artifact.records) throw new Error("CSV row count mismatch.");
    }
  }
  if (jsonlRows === null && csvRows === null) throw new Error("No flat-file artifact found.");
  if (jsonlRows !== null && csvRows !== null && jsonlRows !== csvRows) throw new Error("Formats have different row counts.");
  process.stdout.write(`${JSON.stringify({ verified: true, release_id: manifest.release_id, csv_rows: csvRows, jsonl_rows: jsonlRows, artifacts: manifest.artifacts.length })}\n`);
} catch (error) { process.stderr.write(`Flat-file verification failed: ${error.message}\n`); process.exitCode = 1; }
