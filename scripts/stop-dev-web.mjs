import { setTimeout as delay } from "node:timers/promises";
import { readDevSession, requestDevStop } from "../runner/dev-stop-control.mjs";

try {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== "--run-id")) throw new Error("Usage: node scripts/stop-dev-web.mjs [--run-id UUID]");
  const requested = await requestDevStop({ id: args[1] });
  const deadline = Date.now() + 45_000;
  let current = requested;
  while (current.status !== "STOPPED" && Date.now() < deadline) {
    await delay(200);
    current = await readDevSession({ id: requested.id });
  }
  if (current.status !== "STOPPED") throw new Error("Stop requested but not confirmed. Inspect the launcher and receipts; no process was force-killed by this command.");
  process.stdout.write("Co*Tive development services stopped. Separate reconciliation processes were not targeted.\n");
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
