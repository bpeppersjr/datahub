import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("exact ZIP UI accepts the conservative v3.1 temporal mapping", async () => {
  const source = await readFile(new URL("../app/workspace-views.tsx", import.meta.url), "utf8");
  assert.match(source, /exact-zip-industry-temporal-qualification-view@3\.1\.0/);
  for (const value of ["cms-hospital-directory", "cms-nursing-home-directory", "pa-childcare-centers", "ct-childcare-centers", "md-childcare-centers", "vt-childcare-centers", "co-childcare-centers", "ut-childcare-centers", "ia-childcare-centers", "mn-residential-construction-credentials"]) assert.match(source, new RegExp(value));
  assert.match(source, /item\.semantic_class==="non-active-reporting"/);
  assert.match(source, /item\.review_qualification==="unmeasured"/);
  assert.match(source, /item\.current_operations_verified===false/);
});
