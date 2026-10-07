import test from "node:test";
import assert from "node:assert/strict";
import { readKsChildcareSourceDiscovery } from "./ks-childcare-source-discovery.mjs";
import { readKyChildcareSourceDiscovery } from "./ky-childcare-source-discovery.mjs";
test("Kansas keeps CAPTCHA search unautomated and uses official request path", () => {
  const v = readKsChildcareSourceDiscovery();
  assert.equal(v.access.data_request_path_available, true);
  assert.equal(v.access.portal_automation_authorized, false);
  assert.equal(v.claims.provider_rows_acquired, 0);
});
test("Kentucky preserves dynamic download and exact Type I gates", () => {
  const v = readKyChildcareSourceDiscovery();
  assert.equal(v.access.direct_download_endpoint_verified, false);
  assert.equal(v.scope.type_i_nonhome_predicate_required, true);
  assert.equal(v.claims.provider_rows_acquired, 0);
});
