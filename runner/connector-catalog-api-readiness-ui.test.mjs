import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../app/connector-catalog.tsx", import.meta.url), "utf8");

test("connector catalog distinguishes API configuration from collected industry data", () => {
  assert.match(source, /API collection readiness/);
  assert.match(source, /Collection disabled/);
  assert.match(source, /Credential presence: not inspected/);
  assert.match(source, /record requests performed:/);
  assert.match(source, /Configuration is not collected industry data/);
  assert.doesNotMatch(source, /credential\.value|secret\.value/);
});
