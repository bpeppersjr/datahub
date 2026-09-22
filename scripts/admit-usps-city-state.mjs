#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import { readFile } from "node:fs/promises";
import { admitCityStateProjection } from "../runner/usps-city-state-admission.mjs";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";

const values = {};
for (let i = 2; i < process.argv.length; i += 2) values[process.argv[i]] = process.argv[i + 1];
if (process.argv.includes("--help")) {
  process.stdout.write("Usage: node scripts/admit-usps-city-state.mjs --input <jsonl> --declaration <json> --source-month YYYY-MM --source-version <id> --sha256 <hash> --bytes <n> --permission-reference <id> [--output data/zip-validity/usps-city-state]\nOffline only: writes governed local-restricted metadata; never downloads, stores credentials, copies licensed rows, changes a pointer, or admits production.\n");
  process.exit(0);
}
try {
  const declarationPath = assertInsideApp(path.resolve(APP_ROOT, values["--declaration"] ?? ""));
  const result = await admitCityStateProjection({
    inputPath: assertInsideApp(path.resolve(APP_ROOT, values["--input"] ?? "")),
    outputRoot: assertInsideApp(path.resolve(APP_ROOT, values["--output"] ?? "data/zip-validity/usps-city-state")),
    sourceMonth: values["--source-month"], sourceVersion: values["--source-version"],
    expectedSha256: values["--sha256"], expectedBytes: Number(values["--bytes"]),
    permissionReference: values["--permission-reference"],
    zipClassDeclaration: JSON.parse(await readFile(declarationPath, "utf8")),
  });
  process.stdout.write(`${JSON.stringify({ admission_id: result.admissionId, manifest: result.manifestPath }, null, 2)}\n`);
} catch (error) { process.stderr.write(`USPS City State admission failed: ${error.message}\n`); process.exitCode = 1; }
