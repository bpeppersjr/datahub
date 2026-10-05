import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source=await readFile(new URL("../app/workspace-views.tsx",import.meta.url),"utf8");

test("industry summary keeps operational maintenance intent separate from historical reporting evidence",()=>{
  assert.match(source,/Operational maintenance intent/);
  assert.match(source,/Operational segment IDs are shown separately from reporting\/map categories/);
  assert.match(source,/historical evidence below remains visible and unchanged/);
  assert.match(source,/Manual-only and unauthorized sources retain their own gates/);
  assert.match(source,/Industry connectivity/);
  assert.match(source,/Industry summary/);
});
