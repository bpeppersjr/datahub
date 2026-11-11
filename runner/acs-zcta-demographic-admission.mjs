import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { APP_ROOT } from "./paths.mjs";
import { mnSelectionCanonical as canonical } from "./mn-construction-retained-selection.mjs";

export const VERSION = "acs-zcta-demographic-admission-prerequisites@1.2.0";
export const TABLES = Object.freeze(["B01001", "B02001", "B03002", "B04006"]);
const fail = (message) => {
  throw new Error(`ACS ZCTA prerequisite inspection rejected: ${message}.`);
};
const check = (value, message) => value || fail(message);
const exact = (value, keys) =>
  value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  JSON.stringify(Object.keys(value).sort()) ===
    JSON.stringify([...keys].sort());
const stable = (a, b) =>
  a.isFile() &&
  b.isFile() &&
  !a.isSymbolicLink() &&
  !b.isSymbolicLink() &&
  a.nlink === 1n &&
  b.nlink === 1n &&
  ["dev", "ino", "size", "mtimeNs", "ctimeNs"].every(
    (key) => a[key] === b[key],
  );
const inside = (root, candidate) => {
  const resolved = path.resolve(root, candidate),
    relative = path.relative(root, resolved);
  check(
    relative && !relative.startsWith("..") && !path.isAbsolute(relative),
    "contained path",
  );
  return resolved;
};
async function read(file, maximum, signal) {
  await canonical(path.dirname(file), { signal });
  signal?.throwIfAborted();
  const initial = await fs.lstat(file, { bigint: true });
  check(
    initial.isFile() &&
      !initial.isSymbolicLink() &&
      initial.nlink === 1n &&
      initial.size <= BigInt(maximum),
    "bounded single-link input",
  );
  const handle = await fs.open(file, "r"),
    chunks = [],
    hash = createHash("sha256");
  let bytes = 0;
  try {
    check(
      stable(initial, await handle.stat({ bigint: true })),
      "read ownership",
    );
    for (;;) {
      signal?.throwIfAborted();
      const buffer = Buffer.alloc(65536),
        result = await handle.read(buffer, 0, buffer.length, null);
      if (!result.bytesRead) break;
      bytes += result.bytesRead;
      check(bytes <= maximum, "read byte ceiling");
      const part = buffer.subarray(0, result.bytesRead);
      chunks.push(part);
      hash.update(part);
    }
    check(
      stable(initial, await handle.stat({ bigint: true })) &&
        stable(initial, await fs.lstat(file, { bigint: true })) &&
        BigInt(bytes) === initial.size,
      "input drift",
    );
    return { raw: Buffer.concat(chunks), bytes, sha256: hash.digest("hex") };
  } finally {
    await handle.close();
  }
}
async function json(file, maximum, signal) {
  const result = await read(file, maximum, signal);
  return {
    ...result,
    value: JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(result.raw),
    ),
  };
}
async function replayZctaJsonl(file, expectedBytes, expectedHash, signal) {
  await canonical(path.dirname(file), { signal });
  signal?.throwIfAborted();
  const initial = await fs.lstat(file, { bigint: true });
  check(
    initial.isFile() &&
      !initial.isSymbolicLink() &&
      initial.nlink === 1n &&
      initial.size === BigInt(expectedBytes) &&
      expectedBytes <= 20_000_000,
    "bounded ZCTA artifact",
  );
  const handle = await fs.open(file, "r"),
    digest = createHash("sha256"),
    decoder = new TextDecoder("utf-8", { fatal: true }),
    seen = new Set();
  let bytes = 0,
    tail = Buffer.alloc(0),
    rows = 0;
  try {
    check(
      stable(initial, await handle.stat({ bigint: true })),
      "ZCTA read ownership",
    );
    for (;;) {
      signal?.throwIfAborted();
      const buffer = Buffer.alloc(65536),
        result = await handle.read(buffer, 0, buffer.length, null);
      if (!result.bytesRead) break;
      bytes += result.bytesRead;
      check(bytes <= expectedBytes, "ZCTA byte ceiling");
      const chunk = buffer.subarray(0, result.bytesRead);
      digest.update(chunk);
      let start = 0;
      for (let index = 0; index < chunk.length; index++)
        if (chunk[index] === 10) {
          const raw = Buffer.concat([tail, chunk.subarray(start, index)]);
          check(
            raw.length > 0 && raw.length <= 65536 && raw.at(-1) !== 13,
            "ZCTA line framing",
          );
          const row = JSON.parse(decoder.decode(raw));
          check(
            row &&
              typeof row === "object" &&
              !Array.isArray(row) &&
              row.geo_type === "zcta" &&
              /^\d{5}$/.test(row.zcta) &&
              row.geoid === row.zcta &&
              row.geo_id === `zcta:${row.zcta}` &&
              Number.isSafeInteger(row.population_2020) &&
              row.population_2020 >= 0 &&
              Number.isSafeInteger(row.housing_units_2020) &&
              row.housing_units_2020 >= 0 &&
              !seen.has(row.zcta),
            "ZCTA row shape or identity",
          );
          seen.add(row.zcta);
          rows++;
          check(rows <= 33791, "ZCTA row ceiling");
          tail = Buffer.alloc(0);
          start = index + 1;
        }
      tail = Buffer.concat([tail, chunk.subarray(start)]);
      check(tail.length <= 65536, "ZCTA line ceiling");
    }
    check(
      tail.length === 0 &&
        rows === 33791 &&
        seen.size === 33791 &&
        bytes === expectedBytes &&
        digest.digest("hex") === expectedHash,
      "ZCTA exact replay",
    );
    check(
      stable(initial, await handle.stat({ bigint: true })) &&
        stable(initial, await fs.lstat(file, { bigint: true })),
      "ZCTA input drift",
    );
    return { bytes, sha256: expectedHash, rows, unique_zctas: seen.size };
  } finally {
    await handle.close();
  }
}
export function expectedVariables(config, table) {
  const definition = config.required_tables?.[table];
  check(
    definition &&
      Number.isSafeInteger(definition.first_cell) &&
      Number.isSafeInteger(definition.last_cell) &&
      definition.first_cell === 1 &&
      definition.last_cell >= 1,
    "table definition",
  );
  return Array.from(
    { length: definition.last_cell },
    (_, index) => `${table}_${String(index + 1).padStart(3, "0")}`,
  );
}
export function demographicCellContract(baseVariable) {
  check(/^[A-Z]\d{5}_\d{3}$/.test(baseVariable), "base variable");
  return {
    estimate: `${baseVariable}E`,
    margin_of_error: `${baseVariable}M`,
    estimate_annotation: `${baseVariable}EA`,
    margin_of_error_annotation: `${baseVariable}MA`,
    raw_negative_sentinel_preservation_required: true,
    annotation_semantics: "unresolved-until-trusted-official-metadata",
    missing_value: null,
    percentages_emitted: false,
  };
}
export function expectedDemographicCells(config) {
  return TABLES.flatMap((table) => expectedVariables(config, table));
}
const rawNumeric = (value) =>
  value === null ||
  (typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value));
