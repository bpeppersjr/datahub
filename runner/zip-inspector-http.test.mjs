import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { zipInspectorHttp } from "./zip-inspector-http.mjs";

async function call(method, query) {
  let result;
  let selected;
  const request = { method };
  const response = {};
  const json = (_response, status, body) => { result = { status, body }; };
  const view = async ({ zip, categoryId }) => {
    selected = { zip, categoryId };
    if (!new Set(["all", "health-care", "retail-consumer"]).has(categoryId)) throw Object.assign(new Error("Unsupported business category."), { statusCode: 400 });
    return { zip5: zip, category_id: categoryId };
  };
  await zipInspectorHttp(request, response, new URL(`http://local/api/business-map/zip-inspector${query}`), view, json);
  return { ...result, selected };
}

test("strict ZIP inspector HTTP accepts one ZIP and at most one category on GET", async () => {
  assert.deepEqual(await call("GET", "?zip=12345"), { status: 200, body: { zip5: "12345", category_id: "all" }, selected: { zip: "12345", categoryId: "all" } });
  assert.deepEqual((await call("GET", "?zip=12345&category=health-care")).selected, { zip: "12345", categoryId: "health-care" });
  assert.equal((await call("GET", "")).status, 400);
  assert.equal((await call("GET", "?zip=12345&zip=54321")).status, 400);
  assert.equal((await call("GET", "?zip=12345&category=health-care&category=retail-consumer")).status, 400);
  assert.equal((await call("GET", "?zip=12345&category=Bad_Category")).status, 400);
  assert.equal((await call("GET", "?zip=12345&category=not-governed")).status, 400);
  assert.equal((await call("GET", "?zip=12345&state=NY")).status, 400);
  assert.equal((await call("POST", "?zip=12345")).status, 400);
});

test("the runner authorizes protected API routes before dispatching exact ZIP detail", async () => {
  const server = await readFile(new URL("./server.mjs", import.meta.url), "utf8");
  const authorize = server.indexOf("controlPlane.authorize(request)");
  const inspector = server.indexOf("url.pathname === '/api/business-map/zip-inspector'");
  assert.ok(authorize >= 0 && inspector > authorize);
});
