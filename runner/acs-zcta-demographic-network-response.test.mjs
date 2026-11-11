import test from "node:test";
import assert from "node:assert/strict";
import {
  ACS_GROUPS,
  expectedAcsGroupColumns,
  expectedAcsGroupVariables,
  reconcileAcsGroupData,
  validateAcsGroupData,
  validateAcsGroupMetadata,
} from "./acs-zcta-demographic-network-response.mjs";

const metadata = (group) => ({
  name: `${group} mock official group`,
  description: `${group} mock description`,
  variables: Object.fromEntries(
    expectedAcsGroupColumns(group).map((name) => [name, {
      label: `${name} label`, concept: `${group} concept`, group,
      predicateType: name.endsWith("A") ? "string" : "int", predicateOnly: false,
    }]),
  ),
});
const table = (group, zctas = ["00601", "10001"]) => {
  const columns = expectedAcsGroupColumns(group), header = ["NAME", ...columns, "zip code tabulation area"];
  return [header, ...zctas.map((zcta) => [
    `ZCTA5 ${zcta}`,
    ...columns.map((name) => name.endsWith("EA") || name.endsWith("MA") ? null : name.endsWith("001E") ? "-666666666" : "0"),
    zcta,
  ])];
};

test("official group metadata contract conserves all 756 E/M/EA/MA columns", () => {
  let total = 0;
  for (const group of ACS_GROUPS) {
    const result = validateAcsGroupMetadata(metadata(group), group);
    total += result.source_column_count;
    assert.equal(result.base_variable_count, expectedAcsGroupVariables(group).length);
    assert.equal(result.claims.sentinel_semantics_resolved, false);
  }
  assert.equal(total, 189 * 4);
});

test("group data preserves raw sentinels, null annotations, zero-padded ZCTAs and column reordering", () => {
  const source = table("B02001"), header = source[0], first = source[1];
  source[0] = [...header].reverse(); source[1] = [...first].reverse(); source[2] = [...source[2]].reverse();
  const result = validateAcsGroupData(source, "B02001"), row = result.rows.get("00601");
  assert.equal(row.cells.B02001_001.estimate, "-666666666");
  assert.equal(row.cells.B02001_001.estimate_annotation, null);
  assert.equal(result.claims.census_zcta_not_usps_zip, true);
});

test("four-group reconciliation reports incomplete source ZCTAs instead of inventing cells", () => {
  const groups = new Map(ACS_GROUPS.map((group) => [
    group,
    validateAcsGroupData(table(group, group === "B04006" ? ["00601"] : ["00601", "10001"]), group),
  ]));
  const result = reconcileAcsGroupData(groups);
  assert.equal(result.source_zcta_union_count, 2);
  assert.equal(result.complete_zcta_count, 1);
  assert.equal(result.incomplete_zcta_count, 1);
  assert.deepEqual(result.incomplete_zctas[0], {zcta: "10001", missing_groups: ["B04006"]});
  assert.equal(Object.keys(result.complete_rows[0].cells).length, 189);
  assert.equal(result.claims.non_zcta_space_blocks_map, false);
  assert.equal(result.claims.acquisition_performed, false);
});

test("metadata and data fail closed on roster, type, identity and cross-group name drift", () => {
  const badMetadata = metadata("B02001"); delete badMetadata.variables.B02001_001E;
  assert.throws(() => validateAcsGroupMetadata(badMetadata, "B02001"), /metadata variable/);
  const badType = table("B02001"); badType[1][badType[0].indexOf("B02001_001E")] = 1;
  assert.throws(() => validateAcsGroupData(badType, "B02001"), /raw E\/M\/EA\/MA/);
  const duplicate = table("B02001", ["00601", "00601"]);
  assert.throws(() => validateAcsGroupData(duplicate, "B02001"), /ZCTA identity/);
  const groups = new Map(ACS_GROUPS.map((group) => [group, validateAcsGroupData(table(group, ["00601"]), group)]));
  const b04006 = groups.get("B04006"), changed = new Map(b04006.rows);
  changed.set("00601", {...changed.get("00601"), name: "different"});
  groups.set("B04006", {...b04006, rows: changed});
  assert.throws(() => reconcileAcsGroupData(groups), /NAME disagreement/);
});
