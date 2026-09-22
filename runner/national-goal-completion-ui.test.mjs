import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ui = await readFile(new URL("../app/business-intelligence.tsx", import.meta.url), "utf8");
const server = await readFile(new URL("./server.mjs", import.meta.url), "utf8");

test("business-intelligence right summary exposes qualified matrix evidence and all 51 rows", () => {
  assert.match(ui, /National business goal completion/);
  assert.match(ui, /All 50 states and D\.C\. for this category/);
  assert.match(ui, /All-business completion<\/dt><dd>Unknown/);
  assert.match(ui, /measure governed dataset presence, not the share of U\.S\. businesses collected/);
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
