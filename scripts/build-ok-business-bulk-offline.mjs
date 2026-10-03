#!/usr/bin/env node
import path from "node:path";
import { buildOkBusinessBulkOffline } from "../runner/ok-business-bulk-offline.mjs";
const args = process.argv.slice(2), value = flag => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };
if (args.length === 1 && args[0] === "--help") { console.log("Usage: node scripts/build-ok-business-bulk-offline.mjs --selection ABSOLUTE_SELECTION_JSON --output ABSOLUTE_NEW_OUTPUT_DIRECTORY"); process.exit(0); }
try { console.log(JSON.stringify(await buildOkBusinessBulkOffline({ selectionPath: path.resolve(value("--selection") ?? ""), outputDirectory: path.resolve(value("--output") ?? "") }), null, 2)); }
catch (error) { console.error(error.message); process.exitCode = 1; }
