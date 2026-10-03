import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("ZIP and GDP overview mounts exact-ZCTA execution readiness with HOLD language", async () => {
  const source = await readFile(new URL("../app/workspace-views.tsx", import.meta.url), "utf8");
  assert.match(source, /ZctaGdpExecutionReadinessPanel zcta=\{view\.available\?view\.zcta:null\}/);
  assert.match(source, /Total-model execution readiness · HOLD/);
  assert.match(source, /Technical feasibility is not model approval or output authority/);
  assert.match(source, /Industry allocation<\/dt><dd>Unavailable/);
  assert.match(source, /Numeric GDP<\/dt><dd>Unavailable/);
  assert.match(source, /\/api\/business-map\/zcta-gdp-execution-readiness\?zcta=/);
  assert.match(source, /exactKeys\(x\.claims,claimKeys\)/);
  assert.match(source, /exactKeys\(r\.claims,rowClaimKeys\)/);
  assert.match(source, /Number\.isSafeInteger\(r\.material_relationship_count\)/);
});
