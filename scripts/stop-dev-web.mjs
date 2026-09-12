import { setTimeout as delay } from "node:timers/promises";
import { readDevSession, requestDevStop } from "../runner/dev-stop-control.mjs";
import path from "node:path";
import { APP_ROOT } from "../runner/paths.mjs";

try {
  const args = process.argv.slice(2);
  if (args.length && !(args.length === 1 && args[0] === "--if-running") && (args.length !== 2 || args[0] !== "--run-id")) throw new Error("Usage: node scripts/stop-dev-web.mjs [--if-running | --run-id UUID]");
  const roots = args[0] === "--run-id" ? [path.join(APP_ROOT, "data", "dev-runtime")] : [path.join(APP_ROOT, "data", "dev-runtime"), path.join(APP_ROOT, "data", "desktop-runtime")];
  for (const root of roots) {
    const requested = await requestDevStop({ root, id: args[0] === "--run-id" ? args[1] : undefined, ifRunning: args[0] !== "--run-id" });
    if (!requested) continue;
    const deadline = Date.now() + 45_000;
    let current = requested;
    while (current.status !== "STOPPED" && Date.now() < deadline) {
      await delay(200);
      current = await readDevSession({ root, id: requested.id });
    }
    if (current.status !== "STOPPED") throw new Error("Stop requested but not confirmed. Inspect the launcher and receipts; no process was force-killed by this command.");
  }
  process.stdout.write("Co*Tive services stopped (or already stopped). Separate reconciliation processes were not targeted.\n");
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
