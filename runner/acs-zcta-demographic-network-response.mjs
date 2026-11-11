export const VERSION = "acs-zcta-demographic-network-response@1.0.0";
export const ACS_GROUP_RANGES = Object.freeze({
  B01001: 49,
  B02001: 10,
  B03002: 21,
  B04006: 109,
});
export const ACS_GROUPS = Object.freeze(Object.keys(ACS_GROUP_RANGES));
const SUFFIXES = Object.freeze(["E", "M", "EA", "MA"]);
const fail = (message) => {
  throw new Error(`ACS ZCTA network response rejected: ${message}.`);
};
const check = (value, message) => value || fail(message);
const plain = (value) =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype;
const bounded = (value, maximum = 4096) =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= maximum &&
  !/[\u0000-\u001f\u007f]/.test(value);
const rawNumeric = (value) =>
  value === null ||
  (typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value));
const rawAnnotation = (value) => value === null || bounded(value, 64);

export function expectedAcsGroupVariables(group) {
  const last = ACS_GROUP_RANGES[group];
  check(Number.isSafeInteger(last), "supported group");
  return Array.from({length: last}, (_, index) =>
    `${group}_${String(index + 1).padStart(3, "0")}`,
  );
}

export function expectedAcsGroupColumns(group) {
  return expectedAcsGroupVariables(group).flatMap((base) =>
    SUFFIXES.map((suffix) => `${base}${suffix}`),
  );
}

export function validateAcsGroupMetadata(document, group) {
  check(plain(document) && plain(document.variables), "metadata envelope");
  const expected = expectedAcsGroupColumns(group), variables = {};
  for (const name of expected) {
    const item = document.variables[name];
    check(
      plain(item) &&
        item.group === group &&
        bounded(item.label) &&
        bounded(item.concept) &&
        bounded(item.predicateType, 64),
      `metadata variable ${name}`,
    );
    variables[name] = Object.freeze({
      label: item.label,
      concept: item.concept,
      predicate_type: item.predicateType,
      predicate_only: item.predicateOnly === true,
    });
  }
  const unexpected = Object.keys(document.variables).filter(
    (name) => name.startsWith(`${group}_`) && !expected.includes(name),
  );
  check(unexpected.length === 0, "unexpected same-group metadata variable");
  return Object.freeze({
    schema_version: VERSION,
    group,
    base_variable_count: ACS_GROUP_RANGES[group],
    source_column_count: expected.length,
    name: bounded(document.name) ? document.name : null,
    description: bounded(document.description) ? document.description : null,
    variables: Object.freeze(variables),
    claims: Object.freeze({
      official_metadata_interpretation_complete: false,
      sentinel_semantics_resolved: false,
      percentages_emitted: false,
    }),
  });
}

export function validateAcsGroupData(document, group) {
  check(Array.isArray(document) && document.length >= 2, "data table");
  const header = document[0];
  check(
    Array.isArray(header) &&
      header.length > 0 &&
      header.every((name) => typeof name === "string") &&
      new Set(header).size === header.length,
    "data header",
  );
  const geography = "zip code tabulation area";
  check(header.includes(geography) && header.includes("NAME"), "data identity columns");
  const required = expectedAcsGroupColumns(group);
  check(required.every((name) => header.includes(name)), "data variable roster");
  const unexpected = header.filter(
    (name) => name.startsWith(`${group}_`) && !required.includes(name),
  );
  check(unexpected.length === 0, "unexpected same-group data variable");
  const index = new Map(header.map((name, position) => [name, position])), rows = new Map();
  for (let rowIndex = 1; rowIndex < document.length; rowIndex++) {
    const source = document[rowIndex];
    check(Array.isArray(source) && source.length === header.length, "data row width");
    const zcta = source[index.get(geography)];
    check(/^\d{5}$/.test(zcta) && !rows.has(zcta), "data ZCTA identity");
    const cells = {};
    for (const base of expectedAcsGroupVariables(group)) {
      const estimate = source[index.get(`${base}E`)],
        margin_of_error = source[index.get(`${base}M`)],
        estimate_annotation = source[index.get(`${base}EA`)],
        margin_of_error_annotation = source[index.get(`${base}MA`)];
      check(
        rawNumeric(estimate) &&
          rawNumeric(margin_of_error) &&
          rawAnnotation(estimate_annotation) &&
          rawAnnotation(margin_of_error_annotation),
        `data ${base} raw E/M/EA/MA`,
      );
      cells[base] = Object.freeze({
        estimate,
        margin_of_error,
        estimate_annotation,
        margin_of_error_annotation,
      });
    }
    rows.set(zcta, Object.freeze({
      zcta,
      name: bounded(source[index.get("NAME")]) ? source[index.get("NAME")] : null,
      cells: Object.freeze(cells),
    }));
  }
  return Object.freeze({
    schema_version: VERSION,
    group,
    row_count: rows.size,
    rows,
    claims: Object.freeze({
      census_zcta_not_usps_zip: true,
      zip4_joined: false,
      estimates_are_exact_counts: false,
      percentages_emitted: false,
    }),
  });
}

export function reconcileAcsGroupData(groupResults) {
  check(
    groupResults instanceof Map &&
      groupResults.size === ACS_GROUPS.length &&
      ACS_GROUPS.every((group) => groupResults.has(group)),
    "four-group result roster",
  );
  for (const group of ACS_GROUPS) {
    const result = groupResults.get(group);
    check(
      result?.schema_version === VERSION &&
        result.group === group &&
        result.rows instanceof Map &&
        result.row_count === result.rows.size,
      `group result ${group}`,
    );
  }
  const union = new Set(
      ACS_GROUPS.flatMap((group) => [...groupResults.get(group).rows.keys()]),
    ),
    complete_rows = [],
    incomplete_zctas = [];
  for (const zcta of [...union].sort()) {
    const missing_groups = ACS_GROUPS.filter(
      (group) => !groupResults.get(group).rows.has(zcta),
    );
    if (missing_groups.length) {
      incomplete_zctas.push(Object.freeze({zcta, missing_groups: Object.freeze(missing_groups)}));
      continue;
    }
    const names = new Set(
      ACS_GROUPS.map((group) => groupResults.get(group).rows.get(zcta).name).filter(Boolean),
    );
    check(names.size <= 1, `cross-group NAME disagreement ${zcta}`);
    const cells = Object.assign(
      {},
      ...ACS_GROUPS.map((group) => groupResults.get(group).rows.get(zcta).cells),
    );
    check(Object.keys(cells).length === 189, `complete cell conservation ${zcta}`);
    complete_rows.push(Object.freeze({
      zcta,
      name: names.size ? [...names][0] : null,
      cells: Object.freeze(cells),
    }));
  }
  return Object.freeze({
    schema_version: "acs-zcta-demographic-network-reconciliation@1.0.0",
    group_row_counts: Object.freeze(
      Object.fromEntries(ACS_GROUPS.map((group) => [group, groupResults.get(group).row_count])),
    ),
    source_zcta_union_count: union.size,
    complete_zcta_count: complete_rows.length,
    incomplete_zcta_count: incomplete_zctas.length,
    complete_rows: Object.freeze(complete_rows),
    incomplete_zctas: Object.freeze(incomplete_zctas),
    claims: Object.freeze({
      network_requests: 0,
      acquisition_performed: false,
      governed_map_roster_replaced: false,
      non_zcta_space_blocks_map: false,
      production_enrollment: false,
      current_pointer_written: false,
    }),
  });
}