const rawAnnotation = (value) =>
  value === null ||
  (typeof value === "string" &&
    value.length > 0 &&
    value.length <= 64 &&
    !/[\u0000-\u001f\u007f]/.test(value));
export function validateAcsZctaDemographicCandidateRow(row, config) {
  check(exact(row, ["zcta", "cells"]), "candidate row envelope");
  check(/^\d{5}$/.test(row.zcta), "candidate ZCTA identity");
  const expected = expectedDemographicCells(config);
  check(exact(row.cells, expected), "candidate cell roster");
  const cells = {};
  for (const variable of expected) {
    const value = row.cells[variable];
    check(
      exact(value, [
        "estimate",
        "margin_of_error",
        "estimate_annotation",
        "margin_of_error_annotation",
      ]) &&
        rawNumeric(value.estimate) &&
        rawNumeric(value.margin_of_error) &&
        rawAnnotation(value.estimate_annotation) &&
        rawAnnotation(value.margin_of_error_annotation),
      `candidate ${variable} raw E/M/EA/MA`,
    );
    cells[variable] = Object.freeze({...value});
  }
  return Object.freeze({zcta: row.zcta, cells: Object.freeze(cells)});
}
export async function inspectAcsZctaDemographicPrerequisites(options = {}) {
  const root = path.resolve(options.root ?? APP_ROOT);
  options.signal?.throwIfAborted();
  const configFile = inside(
      root,
      options.configPath ?? "config/acs-zcta-demographic-admission.json",
    ),
    configRead = await json(configFile, 200000, options.signal),
    config = configRead.value;
  check(
    config.schema_version === "acs-zcta-demographic-admission-config@1.1.0" &&
      config.publication_mode === "immutable-local-review-only-pointer-free" &&
      config.expected_zcta_count === 33791,
    "configuration",
  );
  check(exact(config.required_tables, TABLES), "table roster");
  const ranges = {
    B01001: [1, 49],
    B02001: [1, 10],
    B03002: [1, 21],
    B04006: [1, 109],
  };
  for (const table of TABLES)
    check(
      JSON.stringify([
        config.required_tables[table].first_cell,
        config.required_tables[table].last_cell,
      ]) === JSON.stringify(ranges[table]),
      `${table} cell range`,
    );
  const policy = await json(
    inside(root, config.source_policy.path),
    200000,
    options.signal,
  );
  check(
    policy.value.policy_id === "us-census-acs-zcta-demographics" &&
      policy.value.version === "1.0.0" &&
      policy.sha256 === config.source_policy.sha256,
    "policy identity",
  );
  const metadata = await json(
    inside(root, config.official_metadata_registry.path),
    500000,
    options.signal,
  );
  check(
    metadata.sha256 === config.official_metadata_registry.sha256 &&
      metadata.value.schema_version ===
        "acs-zcta-demographic-official-metadata-registry@1.0.0" &&
      Array.isArray(metadata.value.supported_releases),
    "official metadata registry pin",
  );
  const authorization = await json(
    inside(root, config.authorization_registry.path),
    500000,
    options.signal,
  );
  check(
    authorization.sha256 === config.authorization_registry.sha256 &&
      authorization.value.schema_version ===
        "acs-zcta-demographic-authorization-registry@1.0.0" &&
      Array.isArray(authorization.value.approved_receipts),
    "authorization registry pin",
  );
  const acquisitionPlan = await json(
    inside(root, config.network_acquisition_plan.path),
    200000,
    options.signal,
  );
  const plan = acquisitionPlan.value;
  check(
    acquisitionPlan.sha256 === config.network_acquisition_plan.sha256 &&
      exact(plan, [
        "schema_version",
        "status",
        "publisher",
        "dataset",
        "official_evidence",
        "request_contract",
        "reconciliation_contract",
        "semantic_boundaries",
        "authorization",
      ]) &&
      plan.schema_version ===
        "acs-zcta-demographic-network-acquisition-plan@1.0.0" &&
      plan.status ===
        "reviewed-proposed-awaiting-explicit-acquisition-authorization" &&
      plan.publisher === "United States Census Bureau" &&
      exact(plan.dataset, [
        "vintage",
        "period",
        "product",
        "api_base_url",
        "public_release_date",
        "geography",
        "geography_summary_level",
      ]) &&
      plan.dataset.vintage === 2024 &&
      plan.dataset.period === "2020-2024" &&
      plan.dataset.product === "ACS 5-Year Detailed Tables" &&
      plan.dataset.api_base_url ===
        "https://api.census.gov/data/2024/acs/acs5" &&
      plan.dataset.public_release_date === "2026-01-29" &&
      plan.dataset.geography === "zip code tabulation area" &&
      plan.dataset.geography_summary_level === "860" &&
      exact(plan.official_evidence, [
        "release_schedule_url",
        "developer_documentation_url",
        "api_dataset_url",
        "api_geography_url",
        "zip_zcta_explanation_url",
      ]) &&
      Object.values(plan.official_evidence).every(
        (value) =>
          typeof value === "string" &&
          /^https:\/\/(?:www\.)?(?:api\.)?census\.gov\//.test(value),
      ) &&
      exact(plan.request_contract, [
        "allowed_host",
        "redirect_policy",
        "metadata_requests",
        "data_requests",
        "maximum_total_requests",
        "maximum_metadata_response_bytes",
        "maximum_group_response_bytes",
        "maximum_total_source_bytes",
        "minimum_free_disk_bytes",
        "tables",
        "data_geography_query",
        "credential_policy",
        "retries_per_request",
        "request_timeout_seconds",
        "maximum_parallel_requests",
      ]) &&
      plan.request_contract.allowed_host === "api.census.gov" &&
      plan.request_contract.redirect_policy === "same-host-only" &&
      plan.request_contract.metadata_requests === 4 &&
      plan.request_contract.data_requests === 4 &&
      plan.request_contract.maximum_total_requests === 8 &&
      plan.request_contract.maximum_metadata_response_bytes === 5_000_000 &&
      plan.request_contract.maximum_group_response_bytes === 536_870_912 &&
      plan.request_contract.maximum_total_source_bytes === 1_073_741_824 &&
      plan.request_contract.minimum_free_disk_bytes === 2_147_483_648 &&
      JSON.stringify(plan.request_contract.tables) === JSON.stringify(TABLES) &&
      plan.request_contract.data_geography_query ===
        "for=zip code tabulation area:*" &&
      plan.request_contract.retries_per_request === 2 &&
      plan.request_contract.request_timeout_seconds === 120 &&
      plan.request_contract.maximum_parallel_requests === 1 &&
      exact(plan.reconciliation_contract, [
        "governed_map_geography_release",
        "join_key",
        "source_zcta_roster_must_be_retained_exactly",
        "governed_map_roster_must_not_be_silently_replaced",
        "source_only_and_map_only_zctas_reported_separately",
        "private_unique_or_po_box_zip_without_zcta",
        "non_zcta_space_blocks_map",
      ]) &&
      plan.reconciliation_contract.governed_map_geography_release ===
        config.geography.release_id &&
      plan.reconciliation_contract.source_zcta_roster_must_be_retained_exactly ===
        true &&
      plan.reconciliation_contract.governed_map_roster_must_not_be_silently_replaced ===
        true &&
      plan.reconciliation_contract.source_only_and_map_only_zctas_reported_separately ===
        true &&
      plan.reconciliation_contract.private_unique_or_po_box_zip_without_zcta ===
        "not-applicable-no-census-zcta-demographic-estimate" &&
      plan.reconciliation_contract.non_zcta_space_blocks_map === false &&
      exact(plan.semantic_boundaries, [
        "acs_values_are_estimates",
        "estimate_margin_of_error_and_annotations_preserved",
        "zcta_is_usps_delivery_zip",
        "zip4_joined",
        "race_ancestry_hispanic_origin_sex_age_cube_constructed",
        "demographic_gdp_allocation_authorized",
        "missing_population_blocks_map",
      ]) &&
      plan.semantic_boundaries.acs_values_are_estimates === true &&
      plan.semantic_boundaries.estimate_margin_of_error_and_annotations_preserved ===
        true &&
      plan.semantic_boundaries.zcta_is_usps_delivery_zip === false &&
      plan.semantic_boundaries.zip4_joined === false &&
      plan.semantic_boundaries.race_ancestry_hispanic_origin_sex_age_cube_constructed ===
        false &&
      plan.semantic_boundaries.demographic_gdp_allocation_authorized === false &&
      plan.semantic_boundaries.missing_population_blocks_map === false &&
      exact(plan.authorization, [
        "network_acquisition_authorized",
        "production_enrollment_authorized",
        "current_pointer_authorized",
        "execution_performed",
        "network_requests_performed",
      ]) &&
      Object.values(plan.authorization).every(
        (value) => value === false || value === 0,
      ),
    "network acquisition plan pin or boundary",
  );
  const geographyManifest = await json(
    inside(root, config.geography.manifest),
    500000,
    options.signal,
  );
  check(
    geographyManifest.sha256 === config.geography.manifest_sha256 &&
      geographyManifest.value.release_id === config.geography.release_id,
    "geography manifest pin",
  );
  const artifact = geographyManifest.value.artifacts.find(
    (entry) => entry.path === config.geography.artifact,
  );
  check(
    artifact?.record_count === 33791 &&
      artifact.sha256 === config.geography.artifact_sha256,
    "geography artifact pin",
  );
  const geography = await replayZctaJsonl(
    inside(
      root,
      path.join(path.dirname(config.geography.manifest), artifact.path),
    ),
    artifact.bytes,
    artifact.sha256,
    options.signal,
  );
  check(
    geography.bytes === artifact.bytes && geography.sha256 === artifact.sha256,
    "geography artifact replay",
  );
  const unsupportedMetadataEntries = metadata.value.supported_releases.length,
    unsupportedAuthorizationEntries =
      authorization.value.approved_receipts.length,
    official = false,
    approved = false;
  return {
    schema_version: VERSION,
    contract_inspection_only: true,
    substantive_publication_supported: false,
    governed_zctas: 33791,
    table_contracts: Object.fromEntries(
      TABLES.map((table) => [
        table,
        {
          logical_group: config.required_tables[table].logical_group,
          base_variables: expectedVariables(config, table),
          cell_contract: "E/M/EA/MA",
          labels_concepts_universes_source:
            "required-trusted-official-group-metadata",
        },
      ]),
    ),
    prerequisites: {
      trusted_official_metadata_release_available: official,
      approved_structured_authorization_receipt_available: approved,
      immutable_governed_acs_source_release_available: false,
      unsupported_or_untrusted_metadata_entries: unsupportedMetadataEntries,
      unsupported_or_untrusted_authorization_entries:
        unsupportedAuthorizationEntries,
      reviewed_network_acquisition_plan_available: true,
      network_acquisition_authorized:
        plan.authorization.network_acquisition_authorized,
    },
    blockers: [
      !official && "missing-trusted-retained-official-acs-group-metadata",
      !approved && "missing-approved-structured-authorization-receipt",
      "missing-immutable-governed-acs-source-release",
      "unresolved-official-sentinel-and-annotation-semantics",
      "network-acquisition-plan-awaiting-explicit-authorization",
    ].filter(Boolean),
    network_acquisition_plan: {
      vintage: plan.dataset.vintage,
      period: plan.dataset.period,
      product: plan.dataset.product,
      public_release_date: plan.dataset.public_release_date,
      api_base_url: plan.dataset.api_base_url,
      maximum_total_requests: plan.request_contract.maximum_total_requests,
      maximum_metadata_response_bytes:
        plan.request_contract.maximum_metadata_response_bytes,
      maximum_group_response_bytes:
        plan.request_contract.maximum_group_response_bytes,
      maximum_total_source_bytes:
        plan.request_contract.maximum_total_source_bytes,
      minimum_free_disk_bytes: plan.request_contract.minimum_free_disk_bytes,
      tables: [...plan.request_contract.tables],
      geography: plan.dataset.geography,
      non_zcta_space_blocks_map:
        plan.reconciliation_contract.non_zcta_space_blocks_map,
      private_unique_or_po_box_zip_without_zcta:
        plan.reconciliation_contract.private_unique_or_po_box_zip_without_zcta,
      status: plan.status,
    },
    sentinel_contract: {
      raw_negative_sentinel_preservation_required: true,
      estimate_and_moe_annotations_preservation_required: true,
      meanings: null,
      status: "unresolved-until-trusted-official-metadata",
    },
    claims: {
      network_requests: 0,
      current_pointer_written: false,
      production_enrollment: false,
      source_ingestion_performed: false,
      staging_created: false,
      release_created: false,
      percentages_emitted: false,
    },
    pins: {
      admission_config_sha256: configRead.sha256,
      source_policy_sha256: policy.sha256,
      official_metadata_registry_sha256: metadata.sha256,
      authorization_registry_sha256: authorization.sha256,
      network_acquisition_plan_sha256: acquisitionPlan.sha256,
      geography_manifest_sha256: geographyManifest.sha256,
      geography_artifact_sha256: geography.sha256,
    },
  };
}
