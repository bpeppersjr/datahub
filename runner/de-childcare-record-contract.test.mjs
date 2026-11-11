import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
import {
  PAGE_SIZE,
  SELECTED_FIELDS,
  buildDeChildcareRecordRequest,
  normalizeDeChildcarePage,
} from "./de-childcare-record-contract.mjs";

const row = (overrides = {}) => ({
  resource_id: "101",
  resource_name: "Example Child Care",
  resource_type: "Center",
  enforcement_action: "",
  intent_to_revoke: "No",
  site_street_address: "1 Main St",
  site_city: "Dover",
  site_state: "DE",
  site_zip_code: "19901-1234",
  capacity: "42",
  geocoded_location: {type: "Point", coordinates: [-75.5, 39.1]},
  ...overrides,
});

test("builds a deterministic, unexecuted keyset page plan", () => {
  const first = buildDeChildcareRecordRequest();
  assert.equal(first.method, "GET");
  assert.equal(first.page_size, PAGE_SIZE);
  assert.equal(first.claims.request_performed, false);
  const parsed = new URL(first.url);
  assert.equal(parsed.hostname, "data.delaware.gov");
  assert.equal(parsed.searchParams.get("$select"), SELECTED_FIELDS.join(","));
  assert.equal(parsed.searchParams.get("$order"), "resource_id ASC");
  assert.equal(parsed.searchParams.has("$where"), false);
  assert.equal(
    new URL(buildDeChildcareRecordRequest({afterResourceId: "101"}).url)
      .searchParams.get("$where"),
    "resource_id > 101",
  );
  assert.throws(
    () => buildDeChildcareRecordRequest({afterResourceId: "101 OR 1=1"}),
    /pagination cursor/,
  );
});

test("normalizes selected public fields while keeping ZIP+4 separate", () => {
  const view = normalizeDeChildcarePage([row()], {
    sourceReleaseId: "de-source-20261006",
    sourceUpdatedAt: "2026-10-06T15:49:09.000Z",
  });
  assert.equal(view.source_rows, 1);
  assert.equal(view.next_cursor, null);
  const record = view.records[0];
  assert.equal(record.reported_address.zip_code, "19901");
  assert.equal(record.reported_address.zip4, "1234");
  assert.equal(record.geocode.latitude, 39.1);
  assert.equal(record.geocode.longitude, -75.5);
  assert.equal(record.claims.current_operation_verified, false);
  assert.equal(record.claims.statewide_completeness, null);
  assert.equal(record.source_status.intent_to_revoke_source, "No");
  assert.deepEqual(view.claims, {
    network_requests: 0,
    acquisition_performed: false,
    complete_source_snapshot: false,
    current_operations_verified: false,
    production_enrollment: false,
    current_pointer_written: false,
  });
});

test("fails closed on privacy fields, drift, invalid geography and order", () => {
  const options = {
    sourceReleaseId: "de-source-20261006",
    sourceUpdatedAt: "2026-10-06T15:49:09.000Z",
  };
  for (const changed of [
    {...row(), phone_number: "555-0100"},
    row({site_state: "MD"}),
    row({site_zip_code: "1990"}),
    row({capacity: 42}),
    row({geocoded_location: {type: "Point", coordinates: [200, 39]}}),
  ]) assert.throws(() => normalizeDeChildcarePage([changed], options));
  assert.throws(
    () => normalizeDeChildcarePage([row({resource_id: "102"}), row()], options),
    /resource order/,
  );
  assert.throws(
    () => normalizeDeChildcarePage([row(), row()], options),
    /duplicate resource identity/,
  );
});

test("record contract has no transport and connector keeps provider acquisition disabled", async () => {
  const code = await readFile(new URL("./de-childcare-record-contract.mjs", import.meta.url), "utf8");
  const connector = JSON.parse(await readFile(new URL("../config/connectors/de-childcare-providers.json", import.meta.url), "utf8"));
  const policy = JSON.parse(await readFile(new URL("../config/source-policies/de-childcare-providers.json", import.meta.url), "utf8"));
  assert.doesNotMatch(code, /\bfetch\s*\(/);
  assert.equal(connector.version, "1.1.0");
  assert.equal(connector.execution_limits.provider_record_requests, 0);
  assert.match(connector.implementation_status, /record-acquisition-disabled/);
  assert.ok(policy.prohibited_use.some((value) => value.includes("provider-record acquisition")));
});
