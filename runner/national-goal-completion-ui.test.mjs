import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ui = await readFile(new URL("../app/business-intelligence.tsx", import.meta.url), "utf8");
const server = await readFile(new URL("./server.mjs", import.meta.url), "utf8");

test("business-intelligence right summary exposes qualified matrix evidence and all 51 rows", () => {
  assert.match(ui, /National business goal completion/);
  assert.match(ui, /All 50 states and D\.C\. for this category/);
  assert.match(ui, /All-business completion<\/dt><dd>Unknown/);
  assert.match(ui, /measured members; unmeasured members are shown separately/);
  assert.match(ui, /all-unmeasured category has no percentage/);
  assert.match(ui, /Available \/ measured/);
  assert.ok(ui.indexOf("<GoalCompletionSummary") < ui.indexOf("<DatasetRepresentation"));
  for (const context of ["Freshness:", "authorization:", "geocoded:", "Broad state-layer gaps"]) assert.ok(ui.includes(context), context);
});

test("goal-completion API is read-only, closed to unknown options, and behind shared authorization", () => {
  const route = "url.pathname === '/api/business-map/goal-completion'";
  assert.ok(server.includes(route));
  assert.ok(server.indexOf("controlPlane.authorize(request)") < server.indexOf(route));
  assert.match(server, /\['state', 'category'\]/);
  assert.equal(server.includes("publishNationalGoalCompletionMatrix"), false);
});

test("schema-4 state access is first in the entity panel and distinguishes ZCTA polygons from ZIP5",()=>{
  assert.ok(ui.indexOf('<StateAccessSummary')<ui.indexOf('<GoalCompletionSummary'));
  for(const text of ['Worst temporal status','Exact temporal bindings','Annual aggregate context','All-business completion</dt><dd>Unknown','Census ZCTA polygon','source-reported ZIP5 values are address fields, not polygon boundaries'])assert.ok(ui.includes(text),text);
  assert.match(server,/\/api\/business-map\/state-access/);assert.ok(server.indexOf('controlPlane.authorize(request)')<server.indexOf("url.pathname==='/api/business-map/state-access'"));assert.match(server,/getAll\(key\)\.length!==1/);
  assert.equal(server.includes('writeStateAccessReport'),false);
});

test("ZIP-quality API and Heatmap note expose bounded classes without treating ZIP5 as USPS truth",()=>{
  const route="url.pathname === '/api/business-map/zip-quality'";
  assert.ok(server.includes(route));
  assert.ok(server.indexOf('controlPlane.authorize(request)')<server.indexOf(route));
  assert.match(server,/getAll\('zip'\)\.length > 1/);
  for(const text of ['ZIP quality classes:','Registry ZIP5 total:','same-code Census ZCTA members:','Active-business completion remains unknown (null)','a ZCTA is not a USPS boundary','ZIP totals do not measure business coverage','source-reported ZIP5 without same-code ZCTA','explicit placeholder (`00000`)','USPS operational status is','Other low-number ZIP5 values are not treated as placeholders without governed proof'])assert.ok(ui.includes(text),text);
});
