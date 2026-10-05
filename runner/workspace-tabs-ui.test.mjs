import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workspaceSource = await readFile(
  new URL("../app/workspace-views.tsx", import.meta.url),
  "utf8",
);
const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

test("primary navigation exposes focused completion, industry, economic, demographic, and operations tabs", () => {
  const labels = [
    "State Completion",
    "Industry Summary",
    "ZIP Economics",
    "Demographic GDP",
    "Administration",
    "Operations",
  ];
  let previous = -1;
  for (const label of labels) {
    const current = workspaceSource.indexOf(`\"${label}\"`, previous + 1);
    assert.ok(current > previous, `${label} is present in primary-tab order`);
    previous = current;
  }
  assert.match(pageSource, /workspaceTab==='Demographic GDP'/);
  assert.match(pageSource, /mode="demographics"/);
});

test("standalone demographic workspace starts on the cross-view and preserves withheld-output boundaries", () => {
  assert.match(
    workspaceSource,
    /mode === "demographics" \? "Demographics" : "Overview"/,
  );
  assert.match(workspaceSource, /Cross-country GDP by demographic dimension/);
  assert.match(workspaceSource, /Withheld · no governed national estimate/);
  assert.match(workspaceSource, /No demographic group is inferred/);
  assert.match(workspaceSource, /No ZIP GDP or segment allocation is currently authorized/);
});
