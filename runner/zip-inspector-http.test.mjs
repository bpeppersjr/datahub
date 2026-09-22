import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { zipInspectorHttp } from "./zip-inspector-http.mjs";

async function call(method, query) {
  let result;
  const request = { method };
  const response = {};
  const json = (_response, status, body) => { result = { status, body }; };
  const view = async ({ zip }) => ({ zip5: zip });
  await zipInspectorHttp(request, response, new URL(`http://local/api/business-map/zip-inspector${query}`), view, json);
  return result;
}

test("strict ZIP inspector HTTP accepts only one ZIP parameter on GET", async () => {
  assert.deepEqual(await call("GET", "?zip=12345"), { status: 200, body: { zip5: "12345" } });
  assert.equal((await call("GET", "")).status, 400);
  assert.equal((await call("GET", "?zip=12345&zip=54321")).status, 400);
  assert.equal((await call("GET", "?zip=12345&state=NY")).status, 400);
  assert.equal((await call("POST", "?zip=12345")).status, 400);
});

test("the runner authorizes protected API routes before dispatching exact ZIP detail", async () => {
  const server = await readFile(new URL("./server.mjs", import.meta.url), "utf8");
  const authorize = server.indexOf("controlPlane.authorize(request)");
  const inspector = server.indexOf("url.pathname === '/api/business-map/zip-inspector'");
  assert.ok(authorize >= 0 && inspector > authorize);
});
