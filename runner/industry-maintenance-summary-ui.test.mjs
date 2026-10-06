import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source=await readFile(new URL("../app/workspace-views.tsx",import.meta.url),"utf8");

test("industry summary keeps operational maintenance intent separate from historical reporting evidence",()=>{
  assert.match(source,/Industry Status/);
  assert.match(source,/Operational maintenance segments/);
  assert.match(source,/Operational segment IDs are shown separately from retained source dimensions and reporting\/map categories/);
  assert.match(source,/nine operational maintenance segments and governed source dimensions are separate taxonomies/);
  assert.match(source,/historical evidence below remains visible and unchanged/);
  assert.match(source,/Manual-only and unauthorized sources retain their own gates/);
  assert.match(source,/of jurisdictions \(/);
  assert.match(source,/This is a source-access scope metric, not business completeness or a business count/);
  assert.match(source,/Retained evidence status:/);
  assert.match(source,/Temporal status:/);
  assert.match(source,/source vintage and retained release identifiers are reported independently/);
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
  assert.match(source,/State plus cardinal\/central fallback partitions remain unavailable until the governed residual layer passes topology verification/);
  assert.match(source,/\{industries \? \(\s*<>\s*<GovernedIndustryStatus \/>\s*<h3>Industry connectivity<\/h3>/);
  assert.match(source,/function GovernedIndustryStatus\(\).*<OperationalMaintenanceIntent\/><GovernedCoverageStates\/><MnConstructionEvidenceStatusBlock\/><ExactZipIndustryNationalSummary \/>/);
  assert.equal(source.match(/<ExactZipIndustryNationalSummary \/>/g)?.length,1,"national governed matrix must render once, in Industry Summary");
});
