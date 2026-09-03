import { spawn } from "node:child_process";
import path from "node:path";
import { createControlToken } from "../runner/control-plane-security.mjs";

const runnerPort = Number(process.env.RUNNER_PORT) || 4300;
const uiPort = Number(process.env.DATAHUB_DEV_UI_PORT) || 3000;
if (!Number.isInteger(runnerPort) || runnerPort < 1 || runnerPort > 65_535) throw new Error("RUNNER_PORT must be a valid TCP port.");
if (!Number.isInteger(uiPort) || uiPort < 1 || uiPort > 65_535) throw new Error("DATAHUB_DEV_UI_PORT must be a valid TCP port.");

const controlToken = createControlToken();
const environment = {
  ...process.env,
  RUNNER_HOST: "127.0.0.1",
  RUNNER_PORT: String(runnerPort),
  DATAHUB_CONTROL_TOKEN: controlToken,
  DATAHUB_ALLOWED_ORIGINS: `http://localhost:${uiPort},http://127.0.0.1:${uiPort}`,
  VITE_DATAHUB_CONTROL_TOKEN: controlToken,
  VITE_DATAHUB_RUNNER_URL: `http://127.0.0.1:${runnerPort}`,
};

const children = [
  spawn(process.execPath, [path.resolve("runner", "server.mjs")], { env: environment, stdio: "inherit", windowsHide: true }),
  spawn(process.execPath, [path.resolve("node_modules", "vinext", "dist", "cli.js"), "dev", "--port", String(uiPort)], { env: environment, stdio: "inherit", windowsHide: true }),
];

let stoppingPromise;
function terminateChild(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null) return resolve();
    const forceTimer = setTimeout(() => child.kill("SIGKILL"), 5_000);
    forceTimer.unref();
    child.once("exit", () => {
      clearTimeout(forceTimer);
      resolve();
    });
    child.kill();
  });
}

async function stop(exitCode = 0) {
  if (stoppingPromise) return stoppingPromise;
  stoppingPromise = Promise.all(children.map(terminateChild)).then(() => {
    process.exitCode = exitCode;
    if (process.connected) process.disconnect();
  });
  return stoppingPromise;
}

for (const child of children) {
  child.on("error", (error) => {
    console.error(`Development service failed to start: ${error.message}`);
    void stop(1);
  });
  child.on("exit", (code, signal) => {
    if (!stoppingPromise) {
      if (signal) console.error(`Development service stopped after signal ${signal}.`);
      void stop(code ?? 1);
    }
  });
}

process.on("SIGINT", () => void stop(0));
process.on("SIGTERM", () => void stop(0));
process.on("message", (message) => {
  if (message === "shutdown") void stop(0);
});
