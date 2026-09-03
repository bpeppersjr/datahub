import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";
import {
  createControlToken,
  createLocalControlPlaneGuard,
} from "./control-plane-security.mjs";

const CONTROL_TOKEN = "fixture-control-token-that-is-long-enough-123456789";

function request(headers = {}, method = "GET") {
  return { headers, method };
}

function response() {
  const headers = new Map();
  return {
    headers,
    setHeader(name, value) { headers.set(name.toLowerCase(), value); },
  };
}

async function unusedPort() {
  const server = net.createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  await new Promise((resolve) => server.close(resolve));
  return address.port;
}

async function rawRequest({ port, hostHeader, origin, authorization, method = "GET", pathname = "/api/health", body }) {
  return new Promise((resolve, reject) => {
    const headers = { Host: hostHeader };
    if (origin) headers.Origin = origin;
    if (authorization) headers.Authorization = authorization;
    if (body) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = Buffer.byteLength(body);
    }
    const outgoing = http.request({ hostname: "127.0.0.1", port, path: pathname, method, headers }, (incoming) => {
      const chunks = [];
      incoming.on("data", (chunk) => chunks.push(chunk));
      incoming.on("end", () => resolve({
        status: incoming.statusCode,
        headers: incoming.headers,
        body: Buffer.concat(chunks).toString("utf8"),
      }));
    });
    outgoing.on("error", reject);
    if (body) outgoing.write(body);
    outgoing.end();
  });
}

