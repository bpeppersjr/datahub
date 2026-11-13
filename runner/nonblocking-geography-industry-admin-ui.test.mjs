import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const map = await readFile(new URL("../app/business-intelligence.tsx", import.meta.url), "utf8"), admin = await readFile(new URL("../app/administration.tsx", import.meta.url), "utf8");

test("Business Intelligence exposes nonblocking exact-ZIP and unresolved geography treatment", () => {
  for (const phrase of ["Nonblocking geography treatment", "Private, dedicated, organization-specific, or PO-box ZIPs", "do not require a population value or polygon", "Parks, Native/tribal territory, private land", "state context plus a cardinal reference orientation", "Missing population, entity geocodes, a nationwide industry denominator", "never block retained industry evidence", "filter only when the operator explicitly enters them"]) assert.match(map, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(map, /data-testid="nonblocking-geography-treatment"/);
  assert.match(map, /Show selected-state unresolved Census areas/);
  assert.match(map, /existing_map_blocked!==false/);
});

test("Administration separates maintained-industry intent from observed evidence", () => {
  for (const phrase of ["Save maintenance selection", "Observed/admitted evidence means a governed source observation has been retained and accepted for reporting", "does not mean every business was collected", "all-business denominator is not required", "Population, geocode, and Census-ZCTA gaps do not suppress otherwise retained industry evidence", "Settings unavailable — evidence still reportable"]) assert.match(admin, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(admin, /type="checkbox"/);
  assert.match(admin, /maintainedIndustries\.includes\(row\.id\)/);
});
