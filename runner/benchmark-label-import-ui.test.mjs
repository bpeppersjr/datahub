import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("benchmark import UI requires a fresh explicit preview before draft commit", async () => {
  const source = await readFile(new URL("../app/benchmark-review.tsx", import.meta.url), "utf8");
  assert.match(source, /labels\/import\/preview/);
  assert.match(source, /labels\/import\/commit/);
  assert.match(source, /disabled=\{importBusy \|\| previewStale\}/);
  assert.match(source, /setPreviewStale\(true\)/);
  assert.match(source, /No label snapshot was published and export remains unauthorized/);
  assert.doesNotMatch(source, /entity-resolution\/benchmark\/labels\/publish/);
});
