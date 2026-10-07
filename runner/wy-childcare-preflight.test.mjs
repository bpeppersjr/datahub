import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";
import { verifyWyChildcarePreflight } from "./wy-childcare-preflight.mjs";

test("Wyoming metadata preflight verifies exact current file without provider rows", async () => {
  const value = await verifyWyChildcarePreflight(path.join(APP_ROOT,"data/business-sources/wy-childcare/preflights/wy-childcare-preflight-20261007-175437/manifest.json"));
  assert.equal(value.verified,true);
  assert.equal(value.current_file.file_id,"1wikI4MQYcdBfvZr4s5-XRXrqIPuH0XIQ");
  assert.equal(value.current_file.filename,"Oct 2026 Active Provider.pdf");
  assert.equal(value.current_file.content_length,281722);
  assert.equal(value.claims.pdf_body_requested,false);
  assert.equal(value.claims.provider_rows_acquired,0);
});
