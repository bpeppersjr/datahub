import { runOhChildcareAppJobWithTransport } from "../oh-childcare-app.mjs";
import { createCliCancellation } from "../cli-cancellation.mjs";
import { gatedTransport } from "./oh-childcare-gated-transport.mjs";

const cancellation = createCliCancellation();
// The synthetic transport has no live socket/timer to keep this waiting child
// alive. Retain IPC only in this fixture until the cancellation assertion runs.
process.channel?.ref();
try {
  const fixture = await gatedTransport();
  await runOhChildcareAppJobWithTransport({ ...fixture.options, outputRoot: process.argv[2], signal: cancellation.signal, logger: async (phase) => {
    if (phase === "prerequisites-retained") {
      process.send("ready");
      await new Promise((resolve) => { cancellation.signal.addEventListener("abort", resolve, { once: true }); });
    }
  } });
  process.exitCode = 1;
} catch (error) { process.exitCode = error.name === "AbortError" ? 0 : 1; }
finally { cancellation.dispose(); }
