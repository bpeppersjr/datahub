import assert from "node:assert/strict";
import test from "node:test";
import {
  assertNormalizedUsPostalFields,
  assertNormalizedUsPostalFieldsDeep,
} from "./normalized-us-postal-code.mjs";

test("accepts ZIP5 aliases with a separate four-digit or null ZIP+4", () => {
  assert.doesNotThrow(() => assertNormalizedUsPostalFields({ zip_code: "00501", postal_code: "00501", zip4: "1234" }));
  assert.doesNotThrow(() => assertNormalizedUsPostalFields({ zip_code: "00501", postal_code: "00501", zip4: null }));
  assert.doesNotThrow(() => assertNormalizedUsPostalFields({ zip_code: null, postal_code: null, zip4: null }));
});

test("rejects joined aliases, malformed components, and missing separation fields", () => {
  assert.throws(
    () => assertNormalizedUsPostalFields({ zip_code: "00501", postal_code: "00501-1234", zip4: "1234" }),
    /must equal the normalized ZIP5/,
  );
  assert.throws(() => assertNormalizedUsPostalFields({ zip_code: "00501-1234", postal_code: "00501", zip4: "1234" }), /exactly ZIP5/);
  assert.throws(() => assertNormalizedUsPostalFields({ zip_code: "00501", postal_code: "00501", zip4: "123" }), /exactly four digits/);
  assert.throws(() => assertNormalizedUsPostalFields({ zip_code: "00501", postal_code: "00501" }), /zip4.*required/);
  assert.throws(() => assertNormalizedUsPostalFields({ zip_code: null, postal_code: "V6B 1A1", zip4: null }), /keep postal_code and zip4 null/);
});

test("finds a joined postal alias anywhere in a normalized record", () => {
  const record = {
    reported_addresses: [
      { zip_code: "00501", postal_code: "00501", zip4: null },
      { zip_code: "60601", postal_code: "60601-1234", zip4: "1234" },
    ],
  };
  assert.throws(() => assertNormalizedUsPostalFieldsDeep(record), /record\.reported_addresses\[1\]\.postal_code/);
});

test("rejects a missing alias on a marked U.S. address without treating ZIP-keyed geography as an address", () => {
  const missingAlias = {
    physical_address: { street: "1 MAIN ST", country: "US", zip_code: "00501", zip4: null },
    geography: { zip_code: "00501", zcta_geoid: "00501" },
  };
  assert.throws(() => assertNormalizedUsPostalFieldsDeep(missingAlias), /physical_address\.postal_code.*required/);
  assert.doesNotThrow(() => assertNormalizedUsPostalFieldsDeep({ geography: missingAlias.geography }));
});
