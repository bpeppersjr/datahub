import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateNycDcwpRegistrationV11, verifyNycDcwpRegistrationV11 } from "./nyc-dcwp-active-license-registration-v1-1.mjs";

test("v1.1 registration independently binds the retained NYC DCWP release", async () => {
  const value = await verifyNycDcwpRegistrationV11();
  assert.equal(value.release_id, "nyc-dcwp-active-premises-20260903-004437783Z-a00056e7");
  assert.equal(value.manifest_sha256, "c8ad5ffeb5c970d07bc9a78e963a10e26003631b6303bd6e1eed4f004c5013d3");
  assert.deepEqual([value.artifact_count, value.artifact_bytes, value.normalized_licensed_sites, value.source_zip_codes], [21, 91531713, 31163, 1550]);
  assert.deepEqual([value.network_requests, value.production_enrollment], [0, false]);
});

test("v1.1 registration rejects semantic and conservation widening", async () => {
  const source = JSON.parse(await readFile(new URL("../config/datasets/nyc-dcwp-active-license-sites-v1-1.json", import.meta.url)));
  for (const mutate of [
    value => { value.retained_release.normalized_licensed_sites++; },
    value => { value.claims.current_operations_verified = true; },
    value => { value.claims.complete_all_businesses = true; },
    value => { value.claims.nonadditive_with_nyc_dcwp_license_location_profiles = false; },
    value => { value.claims.parent_company_inferred = true; },
    value => { value.runtime_pointer = "data/business-sources/nyc-dcwp-active-license-sites/current.json"; }
  ]) {
    const invalid = structuredClone(source); mutate(invalid);
    assert.throws(() => validateNycDcwpRegistrationV11(invalid), /rejected/);
  }
});

test("v1.1 verifier honors pre-abort before retained replay", async () => {
  await assert.rejects(verifyNycDcwpRegistrationV11({ signal: AbortSignal.abort() }), { name: "AbortError" });
});
