import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdir, mkdtemp, rm, cp, copyFile, symlink, realpath, readFile, writeFile } from "node:fs/promises";
import net from "node:net";
import { APP_ROOT, TEMP_DIR } from './paths.mjs';
import path from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";
import { requestDevStop, readDevSession } from "./dev-stop-control.mjs";
import { access } from "node:fs/promises";

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

async function isolatedApp(prefix) {
  await mkdir(TEMP_DIR, { recursive: true });
  const root=await mkdtemp(path.join(TEMP_DIR,prefix));
  // Vinext owns a PID-based lock in its CWD. Exercise real services without
  // colliding with the user's development lock or any other test's stale PID.
  for(const directory of ['app','runner','scripts','config','docs','.openai','public'])await cp(path.join(APP_ROOT,directory),path.join(root,directory),{recursive:true});
  for(const file of ['package.json','tsconfig.json','next-env.d.ts','next.config.ts'])await copyFile(path.join(APP_ROOT,file),path.join(root,file));
  const dependencies=await realpath(path.join(APP_ROOT,'node_modules'));
  assert.equal(dependencies,path.join(APP_ROOT,'node_modules'));
  await symlink(dependencies,path.join(root,'node_modules'),process.platform==='win32'?'junction':'dir');
  const config=await readFile(path.join(APP_ROOT,'vite.config.ts'),'utf8');
  assert.ok(config.includes('  return {'));
  await writeFile(path.join(root,'vite.config.ts'),config.replace('  return {',"  return {\n    cacheDir: '.vinext/test-vite-cache',"));
  return root;
}

test("development supervisor closes both direct child services", async (context) => {
  const runtimeRoot = await isolatedApp("datahub-dev-supervisor-");
  const runnerPort = await unusedPort();
  let uiPort = await unusedPort();
  while (uiPort === runnerPort) uiPort = await unusedPort();
  const child = spawn(process.execPath, [path.join(runtimeRoot,"scripts/start-dev-web.mjs")], {
    cwd: runtimeRoot,
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
  context.after(() => rm(runtimeRoot, { recursive: true, force: true }));

  // This is a lifecycle test, not a cold-build latency benchmark. The full
  // concurrent suite can exceed 20 seconds compiling the real UI; give startup
  // a separate bounded allowance while retaining the five-second shutdown check.
  await waitUntil(async () => {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error("Development supervisor exited before readiness.");
    return await listening(runnerPort) && await listening(uiPort, "localhost");
  }, 90_000)
    .catch((error) => { throw new Error(`${error.message}\n${output}`, { cause: error }); });
  const request = await requestDevStop({ root: path.join(runtimeRoot, "data", "dev-runtime") });
  const [code] = await once(child, "exit");
  assert.equal(code, 0, output);
  assert.equal((await readDevSession({ root: path.join(runtimeRoot, "data", "dev-runtime"), id: request.id })).status, "STOPPED");
  await assert.rejects(access(path.join(runtimeRoot, "data", "refresh-schedules", "owner.lock")), { code: "ENOENT" });
  await waitUntil(async () => !(await listening(runnerPort)) && !(await listening(uiPort, "localhost")), 5_000);
});

test("development supervisor stops the peer service when one child fails", async (context) => {
  const runtimeRoot = await isolatedApp("datahub-dev-supervisor-failure-");
  context.after(() => rm(runtimeRoot, { recursive: true, force: true }));
  const runnerPort = await unusedPort();
  let uiPort = await unusedPort();
  while (uiPort === runnerPort) uiPort = await unusedPort();
  const blocker = net.createServer((socket) => socket.destroy());
  blocker.listen(runnerPort, "127.0.0.1");
  await once(blocker, "listening");
  context.after(() => new Promise((resolve) => blocker.close(resolve)));

  const child = spawn(process.execPath, [path.join(runtimeRoot,"scripts/start-dev-web.mjs")], {
    cwd: runtimeRoot,
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
