import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { DuckDBInstance } from "@duckdb/node-api";
import { APP_ROOT } from "./paths.mjs";
import { runOvertureExtraction } from "./overture-extraction-lifecycle.mjs";

test("native offline extraction closes its database while retaining selected output", async () => {
  const temporaryRoot = path.join(APP_ROOT, "data", "tmp");
  await mkdir(temporaryRoot, { recursive: true });
  const directory = await mkdtemp(path.join(temporaryRoot, "overture-lifecycle-native-"));
  const databasePath = path.join(directory, "extraction.duckdb");
  const outputPath = path.join(directory, "selected.jsonl");
  const createInstance = (filename) => DuckDBInstance.create(filename, {
    threads: "1", autoinstall_known_extensions: "false", autoload_known_extensions: "false",
  });
  try {
    const escapedOutput = outputPath.replaceAll("\\", "/").replaceAll("'", "''");
    await runOvertureExtraction({
      createInstance, databasePath,
      query: `COPY (SELECT 'offline-fixture' AS name) TO '${escapedOutput}' (FORMAT JSON, ARRAY false)`,
    });
    assert.deepEqual(JSON.parse(await readFile(outputPath, "utf8")), { name: "offline-fixture" });
    await assert.rejects(stat(databasePath), { code: "ENOENT" });
    await assert.rejects(stat(`${databasePath}.wal`), { code: "ENOENT" });
    // Exercise the native failure path against the same now-unlocked filename.
    await assert.rejects(runOvertureExtraction({ createInstance, databasePath, query: "THIS IS NOT SQL" }));
    await assert.rejects(stat(databasePath), { code: "ENOENT" });
    assert.deepEqual(JSON.parse(await readFile(outputPath, "utf8")), { name: "offline-fixture" });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
