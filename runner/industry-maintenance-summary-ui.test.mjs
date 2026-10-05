import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source=await readFile(new URL("../app/workspace-views.tsx",import.meta.url),"utf8");

test("industry summary keeps operational maintenance intent separate from historical reporting evidence",()=>{
  assert.match(source,/Operational maintenance intent/);
  assert.match(source,/Operational segment IDs are shown separately from reporting\/map categories/);
  assert.match(source,/historical evidence below remains visible and unchanged/);
  assert.match(source,/Manual-only and unauthorized sources retain their own gates/);
  assert.match(source,/of jurisdictions \(/);
  assert.match(source,/have retained access evidence\. This is not business completeness/);
  assert.match(source,/Temporal review:/);
  assert.match(source,/Industry connectivity/);
  assert.match(source,/Industry summary/);
  assert.match(source,/\{industries \? \(\s*<>\s*<OperationalMaintenanceIntent\/>\s*<ExactZipIndustryNationalSummary \/>\s*<h3>Industry connectivity<\/h3>/);
  assert.equal(source.match(/<ExactZipIndustryNationalSummary \/>/g)?.length,1,"national governed matrix must render once, in Industry Summary");
});
