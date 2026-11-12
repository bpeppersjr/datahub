import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../app/business-intelligence.tsx", import.meta.url), "utf8");

test("business intelligence reports source-relative industry status", () => {
  assert.match(source, /State industry status/);
  assert.match(source, /Nationwide industry-source status by state/);
  assert.match(source, /Status is relative to each governed source scope/);
  assert.match(source, /remains reportable when entity coordinates, population, or universal industry denominators are unavailable/);
});

test("special and unresolved geography is nonblocking and never silently classified", () => {
  assert.match(source, /Private or organization-specific ZIPs, populationless areas, parks, tribal\/Native territories, private land, and other non-ZCTA space do not block the map or industry status/);
  assert.match(source, /remains state-context or unassigned/);
  assert.match(source, /never silently converted into a ZIP, population, business count, or completion claim/);
});
