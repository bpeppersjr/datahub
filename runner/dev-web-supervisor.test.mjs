import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

async function unusedPort() {
  const server = net.createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function listening(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const finish = (value) => {
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(250, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

async function waitUntil(predicate, timeout = 20_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Timed out waiting for the development supervisor state.");
}

test("development supervisor closes both direct child services", async (context) => {
  const runtimeRoot = await mkdtemp(path.join(os.tmpdir(), "datahub-dev-supervisor-"));
  context.after(() => rm(runtimeRoot, { recursive: true, force: true }));
  const runnerPort = await unusedPort();
  let uiPort = await unusedPort();
  while (uiPort === runnerPort) uiPort = await unusedPort();
  const child = spawn(process.execPath, [path.resolve("scripts/start-dev-web.mjs")], {
    cwd: path.resolve("."),
    env: {
      ...process.env,
      DATAHUB_ROOT: runtimeRoot,
      RUNNER_PORT: String(runnerPort),
      DATAHUB_DEV_UI_PORT: String(uiPort),
    },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
    windowsHide: true,
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += String(chunk); });
  child.stderr.on("data", (chunk) => { output += String(chunk); });
  context.after(async () => {
    if (child.exitCode === null) child.kill("SIGKILL");
    if (child.exitCode === null) await once(child, "exit");
  });

  await waitUntil(async () => await listening(runnerPort) && await listening(uiPort, "localhost"));
  child.send("shutdown");
  const [code] = await once(child, "exit");
  assert.equal(code, 0, output);
  await waitUntil(async () => !(await listening(runnerPort)) && !(await listening(uiPort, "localhost")), 5_000);
});

test("development supervisor stops the peer service when one child fails", async (context) => {
  const runtimeRoot = await mkdtemp(path.join(os.tmpdir(), "datahub-dev-supervisor-failure-"));
  context.after(() => rm(runtimeRoot, { recursive: true, force: true }));
  const runnerPort = await unusedPort();
  let uiPort = await unusedPort();
  while (uiPort === runnerPort) uiPort = await unusedPort();
  const blocker = net.createServer((socket) => socket.destroy());
  blocker.listen(runnerPort, "127.0.0.1");
  await once(blocker, "listening");
  context.after(() => new Promise((resolve) => blocker.close(resolve)));

  const child = spawn(process.execPath, [path.resolve("scripts/start-dev-web.mjs")], {
    cwd: path.resolve("."),
    env: {
      ...process.env,
      DATAHUB_ROOT: runtimeRoot,
      RUNNER_PORT: String(runnerPort),
      DATAHUB_DEV_UI_PORT: String(uiPort),
    },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
    windowsHide: true,
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += String(chunk); });
  child.stderr.on("data", (chunk) => { output += String(chunk); });
  const forceTimer = setTimeout(() => child.kill("SIGKILL"), 15_000);
  const [code] = await once(child, "exit");
  clearTimeout(forceTimer);
  assert.notEqual(code, 0, output);
  await waitUntil(async () => !(await listening(uiPort, "localhost")), 5_000);
});
