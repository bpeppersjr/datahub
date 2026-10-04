import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("ZIP and GDP overview mounts exact-ZCTA execution readiness with HOLD language", async () => {
  const source = await readFile(new URL("../app/workspace-views.tsx", import.meta.url), "utf8");
  assert.match(source, /ZctaGdpExecutionReadinessPanel\s+zcta=\{\s*view\.available\s*\?\s*view\.zcta\s*:\s*null\s*\}/);
  assert.match(source, /Total-model execution readiness · HOLD/);
  assert.match(source, /Technical feasibility is not model approval or\s*output authority/);
  assert.match(source, /Industry allocation<\/dt>\s*<dd>\s*Unavailable/);
  assert.match(source, /Numeric GDP<\/dt>\s*<dd>\s*Unavailable/);
  assert.match(source, /\/api\/business-map\/zcta-gdp-execution-readiness\?zcta=/);
  assert.match(source, /exactKeys\(x\.claims,\s*claimKeys\)/);
  assert.match(source, /exactKeys\(r\.claims,\s*rowClaimKeys\)/);
  assert.match(source, /Number\.isSafeInteger\(r\.material_relationship_count\)/);
});
