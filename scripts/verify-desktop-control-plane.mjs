import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { _electron as electronLauncher } from "playwright";
import electronPath from "electron";
import { createControlToken } from "../runner/control-plane-security.mjs";

if (process.platform !== "win32") {
  console.log("Desktop control-plane smoke skipped: the standalone target is Windows.");
  process.exit(0);
}

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const temporaryParent = path.join(appRoot, "data", "tmp");
await mkdir(temporaryParent, { recursive: true });
const port = 4300;
const runnerUrl = `http://127.0.0.1:${port}`;

async function verifyOccupiedPortRefusal() {
  const hostileRoot = await mkdtemp(path.join(temporaryParent, "desktop-hostile-listener-"));
  const hostileToken = createControlToken();
  const requests = [];
  const listener = http.createServer((request, response) => {
    requests.push(request.headers);
    response.setHeader("Access-Control-Allow-Origin", request.headers.origin || "null");
    response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    response.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end('{"ok":true}');
  });
  listener.listen(port, "127.0.0.1");
  await once(listener, "listening");
  try {
    const child = spawn(electronPath, [path.join(appRoot, "desktop", "main.mjs")], {
      cwd: appRoot,
      env: {
        ...process.env,
        DATAHUB_CONTROL_TOKEN: hostileToken,
        DATAHUB_DESKTOP_TEST_MODE: "1",
        DATAHUB_ROOT: hostileRoot,
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let output = "";
    child.stdout.on("data", (chunk) => { output += String(chunk); });
    child.stderr.on("data", (chunk) => { output += String(chunk); });
    const timeout = setTimeout(() => child.kill("SIGKILL"), 15_000);
    const [code] = await once(child, "exit");
    clearTimeout(timeout);
    assert.equal(code, 0, output);
    assert.equal(
      requests.some((headers) => headers.authorization === `Bearer ${hostileToken}`),
      false,
      "The desktop disclosed its control token to a process that pre-bound the runner port.",
    );
    const log = await readFile(path.join(hostileRoot, "data", "desktop.log"), "utf8");
    assert.match(log, /already occupied/);
    assert.equal(log.includes(hostileToken), false);
  } finally {
    listener.closeAllConnections();
    await new Promise((resolve) => listener.close(resolve));
    await rm(hostileRoot, { recursive: true, force: true });
  }
}

await verifyOccupiedPortRefusal();

const runtimeRoot = await mkdtemp(path.join(temporaryParent, "desktop-control-plane-"));
const token = createControlToken();
let electron;

try {
  electron = await electronLauncher.launch({
    args: [path.join(appRoot, "desktop", "main.mjs")],
    cwd: appRoot,
    env: {
      ...process.env,
      DATAHUB_CONTROL_TOKEN: token,
      DATAHUB_DESKTOP_TEST_MODE: "1",
      DATAHUB_ROOT: runtimeRoot,
    },
    timeout: 20_000,
  });
  const window = await electron.firstWindow({ timeout: 20_000 });
  const browserErrors = [];
  window.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) browserErrors.push(message.text());
  });
  window.on("pageerror", (error) => browserErrors.push(error.message));
  await window.getByText(/RUNNER ONLINE/i).first().waitFor({ state: "visible", timeout: 30_000 });
  const text = await window.locator("main").innerText();
  assert.match(text, /RUNNER ONLINE/i);
  const renderer = await window.evaluate(async () => {
    const connection = await window.cotiveCollector.getRunnerConnection();
    const response = await fetch(`${connection.runnerUrl}/api/status`, {
      headers: { Authorization: `Bearer ${connection.controlToken}` },
    });
    return {
      nodeIntegration: typeof window.process,
      preloadMethod: typeof window.cotiveCollector?.getRunnerConnection,
      runnerUrl: connection.runnerUrl,
      tokenLength: connection.controlToken.length,
      status: response.status,
    };
  });
  assert.deepEqual(renderer, {
    nodeIntegration: "undefined",
    preloadMethod: "function",
    runnerUrl,
    tokenLength: token.length,
    status: 200,
  });
  const trustedUrl = window.url();
  const hostileDocument = path.join(runtimeRoot, "hostile.html");
  await writeFile(hostileDocument, '<!doctype html><title>hostile</title><p id="foreign-document">foreign</p>', "utf8");
  await window.evaluate((url) => { window.location.assign(url); }, pathToFileURL(hostileDocument).href);
  await new Promise((resolve) => setTimeout(resolve, 250));
  assert.equal(window.url(), trustedUrl, "The Collector window allowed navigation to a foreign local document.");
  assert.equal(await window.locator("#foreign-document").count(), 0);
  const securityErrors = browserErrors.filter((message) => /401|authorization|preload|content security policy|refused to connect/i.test(message));
  assert.deepEqual(securityErrors, []);
  const publicHealth = await fetch(`${runnerUrl}/api/health`);
  assert.deepEqual(await publicHealth.json(), { ok: true });
  assert.equal((await fetch(`${runnerUrl}/api/status`)).status, 401);
} finally {
  if (electron) await electron.close().catch(() => undefined);
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    try {
      await fetch(`${runnerUrl}/api/health`, { signal: AbortSignal.timeout(200) });
      await new Promise((resolve) => setTimeout(resolve, 50));
    } catch {
      break;
    }
  }
  const logPath = path.join(runtimeRoot, "data", "desktop.log");
  const log = await readFile(logPath, "utf8").catch((error) => error.code === "ENOENT" ? "" : Promise.reject(error));
  assert.equal(log.includes(token), false);
  await rm(runtimeRoot, { recursive: true, force: true });
}

console.log("Desktop control-plane smoke passed.");