test("creates strong per-launch tokens and refuses non-loopback listeners", () => {
  const first = createControlToken();
  const second = createControlToken();
  assert.match(first, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(first, second);
  assert.throws(() => createLocalControlPlaneGuard({
    host: "0.0.0.0",
    port: 4300,
    controlToken: CONTROL_TOKEN,
  }), /loopback/i);
  assert.throws(() => createLocalControlPlaneGuard({
    host: "127.0.0.1",
    port: 4300,
    controlToken: "weak",
  }), /at least 32/);
});

test("enforces exact Host, origin, and bearer-token boundaries without disclosing the token", () => {
  const guard = createLocalControlPlaneGuard({
    host: "127.0.0.1",
    port: 4300,
    controlToken: CONTROL_TOKEN,
    allowedOrigins: ["null", "http://localhost:3000"],
  });
  const allowedResponse = response();
  guard.prepare(request({
    host: "127.0.0.1:4300",
    origin: "http://localhost:3000",
    authorization: `Bearer ${CONTROL_TOKEN}`,
  }), allowedResponse);
  guard.authorize(request({ authorization: `Bearer ${CONTROL_TOKEN}` }));
  assert.equal(allowedResponse.headers.get("access-control-allow-origin"), "http://localhost:3000");
  assert.equal(allowedResponse.headers.get("access-control-allow-headers"), "Authorization, Content-Type");
  assert.equal(allowedResponse.headers.get("cache-control"), "no-store");

  assert.throws(() => guard.prepare(request({ host: "evil.example:4300" }), response()), { statusCode: 400 });
  assert.throws(() => guard.prepare(request({ host: "127.0.0.1:4300", origin: "http://localhost:3999" }), response()), { statusCode: 403 });
  for (const authorization of [undefined, "Basic abc", "Bearer wrong-control-token-that-is-long-enough-12345"]) {
    assert.throws(() => guard.authorize(request({ authorization })), (error) => {
      assert.equal(error.statusCode, 401);
      assert.equal(error.message.includes(CONTROL_TOKEN), false);
      return true;
    });
  }
});

test("protects every live management endpoint while leaving only narrow liveness public", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "datahub-control-plane-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const port = await unusedPort();
  const child = spawn(process.execPath, [path.resolve("runner/server.mjs")], {
    cwd: path.resolve("."),
    env: {
      ...process.env,
      DATAHUB_ROOT: root,
      RUNNER_HOST: "127.0.0.1",
      RUNNER_PORT: String(port),
      DATAHUB_CONTROL_TOKEN: CONTROL_TOKEN,
      DATAHUB_ALLOWED_ORIGINS: "http://localhost:3999",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += String(chunk); });
  child.stderr.on("data", (chunk) => { output += String(chunk); });
  context.after(async () => {
    if (child.exitCode === null) child.kill("SIGTERM");
    if (child.exitCode === null) await once(child, "exit");
  });

  const deadline = Date.now() + 10_000;
  while (!output.includes("listening at") && child.exitCode === null && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.equal(child.exitCode, null, output);
  assert.match(output, /listening at/);
  assert.equal(output.includes(CONTROL_TOKEN), false);

  const hostHeader = `127.0.0.1:${port}`;
  const health = await rawRequest({ port, hostHeader });
  assert.equal(health.status, 200);
  assert.deepEqual(JSON.parse(health.body), { ok: true });
  assert.equal(health.headers["cache-control"], "no-store");

  const protectedEndpoints = [
    ["GET", "/api/status"],
    ["GET", "/api/templates"],
    ["GET", "/api/connectors"],
    ["GET", "/api/connectors/us-census-geography"],
    ["POST", "/api/connectors/us-census-geography/validate", "{}"],
    ["GET", "/api/business-coverage"],
    ["GET", "/api/business-coverage/states"],
    ["GET", "/api/business-map/catalog"],
    ["GET", "/api/business-map/features?level=states"],
    ["GET", "/api/business-map/state-summary"],
    ["GET", "/api/business-map/names?zip=12345"],
    ["GET", "/api/entity-resolution/benchmark"],
    ["GET", "/api/entity-resolution/benchmark/labels"],
    ["PUT", "/api/entity-resolution/benchmark/labels/fixture", "{}"],
    ["GET", "/api/jobs"],
    ["POST", "/api/jobs", "{}"],
    ["PUT", "/api/jobs/fixture", "{}"],
    ["DELETE", "/api/jobs/fixture"],
    ["GET", "/api/runs"],
    ["POST", "/api/runs", "{}"],
    ["POST", "/api/runs/fixture/cancel", "{}"],
    ["GET", "/api/runs/fixture/output"],
    ["GET", "/api/activity"],
    ["GET", "/api/settings"],
    ["PUT", "/api/settings", "{}"],
  ];
  for (const [method, pathname, body] of protectedEndpoints) {
    const missing = await rawRequest({ port, hostHeader, method, pathname, body });
    assert.equal(missing.status, 401, `${method} ${pathname}`);
    assert.equal(missing.body.includes(CONTROL_TOKEN), false, `${method} ${pathname}`);
  }

  const wrongHost = await rawRequest({
    port,
    hostHeader: `evil.example:${port}`,
    pathname: "/api/jobs",
    authorization: `Bearer ${CONTROL_TOKEN}`,
  });
  assert.equal(wrongHost.status, 400);

  const wrongOrigin = await rawRequest({
    port,
    hostHeader,
    origin: "http://localhost:3000",
    pathname: "/api/jobs",
    authorization: `Bearer ${CONTROL_TOKEN}`,
  });
  assert.equal(wrongOrigin.status, 403);

  const preflight = await rawRequest({
    port,
    hostHeader,
    origin: "http://localhost:3999",
    method: "OPTIONS",
    pathname: "/api/jobs",
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers["access-control-allow-origin"], "http://localhost:3999");
  assert.match(preflight.headers["access-control-allow-headers"], /Authorization/);

  const authorized = await rawRequest({
    port,
    hostHeader,
    origin: "http://localhost:3999",
    pathname: "/api/jobs",
    authorization: `Bearer ${CONTROL_TOKEN}`,
  });
  assert.equal(authorized.status, 200);
  assert(Array.isArray(JSON.parse(authorized.body)));

  const connectorCatalog = await rawRequest({
    port,
    hostHeader,
    origin: "http://localhost:3999",
    pathname: "/api/connectors",
    authorization: `Bearer ${CONTROL_TOKEN}`,
  });
  assert.equal(connectorCatalog.status, 200);
  const connectorCatalogBody = JSON.parse(connectorCatalog.body);
  assert.equal(connectorCatalogBody.connector_count, 41);
  assert.equal(connectorCatalogBody.policy_profile_count, 39);
  assert.equal(connectorCatalog.body.includes(CONTROL_TOKEN), false);

  const connectorDetail = await rawRequest({
    port,
    hostHeader,
    pathname: "/api/connectors/us-census-geography",
    authorization: `Bearer ${CONTROL_TOKEN}`,
  });
  assert.equal(connectorDetail.status, 200);
  assert.equal(JSON.parse(connectorDetail.body).connector_id, "us-census-geography");

  const validConfiguration = await rawRequest({
    port,
    hostHeader,
    method: "POST",
    pathname: "/api/connectors/us-census-geography/validate",
    authorization: `Bearer ${CONTROL_TOKEN}`,
    body: JSON.stringify({ configuration: { page_size: 1000 } }),
  });
  assert.equal(validConfiguration.status, 200);
  assert.equal(JSON.parse(validConfiguration.body).configuration.page_size, 1000);

  const invalidConfiguration = await rawRequest({
    port,
    hostHeader,
    method: "POST",
    pathname: "/api/connectors/us-census-geography/validate",
    authorization: `Bearer ${CONTROL_TOKEN}`,
    body: JSON.stringify({ configuration: { page_size: 9999, secret: "must-not-be-echoed" } }),
  });
  assert.equal(invalidConfiguration.status, 422);
  assert.equal(invalidConfiguration.body.includes("must-not-be-echoed"), false);

  const created = await rawRequest({
    port,
    hostHeader,
    origin: "http://localhost:3999",
    authorization: `Bearer ${CONTROL_TOKEN}`,
    method: "POST",
    pathname: "/api/jobs",
    body: JSON.stringify({ name: "Protected fixture", type: "api", config: { url: "https://example.com" } }),
  });
  assert.equal(created.status, 201);

  const status = await rawRequest({
    port,
    hostHeader,
    pathname: "/api/status",
    authorization: `Bearer ${CONTROL_TOKEN}`,
  });
  assert.equal(status.status, 200);
  assert.equal(JSON.parse(status.body).runner, "Co*Tive Collector");
  assert.equal(status.body.includes(CONTROL_TOKEN), false);
});
