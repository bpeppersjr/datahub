#!/usr/bin/env node
import path from "node:path";
import { pathToFileURL } from "node:url";
import { writeStateAccessReport } from "../runner/state-access-ledger.mjs";

function parseArguments(argv) {
  const activeAssignments = []; let observedTotalActiveAgents = null;
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (option === "--active-state") {
      const value = argv[++index]; if (!value) throw new Error("--active-state requires a state code."); activeAssignments.push(value);
    } else if (option === "--observed-total-active-agents") {
      const value = argv[++index]; if (!value || !/^\d+$/.test(value)) throw new Error("--observed-total-active-agents requires an integer."); observedTotalActiveAgents = Number(value);
    } else throw new Error(`Unknown option: ${option}`);
  }
  return { activeAssignments, observedTotalActiveAgents };
}

export async function main(argv = process.argv.slice(2)) {
  const result = await writeStateAccessReport(parseArguments(argv));
  process.stdout.write(`${JSON.stringify({ reportPath: path.relative(process.cwd(), result.reportPath).replaceAll("\\", "/"), summary: result.ledger.summary, dispatch: result.ledger.dispatch })}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
