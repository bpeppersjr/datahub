import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source=await readFile(new URL("../app/data-operations.tsx",import.meta.url),"utf8");

test("operations polling hydrates maintenance intent once and never dispatches it",()=>{
  assert.match(source,/maintenanceLoaded=useRef\(false\)/);
  assert.match(source,/if\(!maintenanceLoaded\.current\)/);
  assert.match(source,/maintenanceLoaded\.current=true/);
  assert.match(source,/setInterval\(\(\) => void refresh\(\), 3000\)/);
  assert.doesNotMatch(source,/\/api\/administration\/industries[^\n]+\/collections/);
  assert.match(source,/disabled=\{!catalog \|\| busy \|\| !industries\.length\}/);
  assert.match(source,/empty maintenance selection stays empty/i);
});
