import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source=await readFile(new URL("../app/workspace-views.tsx",import.meta.url),"utf8");

test("industry summary keeps operational maintenance intent separate from historical reporting evidence",()=>{
  assert.match(source,/Industry Status/);
  assert.match(source,/Operational maintenance segments/);
  assert.match(source,/nine operational segments regardless of selection/);
  assert.match(source,/governed crosswalk below relates compatible retained source dimensions to the nine operational segments/);
  assert.match(source,/saved selection sets defaults for collection and refresh planning/);
  assert.match(source,/share of the 50 states and D\.C\. with retained evidence/);
  assert.match(source,/have retained source evidence/);
  assert.match(source,/Source counts may overlap and use different units/);
  assert.match(source,/Retained evidence status:/);
  assert.match(source,/Temporal status<\/th>/);
  assert.match(source,/State evidence details for/);
  assert.match(source,/exact-ZIP crosswalk below reports a different measure/);
  assert.match(source,/Retained source-dimension status/);
  assert.match(source,/Source vintage \/ temporal status/);
  assert.match(source,/Unknown, absent, or outside denominator/);
  assert.match(source,/unavailable—not materialized, not measured zero/);
  assert.match(source,/Industry connectivity/);
  assert.match(source,/Industry summary/);
  assert.match(source,/function GovernedCoverageStates\(\).*Geography coverage states/);
  assert.match(source,/Private or special-purpose ZIP evidence/);
  assert.match(source,/Park or protected land.*No classification is inferred/);
  assert.match(source,/Tribal or Native territory.*No classification is inferred/);
  assert.match(source,/A topology-verified residual artifact is retained separately for each of the 56 Census state equivalents/);
  assert.match(source,/It remains nonblocking optional context and does not infer a ZIP, population, park, tribal\/Native, private-land, or business status/);
  assert.match(source,/\{industries \? \(\s*<>\s*<GovernedIndustryStatus state=\{state\} \/>\s*<h3>Industry connectivity<\/h3>/);
  assert.match(source,/function GovernedIndustryStatus\(\{state\}:\{state:string\}\).*<OperationalMaintenanceIntent state=\{state\}\/><NationalStatusPanel state=\{state\}\/><OperationalIndustryCrosswalkStatus state=\{state\}\/><EpaOperationalIndustryStatus state=\{state\}\/><GovernedCoverageStates\/><AdjacentExactZipEvidenceCatalog\/><ExactZipIndustryNationalSummary \/>/);
  assert.equal(source.match(/<ExactZipIndustryNationalSummary \/>/g)?.length,1,"national governed matrix must render once, in Industry Summary");
});
