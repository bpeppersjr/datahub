import path from "node:path";
import { APP_ROOT } from "../runner/paths.mjs";
import { buildUtahBusinessListReplayPackage } from "../runner/utah-business-list-workbook-replay.mjs";

const args = Object.fromEntries(process.argv.slice(2).map((value, index, all) => value.startsWith("--") ? [value.slice(2), all[index + 1]] : null).filter(Boolean));
const usage = "Usage: node scripts/build-utah-business-list-replay.mjs --workbook data/imports/utah-business-list/workbooks/<file>.xlsx --package-id <id> --observed-at <ISO> --updated-through <YYYY-MM-DD>";
try {
  if (!exactArgs() || args.help) throw new Error(usage);
  const result = await buildUtahBusinessListReplayPackage({ workbookPath: path.resolve(APP_ROOT, args.workbook), packageId: args["package-id"], observedAt: args["observed-at"], updatedThrough: args["updated-through"] });
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
function exactArgs() { const raw = process.argv.slice(2), flags = raw.filter((_, index) => index % 2 === 0); return raw.length === 8 && new Set(flags).size === 4 && flags.every(value => ["--workbook", "--package-id", "--observed-at", "--updated-through"].includes(value)) && raw.every((value, index) => index % 2 === 0 || !value.startsWith("--")); }
