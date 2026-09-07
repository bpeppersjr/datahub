import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createCliCancellation } from "./cli-cancellation.mjs";
import { spawn } from "node:child_process";
import { once } from "node:events";

test("IPC cancel and disposal are cooperative", () => {
  const fake = new EventEmitter(); fake.connected = true; let disconnected = false; fake.disconnect = () => { disconnected = true; };
  const cancellation = createCliCancellation({ processRef: fake });
  fake.emit("message", { type: "cancel" });
  assert.equal(cancellation.signal.aborted, true);
  cancellation.dispose();
  assert.equal(disconnected, true);
  fake.emit("message", { type: "cancel" });
});

test("real subprocess receives IPC cancellation and exits after cooperative cleanup", async () => {
  const moduleUrl = new URL("./cli-cancellation.mjs", import.meta.url).href;
  const code = `import { createCliCancellation } from ${JSON.stringify(moduleUrl)};
    const cancellation = createCliCancellation();
    const keepAlive = setInterval(() => {}, 1000);
    cancellation.signal.addEventListener('abort', () => {
      clearInterval(keepAlive);
      process.stdout.write('cleanup-complete');
      cancellation.dispose();
    }, { once: true });
    process.send({type:'ready'});`;
  const child = spawn(process.execPath, ["--input-type=module", "-e", code], {
    stdio: ["ignore", "pipe", "pipe", "ipc"], windowsHide: true,
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  const deadline = setTimeout(() => child.kill("SIGKILL"), 5000);
  try {
    const exit = once(child, "exit");
    await once(child, "message");
    child.send({ type: "cancel" });
    const [code, signal] = await exit;
    assert.equal(code, 0);
    assert.equal(signal, null);
    assert.equal(output, "cleanup-complete");
  } finally { clearTimeout(deadline); if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); }
});
