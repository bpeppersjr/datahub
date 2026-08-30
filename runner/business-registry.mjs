import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { finished } from "node:stream/promises";
import { createInterface } from "node:readline";
import { createGunzip, createGzip } from "node:zlib";
import { createLocationMatchProfile } from "./business-entity-resolution.mjs";

export const REGISTRY_SCHEMA_VERSION = "1.0.0";
export const REGISTRY_TRANSFORMATION_VERSION = "national-business-registry@1.2.0";
export const SNAP_SERVICE_ENTITY_ID = "service:usda_snap_authorization";

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function hashId(prefix, parts) {
  return `${prefix}:${digest(JSON.stringify(parts)).slice(0, 32)}`;
}

function sourceFor(record, sourceField) {
  const source = record.provenance;
  if (!source?.source_id || !source.source_release_id || !source.source_record_id || !source.ingest_run_id || !source.transformation_version || !source.policy_id) {
    throw new Error(`Source record ${record.normalized_record_id ?? "<unknown>"} has incomplete provenance.`);
  }
  return {
    source_id: source.source_id,
    source_release_id: source.source_release_id,
    source_record_id: source.source_record_id,
    ingest_run_id: source.ingest_run_id,
    transformation_version: `${source.transformation_version} -> ${REGISTRY_TRANSFORMATION_VERSION}`,
    policy_id: source.policy_id,
    source_field: sourceField ?? null,
  };
}

function relationshipSource(record) {
  const source = sourceFor(record, null);
  delete source.source_field;
  return source;
}

function assertion(record, subjectEntityId, predicate, value, valueType, sourceField) {
  const observedAt = record.observed_at;
  if (!observedAt) throw new Error(`Source record ${record.normalized_record_id} has no observation timestamp.`);
  const source = sourceFor(record, sourceField);
  return {
    schema_version: REGISTRY_SCHEMA_VERSION,
    assertion_id: hashId("assertion", [subjectEntityId, predicate, value, source.source_release_id, source.source_record_id]),
    subject_entity_id: subjectEntityId,
    predicate,
    value,
    value_type: valueType,
    assertion_status: "active",
    valid_from: null,
    valid_to: null,
    observed_at: observedAt,
    first_seen: observedAt,
    last_seen: observedAt,
    confidence: 1,
    source,
    export_policy: "public",
  };
}

function relationship(record, relationshipType, subjectEntityId, objectEntityId) {
  return {
    schema_version: REGISTRY_SCHEMA_VERSION,
    relationship_id: hashId("relationship", [relationshipType, subjectEntityId, objectEntityId, record.provenance.source_release_id, record.provenance.source_record_id]),
    relationship_type: relationshipType,
    subject_entity_id: subjectEntityId,
    object_entity_id: objectEntityId,
    status: "active",
    valid_from: null,
    valid_to: null,
    observed_at: record.observed_at,
    confidence: 1,
    source: relationshipSource(record),
  };
}

export function reconcileSnapRecord(record) {
  const siteId = record.entity_candidates?.physical_site_id;
  const establishmentId = record.entity_candidates?.establishment_id;
  if (!/^site:[A-Za-z0-9_-]+$/.test(siteId ?? "") || !/^establishment:[A-Za-z0-9_-]+$/.test(establishmentId ?? "")) {
    throw new Error(`SNAP record ${record.normalized_record_id ?? "<unknown>"} has invalid entity candidates.`);
  }
  if (!/^\d{5}$/.test(record.address?.zip_code ?? "")) throw new Error(`SNAP record ${record.normalized_record_id} has an invalid ZIP.`);
  const observedAt = record.observed_at;
  const entities = [
    {
      schema_version: REGISTRY_SCHEMA_VERSION,
      entity_id: siteId,
      entity_type: "physical_site",
      identity_status: "provisional",
      created_at: observedAt,
      updated_at: observedAt,
      superseded_by: null,
    },
    {
      schema_version: REGISTRY_SCHEMA_VERSION,
      entity_id: establishmentId,
      entity_type: "establishment",
      identity_status: "provisional",
      created_at: observedAt,
      updated_at: observedAt,
      superseded_by: null,
    },
  ];
  const assertions = [
    assertion(record, siteId, "site.address", record.address, "address", "Store_Street_Address|Additonal_Address|City|State|Zip_Code|Zip4|County"),
    assertion(record, siteId, "site.location", record.location, "geometry", "Latitude|Longitude"),
    assertion(record, siteId, "site.zip-code", record.address.zip_code, "string", "Zip_Code"),
    assertion(record, siteId, "site.zcta", {
      match_status: record.geography?.zcta_match_status ?? null,
      geo_id: record.geography?.zcta_geo_id ?? null,
      geoid: record.geography?.zcta_geoid ?? null,
    }, "object", "Zip_Code"),
    assertion(record, establishmentId, "establishment.name", record.name, "string", "Store_Name"),
    assertion(record, establishmentId, "establishment.external-identifier", record.external_identifiers?.[0], "identifier", "Record_ID"),
    assertion(record, establishmentId, "establishment.source-status", record.operating_status, "object", null),
    assertion(record, establishmentId, "service.snap-authorized", true, "boolean", "Record_ID"),
  ];
  if (record.source_classification?.value) {
    assertions.push(assertion(record, establishmentId, "establishment.store-type", record.source_classification, "object", "Store_Type"));
  }
  if (record.service_assertions?.healthy_incentive_program) {
    assertions.push(assertion(record, establishmentId, "service.healthy-incentive-program", record.service_assertions.healthy_incentive_program, "string", "Incentive_Program"));
  }
  if (record.service_assertions?.healthy_incentive_grantee) {
    assertions.push(assertion(record, establishmentId, "service.healthy-incentive-grantee", record.service_assertions.healthy_incentive_grantee, "string", "Grantee_Name"));
  }
  return {
    zipCode: record.address.zip_code,
    entities,
    assertions,
    relationships: [
      relationship(record, "located_at", establishmentId, siteId),
      relationship(record, "provides_service", establishmentId, SNAP_SERVICE_ENTITY_ID),
    ],
  };
}

function canonicalEntity(entityId, entityType, observedAt) {
  return {
    schema_version: REGISTRY_SCHEMA_VERSION,
    entity_id: entityId,
    entity_type: entityType,
    identity_status: "provisional",
    created_at: observedAt,
    updated_at: observedAt,
    superseded_by: null,
  };
}

function nppesLocationAssertions(record, establishmentId, siteId, address, geography, telephone, sourceStatus, name = null, fieldPrefix = "Provider Business Practice Location") {
  const assertions = [
    assertion(record, siteId, "site.address", address, "address", `${fieldPrefix} Address fields`),
    assertion(record, siteId, "site.zcta", geography, "object", `${fieldPrefix} Address Postal Code`),
    assertion(record, establishmentId, "establishment.source-status", sourceStatus, "object", "NPI Deactivation Date|NPI Reactivation Date"),
  ];
  if (telephone) assertions.push(assertion(record, siteId, "site.telephone", telephone, "string", `${fieldPrefix} Address Telephone Number`));
  if (name) assertions.push(assertion(record, establishmentId, "establishment.name", name, "string", "Provider Organization Name (Legal Business Name)|Provider Other Organization Name"));
  return assertions;
}

export function reconcileNppesOrganization(record) {
  const npi = record.external_identifiers?.find((item) => item.type === "npi")?.value;
  const organizationId = record.entity_candidates?.organization_id;
  if (!/^\d{10}$/.test(npi ?? "") || organizationId !== `organization:cms_npi_${npi}`) throw new Error(`Invalid NPPES organization candidate ${record.normalized_record_id}.`);
  const entities = [canonicalEntity(organizationId, "organization", record.observed_at)];
  const organizationAssertions = [
    assertion(record, organizationId, "organization.legal-name", record.legal_business_name, "string", "Provider Organization Name (Legal Business Name)"),
    assertion(record, organizationId, "organization.external-identifier", { type: "npi", value: npi }, "identifier", "NPI"),
    assertion(record, organizationId, "organization.npi-status", record.npi_status, "object", "NPI Deactivation Date|NPI Reactivation Date"),
    assertion(record, organizationId, "organization.healthcare-taxonomies", { system: "NUCC Healthcare Provider Taxonomy", items: record.healthcare_taxonomies }, "object", "Healthcare Provider Taxonomy Code_1 through _15"),
  ];
  if (record.organization_subpart !== null) {
    organizationAssertions.push(assertion(record, organizationId, "organization.subpart", record.organization_subpart, "boolean", "Is Organization Subpart"));
  }
  if (record.other_organization_name) {
    organizationAssertions.push(assertion(record, organizationId, "organization.other-name", {
      name: record.other_organization_name,
      name_type: record.other_organization_name_type,
    }, "object", "Provider Other Organization Name|Provider Other Organization Name Type Code"));
  }
  if (record.parent_organization_name) {
    organizationAssertions.push(assertion(record, organizationId, "organization.reported-parent-name", record.parent_organization_name, "string", "Parent Organization LBN"));
  }
  const locationAssertions = [];
  const relationships = [];
  let zipCode = null;
  const siteId = record.entity_candidates?.physical_site_id;
  const establishmentId = record.entity_candidates?.establishment_id;
  if (record.primary_practice_location) {
    zipCode = record.primary_practice_location.address?.zip_code;
    if (!/^\d{5}$/.test(zipCode ?? "") || !siteId || !establishmentId) throw new Error(`NPPES organization ${npi} has an invalid primary location candidate.`);
    entities.push(canonicalEntity(siteId, "physical_site", record.observed_at));
    entities.push(canonicalEntity(establishmentId, "establishment", record.observed_at));
    locationAssertions.push(...nppesLocationAssertions(
      record,
      establishmentId,
      siteId,
      record.primary_practice_location.address,
      record.primary_practice_location.geography,
      record.primary_practice_location.telephone,
      record.npi_status,
      record.other_organization_name || record.legal_business_name,
    ));
    relationships.push(relationship(record, "operates", organizationId, establishmentId));
    relationships.push(relationship(record, "located_at", establishmentId, siteId));
  }
  return { npi, npiPrefix: npi[0], zipCode, entities, organizationAssertions, locationAssertions, relationships };
}

export function reconcileNppesPracticeLocation(record) {
  const npi = record.npi;
  const organizationId = record.entity_candidates?.organization_id;
  const siteId = record.entity_candidates?.physical_site_id;
  const establishmentId = record.entity_candidates?.establishment_id;
  const zipCode = record.address?.zip_code;
  if (!/^\d{10}$/.test(npi ?? "") || organizationId !== `organization:cms_npi_${npi}` || !siteId || !establishmentId || !/^\d{5}$/.test(zipCode ?? "")) {
    throw new Error(`Invalid NPPES practice-location candidate ${record.normalized_record_id}.`);
  }
  return {
    npi,
    zipCode,
    entities: [
      canonicalEntity(siteId, "physical_site", record.observed_at),
      canonicalEntity(establishmentId, "establishment", record.observed_at),
    ],
    assertions: nppesLocationAssertions(record, establishmentId, siteId, record.address, record.geography, record.telephone, record.source_status, null, "Provider Secondary Practice Location"),
    relationships: [
      relationship(record, "operates", organizationId, establishmentId),
      relationship(record, "located_at", establishmentId, siteId),
    ],
  };
}

export function reconcileNppesOtherName(record) {
  if (!/^\d{10}$/.test(record.npi ?? "") || record.organization_id !== `organization:cms_npi_${record.npi}` || !record.name) {
    throw new Error(`Invalid NPPES organization other name ${record.normalized_record_id}.`);
  }
  return assertion(record, record.organization_id, "organization.other-name", {
    name: record.name,
    name_type: record.name_type,
    source_created_date: record.source_created_date,
  }, "object", "Provider Other Organization Name|Provider Other Organization Name Type Code|Created Date");
}

export function reconcileFdicInstitution(record) {
  const certificate = record.external_identifiers?.find((item) => item.type === "fdic_certificate")?.value;
  const organizationId = record.entity_candidates?.organization_id;
  if (!/^\d+$/.test(certificate ?? "") || organizationId !== `organization:fdic_cert_${certificate}` || !record.legal_name) {
    throw new Error(`Invalid FDIC institution candidate ${record.normalized_record_id}.`);
  }
  const assertions = [
    assertion(record, organizationId, "organization.legal-name", record.legal_name, "string", "NAME"),
    assertion(record, organizationId, "organization.fdic-status", record.source_status, "object", "ACTIVE|INACTIVE"),
  ];
  for (const identifier of record.external_identifiers ?? []) {
    assertions.push(assertion(record, organizationId, "organization.external-identifier", identifier, "identifier", identifier.source_field));
  }
  if (record.headquarters?.address) assertions.push(assertion(record, organizationId, "organization.reported-headquarters-address", record.headquarters.address, "address", "ADDRESS|ADDRESS2|CITY|STALP|ZIP|COUNTY|STCNTY"));
  if (record.headquarters?.location) assertions.push(assertion(record, organizationId, "organization.reported-headquarters-location", record.headquarters.location, "geometry", "LATITUDE|LONGITUDE"));
  if (record.headquarters?.geography) assertions.push(assertion(record, organizationId, "organization.reported-headquarters-zcta", record.headquarters.geography, "object", "ZIP"));
  if (record.website) assertions.push(assertion(record, organizationId, "organization.reported-website", record.website, "string", "WEBADDR"));
  if (record.institution_class) assertions.push(assertion(record, organizationId, "organization.fdic-institution-class", record.institution_class, "object", "BKCLASS|CHRTAGNT|REGAGNT"));
  if (record.minority_depository_status) assertions.push(assertion(record, organizationId, "organization.fdic-minority-depository-status", record.minority_depository_status, "object", "MDI_STATUS_CODE|MDI_STATUS_DESC"));
  if (record.reported_office_count !== null) assertions.push(assertion(record, organizationId, "organization.reported-office-count", record.reported_office_count, "number", "OFFICES"));
  if (record.operating_dates) assertions.push(assertion(record, organizationId, "organization.fdic-operating-dates", record.operating_dates, "object", "ESTYMD|INSDATE|ENDEFYMD|DATEUPDT|RUNDATE"));
  return { certificate, certificatePrefix: certificate[0], entity: canonicalEntity(organizationId, "organization", record.observed_at), assertions };
}

export function reconcileFdicLocation(record) {
  const certificate = record.external_identifiers?.find((item) => item.type === "fdic_certificate")?.value;
  const organizationId = record.entity_candidates?.organization_id;
  const siteId = record.entity_candidates?.physical_site_id;
  const establishmentId = record.entity_candidates?.establishment_id;
  const zipCode = record.address?.zip_code;
  if (!/^\d+$/.test(certificate ?? "") || organizationId !== `organization:fdic_cert_${certificate}` || !siteId || !establishmentId || !/^\d{5}$/.test(zipCode ?? "")) {
    throw new Error(`Invalid FDIC location candidate ${record.normalized_record_id}.`);
  }
  const assertions = [
    assertion(record, siteId, "site.address", record.address, "address", "ADDRESS|ADDRESS2|CITY|STALP|ZIP|COUNTY|STCNTY"),
    assertion(record, siteId, "site.zip-code", zipCode, "string", "ZIP"),
    assertion(record, siteId, "site.zcta", record.geography, "object", "ZIP"),
    assertion(record, establishmentId, "establishment.name", record.office_name || record.institution_name, "string", "OFFNAME|NAME"),
    assertion(record, establishmentId, "establishment.source-status", record.source_status, "object", null),
    assertion(record, establishmentId, "establishment.fdic-main-office", record.main_office, "boolean", "MAINOFF"),
  ];
  if (record.location) assertions.push(assertion(record, siteId, "site.location", record.location, "geometry", "LATITUDE|LONGITUDE"));
  for (const identifier of record.external_identifiers ?? []) {
    assertions.push(assertion(record, establishmentId, "establishment.external-identifier", identifier, "identifier", identifier.source_field));
  }
  if (record.office_number) assertions.push(assertion(record, establishmentId, "establishment.fdic-office-number", record.office_number, "string", "OFFNUM"));
  if (record.service_type) assertions.push(assertion(record, establishmentId, "establishment.fdic-service-type", record.service_type, "object", "SERVTYPE|SERVTYPE_DESC"));
  if (record.institution_class_code) assertions.push(assertion(record, establishmentId, "establishment.fdic-institution-class-code", record.institution_class_code, "string", "BKCLASS"));
  if (record.established_date) assertions.push(assertion(record, establishmentId, "establishment.established-date", record.established_date, "date", "ESTYMD"));
  if (record.source_run_date) assertions.push(assertion(record, establishmentId, "establishment.source-run-date", record.source_run_date, "date", "RUNDATE"));
  return {
    certificate,
    zipCode,
    entities: [canonicalEntity(siteId, "physical_site", record.observed_at), canonicalEntity(establishmentId, "establishment", record.observed_at)],
    assertions,
    relationships: [relationship(record, "operates", organizationId, establishmentId), relationship(record, "located_at", establishmentId, siteId)],
  };
}

export function reconcileNcuaInstitution(record) {
  const charterNumber = record.external_identifiers?.find((item) => item.type === "ncua_charter_number")?.value;
  const organizationId = record.entity_candidates?.organization_id;
  if (!/^\d+$/.test(charterNumber ?? "") || organizationId !== `organization:ncua_charter_${charterNumber}` || !record.legal_name) {
    throw new Error(`Invalid NCUA institution candidate ${record.normalized_record_id}.`);
  }
  const assertions = [
    assertion(record, organizationId, "organization.legal-name", record.legal_name, "string", "CU_NAME"),
    assertion(record, organizationId, "organization.ncua-status", record.source_status, "object", "CU_TYPE|CYCLE_DATE"),
  ];
  for (const identifier of record.external_identifiers ?? []) {
    assertions.push(assertion(record, organizationId, "organization.external-identifier", identifier, "identifier", identifier.source_field));
  }
  if (record.credit_union_type) assertions.push(assertion(record, organizationId, "organization.ncua-credit-union-type", record.credit_union_type, "object", "CU_TYPE|CharterState"));
  if (record.reported_mailing_address) assertions.push(assertion(record, organizationId, "organization.reported-mailing-address", record.reported_mailing_address, "address", "STREET|CITY|STATE|ZIP_CODE"));
  if (record.organization_dates) assertions.push(assertion(record, organizationId, "organization.ncua-dates", record.organization_dates, "object", "YEAR_OPENED|ISSUE_DATE|INSURED_DATE"));
  if (record.source_classifications) assertions.push(assertion(record, organizationId, "organization.ncua-classifications", record.source_classifications, "object", "TOM_CODE|LIMITED_INC|IsMDI|Peer_Group|REGION"));
  return { charterNumber, charterPrefix: charterNumber[0], entity: canonicalEntity(organizationId, "organization", record.observed_at), assertions };
}

export function reconcileNcuaLocation(record) {
  const charterNumber = record.external_identifiers?.find((item) => item.type === "ncua_charter_number")?.value;
  const organizationId = record.entity_candidates?.organization_id;
  const siteId = record.entity_candidates?.physical_site_id;
  const establishmentId = record.entity_candidates?.establishment_id;
  const zipCode = record.address?.zip_code;
  if (!/^\d+$/.test(charterNumber ?? "") || organizationId !== `organization:ncua_charter_${charterNumber}` || !siteId || !establishmentId || !/^\d{5}$/.test(zipCode ?? "")) {
    throw new Error(`Invalid NCUA location candidate ${record.normalized_record_id}.`);
  }
  const assertions = [
    assertion(record, siteId, "site.address", record.address, "address", "PhysicalAddress fields"),
    assertion(record, siteId, "site.zip-code", zipCode, "string", "PhysicalAddressPostalCode"),
    assertion(record, siteId, "site.zcta", record.geography, "object", "PhysicalAddressPostalCode"),
    assertion(record, establishmentId, "establishment.name", record.site_name || record.credit_union_name, "string", "SiteName|CU_NAME"),
    assertion(record, establishmentId, "establishment.source-status", record.source_status, "object", "CYCLE_DATE"),
    assertion(record, establishmentId, "establishment.ncua-main-office", record.main_office, "boolean", "MainOffice"),
    assertion(record, establishmentId, "establishment.ncua-reported-services", record.reported_services, "object", "MemberServices|ATM|DriveThru|Shrd_Serv_Cntr_Net"),
  ];
  if (record.mailing_address) assertions.push(assertion(record, siteId, "site.reported-mailing-address", record.mailing_address, "address", "MailingAddress fields"));
  if (record.telephone) assertions.push(assertion(record, siteId, "site.telephone", record.telephone, "string", "PhoneNumber"));
  if (record.reported_hours_of_operation) assertions.push(assertion(record, establishmentId, "establishment.reported-hours", record.reported_hours_of_operation, "string", "HoursOfOperation"));
  if (record.site_type) assertions.push(assertion(record, establishmentId, "establishment.ncua-site-type", record.site_type, "string", "SiteTypeName"));
  for (const identifier of record.external_identifiers ?? []) {
    assertions.push(assertion(record, establishmentId, "establishment.external-identifier", identifier, "identifier", identifier.source_field));
  }
  return {
    charterNumber,
    zipCode,
    entities: [canonicalEntity(siteId, "physical_site", record.observed_at), canonicalEntity(establishmentId, "establishment", record.observed_at)],
    assertions,
    relationships: [relationship(record, "operates", organizationId, establishmentId), relationship(record, "located_at", establishmentId, siteId)],
  };
}

export function reconcileNcuaTradeName(record) {
  if (!/^\d+$/.test(record.charter_number ?? "") || record.organization_id !== `organization:ncua_charter_${record.charter_number}` || !record.name) {
    throw new Error(`Invalid NCUA trade-name candidate ${record.normalized_record_id}.`);
  }
  return assertion(record, record.organization_id, "organization.other-name", {
    name: record.name,
    name_type: "ncua-reported-trade-name",
    ncua_trade_name_id: record.trade_name_id,
  }, "object", "TradeName|TradeNamesId");
}

export function reconcileFsisEstablishment(record) {
  const fsisId = record.external_identifiers?.find((item) => item.type === "fsis_establishment_id")?.value;
  const siteId = record.entity_candidates?.physical_site_id;
  const establishmentId = record.entity_candidates?.establishment_id;
  const zipCode = record.address?.zip_code;
  if (!/^\d+$/.test(fsisId ?? "") || siteId !== `site:fsis_establishment_${fsisId}`
    || establishmentId !== `establishment:fsis_establishment_${fsisId}` || !/^\d{5}$/.test(zipCode ?? "") || !record.name) {
    throw new Error(`Invalid FSIS establishment candidate ${record.normalized_record_id}.`);
  }
  const assertions = [
    assertion(record, siteId, "site.address", record.address, "address", "street|city|state|zip|county|fips_code"),
    assertion(record, siteId, "site.zip-code", zipCode, "string", "zip"),
    assertion(record, siteId, "site.location", record.location, "geometry", "latitude|longitude"),
    assertion(record, siteId, "site.zcta", record.geography, "object", "zip"),
    assertion(record, establishmentId, "establishment.name", record.name, "string", "establishment_name"),
    assertion(record, establishmentId, "establishment.source-status", record.source_status, "object", null),
    assertion(record, establishmentId, "establishment.fsis-activities", { items: record.activities }, "object", "activities"),
    assertion(record, establishmentId, "establishment.fsis-inspection-context", record.inspection_context, "object", "district|circuit|size"),
    assertion(record, establishmentId, "establishment.fsis-active-grants", record.active_grants, "object", "active_*_grant|last_*_grant_edit_date"),
    assertion(record, establishmentId, "establishment.fsis-reported-demographics", record.reported_demographics, "object", "Establishment Demographic Data fields"),
  ];
  if (record.telephone) assertions.push(assertion(record, siteId, "site.telephone", record.telephone, "string", "phone"));
  if (record.grant_date) assertions.push(assertion(record, establishmentId, "establishment.fsis-grant-date", record.grant_date, "date", "grant_date"));
  for (const identifier of record.external_identifiers ?? []) {
    assertions.push(assertion(record, establishmentId, "establishment.external-identifier", identifier, "identifier", identifier.source_field));
  }
  for (const name of record.other_names ?? []) {
    assertions.push(assertion(record, establishmentId, "establishment.other-name", { name, name_type: "fsis-reported-dba" }, "object", "dbas"));
  }
  return {
    fsisId,
    zipCode,
    entities: [canonicalEntity(siteId, "physical_site", record.observed_at), canonicalEntity(establishmentId, "establishment", record.observed_at)],
    assertions,
    relationships: [relationship(record, "located_at", establishmentId, siteId)],
  };
}

export function reconcileEpaEchoFacility(record) {
  const frsId = record.external_identifiers?.find((item) => item.type === "frs_registry_id")?.value;
  const siteId = record.entity_candidates?.physical_site_id;
  const establishmentId = record.entity_candidates?.establishment_id;
  const zipCode = record.address?.zip_code;
  if (!/^\d+$/.test(frsId ?? "") || siteId !== `site:epa_frs_${frsId}`
    || establishmentId !== `establishment:epa_frs_${frsId}` || !/^\d{5}$/.test(zipCode ?? "") || !record.name) {
    throw new Error(`Invalid EPA ECHO facility candidate ${record.normalized_record_id}.`);
  }
  const assertions = [
    assertion(record, siteId, "site.address", record.address, "address", "FAC_STREET|FAC_CITY|FAC_STATE|FAC_ZIP|FAC_COUNTY|FAC_FIPS_CODE"),
    assertion(record, siteId, "site.zip-code", zipCode, "string", "FAC_ZIP"),
    assertion(record, siteId, "site.zcta", record.geography, "object", "FAC_ZIP"),
    assertion(record, establishmentId, "establishment.name", record.name, "string", "FAC_NAME"),
    assertion(record, establishmentId, "establishment.source-status", record.source_status, "object", "FAC_ACTIVE_FLAG"),
    assertion(record, establishmentId, "establishment.epa-program-associations", record.program_associations, "object", "AIR_FLAG|NPDES_FLAG|SDWIS_FLAG|RCRA_FLAG|TRI_FLAG|GHG_FLAG"),
    assertion(record, establishmentId, "establishment.source-classifications", record.source_classifications, "object", "FAC_NAICS_CODES|FAC_SIC_CODES|CAA_NAICS|CWA_NAICS|RCRA_NAICS"),
    assertion(record, establishmentId, "establishment.epa-facility-context", record.facility_context, "object", "FAC_EPA_REGION|FAC_MAJOR_FLAG|FAC_FEDERAL_FLG|FAC_FEDERAL_AGENCY|FAC_INDIAN_CNTRY_FLG"),
  ];
  if (record.reported_location) assertions.push(assertion(record, siteId, "site.reported-location", record.reported_location, "object", "FAC_LAT|FAC_LONG|FAC_COLLECTION_METHOD|FAC_REFERENCE_POINT|FAC_ACCURACY_METERS"));
  if (record.detailed_facility_report_url) assertions.push(assertion(record, establishmentId, "establishment.epa-detailed-facility-report-url", record.detailed_facility_report_url, "string", "DFR_URL"));
  for (const identifier of record.external_identifiers ?? []) {
    assertions.push(assertion(record, establishmentId, "establishment.external-identifier", identifier, "identifier", identifier.source_field));
  }
  return {
    frsId,
    zipCode,
    entities: [canonicalEntity(siteId, "physical_site", record.observed_at), canonicalEntity(establishmentId, "establishment", record.observed_at)],
    assertions,
    relationships: [relationship(record, "located_at", establishmentId, siteId)],
  };
}

export function reconcileFmcsaCompany(record) {
  const dotNumber = record.external_identifiers?.find((item) => item.type === "usdot_number")?.value;
  const siteId = record.entity_candidates?.physical_site_id;
  const establishmentId = record.entity_candidates?.establishment_id;
  const zipCode = record.address?.zip_code;
  if (!/^\d+$/.test(dotNumber ?? "") || siteId !== `site:fmcsa_usdot_${dotNumber}_principal_office`
    || establishmentId !== `establishment:fmcsa_usdot_${dotNumber}_principal_office` || !/^\d{5}$/.test(zipCode ?? "")
    || !record.legal_name || record.entity_candidates?.organization_id) {
    throw new Error(`Invalid FMCSA Company Census candidate ${record.normalized_record_id}.`);
  }
  const assertions = [
    assertion(record, siteId, "site.address", record.address, "address", "PHY_STREET|PHY_CITY|PHY_STATE|PHY_ZIP|PHY_CNTY|PHY_COUNTRY"),
    assertion(record, siteId, "site.zip-code", zipCode, "string", "PHY_ZIP"),
    assertion(record, siteId, "site.zcta", record.geography, "object", "PHY_ZIP"),
    assertion(record, establishmentId, "establishment.name", record.legal_name, "string", "LEGAL_NAME"),
    assertion(record, establishmentId, "establishment.source-status", record.source_status, "object", "STATUS_CODE"),
    assertion(record, establishmentId, "establishment.fmcsa-registration-profile", record.registration_profile, "object", "CARRIER_OPERATION|BUSINESS_ORG_ID|BUSINESS_ORG_DESC|CARSHIP|CLASSDEF|HM_Ind|PHY_OMC_REGION|MCS150_DATE|ADD_DATE|DOCKET1PREFIX|DOCKET1|DOCKET1_STATUS_CODE through DOCKET3PREFIX|DOCKET3|DOCKET3_STATUS_CODE"),
    assertion(record, establishmentId, "establishment.source-data-sensitivity", record.data_sensitivity, "object", null),
  ];
  if (record.dba_name) assertions.push(assertion(record, establishmentId, "establishment.other-name", { name: record.dba_name, name_type: "fmcsa-reported-dba" }, "object", "DBA_NAME"));
  const identifierKeys = new Set();
  for (const identifier of record.external_identifiers ?? []) {
    const key = `${identifier.type}:${identifier.value}`;
    if (identifierKeys.has(key)) continue;
    identifierKeys.add(key);
    assertions.push(assertion(record, establishmentId, "establishment.external-identifier", identifier, "identifier", identifier.source_field));
  }
  return {
    dotNumber,
    zipCode,
    entities: [canonicalEntity(siteId, "physical_site", record.observed_at), canonicalEntity(establishmentId, "establishment", record.observed_at)],
    assertions,
    relationships: [relationship(record, "located_at", establishmentId, siteId)],
  };
}

export function reconcileIrsEoOrganization(record) {
  const ein = record.external_identifiers?.find((item) => item.type === "ein")?.value;
  const organizationId = record.entity_candidates?.organization_id;
  const zipCode = record.reported_filing_address?.zip_code;
  if (!/^\d{9}$/.test(ein ?? "") || organizationId !== `organization:irs_ein_${ein}`
    || !/^\d{5}$/.test(zipCode ?? "") || !record.legal_name || record.entity_candidates?.physical_site_id || record.entity_candidates?.establishment_id) {
    throw new Error(`Invalid IRS EO organization candidate ${record.normalized_record_id}.`);
  }
  const assertions = [
    assertion(record, organizationId, "organization.legal-name", record.legal_name, "string", "NAME"),
    assertion(record, organizationId, "organization.reported-filing-address", record.reported_filing_address, "address", "STREET|CITY|STATE|ZIP"),
    assertion(record, organizationId, "organization.reported-filing-zip-code", zipCode, "string", "ZIP"),
    assertion(record, organizationId, "organization.reported-filing-zcta", record.geography, "object", "ZIP"),
    assertion(record, organizationId, "organization.irs-eo-tax-profile", record.tax_exempt_profile, "object", "GROUP|SUBSECTION|AFFILIATION|CLASSIFICATION|RULING|DEDUCTIBILITY|FOUNDATION|ACTIVITY|ORGANIZATION|STATUS|TAX_PERIOD|FILING_REQ_CD|PF_FILING_REQ_CD|ACCT_PD|NTEE_CD"),
    assertion(record, organizationId, "organization.irs-eo-source-status", record.source_status, "object", "STATUS"),
  ];
  for (const identifier of record.external_identifiers ?? []) {
    assertions.push(assertion(record, organizationId, "organization.external-identifier", identifier, "identifier", identifier.source_field));
  }
  for (const otherName of record.other_names ?? []) {
    assertions.push(assertion(record, organizationId, "organization.other-name", otherName, "object", "SORT_NAME"));
  }
  return {
    ein,
    einPrefix: ein[0],
    zipCode,
    entity: canonicalEntity(organizationId, "organization", record.observed_at),
    assertions,
  };
}

function sha256Buffer(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function hashFile(filePath) {
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of createReadStream(filePath)) {
    bytes += chunk.length;
    hash.update(chunk);
  }
  return { bytes, sha256: hash.digest("hex") };
}

async function writeArtifact(directory, relativePath, content, metadata = {}) {
  const destination = path.join(directory, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
  const temporary = `${destination}.tmp-${randomUUID()}`;
  await writeFile(temporary, buffer);
  await rename(temporary, destination);
  return { path: relativePath.replaceAll("\\", "/"), bytes: buffer.length, sha256: sha256Buffer(buffer), ...metadata };
}

async function openGzipWriter(stagingDirectory, relativePath) {
  const destination = path.join(stagingDirectory, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.tmp-${randomUUID()}`;
  const output = createWriteStream(temporary, { flags: "wx" });
  const gzip = createGzip();
  gzip.pipe(output);
  return { relativePath, destination, temporary, output, gzip, records: 0 };
}

async function writeGzipRecord(writer, record) {
  if (!writer.gzip.write(`${JSON.stringify(record)}\n`)) await once(writer.gzip, "drain");
  writer.records += 1;
}

async function closeGzipWriters(writers, artifactType) {
  const completion = writers.map((writer) => finished(writer.output));
  for (const writer of writers) writer.gzip.end();
  await Promise.all(completion);
  const artifacts = [];
  for (const writer of writers) {
    await rename(writer.temporary, writer.destination);
    artifacts.push({
      path: writer.relativePath.replaceAll("\\", "/"),
      ...(await hashFile(writer.destination)),
      record_count: writer.records,
      artifact_type: artifactType,
    });
  }
  return artifacts;
}

async function writeLocationResolutionProfile(writers, record, reconciled) {
  const profile = createLocationMatchProfile(record, reconciled);
  if (!profile) throw new Error(`Location ${record.normalized_record_id ?? "<unknown>"} produced no entity-resolution profile.`);
  const zip2 = profile.zip_code.slice(0, 2);
  const writer = writers.get(zip2);
  if (!writer) throw new Error(`No entity-resolution profile writer exists for ZIP2 ${zip2}.`);
  await writeGzipRecord(writer, profile);
}

function assertContained(parent, child, label) {
  const relative = path.relative(parent, child);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`${label} escapes its release directory.`);
}

async function loadSnapRelease(pointerPath) {
  const pointer = JSON.parse(await readFile(pointerPath, "utf8"));
  const pointerDirectory = path.dirname(pointerPath);
  const manifestPath = path.resolve(pointerDirectory, pointer.manifest ?? "");
  assertContained(pointerDirectory, manifestPath, "SNAP manifest path");
  const manifestBuffer = await readFile(manifestPath);
  const manifest = JSON.parse(manifestBuffer.toString("utf8"));
  if (manifest.dataset_id !== "usda-snap-retailers" || manifest.status !== "published" || !manifest.complete_source_snapshot) {
    throw new Error("A complete published USDA SNAP source release is required.");
  }
  const releaseDirectory = path.dirname(manifestPath);
  const retailerArtifacts = (manifest.artifacts ?? [])
    .filter((artifact) => artifact.artifact_type === "normalized-snap-retailer-jsonl-gzip")
    .sort((a, b) => a.path.localeCompare(b.path));
  if (retailerArtifacts.length !== 10) throw new Error(`Expected 10 USDA SNAP retailer partitions; found ${retailerArtifacts.length}.`);
  const zipArtifact = manifest.artifacts.find((artifact) => artifact.path === "derived/zip-coverage.jsonl");
  if (!zipArtifact) throw new Error("USDA SNAP release has no ZIP coverage artifact.");
  for (const artifact of [...retailerArtifacts, zipArtifact]) {
    const artifactPath = path.resolve(releaseDirectory, artifact.path);
    assertContained(releaseDirectory, artifactPath, `SNAP artifact ${artifact.path}`);
    const actual = await hashFile(artifactPath);
    if (actual.bytes !== artifact.bytes || actual.sha256 !== artifact.sha256) throw new Error(`USDA SNAP artifact ${artifact.path} failed checksum validation.`);
  }
  const zipRows = (await readFile(path.join(releaseDirectory, zipArtifact.path), "utf8"))
    .trim()
    .split("\n")
    .filter(Boolean)
    .map(JSON.parse);
  if (zipRows.length !== zipArtifact.record_count) throw new Error("USDA SNAP ZIP coverage record count does not match its manifest.");
  return {
    manifest,
    manifestPath,
    manifestSha256: sha256Buffer(manifestBuffer),
    releaseDirectory,
    retailerArtifacts,
    zipRows,
  };
}

async function loadNppesRelease(pointerPath) {
  const pointer = JSON.parse(await readFile(pointerPath, "utf8"));
  const pointerDirectory = path.dirname(pointerPath);
  const manifestPath = path.resolve(pointerDirectory, pointer.manifest ?? "");
  assertContained(pointerDirectory, manifestPath, "NPPES manifest path");
  const manifestBuffer = await readFile(manifestPath);
  const manifest = JSON.parse(manifestBuffer.toString("utf8"));
  if (manifest.dataset_id !== "cms-nppes-organizations" || manifest.status !== "published" || !manifest.complete_cms_monthly_source_snapshot) {
    throw new Error("A complete published CMS NPPES organization source release is required.");
  }
  const releaseDirectory = path.dirname(manifestPath);
  const organizationArtifacts = manifest.artifacts.filter((artifact) => artifact.artifact_type === "normalized-nppes-organization-jsonl-gzip").sort((a, b) => a.path.localeCompare(b.path));
  const practiceArtifacts = manifest.artifacts.filter((artifact) => artifact.artifact_type === "normalized-nppes-practice-location-jsonl-gzip").sort((a, b) => a.path.localeCompare(b.path));
  const nameArtifacts = manifest.artifacts.filter((artifact) => artifact.artifact_type === "normalized-nppes-other-name-jsonl-gzip").sort((a, b) => a.path.localeCompare(b.path));
  if (organizationArtifacts.length !== 11 || practiceArtifacts.length !== 10 || nameArtifacts.length !== 10) throw new Error("CMS NPPES source release has an incomplete normalized partition set.");
  const zipArtifact = manifest.artifacts.find((artifact) => artifact.artifact_type === "nppes-organization-zip-coverage-jsonl");
  if (!zipArtifact) throw new Error("CMS NPPES source release has no ZIP coverage artifact.");
  for (const artifact of [...organizationArtifacts, ...practiceArtifacts, ...nameArtifacts, zipArtifact]) {
    const filename = path.resolve(releaseDirectory, artifact.path);
    assertContained(releaseDirectory, filename, `NPPES artifact ${artifact.path}`);
    const actual = await hashFile(filename);
    if (actual.bytes !== artifact.bytes || actual.sha256 !== artifact.sha256) throw new Error(`CMS NPPES artifact ${artifact.path} failed checksum validation.`);
  }
  const zipRows = (await readFile(path.join(releaseDirectory, zipArtifact.path), "utf8")).trim().split("\n").filter(Boolean).map(JSON.parse);
  if (zipRows.length !== zipArtifact.record_count) throw new Error("CMS NPPES ZIP coverage record count does not match its manifest.");
  return {
    manifest,
    manifestSha256: sha256Buffer(manifestBuffer),
    releaseDirectory,
    organizationArtifacts,
    practiceArtifacts,
    nameArtifacts,
    zipRows,
  };
}

async function loadFdicRelease(pointerPath) {
  const pointer = JSON.parse(await readFile(pointerPath, "utf8"));
  const pointerDirectory = path.dirname(pointerPath);
  const manifestPath = path.resolve(pointerDirectory, pointer.manifest ?? "");
  assertContained(pointerDirectory, manifestPath, "FDIC manifest path");
  const manifestBuffer = await readFile(manifestPath);
  const manifest = JSON.parse(manifestBuffer.toString("utf8"));
  if (manifest.dataset_id !== "fdic-bankfind" || manifest.status !== "published" || !manifest.complete_current_structure_snapshot) {
    throw new Error("A complete published FDIC BankFind source release is required.");
  }
  const releaseDirectory = path.dirname(manifestPath);
  const institutionArtifacts = manifest.artifacts.filter((artifact) => artifact.artifact_type === "normalized-fdic-institution-jsonl-gzip").sort((a, b) => a.path.localeCompare(b.path));
  const locationArtifacts = manifest.artifacts.filter((artifact) => artifact.artifact_type === "normalized-fdic-location-jsonl-gzip").sort((a, b) => a.path.localeCompare(b.path));
  if (institutionArtifacts.length !== 10 || locationArtifacts.length !== 10) throw new Error("FDIC BankFind source release has an incomplete normalized partition set.");
  const zipArtifact = manifest.artifacts.find((artifact) => artifact.artifact_type === "fdic-zip-coverage-jsonl");
  if (!zipArtifact) throw new Error("FDIC BankFind source release has no ZIP coverage artifact.");
  for (const artifact of [...institutionArtifacts, ...locationArtifacts, zipArtifact]) {
    const filename = path.resolve(releaseDirectory, artifact.path);
    assertContained(releaseDirectory, filename, `FDIC artifact ${artifact.path}`);
    const actual = await hashFile(filename);
    if (actual.bytes !== artifact.bytes || actual.sha256 !== artifact.sha256) throw new Error(`FDIC artifact ${artifact.path} failed checksum validation.`);
  }
  const zipRows = (await readFile(path.join(releaseDirectory, zipArtifact.path), "utf8")).trim().split("\n").filter(Boolean).map(JSON.parse);
  if (zipRows.length !== zipArtifact.record_count) throw new Error("FDIC ZIP coverage record count does not match its manifest.");
  return {
    manifest,
    manifestSha256: sha256Buffer(manifestBuffer),
    releaseDirectory,
    institutionArtifacts,
    locationArtifacts,
    zipRows,
  };
}

async function loadNcuaRelease(pointerPath) {
  const pointer = JSON.parse(await readFile(pointerPath, "utf8"));
  const pointerDirectory = path.dirname(pointerPath);
  const manifestPath = path.resolve(pointerDirectory, pointer.manifest ?? "");
  assertContained(pointerDirectory, manifestPath, "NCUA manifest path");
  const manifestBuffer = await readFile(manifestPath);
  const manifest = JSON.parse(manifestBuffer.toString("utf8"));
  if (manifest.dataset_id !== "ncua-quarterly-credit-unions" || manifest.status !== "published" || !manifest.complete_final_quarterly_source_snapshot) {
    throw new Error("A complete published NCUA final quarterly source release is required.");
  }
  const releaseDirectory = path.dirname(manifestPath);
  const institutionArtifacts = manifest.artifacts.filter((artifact) => artifact.artifact_type === "normalized-ncua-institution-jsonl-gzip").sort((a, b) => a.path.localeCompare(b.path));
  const locationArtifacts = manifest.artifacts.filter((artifact) => artifact.artifact_type === "normalized-ncua-location-jsonl-gzip").sort((a, b) => a.path.localeCompare(b.path));
  const nameArtifacts = manifest.artifacts.filter((artifact) => artifact.artifact_type === "normalized-ncua-trade-name-jsonl-gzip").sort((a, b) => a.path.localeCompare(b.path));
  if (institutionArtifacts.length !== 10 || locationArtifacts.length !== 10 || nameArtifacts.length !== 10) throw new Error("NCUA source release has an incomplete normalized partition set.");
  const zipArtifact = manifest.artifacts.find((artifact) => artifact.artifact_type === "ncua-zip-coverage-jsonl");
  if (!zipArtifact) throw new Error("NCUA source release has no ZIP coverage artifact.");
  for (const artifact of [...institutionArtifacts, ...locationArtifacts, ...nameArtifacts, zipArtifact]) {
    const filename = path.resolve(releaseDirectory, artifact.path);
    assertContained(releaseDirectory, filename, `NCUA artifact ${artifact.path}`);
    const actual = await hashFile(filename);
    if (actual.bytes !== artifact.bytes || actual.sha256 !== artifact.sha256) throw new Error(`NCUA artifact ${artifact.path} failed checksum validation.`);
  }
  const zipRows = (await readFile(path.join(releaseDirectory, zipArtifact.path), "utf8")).trim().split("\n").filter(Boolean).map(JSON.parse);
  if (zipRows.length !== zipArtifact.record_count) throw new Error("NCUA ZIP coverage record count does not match its manifest.");
  return {
    manifest,
    manifestSha256: sha256Buffer(manifestBuffer),
    releaseDirectory,
    institutionArtifacts,
    locationArtifacts,
    nameArtifacts,
    zipRows,
  };
}

async function loadFsisRelease(pointerPath) {
  const pointer = JSON.parse(await readFile(pointerPath, "utf8"));
  const pointerDirectory = path.dirname(pointerPath);
  const manifestPath = path.resolve(pointerDirectory, pointer.manifest ?? "");
  assertContained(pointerDirectory, manifestPath, "FSIS manifest path");
  const manifestBuffer = await readFile(manifestPath);
  const manifest = JSON.parse(manifestBuffer.toString("utf8"));
  if (manifest.dataset_id !== "fsis-active-mpi-establishments" || manifest.status !== "published" || !manifest.complete_current_active_directory_snapshot) {
    throw new Error("A complete published FSIS active MPI source release is required.");
  }
  const releaseDirectory = path.dirname(manifestPath);
  const establishmentArtifacts = manifest.artifacts.filter((artifact) => artifact.artifact_type === "normalized-fsis-establishment-jsonl-gzip").sort((a, b) => a.path.localeCompare(b.path));
  if (establishmentArtifacts.length !== 10) throw new Error("FSIS source release has an incomplete normalized partition set.");
  const zipArtifact = manifest.artifacts.find((artifact) => artifact.artifact_type === "fsis-zip-coverage-jsonl");
  if (!zipArtifact) throw new Error("FSIS source release has no ZIP coverage artifact.");
  for (const artifact of [...establishmentArtifacts, zipArtifact]) {
    const filename = path.resolve(releaseDirectory, artifact.path);
    assertContained(releaseDirectory, filename, `FSIS artifact ${artifact.path}`);
    const actual = await hashFile(filename);
    if (actual.bytes !== artifact.bytes || actual.sha256 !== artifact.sha256) throw new Error(`FSIS artifact ${artifact.path} failed checksum validation.`);
  }
  const zipRows = (await readFile(path.join(releaseDirectory, zipArtifact.path), "utf8")).trim().split("\n").filter(Boolean).map(JSON.parse);
  if (zipRows.length !== zipArtifact.record_count) throw new Error("FSIS ZIP coverage record count does not match its manifest.");
  return {
    manifest,
    manifestSha256: sha256Buffer(manifestBuffer),
    releaseDirectory,
    establishmentArtifacts,
    zipRows,
  };
}

async function loadEpaEchoRelease(pointerPath) {
  const pointer = JSON.parse(await readFile(pointerPath, "utf8"));
  const pointerDirectory = path.dirname(pointerPath);
  const manifestPath = path.resolve(pointerDirectory, pointer.manifest ?? "");
  assertContained(pointerDirectory, manifestPath, "EPA ECHO manifest path");
  const manifestBuffer = await readFile(manifestPath);
  const manifest = JSON.parse(manifestBuffer.toString("utf8"));
  if (manifest.dataset_id !== "epa-echo-active-facilities" || manifest.status !== "published" || !manifest.complete_echo_exporter_snapshot || manifest.active_filter !== "FAC_ACTIVE_FLAG=Y") {
    throw new Error("A complete published EPA ECHO active-facility source release is required.");
  }
  const releaseDirectory = path.dirname(manifestPath);
  const facilityArtifacts = manifest.artifacts.filter((artifact) => artifact.artifact_type === "normalized-epa-echo-facility-jsonl-gzip").sort((a, b) => a.path.localeCompare(b.path));
  if (facilityArtifacts.length !== 10) throw new Error("EPA ECHO source release has an incomplete normalized partition set.");
  const zipArtifact = manifest.artifacts.find((artifact) => artifact.artifact_type === "epa-echo-zip-coverage-jsonl");
  if (!zipArtifact) throw new Error("EPA ECHO source release has no ZIP coverage artifact.");
  for (const artifact of [...facilityArtifacts, zipArtifact]) {
    const filename = path.resolve(releaseDirectory, artifact.path);
    assertContained(releaseDirectory, filename, `EPA ECHO artifact ${artifact.path}`);
    const actual = await hashFile(filename);
    if (actual.bytes !== artifact.bytes || actual.sha256 !== artifact.sha256) throw new Error(`EPA ECHO artifact ${artifact.path} failed checksum validation.`);
  }
  const zipRows = (await readFile(path.join(releaseDirectory, zipArtifact.path), "utf8")).trim().split("\n").filter(Boolean).map(JSON.parse);
  if (zipRows.length !== zipArtifact.record_count) throw new Error("EPA ECHO ZIP coverage record count does not match its manifest.");
  return {
    manifest,
    manifestSha256: sha256Buffer(manifestBuffer),
    releaseDirectory,
    facilityArtifacts,
    zipRows,
  };
}

async function loadFmcsaRelease(pointerPath) {
  const pointer = JSON.parse(await readFile(pointerPath, "utf8"));
  const pointerDirectory = path.dirname(pointerPath);
  const manifestPath = path.resolve(pointerDirectory, pointer.manifest ?? "");
  assertContained(pointerDirectory, manifestPath, "FMCSA manifest path");
  const manifestBuffer = await readFile(manifestPath);
  const manifest = JSON.parse(manifestBuffer.toString("utf8"));
  if (manifest.dataset_id !== "fmcsa-active-us-company-census" || manifest.status !== "published"
    || !manifest.complete_pinned_active_us_selected_snapshot || manifest.source_filter !== "status_code='A' AND phy_country='US'"
    || manifest.source_order !== "dot_number") {
    throw new Error("A complete published FMCSA active U.S. Company Census source release is required.");
  }
  const releaseDirectory = path.dirname(manifestPath);
  const recordArtifacts = manifest.artifacts.filter((artifact) => artifact.artifact_type === "normalized-fmcsa-company-census-record-jsonl-gzip").sort((a, b) => a.path.localeCompare(b.path));
  if (recordArtifacts.length !== 10) throw new Error("FMCSA source release has an incomplete normalized partition set.");
  const zipArtifact = manifest.artifacts.find((artifact) => artifact.artifact_type === "fmcsa-company-census-zip-coverage-jsonl");
  if (!zipArtifact) throw new Error("FMCSA source release has no ZIP coverage artifact.");
  for (const artifact of [...recordArtifacts, zipArtifact]) {
    const filename = path.resolve(releaseDirectory, artifact.path);
    assertContained(releaseDirectory, filename, `FMCSA artifact ${artifact.path}`);
    const actual = await hashFile(filename);
    if (actual.bytes !== artifact.bytes || actual.sha256 !== artifact.sha256) throw new Error(`FMCSA artifact ${artifact.path} failed checksum validation.`);
  }
  const zipRows = (await readFile(path.join(releaseDirectory, zipArtifact.path), "utf8")).trim().split("\n").filter(Boolean).map(JSON.parse);
  if (zipRows.length !== zipArtifact.record_count) throw new Error("FMCSA ZIP coverage record count does not match its manifest.");
  return {
    manifest,
    manifestSha256: sha256Buffer(manifestBuffer),
    releaseDirectory,
    recordArtifacts,
    zipRows,
  };
}

async function loadIrsEoRelease(pointerPath) {
  const pointer = JSON.parse(await readFile(pointerPath, "utf8"));
  const pointerDirectory = path.dirname(pointerPath);
  const manifestPath = path.resolve(pointerDirectory, pointer.manifest ?? "");
  assertContained(pointerDirectory, manifestPath, "IRS EO BMF manifest path");
  const manifestBuffer = await readFile(manifestPath);
  const manifest = JSON.parse(manifestBuffer.toString("utf8"));
  if (manifest.dataset_id !== "irs-eo-bmf-organizations" || manifest.status !== "published" || !manifest.complete_current_eo_bmf_snapshot) {
    throw new Error("A complete published IRS EO BMF organization source release is required.");
  }
  const releaseDirectory = path.dirname(manifestPath);
  const organizationArtifacts = manifest.artifacts.filter((artifact) => artifact.artifact_type === "normalized-irs-eo-organization-jsonl-gzip").sort((a, b) => a.path.localeCompare(b.path));
  if (organizationArtifacts.length !== 10) throw new Error("IRS EO BMF source release has an incomplete normalized partition set.");
  const zipArtifact = manifest.artifacts.find((artifact) => artifact.artifact_type === "irs-eo-bmf-zip-coverage-jsonl");
  if (!zipArtifact) throw new Error("IRS EO BMF source release has no ZIP coverage artifact.");
  for (const artifact of [...organizationArtifacts, zipArtifact]) {
    const filename = path.resolve(releaseDirectory, artifact.path);
    assertContained(releaseDirectory, filename, `IRS EO BMF artifact ${artifact.path}`);
    const actual = await hashFile(filename);
    if (actual.bytes !== artifact.bytes || actual.sha256 !== artifact.sha256) throw new Error(`IRS EO BMF artifact ${artifact.path} failed checksum validation.`);
  }
  const zipRows = (await readFile(path.join(releaseDirectory, zipArtifact.path), "utf8")).trim().split("\n").filter(Boolean).map(JSON.parse);
  if (zipRows.length !== zipArtifact.record_count) throw new Error("IRS EO BMF ZIP coverage record count does not match its manifest.");
  return {
    manifest,
    manifestSha256: sha256Buffer(manifestBuffer),
    releaseDirectory,
    organizationArtifacts,
    zipRows,
  };
}

async function loadUspsOperationalZipRelease(pointerPath) {
  const pointer = JSON.parse(await readFile(pointerPath, "utf8"));
  const pointerDirectory = path.dirname(pointerPath);
  const manifestPath = path.resolve(pointerDirectory, pointer.manifest ?? "");
  assertContained(pointerDirectory, manifestPath, "USPS operational ZIP manifest path");
  const manifestBuffer = await readFile(manifestPath);
  const manifest = JSON.parse(manifestBuffer.toString("utf8"));
  if (manifest.dataset_id !== "usps-operational-zip-assignments" || manifest.status !== "published-local-restricted"
    || manifest.complete_source_release !== true || manifest.complete_current_area_district_assignment_file !== true
    || manifest.complete_current_delivery_zip_registry !== false) {
    throw new Error("A complete governed USPS Area/District ZIP assignment source release is required.");
  }
  const releaseDirectory = path.dirname(manifestPath);
  const zipArtifact = manifest.artifacts?.find((artifact) => artifact.artifact_type === "usps-operational-zip-assignment-jsonl");
  if (!zipArtifact) throw new Error("USPS operational ZIP release has no normalized assignment artifact.");
  const filename = path.resolve(releaseDirectory, zipArtifact.path);
  assertContained(releaseDirectory, filename, `USPS operational ZIP artifact ${zipArtifact.path}`);
  const actual = await hashFile(filename);
  if (actual.bytes !== zipArtifact.bytes || actual.sha256 !== zipArtifact.sha256) {
    throw new Error(`USPS operational ZIP artifact ${zipArtifact.path} failed checksum validation.`);
  }
  const zipRows = (await readFile(filename, "utf8")).trim().split("\n").filter(Boolean).map(JSON.parse);
  const expectedExportPolicy = manifest.use_authorization?.redistribution_authorized ? "permission-governed" : "local-restricted";
  if (zipRows.length !== zipArtifact.record_count
    || zipRows.length !== manifest.coverage?.current_area_district_zip_assignment_denominator
    || new Set(zipRows.map((row) => row.zip_code)).size !== zipRows.length
    || zipRows.some((row) => row.assignment_status !== "listed-in-current-usps-area-district-file"
      || row.deliverability_status !== "not-asserted" || row.zcta_status !== "not-asserted"
      || row.export_policy !== expectedExportPolicy)
    || !["personal-noncommercial-home-use", "usps-written-permission"].includes(manifest.use_authorization?.basis)
    || (manifest.use_authorization?.basis === "personal-noncommercial-home-use" && manifest.use_authorization?.redistribution_authorized !== false)
    || (manifest.use_authorization?.basis === "usps-written-permission" && manifest.use_authorization?.redistribution_authorized !== true)) {
    throw new Error("USPS operational ZIP normalized assignments failed structural validation.");
  }
  return {
    manifest,
    manifestSha256: sha256Buffer(manifestBuffer),
    zipRows,
  };
}

async function forEachGzipRecord(filePath, consumer) {
  const lines = createInterface({ input: createReadStream(filePath).pipe(createGunzip()), crlfDelay: Infinity });
  let count = 0;
  for await (const line of lines) {
    if (!line) continue;
    await consumer(JSON.parse(line));
    count += 1;
  }
  return count;
}

function releaseTimestamp(instant) {
  return instant.replaceAll(/[-:.]/g, "").replace("T", "-").replace("Z", "Z");
}

function json(value) {
  return `${JSON.stringify(value)}\n`;
}

function jsonLines(records) {
  return `${records.map((record) => JSON.stringify(record)).join("\n")}\n`;
}

function registryZipCoverage({ snap, nppes, fdic, ncua, fsis, echo, fmcsa, irsEo, uspsZips, snapCounts, nppesPrimaryCounts, nppesSecondaryCounts, fdicLocationCounts, ncuaLocationCounts, fsisEstablishmentCounts, echoFacilityCounts, fmcsaRecordCounts, irsEoOrganizationCounts }) {
  const snapRows = new Map(snap.zipRows.map((row) => [row.zip_code, row]));
  const nppesRows = new Map((nppes?.zipRows ?? []).map((row) => [row.zip_code, row]));
  const fdicRows = new Map((fdic?.zipRows ?? []).map((row) => [row.zip_code, row]));
  const ncuaRows = new Map((ncua?.zipRows ?? []).map((row) => [row.zip_code, row]));
  const fsisRows = new Map((fsis?.zipRows ?? []).map((row) => [row.zip_code, row]));
  const echoRows = new Map((echo?.zipRows ?? []).map((row) => [row.zip_code, row]));
  const fmcsaRows = new Map((fmcsa?.zipRows ?? []).map((row) => [row.zip_code, row]));
  const irsEoRows = new Map((irsEo?.zipRows ?? []).map((row) => [row.zip_code, row]));
  const uspsRows = new Map((uspsZips?.zipRows ?? []).map((row) => [row.zip_code, row]));
  const zipCodes = [...new Set([...snapRows.keys(), ...nppesRows.keys(), ...fdicRows.keys(), ...ncuaRows.keys(), ...fsisRows.keys(), ...echoRows.keys(), ...fmcsaRows.keys(), ...irsEoRows.keys(), ...uspsRows.keys(), ...snapCounts.keys(), ...nppesPrimaryCounts.keys(), ...nppesSecondaryCounts.keys(), ...fdicLocationCounts.keys(), ...ncuaLocationCounts.keys(), ...fsisEstablishmentCounts.keys(), ...echoFacilityCounts.keys(), ...fmcsaRecordCounts.keys(), ...irsEoOrganizationCounts.keys()])].sort();
  return zipCodes.map((zipCode) => {
    const snapRow = snapRows.get(zipCode);
    const nppesRow = nppesRows.get(zipCode);
    const fdicRow = fdicRows.get(zipCode);
    const ncuaRow = ncuaRows.get(zipCode);
    const fsisRow = fsisRows.get(zipCode);
    const echoRow = echoRows.get(zipCode);
    const fmcsaRow = fmcsaRows.get(zipCode);
    const irsEoRow = irsEoRows.get(zipCode);
    const uspsRow = uspsRows.get(zipCode);
    const foundation = nppesRow ?? snapRow ?? fdicRow ?? ncuaRow ?? fsisRow ?? echoRow ?? fmcsaRow ?? irsEoRow;
    if (!foundation && !uspsRow) throw new Error(`Registry ZIP ${zipCode} has no source coverage row.`);
    const snapCount = snapCounts.get(zipCode) ?? 0;
    const primary = nppesPrimaryCounts.get(zipCode) ?? 0;
    const secondary = nppesSecondaryCounts.get(zipCode) ?? 0;
    const fdicLocations = fdicLocationCounts.get(zipCode) ?? 0;
    const ncuaLocations = ncuaLocationCounts.get(zipCode) ?? 0;
    const fsisEstablishments = fsisEstablishmentCounts.get(zipCode) ?? 0;
    const echoFacilities = echoFacilityCounts.get(zipCode) ?? 0;
    const fmcsaRecords = fmcsaRecordCounts.get(zipCode) ?? 0;
    const irsEoOrganizations = irsEoOrganizationCounts.get(zipCode) ?? 0;
    if (snapCount !== (snapRow?.snap_retailer_snapshot?.retailer_count ?? 0)) throw new Error(`ZIP ${zipCode} USDA SNAP counts do not reconcile.`);
    if (nppes && (primary !== (nppesRow?.nppes_organization_provider_snapshot?.primary_practice_location_count ?? 0)
      || secondary !== (nppesRow?.nppes_organization_provider_snapshot?.non_primary_practice_location_count ?? 0))) {
      throw new Error(`ZIP ${zipCode} CMS NPPES counts do not reconcile.`);
    }
    if (fdic && fdicLocations !== (fdicRow?.fdic_current_location_snapshot?.location_count ?? 0)) throw new Error(`ZIP ${zipCode} FDIC location counts do not reconcile.`);
    if (ncua && ncuaLocations !== (ncuaRow?.ncua_quarterly_snapshot?.location_count ?? 0)) throw new Error(`ZIP ${zipCode} NCUA location counts do not reconcile.`);
    if (fsis && fsisEstablishments !== (fsisRow?.fsis_active_mpi_snapshot?.establishment_count ?? 0)) throw new Error(`ZIP ${zipCode} FSIS establishment counts do not reconcile.`);
    if (echo && echoFacilities !== (echoRow?.epa_echo_active_facility_snapshot?.facility_count ?? 0)) throw new Error(`ZIP ${zipCode} EPA ECHO facility counts do not reconcile.`);
    if (fmcsa && fmcsaRecords !== (fmcsaRow?.fmcsa_active_registration_principal_office_snapshot?.record_count ?? 0)) throw new Error(`ZIP ${zipCode} FMCSA principal-office counts do not reconcile.`);
    if (irsEo && irsEoOrganizations !== (irsEoRow?.irs_eo_bmf_current_snapshot?.organization_filing_address_count ?? 0)) throw new Error(`ZIP ${zipCode} IRS EO organization filing-address counts do not reconcile.`);
    const locationCount = snapCount + primary + secondary + fdicLocations + ncuaLocations + fsisEstablishments + echoFacilities + fmcsaRecords;
    const recordContributionCount = locationCount + irsEoOrganizations;
    return {
      schema_version: REGISTRY_SCHEMA_VERSION,
      zip_code: zipCode,
      registry_coverage: {
        status: recordContributionCount > 0 ? "record-level-source-contribution" : "denominator-only-no-record-level-contribution",
        complete_all_businesses: false,
        physical_site_count: locationCount,
        establishment_count: locationCount,
        organization_primary_location_count: primary,
        snap_authorization_evidence_count: snapCount,
        nppes_primary_practice_location_count: primary,
        nppes_non_primary_practice_location_count: secondary,
        fdic_current_location_count: fdicLocations,
        ncua_reported_us_location_count: ncuaLocations,
        fsis_active_establishment_count: fsisEstablishments,
        epa_echo_active_facility_count: echoFacilities,
        fmcsa_active_registration_principal_office_count: fmcsaRecords,
        irs_eo_organization_filing_address_count: irsEoOrganizations,
      },
      source_contributions: {
        usda_snap_retailers: {
          record_count: snapCount,
          source_release_id: snap.manifest.source_release_id,
          source_updated_at: snap.manifest.source_updated_at,
        },
        ...(nppes ? {
          cms_nppes_organizations: {
            primary_practice_location_count: primary,
            non_primary_practice_location_count: secondary,
            source_release_id: nppes.manifest.source_release_id,
            source_through_date: nppes.manifest.source_through_date,
          },
        } : {}),
        ...(fdic ? {
          fdic_bankfind: {
            current_location_count: fdicLocations,
            source_release_id: fdic.manifest.source_release_id,
            source_updated_at: fdic.manifest.source_updated_at,
          },
        } : {}),
        ...(ncua ? {
          ncua_quarterly_credit_unions: {
            reported_us_location_count: ncuaLocations,
            source_release_id: ncua.manifest.source_release_id,
            cycle_date: ncua.manifest.cycle_date,
          },
        } : {}),
        ...(fsis ? {
          fsis_active_mpi_establishments: {
            active_establishment_count: fsisEstablishments,
            source_release_id: fsis.manifest.source_release_id,
            source_date: fsis.manifest.source_date,
          },
        } : {}),
        ...(echo ? {
          epa_echo_active_facilities: {
            active_facility_count: echoFacilities,
            source_release_id: echo.manifest.source_release_id,
            source_updated_at: echo.manifest.source_updated_at,
          },
        } : {}),
        ...(fmcsa ? {
          fmcsa_active_us_company_census: {
            active_registration_principal_office_count: fmcsaRecords,
            source_release_id: fmcsa.manifest.source_release_id,
            source_updated_at: fmcsa.manifest.source_updated_at,
          },
        } : {}),
        ...(irsEo ? {
          irs_eo_bmf_organizations: {
            organization_filing_address_count: irsEoOrganizations,
            source_release_id: irsEo.manifest.source_release_id,
            source_posting_date: irsEo.manifest.source_posting_date,
          },
        } : {}),
      },
      current_usps_validity: uspsZips ? (uspsRow ? {
        status: uspsRow.assignment_status,
        evidence_scope: uspsRow.evidence_scope,
        deliverability_status: "not-asserted",
        source_month: uspsRow.source_month,
        source_release_id: uspsRow.provenance?.source_release_id ?? null,
        export_policy: uspsRow.export_policy,
      } : {
        status: "not-listed-in-current-usps-area-district-file",
        evidence_scope: "operational-area-district-5-digit-zip-assignment",
        deliverability_status: "not-asserted",
        source_month: uspsZips.manifest.source_month,
        source_release_id: `usps-postalpro-area-district-zip5-${uspsZips.manifest.source_month}`,
        export_policy: uspsZips.manifest.use_authorization?.redistribution_authorized ? "permission-governed" : "local-restricted",
      }) : foundation?.current_usps_validity ?? { status: "unverified" },
      geography: foundation?.geography ?? { status: "not-observed-in-integrated-census-coverage-union" },
      employer_baseline: foundation?.employer_baseline ?? null,
      baseline_coverage_status: foundation?.baseline_coverage_status ?? "not-observed-in-integrated-census-coverage-union",
    };
  });
}

export async function buildNationalBusinessRegistry({
  outputRoot,
  snapPointer,
  nppesPointer = null,
  fdicPointer = null,
  ncuaPointer = null,
  fsisPointer = null,
  echoPointer = null,
  fmcsaPointer = null,
  irsEoPointer = null,
  uspsZipsPointer = null,
  logger = console.log,
  now = () => new Date(),
} = {}) {
  if (!outputRoot) throw new Error("outputRoot is required.");
  if (!snapPointer) throw new Error("snapPointer is required.");
  const snap = await loadSnapRelease(snapPointer);
  const nppes = nppesPointer ? await loadNppesRelease(nppesPointer) : null;
  const fdic = fdicPointer ? await loadFdicRelease(fdicPointer) : null;
  const ncua = ncuaPointer ? await loadNcuaRelease(ncuaPointer) : null;
  const fsis = fsisPointer ? await loadFsisRelease(fsisPointer) : null;
  const echo = echoPointer ? await loadEpaEchoRelease(echoPointer) : null;
  const fmcsa = fmcsaPointer ? await loadFmcsaRelease(fmcsaPointer) : null;
  const irsEo = irsEoPointer ? await loadIrsEoRelease(irsEoPointer) : null;
  const uspsZips = uspsZipsPointer ? await loadUspsOperationalZipRelease(uspsZipsPointer) : null;
  const createdAt = now().toISOString();
  const runId = randomUUID();
  const releaseId = `national-business-registry-${releaseTimestamp(createdAt)}-${runId.slice(0, 8)}`;
  const stagingDirectory = path.join(outputRoot, ".staging", runId);
  await mkdir(stagingDirectory, { recursive: true });

  const siteWriters = new Map();
  const establishmentWriters = new Map();
  const assertionWriters = new Map();
  const relationshipWriters = new Map();
  const organizationWriters = new Map();
  const organizationAssertionWriters = new Map();
  const fdicOrganizationWriters = new Map();
  const fdicOrganizationAssertionWriters = new Map();
  const ncuaOrganizationWriters = new Map();
  const ncuaOrganizationAssertionWriters = new Map();
  const irsEoOrganizationWriters = new Map();
  const irsEoOrganizationAssertionWriters = new Map();
  const resolutionProfileWriters = new Map();
  for (const prefix of "0123456789") {
    siteWriters.set(prefix, await openGzipWriter(stagingDirectory, `entities/physical-sites/prefix=${prefix}.jsonl.gz`));
    establishmentWriters.set(prefix, await openGzipWriter(stagingDirectory, `entities/establishments/prefix=${prefix}.jsonl.gz`));
    assertionWriters.set(prefix, await openGzipWriter(stagingDirectory, `assertions/prefix=${prefix}.jsonl.gz`));
    relationshipWriters.set(prefix, await openGzipWriter(stagingDirectory, `relationships/prefix=${prefix}.jsonl.gz`));
    if (nppes) {
      organizationWriters.set(prefix, await openGzipWriter(stagingDirectory, `entities/organizations/npi-prefix=${prefix}.jsonl.gz`));
      organizationAssertionWriters.set(prefix, await openGzipWriter(stagingDirectory, `assertions/organizations/npi-prefix=${prefix}.jsonl.gz`));
    }
    if (fdic) {
      fdicOrganizationWriters.set(prefix, await openGzipWriter(stagingDirectory, `entities/organizations/fdic-cert-prefix=${prefix}.jsonl.gz`));
      fdicOrganizationAssertionWriters.set(prefix, await openGzipWriter(stagingDirectory, `assertions/organizations/fdic-cert-prefix=${prefix}.jsonl.gz`));
    }
    if (ncua) {
      ncuaOrganizationWriters.set(prefix, await openGzipWriter(stagingDirectory, `entities/organizations/ncua-charter-prefix=${prefix}.jsonl.gz`));
      ncuaOrganizationAssertionWriters.set(prefix, await openGzipWriter(stagingDirectory, `assertions/organizations/ncua-charter-prefix=${prefix}.jsonl.gz`));
    }
    if (irsEo) {
      irsEoOrganizationWriters.set(prefix, await openGzipWriter(stagingDirectory, `entities/organizations/irs-ein-prefix=${prefix}.jsonl.gz`));
      irsEoOrganizationAssertionWriters.set(prefix, await openGzipWriter(stagingDirectory, `assertions/organizations/irs-ein-prefix=${prefix}.jsonl.gz`));
    }
  }
  for (let prefix = 0; prefix < 100; prefix += 1) {
    const zip2 = String(prefix).padStart(2, "0");
    resolutionProfileWriters.set(zip2, await openGzipWriter(stagingDirectory, `resolution/location-profiles/zip2=${zip2}.jsonl.gz`));
  }

  const snapCountsByZip = new Map();
  const nppesPrimaryCountsByZip = new Map();
  const nppesSecondaryCountsByZip = new Map();
  const fdicLocationCountsByZip = new Map();
  const ncuaLocationCountsByZip = new Map();
  const fsisEstablishmentCountsByZip = new Map();
  const echoFacilityCountsByZip = new Map();
  const fmcsaRecordCountsByZip = new Map();
  const irsEoOrganizationCountsByZip = new Map();
  const normalizedIds = new Set();
  const nppesNpis = new Set();
  const fdicCertificates = new Set();
  const fdicLocationIds = new Set();
  const ncuaCharters = new Set();
  const ncuaLocationIds = new Set();
  const fsisEstablishmentIds = new Set();
  const echoFacilityIds = new Set();
  const fmcsaDotNumbers = new Set();
  const irsEoEins = new Set();
  let snapRecords = 0;
  let nppesOrganizations = 0;
  let nppesPrimaryLocations = 0;
  let nppesSecondaryLocations = 0;
  let nppesOtherNames = 0;
  let fdicInstitutions = 0;
  let fdicLocations = 0;
  let ncuaInstitutions = 0;
  let ncuaLocations = 0;
  let ncuaTradeNames = 0;
  let fsisEstablishments = 0;
  let echoFacilities = 0;
  let fmcsaRecords = 0;
  let irsEoOrganizations = 0;
  let assertions = 0;
  let relationships = 0;
  let resolutionLocationProfiles = 0;
  for (const artifact of snap.retailerArtifacts) {
    const partition = artifact.path.match(/prefix=(\d)/)?.[1];
    if (!partition) throw new Error(`Cannot determine ZIP prefix for ${artifact.path}.`);
    const count = await forEachGzipRecord(path.join(snap.releaseDirectory, artifact.path), async (record) => {
      if (normalizedIds.has(record.normalized_record_id)) throw new Error(`Duplicate normalized SNAP record ${record.normalized_record_id}.`);
      normalizedIds.add(record.normalized_record_id);
      const reconciled = reconcileSnapRecord(record);
      if (reconciled.zipCode[0] !== partition) throw new Error(`SNAP record ${record.normalized_record_id} is in the wrong ZIP partition.`);
      await writeGzipRecord(siteWriters.get(partition), reconciled.entities[0]);
      await writeGzipRecord(establishmentWriters.get(partition), reconciled.entities[1]);
      for (const item of reconciled.assertions) await writeGzipRecord(assertionWriters.get(partition), item);
      for (const item of reconciled.relationships) await writeGzipRecord(relationshipWriters.get(partition), item);
      await writeLocationResolutionProfile(resolutionProfileWriters, record, reconciled);
      resolutionLocationProfiles += 1;
      snapCountsByZip.set(reconciled.zipCode, (snapCountsByZip.get(reconciled.zipCode) ?? 0) + 1);
      assertions += reconciled.assertions.length;
      relationships += reconciled.relationships.length;
    });
    if (count !== artifact.record_count) throw new Error(`SNAP artifact ${artifact.path} has ${count} records; expected ${artifact.record_count}.`);
    snapRecords += count;
    logger(`Reconciled ${snapRecords.toLocaleString("en-US")} USDA SNAP records.`);
  }
  if (snapRecords !== snap.manifest.coverage.accepted_records) throw new Error("Registry input count does not match the USDA SNAP accepted-record count.");

  if (nppes) {
    for (const artifact of nppes.organizationArtifacts) {
      const count = await forEachGzipRecord(path.join(nppes.releaseDirectory, artifact.path), async (record) => {
        const reconciled = reconcileNppesOrganization(record);
        if (nppesNpis.has(reconciled.npi)) throw new Error(`Duplicate CMS NPPES organization ${reconciled.npi}.`);
        nppesNpis.add(reconciled.npi);
        await writeGzipRecord(organizationWriters.get(reconciled.npiPrefix), reconciled.entities[0]);
        for (const item of reconciled.organizationAssertions) await writeGzipRecord(organizationAssertionWriters.get(reconciled.npiPrefix), item);
        assertions += reconciled.organizationAssertions.length;
        if (reconciled.zipCode) {
          const prefix = reconciled.zipCode[0];
          await writeGzipRecord(siteWriters.get(prefix), reconciled.entities[1]);
          await writeGzipRecord(establishmentWriters.get(prefix), reconciled.entities[2]);
          for (const item of reconciled.locationAssertions) await writeGzipRecord(assertionWriters.get(prefix), item);
          for (const item of reconciled.relationships) await writeGzipRecord(relationshipWriters.get(prefix), item);
          await writeLocationResolutionProfile(resolutionProfileWriters, record, reconciled);
          resolutionLocationProfiles += 1;
          nppesPrimaryCountsByZip.set(reconciled.zipCode, (nppesPrimaryCountsByZip.get(reconciled.zipCode) ?? 0) + 1);
          nppesPrimaryLocations += 1;
          assertions += reconciled.locationAssertions.length;
          relationships += reconciled.relationships.length;
        }
      });
      if (count !== artifact.record_count) throw new Error(`CMS NPPES organization artifact ${artifact.path} record count mismatch.`);
      nppesOrganizations += count;
      logger(`Reconciled ${nppesOrganizations.toLocaleString("en-US")} CMS NPPES organizations.`);
    }
    if (nppesOrganizations !== nppes.manifest.coverage.active_organization_npis || nppesPrimaryLocations !== nppes.manifest.coverage.organization_primary_locations_with_us_zip) {
      throw new Error("Registry CMS NPPES organization counts do not match the source release.");
    }

    for (const artifact of nppes.practiceArtifacts) {
      const count = await forEachGzipRecord(path.join(nppes.releaseDirectory, artifact.path), async (record) => {
        if (!nppesNpis.has(record.npi)) throw new Error(`CMS NPPES practice location has no organization ${record.npi}.`);
        const reconciled = reconcileNppesPracticeLocation(record);
        const prefix = reconciled.zipCode[0];
        await writeGzipRecord(siteWriters.get(prefix), reconciled.entities[0]);
        await writeGzipRecord(establishmentWriters.get(prefix), reconciled.entities[1]);
        for (const item of reconciled.assertions) await writeGzipRecord(assertionWriters.get(prefix), item);
        for (const item of reconciled.relationships) await writeGzipRecord(relationshipWriters.get(prefix), item);
        await writeLocationResolutionProfile(resolutionProfileWriters, record, reconciled);
        resolutionLocationProfiles += 1;
        nppesSecondaryCountsByZip.set(reconciled.zipCode, (nppesSecondaryCountsByZip.get(reconciled.zipCode) ?? 0) + 1);
        nppesSecondaryLocations += 1;
        assertions += reconciled.assertions.length;
        relationships += reconciled.relationships.length;
      });
      if (count !== artifact.record_count) throw new Error(`CMS NPPES practice-location artifact ${artifact.path} record count mismatch.`);
      logger(`Reconciled ${nppesSecondaryLocations.toLocaleString("en-US")} CMS NPPES non-primary practice locations.`);
    }
    if (nppesSecondaryLocations !== nppes.manifest.coverage.accepted_non_primary_practice_locations) throw new Error("Registry CMS NPPES practice-location count does not match the source release.");

    for (const artifact of nppes.nameArtifacts) {
      const count = await forEachGzipRecord(path.join(nppes.releaseDirectory, artifact.path), async (record) => {
        if (!nppesNpis.has(record.npi)) throw new Error(`CMS NPPES other name has no organization ${record.npi}.`);
        await writeGzipRecord(organizationAssertionWriters.get(record.npi[0]), reconcileNppesOtherName(record));
        nppesOtherNames += 1;
        assertions += 1;
      });
      if (count !== artifact.record_count) throw new Error(`CMS NPPES other-name artifact ${artifact.path} record count mismatch.`);
      logger(`Reconciled ${nppesOtherNames.toLocaleString("en-US")} CMS NPPES organization other names.`);
    }
    if (nppesOtherNames !== nppes.manifest.coverage.accepted_other_names) throw new Error("Registry CMS NPPES other-name count does not match the source release.");
  }

  if (fdic) {
    for (const artifact of fdic.institutionArtifacts) {
      const partition = artifact.path.match(/cert-prefix=(\d)/)?.[1];
      if (!partition) throw new Error(`Cannot determine FDIC certificate prefix for ${artifact.path}.`);
      const count = await forEachGzipRecord(path.join(fdic.releaseDirectory, artifact.path), async (record) => {
        const reconciled = reconcileFdicInstitution(record);
        if (reconciled.certificatePrefix !== partition) throw new Error(`FDIC institution ${reconciled.certificate} is in the wrong certificate partition.`);
        if (fdicCertificates.has(reconciled.certificate)) throw new Error(`Duplicate FDIC institution certificate ${reconciled.certificate}.`);
        fdicCertificates.add(reconciled.certificate);
        await writeGzipRecord(fdicOrganizationWriters.get(partition), reconciled.entity);
        for (const item of reconciled.assertions) await writeGzipRecord(fdicOrganizationAssertionWriters.get(partition), item);
        assertions += reconciled.assertions.length;
      });
      if (count !== artifact.record_count) throw new Error(`FDIC institution artifact ${artifact.path} record count mismatch.`);
      fdicInstitutions += count;
      logger(`Reconciled ${fdicInstitutions.toLocaleString("en-US")} FDIC institutions.`);
    }
    if (fdicInstitutions !== fdic.manifest.coverage.accepted_active_institutions) throw new Error("Registry FDIC institution count does not match the source release.");

    for (const artifact of fdic.locationArtifacts) {
      const partition = artifact.path.match(/zip-prefix=(\d)/)?.[1];
      if (!partition) throw new Error(`Cannot determine FDIC ZIP prefix for ${artifact.path}.`);
      const count = await forEachGzipRecord(path.join(fdic.releaseDirectory, artifact.path), async (record) => {
        const reconciled = reconcileFdicLocation(record);
        if (reconciled.zipCode[0] !== partition) throw new Error(`FDIC location ${record.normalized_record_id} is in the wrong ZIP partition.`);
        if (!fdicCertificates.has(reconciled.certificate)) throw new Error(`FDIC location has no active institution certificate ${reconciled.certificate}.`);
        if (fdicLocationIds.has(record.normalized_record_id)) throw new Error(`Duplicate FDIC location ${record.normalized_record_id}.`);
        fdicLocationIds.add(record.normalized_record_id);
        await writeGzipRecord(siteWriters.get(partition), reconciled.entities[0]);
        await writeGzipRecord(establishmentWriters.get(partition), reconciled.entities[1]);
        for (const item of reconciled.assertions) await writeGzipRecord(assertionWriters.get(partition), item);
        for (const item of reconciled.relationships) await writeGzipRecord(relationshipWriters.get(partition), item);
        await writeLocationResolutionProfile(resolutionProfileWriters, record, reconciled);
        resolutionLocationProfiles += 1;
        fdicLocationCountsByZip.set(reconciled.zipCode, (fdicLocationCountsByZip.get(reconciled.zipCode) ?? 0) + 1);
        assertions += reconciled.assertions.length;
        relationships += reconciled.relationships.length;
      });
      if (count !== artifact.record_count) throw new Error(`FDIC location artifact ${artifact.path} record count mismatch.`);
      fdicLocations += count;
      logger(`Reconciled ${fdicLocations.toLocaleString("en-US")} FDIC locations.`);
    }
    if (fdicLocations !== fdic.manifest.coverage.accepted_current_locations) throw new Error("Registry FDIC location count does not match the source release.");
  }

  if (ncua) {
    for (const artifact of ncua.institutionArtifacts) {
      const partition = artifact.path.match(/charter-prefix=(\d)/)?.[1];
      if (!partition) throw new Error(`Cannot determine NCUA charter prefix for ${artifact.path}.`);
      const count = await forEachGzipRecord(path.join(ncua.releaseDirectory, artifact.path), async (record) => {
        const reconciled = reconcileNcuaInstitution(record);
        if (reconciled.charterPrefix !== partition) throw new Error(`NCUA institution ${reconciled.charterNumber} is in the wrong charter partition.`);
        if (ncuaCharters.has(reconciled.charterNumber)) throw new Error(`Duplicate NCUA charter ${reconciled.charterNumber}.`);
        ncuaCharters.add(reconciled.charterNumber);
        await writeGzipRecord(ncuaOrganizationWriters.get(partition), reconciled.entity);
        for (const item of reconciled.assertions) await writeGzipRecord(ncuaOrganizationAssertionWriters.get(partition), item);
        assertions += reconciled.assertions.length;
      });
      if (count !== artifact.record_count) throw new Error(`NCUA institution artifact ${artifact.path} record count mismatch.`);
      ncuaInstitutions += count;
      logger(`Reconciled ${ncuaInstitutions.toLocaleString("en-US")} NCUA institutions.`);
    }
    if (ncuaInstitutions !== ncua.manifest.coverage.accepted_federally_insured_institutions) throw new Error("Registry NCUA institution count does not match the source release.");

    for (const artifact of ncua.locationArtifacts) {
      const partition = artifact.path.match(/zip-prefix=(\d)/)?.[1];
      if (!partition) throw new Error(`Cannot determine NCUA ZIP prefix for ${artifact.path}.`);
      const count = await forEachGzipRecord(path.join(ncua.releaseDirectory, artifact.path), async (record) => {
        const reconciled = reconcileNcuaLocation(record);
        if (reconciled.zipCode[0] !== partition) throw new Error(`NCUA location ${record.normalized_record_id} is in the wrong ZIP partition.`);
        if (!ncuaCharters.has(reconciled.charterNumber)) throw new Error(`NCUA location has no federally insured charter ${reconciled.charterNumber}.`);
        if (ncuaLocationIds.has(record.normalized_record_id)) throw new Error(`Duplicate NCUA location ${record.normalized_record_id}.`);
        ncuaLocationIds.add(record.normalized_record_id);
        await writeGzipRecord(siteWriters.get(partition), reconciled.entities[0]);
        await writeGzipRecord(establishmentWriters.get(partition), reconciled.entities[1]);
        for (const item of reconciled.assertions) await writeGzipRecord(assertionWriters.get(partition), item);
        for (const item of reconciled.relationships) await writeGzipRecord(relationshipWriters.get(partition), item);
        await writeLocationResolutionProfile(resolutionProfileWriters, record, reconciled);
        resolutionLocationProfiles += 1;
        ncuaLocationCountsByZip.set(reconciled.zipCode, (ncuaLocationCountsByZip.get(reconciled.zipCode) ?? 0) + 1);
        assertions += reconciled.assertions.length;
        relationships += reconciled.relationships.length;
      });
      if (count !== artifact.record_count) throw new Error(`NCUA location artifact ${artifact.path} record count mismatch.`);
      ncuaLocations += count;
      logger(`Reconciled ${ncuaLocations.toLocaleString("en-US")} NCUA U.S. locations.`);
    }
    if (ncuaLocations !== ncua.manifest.coverage.accepted_us_locations) throw new Error("Registry NCUA location count does not match the source release.");

    for (const artifact of ncua.nameArtifacts) {
      const count = await forEachGzipRecord(path.join(ncua.releaseDirectory, artifact.path), async (record) => {
        if (!ncuaCharters.has(record.charter_number)) throw new Error(`NCUA trade name has no federally insured charter ${record.charter_number}.`);
        await writeGzipRecord(ncuaOrganizationAssertionWriters.get(record.charter_number[0]), reconcileNcuaTradeName(record));
        ncuaTradeNames += 1;
        assertions += 1;
      });
      if (count !== artifact.record_count) throw new Error(`NCUA trade-name artifact ${artifact.path} record count mismatch.`);
      logger(`Reconciled ${ncuaTradeNames.toLocaleString("en-US")} NCUA trade names.`);
    }
    if (ncuaTradeNames !== ncua.manifest.coverage.accepted_trade_names) throw new Error("Registry NCUA trade-name count does not match the source release.");
  }

  if (fsis) {
    for (const artifact of fsis.establishmentArtifacts) {
      const partition = artifact.path.match(/zip-prefix=(\d)/)?.[1];
      if (!partition) throw new Error(`Cannot determine FSIS ZIP prefix for ${artifact.path}.`);
      const count = await forEachGzipRecord(path.join(fsis.releaseDirectory, artifact.path), async (record) => {
        const reconciled = reconcileFsisEstablishment(record);
        if (reconciled.zipCode[0] !== partition) throw new Error(`FSIS establishment ${record.normalized_record_id} is in the wrong ZIP partition.`);
        if (fsisEstablishmentIds.has(reconciled.fsisId)) throw new Error(`Duplicate FSIS establishment ${reconciled.fsisId}.`);
        fsisEstablishmentIds.add(reconciled.fsisId);
        await writeGzipRecord(siteWriters.get(partition), reconciled.entities[0]);
        await writeGzipRecord(establishmentWriters.get(partition), reconciled.entities[1]);
        for (const item of reconciled.assertions) await writeGzipRecord(assertionWriters.get(partition), item);
        for (const item of reconciled.relationships) await writeGzipRecord(relationshipWriters.get(partition), item);
        await writeLocationResolutionProfile(resolutionProfileWriters, record, reconciled);
        resolutionLocationProfiles += 1;
        fsisEstablishmentCountsByZip.set(reconciled.zipCode, (fsisEstablishmentCountsByZip.get(reconciled.zipCode) ?? 0) + 1);
        assertions += reconciled.assertions.length;
        relationships += reconciled.relationships.length;
      });
      if (count !== artifact.record_count) throw new Error(`FSIS establishment artifact ${artifact.path} record count mismatch.`);
      fsisEstablishments += count;
      logger(`Reconciled ${fsisEstablishments.toLocaleString("en-US")} FSIS active establishments.`);
    }
    if (fsisEstablishments !== fsis.manifest.coverage.accepted_active_establishments) throw new Error("Registry FSIS establishment count does not match the source release.");
  }

  if (echo) {
    for (const artifact of echo.facilityArtifacts) {
      const partition = artifact.path.match(/zip-prefix=(\d)/)?.[1];
      if (!partition) throw new Error(`Cannot determine EPA ECHO ZIP prefix for ${artifact.path}.`);
      const count = await forEachGzipRecord(path.join(echo.releaseDirectory, artifact.path), async (record) => {
        const reconciled = reconcileEpaEchoFacility(record);
        if (reconciled.zipCode[0] !== partition) throw new Error(`EPA ECHO facility ${record.normalized_record_id} is in the wrong ZIP partition.`);
        if (echoFacilityIds.has(reconciled.frsId)) throw new Error(`Duplicate EPA ECHO facility ${reconciled.frsId}.`);
        echoFacilityIds.add(reconciled.frsId);
        await writeGzipRecord(siteWriters.get(partition), reconciled.entities[0]);
        await writeGzipRecord(establishmentWriters.get(partition), reconciled.entities[1]);
        for (const item of reconciled.assertions) await writeGzipRecord(assertionWriters.get(partition), item);
        for (const item of reconciled.relationships) await writeGzipRecord(relationshipWriters.get(partition), item);
        await writeLocationResolutionProfile(resolutionProfileWriters, record, reconciled);
        resolutionLocationProfiles += 1;
        echoFacilityCountsByZip.set(reconciled.zipCode, (echoFacilityCountsByZip.get(reconciled.zipCode) ?? 0) + 1);
        assertions += reconciled.assertions.length;
        relationships += reconciled.relationships.length;
      });
      if (count !== artifact.record_count) throw new Error(`EPA ECHO facility artifact ${artifact.path} record count mismatch.`);
      echoFacilities += count;
      logger(`Reconciled ${echoFacilities.toLocaleString("en-US")} EPA ECHO active facilities.`);
    }
    if (echoFacilities !== echo.manifest.coverage.accepted_active_facilities) throw new Error("Registry EPA ECHO facility count does not match the source release.");
  }

  if (fmcsa) {
    for (const artifact of fmcsa.recordArtifacts) {
      const partition = artifact.path.match(/zip-prefix=(\d)/)?.[1];
      if (!partition) throw new Error(`Cannot determine FMCSA ZIP prefix for ${artifact.path}.`);
      const count = await forEachGzipRecord(path.join(fmcsa.releaseDirectory, artifact.path), async (record) => {
        const reconciled = reconcileFmcsaCompany(record);
        if (reconciled.zipCode[0] !== partition) throw new Error(`FMCSA record ${record.normalized_record_id} is in the wrong ZIP partition.`);
        if (fmcsaDotNumbers.has(reconciled.dotNumber)) throw new Error(`Duplicate FMCSA USDOT number ${reconciled.dotNumber}.`);
        fmcsaDotNumbers.add(reconciled.dotNumber);
        await writeGzipRecord(siteWriters.get(partition), reconciled.entities[0]);
        await writeGzipRecord(establishmentWriters.get(partition), reconciled.entities[1]);
        for (const item of reconciled.assertions) await writeGzipRecord(assertionWriters.get(partition), item);
        for (const item of reconciled.relationships) await writeGzipRecord(relationshipWriters.get(partition), item);
        await writeLocationResolutionProfile(resolutionProfileWriters, record, reconciled);
        resolutionLocationProfiles += 1;
        fmcsaRecordCountsByZip.set(reconciled.zipCode, (fmcsaRecordCountsByZip.get(reconciled.zipCode) ?? 0) + 1);
        assertions += reconciled.assertions.length;
        relationships += reconciled.relationships.length;
      });
      if (count !== artifact.record_count) throw new Error(`FMCSA record artifact ${artifact.path} record count mismatch.`);
      fmcsaRecords += count;
      logger(`Reconciled ${fmcsaRecords.toLocaleString("en-US")} FMCSA active principal-office records.`);
    }
    if (fmcsaRecords !== fmcsa.manifest.coverage.accepted_principal_office_records) throw new Error("Registry FMCSA record count does not match the source release.");
  }

  if (irsEo) {
    for (const artifact of irsEo.organizationArtifacts) {
      const partition = artifact.path.match(/ein-prefix=(\d)/)?.[1];
      if (!partition) throw new Error(`Cannot determine IRS EO EIN prefix for ${artifact.path}.`);
      const count = await forEachGzipRecord(path.join(irsEo.releaseDirectory, artifact.path), async (record) => {
        const reconciled = reconcileIrsEoOrganization(record);
        if (reconciled.einPrefix !== partition) throw new Error(`IRS EO organization ${reconciled.ein} is in the wrong EIN partition.`);
        if (irsEoEins.has(reconciled.ein)) throw new Error(`Duplicate IRS EO EIN ${reconciled.ein}.`);
        irsEoEins.add(reconciled.ein);
        await writeGzipRecord(irsEoOrganizationWriters.get(partition), reconciled.entity);
        for (const item of reconciled.assertions) await writeGzipRecord(irsEoOrganizationAssertionWriters.get(partition), item);
        irsEoOrganizationCountsByZip.set(reconciled.zipCode, (irsEoOrganizationCountsByZip.get(reconciled.zipCode) ?? 0) + 1);
        assertions += reconciled.assertions.length;
      });
      if (count !== artifact.record_count) throw new Error(`IRS EO organization artifact ${artifact.path} record count mismatch.`);
      irsEoOrganizations += count;
      logger(`Reconciled ${irsEoOrganizations.toLocaleString("en-US")} IRS EO organizations.`);
    }
    if (irsEoOrganizations !== irsEo.manifest.coverage.accepted_current_exempt_organizations) throw new Error("Registry IRS EO organization count does not match the source release.");
  }

  const physicalSiteCount = snapRecords + nppesPrimaryLocations + nppesSecondaryLocations + fdicLocations + ncuaLocations + fsisEstablishments + echoFacilities + fmcsaRecords;
  if (resolutionLocationProfiles !== physicalSiteCount) {
    throw new Error(`Entity-resolution profile count ${resolutionLocationProfiles} does not match physical-site count ${physicalSiteCount}.`);
  }

  const artifacts = [];
  artifacts.push(...await closeGzipWriters([...siteWriters.values()], "canonical-physical-site-jsonl-gzip"));
  artifacts.push(...await closeGzipWriters([...establishmentWriters.values()], "canonical-establishment-jsonl-gzip"));
  if (nppes) artifacts.push(...await closeGzipWriters([...organizationWriters.values()], "canonical-organization-jsonl-gzip"));
  if (fdic) artifacts.push(...await closeGzipWriters([...fdicOrganizationWriters.values()], "canonical-organization-jsonl-gzip"));
  if (ncua) artifacts.push(...await closeGzipWriters([...ncuaOrganizationWriters.values()], "canonical-organization-jsonl-gzip"));
  if (irsEo) artifacts.push(...await closeGzipWriters([...irsEoOrganizationWriters.values()], "canonical-organization-jsonl-gzip"));
  artifacts.push(...await closeGzipWriters([...assertionWriters.values()], "business-assertion-jsonl-gzip"));
  if (nppes) artifacts.push(...await closeGzipWriters([...organizationAssertionWriters.values()], "business-assertion-jsonl-gzip"));
  if (fdic) artifacts.push(...await closeGzipWriters([...fdicOrganizationAssertionWriters.values()], "business-assertion-jsonl-gzip"));
  if (ncua) artifacts.push(...await closeGzipWriters([...ncuaOrganizationAssertionWriters.values()], "business-assertion-jsonl-gzip"));
  if (irsEo) artifacts.push(...await closeGzipWriters([...irsEoOrganizationAssertionWriters.values()], "business-assertion-jsonl-gzip"));
  artifacts.push(...await closeGzipWriters([...relationshipWriters.values()], "business-relationship-jsonl-gzip"));
  artifacts.push(...await closeGzipWriters([...resolutionProfileWriters.values()], "entity-resolution-location-profile-jsonl-gzip"));

  const serviceEntity = {
    schema_version: REGISTRY_SCHEMA_VERSION,
    entity_id: SNAP_SERVICE_ENTITY_ID,
    entity_type: "service",
    identity_status: "resolved",
    created_at: createdAt,
    updated_at: createdAt,
    superseded_by: null,
  };
  artifacts.push(await writeArtifact(stagingDirectory, "entities/services.jsonl", json(serviceEntity), {
    record_count: 1,
    artifact_type: "canonical-service-jsonl",
  }));

  const zipCoverage = registryZipCoverage({ snap, nppes, fdic, ncua, fsis, echo, fmcsa, irsEo, uspsZips, snapCounts: snapCountsByZip, nppesPrimaryCounts: nppesPrimaryCountsByZip, nppesSecondaryCounts: nppesSecondaryCountsByZip, fdicLocationCounts: fdicLocationCountsByZip, ncuaLocationCounts: ncuaLocationCountsByZip, fsisEstablishmentCounts: fsisEstablishmentCountsByZip, echoFacilityCounts: echoFacilityCountsByZip, fmcsaRecordCounts: fmcsaRecordCountsByZip, irsEoOrganizationCounts: irsEoOrganizationCountsByZip });
  artifacts.push(await writeArtifact(stagingDirectory, "derived/zip-coverage.jsonl", jsonLines(zipCoverage), {
    record_count: zipCoverage.length,
    artifact_type: "registry-zip-coverage-jsonl",
    distribution_policy: uspsZips
      ? (uspsZips.manifest.use_authorization?.redistribution_authorized ? "permission-governed" : "local-restricted")
      : "public-source-layer",
  }));
  const sourceContribution = {
    usda_snap_retailers: {
      source_id: "usda-snap-current-retailers",
      dataset_id: "usda-snap-retailers",
      source_release_id: snap.manifest.source_release_id,
      dataset_release_id: snap.manifest.release_id,
      source_updated_at: snap.manifest.source_updated_at,
      accepted_source_records: snapRecords,
      physical_sites_published: snapRecords,
      establishments_published: snapRecords,
      service_relationships_published: snapRecords,
      identity_resolution: "one provisional site and establishment per source record; no cross-source merge",
      general_operating_status_inferred: false,
    },
    ...(nppes ? {
      cms_nppes_organizations: {
        source_id: "cms-nppes-monthly-v2",
        dataset_id: nppes.manifest.dataset_id,
        source_release_id: nppes.manifest.source_release_id,
        dataset_release_id: nppes.manifest.release_id,
        source_through_date: nppes.manifest.source_through_date,
        organizations_published: nppesOrganizations,
        primary_practice_locations_published: nppesPrimaryLocations,
        non_primary_practice_locations_published: nppesSecondaryLocations,
        other_name_assertions_published: nppesOtherNames,
        identity_resolution: "one provisional organization per active organization NPI and one provisional site/establishment per reported practice location; no cross-source merge",
        general_operating_status_inferred: false,
      },
    } : {}),
    ...(fdic ? {
      fdic_bankfind: {
        source_id: "fdic-bankfind-current-structure",
        dataset_id: fdic.manifest.dataset_id,
        source_release_id: fdic.manifest.source_release_id,
        dataset_release_id: fdic.manifest.release_id,
        source_updated_at: fdic.manifest.source_updated_at,
        active_institutions_published: fdicInstitutions,
        current_us_locations_published: fdicLocations,
        foreign_locations_excluded_by_source_layer: fdic.manifest.coverage.excluded_locations_outside_united_states,
        identity_resolution: "one provisional organization per FDIC certificate and one provisional site/establishment per U.S. location unique number; no cross-source merge",
        general_operating_status_inferred: false,
      },
    } : {}),
    ...(ncua ? {
      ncua_quarterly_credit_unions: {
        source_id: "ncua-final-quarterly-call-report",
        dataset_id: ncua.manifest.dataset_id,
        source_release_id: ncua.manifest.source_release_id,
        dataset_release_id: ncua.manifest.release_id,
        cycle_date: ncua.manifest.cycle_date,
        federally_insured_institutions_published: ncuaInstitutions,
        reported_us_locations_published: ncuaLocations,
        trade_name_assertions_published: ncuaTradeNames,
        non_insured_and_foreign_records_excluded_by_source_layer: ncua.manifest.coverage.excluded_non_federally_insured_institutions
          + ncua.manifest.coverage.excluded_non_federally_insured_locations
          + ncua.manifest.coverage.excluded_non_federally_insured_trade_names
          + ncua.manifest.coverage.excluded_locations_outside_united_states,
        identity_resolution: "one provisional organization per NCUA charter and one provisional site/establishment per composite charter plus SiteId; no cross-source merge",
        general_operating_status_inferred: false,
      },
    } : {}),
    ...(fsis ? {
      fsis_active_mpi_establishments: {
        source_id: "usda-fsis-active-mpi-directory",
        dataset_id: fsis.manifest.dataset_id,
        source_release_id: fsis.manifest.source_release_id,
        dataset_release_id: fsis.manifest.release_id,
        source_date: fsis.manifest.source_date,
        active_establishments_published: fsisEstablishments,
        identity_resolution: "one provisional physical site and establishment per FSIS establishment ID; no legal organization or cross-source merge inferred",
        general_operating_status_inferred: false,
      },
    } : {}),
    ...(echo ? {
      epa_echo_active_facilities: {
        source_id: "epa-echo-exporter-active-facility",
        dataset_id: echo.manifest.dataset_id,
        source_release_id: echo.manifest.source_release_id,
        dataset_release_id: echo.manifest.release_id,
        source_updated_at: echo.manifest.source_updated_at,
        active_facilities_published: echoFacilities,
        active_rows_quarantined_by_source_layer: echo.manifest.coverage.quarantined_active_or_unexpected_records,
        unknown_active_status_rows_excluded_by_source_layer: echo.manifest.coverage.source_unknown_blank_active_flag_records_excluded,
        identity_resolution: "one provisional physical site and establishment per FRS REGISTRY_ID; no legal organization or cross-source merge inferred",
        general_operating_status_inferred: false,
      },
    } : {}),
    ...(fmcsa ? {
      fmcsa_active_us_company_census: {
        source_id: "fmcsa-company-census-active-us-principal-office",
        dataset_id: fmcsa.manifest.dataset_id,
        source_release_id: fmcsa.manifest.source_release_id,
        dataset_release_id: fmcsa.manifest.release_id,
        source_updated_at: fmcsa.manifest.source_updated_at,
        active_principal_office_records_published: fmcsaRecords,
        selected_rows_quarantined_by_source_layer: fmcsa.manifest.coverage.quarantined_selected_records,
        source_columns_available: fmcsa.manifest.privacy.source_columns_available,
        source_columns_acquired: fmcsa.manifest.privacy.source_columns_acquired,
        identity_resolution: "one provisional physical site and establishment per accepted USDOT principal-office record; no legal organization, parent, or cross-source merge inferred",
        general_operating_status_inferred: false,
      },
    } : {}),
    ...(irsEo ? {
      irs_eo_bmf_organizations: {
        source_id: "irs-eo-business-master-file-current-extract",
        dataset_id: irsEo.manifest.dataset_id,
        source_release_id: irsEo.manifest.source_release_id,
        dataset_release_id: irsEo.manifest.release_id,
        source_posting_date: irsEo.manifest.source_posting_date,
        organizations_published: irsEoOrganizations,
        outside_supported_us_scope_excluded_by_source_layer: irsEo.manifest.coverage.excluded_outside_supported_us_scope,
        records_quarantined_by_source_layer: irsEo.manifest.coverage.quarantined_records,
        identity_resolution: "one provisional organization per EIN; filing addresses remain organization assertions and do not create physical sites or establishments; no cross-source merge",
        general_operating_status_inferred: false,
      },
    } : {}),
    ...(uspsZips ? {
      usps_operational_zip_assignments: {
        source_id: "usps-postalpro-area-district-zip5",
        dataset_id: uspsZips.manifest.dataset_id,
        dataset_release_id: uspsZips.manifest.release_id,
        source_month: uspsZips.manifest.source_month,
        operational_area_district_zip_assignments: uspsZips.zipRows.length,
        aisu_routing_rows: uspsZips.manifest.coverage.aisu_routing_rows,
        aisu_only_rows_excluded: uspsZips.manifest.coverage.routing_only_rows_excluded_from_denominator,
        address_deliverability_inferred: false,
        export_policy: uspsZips.manifest.export_policy,
      },
    } : {}),
  };
  artifacts.push(await writeArtifact(stagingDirectory, "derived/source-contributions.json", json(sourceContribution), {
    artifact_type: "registry-source-contribution-summary",
  }));

  const manifest = {
    schema_version: REGISTRY_SCHEMA_VERSION,
    dataset_id: "national-business-registry",
    publisher: { id: "national-business-registry", version: "1.2.0" },
    release_id: releaseId,
    run_id: runId,
    created_at: createdAt,
    status: "published-partial",
    complete_national_business_registry: false,
    publication_scope: `${[
      "USDA SNAP-authorized retailers",
      ...(nppes ? ["CMS NPPES organization providers and reported practice locations"] : []),
      ...(fdic ? ["FDIC active insured institutions and current indexed U.S. locations"] : []),
      ...(ncua ? ["NCUA federally insured credit unions and reported U.S. locations from the final quarterly release"] : []),
      ...(fsis ? ["USDA FSIS establishments in the current active MPI directory"] : []),
      ...(echo ? ["EPA ECHO facilities with FAC_ACTIVE_FLAG=Y and a valid reported U.S. physical address"] : []),
      ...(fmcsa ? ["FMCSA Company Census registrations with STATUS_CODE=A and an accepted reported U.S./territory principal-office address"] : []),
      ...(irsEo ? ["IRS organizations present in the current EO BMF extract with supported U.S. or territory filing addresses"] : []),
    ].join(", ")}, reconciled against the Census ZBP/ZCTA ZIP coverage union`,
    coverage: {
      source_records: snapRecords + nppesOrganizations + nppesSecondaryLocations + nppesOtherNames + fdicInstitutions + fdicLocations + ncuaInstitutions + ncuaLocations + ncuaTradeNames + fsisEstablishments + echoFacilities + fmcsaRecords + irsEoOrganizations,
      snap_source_records: snapRecords,
      nppes_organization_records: nppesOrganizations,
      nppes_non_primary_practice_location_records: nppesSecondaryLocations,
      nppes_other_name_records: nppesOtherNames,
      fdic_institution_records: fdicInstitutions,
      fdic_location_records: fdicLocations,
      ncua_institution_records: ncuaInstitutions,
      ncua_location_records: ncuaLocations,
      ncua_trade_name_records: ncuaTradeNames,
      fsis_establishment_records: fsisEstablishments,
      epa_echo_active_facility_records: echoFacilities,
      fmcsa_active_principal_office_records: fmcsaRecords,
      irs_eo_organization_records: irsEoOrganizations,
      organizations: nppesOrganizations + fdicInstitutions + ncuaInstitutions + irsEoOrganizations,
      physical_sites: physicalSiteCount,
      establishments: physicalSiteCount,
      services: 1,
      assertions,
      relationships,
      resolution_location_profiles: resolutionLocationProfiles,
      zip_union_records: zipCoverage.length,
      zips_with_record_level_contributions: new Set([...snapCountsByZip.keys(), ...nppesPrimaryCountsByZip.keys(), ...nppesSecondaryCountsByZip.keys(), ...fdicLocationCountsByZip.keys(), ...ncuaLocationCountsByZip.keys(), ...fsisEstablishmentCountsByZip.keys(), ...echoFacilityCountsByZip.keys(), ...fmcsaRecordCountsByZip.keys(), ...irsEoOrganizationCountsByZip.keys()]).size,
      authoritative_current_usps_zip_denominator: uspsZips ? {
        count: uspsZips.zipRows.length,
        evidence_scope: "current-usps-area-district-5-digit-zip-assignments",
        source_month: uspsZips.manifest.source_month,
        dataset_id: uspsZips.manifest.dataset_id,
        release_id: uspsZips.manifest.release_id,
        address_level_deliverability_asserted: false,
        distribution_policy: uspsZips.manifest.use_authorization?.redistribution_authorized ? "permission-governed" : "local-restricted",
      } : null,
    },
    dependencies: [
      {
        dataset_id: snap.manifest.dataset_id,
        release_id: snap.manifest.release_id,
        manifest_sha256: snap.manifestSha256,
      },
      ...(nppes ? [{
        dataset_id: nppes.manifest.dataset_id,
        release_id: nppes.manifest.release_id,
        manifest_sha256: nppes.manifestSha256,
      }] : []),
      ...(fdic ? [{
        dataset_id: fdic.manifest.dataset_id,
        release_id: fdic.manifest.release_id,
        manifest_sha256: fdic.manifestSha256,
      }] : []),
      ...(ncua ? [{
        dataset_id: ncua.manifest.dataset_id,
        release_id: ncua.manifest.release_id,
        manifest_sha256: ncua.manifestSha256,
      }] : []),
      ...(fsis ? [{
        dataset_id: fsis.manifest.dataset_id,
        release_id: fsis.manifest.release_id,
        manifest_sha256: fsis.manifestSha256,
      }] : []),
      ...(echo ? [{
        dataset_id: echo.manifest.dataset_id,
        release_id: echo.manifest.release_id,
        manifest_sha256: echo.manifestSha256,
      }] : []),
      ...(fmcsa ? [{
        dataset_id: fmcsa.manifest.dataset_id,
        release_id: fmcsa.manifest.release_id,
        manifest_sha256: fmcsa.manifestSha256,
      }] : []),
      ...(irsEo ? [{
        dataset_id: irsEo.manifest.dataset_id,
        release_id: irsEo.manifest.release_id,
        manifest_sha256: irsEo.manifestSha256,
      }] : []),
      ...(uspsZips ? [{
        dataset_id: uspsZips.manifest.dataset_id,
        release_id: uspsZips.manifest.release_id,
        manifest_sha256: uspsZips.manifestSha256,
      }] : []),
      ...(snap.manifest.dependencies ?? []),
      ...(nppes?.manifest.dependencies ?? []),
      ...(fdic?.manifest.dependencies ?? []),
      ...(ncua?.manifest.dependencies ?? []),
      ...(fsis?.manifest.dependencies ?? []),
      ...(echo?.manifest.dependencies ?? []),
      ...(fmcsa?.manifest.dependencies ?? []),
      ...(irsEo?.manifest.dependencies ?? []),
    ],
    contracts: {
      entity: "config/schemas/business-entity.schema.json",
      assertion: "config/schemas/business-assertion.schema.json",
      relationship: "config/schemas/business-relationship.schema.json",
    },
    export_policy: uspsZips
      ? "Business entity/assertion/relationship artifacts retain their source policies; ZIP coverage derived from USPS assignments inherits the USPS release export policy."
      : "public source layer only; restricted and licensed fields are not present",
    limitations: [
      "This is a partial registry release and must not be represented as all U.S. businesses.",
      "The source covers SNAP-authorized retailers, not all grocery stores, retailers, employers, or establishments.",
      ...(nppes ? [
        "CMS NPPES covers health care providers and suppliers, not all U.S. businesses.",
        "Active NPI enumeration does not validate licensure or credentials and does not prove that a reported practice location is currently open.",
        "Active individual NPI records and authorized-official personal fields are excluded from this registry release.",
      ] : []),
      ...(fdic ? [
        "FDIC BankFind covers FDIC-insured institutions and current indexed locations, not all banks, credit unions, financial businesses, or all U.S. businesses.",
        "An FDIC current-location record does not independently prove public access, current hours, or every service offered.",
        "Foreign FDIC offices are excluded from the normalized U.S. location layer by the source connector.",
      ] : []),
      ...(ncua ? [
        "NCUA quarterly data covers federally insured credit unions and reported locations, not all credit unions, financial businesses, or all U.S. businesses.",
        "An NCUA quarterly branch row does not independently prove current public access, membership eligibility, current hours, or service availability.",
        "Non-federally-insured and foreign NCUA records are excluded by the governed source connector.",
        "NCUA SiteId is scoped by credit-union charter because the source reuses site IDs across institutions.",
      ] : []),
      ...(fsis ? [
        "USDA FSIS MPI data covers regulated meat, poultry, and egg-product establishments, not all food businesses or all U.S. businesses.",
        "FSIS active-directory membership does not independently prove general business operating status, public access, current hours, ownership, or every product made.",
        "No legal organization or parent company is inferred from FSIS establishment names or DBAs, and the source DUNS field is excluded from the public registry.",
      ] : []),
      ...(echo ? [
        "EPA ECHO covers environmentally regulated facilities and program records, not every U.S. business; included facilities can be businesses, public agencies, utilities, institutions, or other regulated sites.",
        "ECHO FAC_ACTIVE_FLAG=Y means at least one associated ICIS-Air, ICIS-NPDES, RCRAInfo, or SDWIS permit/facility is active; it does not independently prove general business operation, public access, ownership, or active status in every associated program.",
        "EPA ECHO program flags and identifiers are associations, and source coordinates can be ZIP or county centroids rather than premise-level geocodes.",
        "No legal organization, owner, or parent company is inferred from EPA ECHO facility names.",
      ] : []),
      ...(fmcsa ? [
        "FMCSA Company Census covers regulated registrants, not every U.S. business, and the public file excludes shipper-only business types and entities with an active Hazardous Materials Safety Permit.",
        "FMCSA active registration is retained as source-specific regulatory evidence and is not generalized into proof of public access, customer-facing operations, or status outside FMCSA scope.",
        "The reported physical address is the principal office, can be home-based, and is not independently proven to be a storefront, vehicle base, or currently deliverable location.",
        "No legal organization, proprietor entity, parent, or ownership relationship is inferred because the source can describe individuals and its business-organization type is review-only and incomplete.",
        "Officer, phone, cell, fax, email, D&B, mailing-address, crash, review, inspection, safety-rating, and unnecessary operational fields were excluded before source acquisition.",
      ] : []),
      ...(irsEo ? [
        "IRS EO BMF covers organizations in the current cumulative exempt-organization extract, not every nonprofit, exempt organization, employer, physical establishment, or U.S. business.",
        "IRS filing addresses can be mailing addresses or P.O. boxes and may not represent an operating location; the registry creates no physical site or establishment from them.",
        "Current EO BMF membership and source status codes are federal tax-status evidence, not independent proof of current operations, public access, or a current physical location.",
        "The IRS ICO in-care-of personal-contact field and source financial amounts are excluded from normalized and registry records, and group or affiliation codes do not create parent or ownership relationships.",
      ] : []),
      "SNAP authorization is source-specific evidence and does not independently prove that a business is open at retrieval time.",
      "Each source record creates provisional site and establishment identities; cross-record and cross-source entity resolution has not yet been applied.",
      "No brand, legal organization, parent company, ownership, or general operating-status claim is inferred from the source name.",
      ...(uspsZips ? [
        "USPS evidence establishes membership in the current Area/District 5-digit ZIP assignment file, not address-level deliverability, delivery type, preferred city/state, ZIP+4 ranges, or ZCTA geography.",
        "ZIP coverage derived from USPS rows must not be exported beyond the recorded USPS use authorization and reviewed permission.",
      ] : ["Current USPS ZIP validity remains unverified until an authoritative current ZIP denominator is integrated."]),
    ],
    artifacts: artifacts.sort((a, b) => a.path.localeCompare(b.path)),
  };
  await writeArtifact(stagingDirectory, "manifest.json", json(manifest));
  const releaseDirectory = path.join(outputRoot, "releases", releaseId);
  await mkdir(path.dirname(releaseDirectory), { recursive: true });
  await rename(stagingDirectory, releaseDirectory);
  const pointer = {
    dataset_id: manifest.dataset_id,
    release_id: releaseId,
    manifest: `releases/${releaseId}/manifest.json`,
    updated_at: createdAt,
    status: manifest.status,
  };
  const pointerPath = path.join(outputRoot, "current.json");
  const temporaryPointer = `${pointerPath}.tmp-${runId}`;
  await mkdir(outputRoot, { recursive: true });
  await writeFile(temporaryPointer, json(pointer), "utf8");
  await rename(temporaryPointer, pointerPath);
  if (!(await stat(releaseDirectory)).isDirectory()) throw new Error("Published national business registry release is not a directory.");
  return { manifest, releaseDirectory, pointerPath };
}

function validateProvenance(source) {
  return Boolean(source?.source_id && source.source_release_id && source.source_record_id && source.ingest_run_id && source.transformation_version && source.policy_id);
}

export async function verifyNationalBusinessRegistry(manifestPath) {
  const absoluteManifestPath = path.resolve(manifestPath);
  const releaseDirectory = path.dirname(absoluteManifestPath);
  const manifest = JSON.parse(await readFile(absoluteManifestPath, "utf8"));
  const failures = [];
  if (manifest.dataset_id !== "national-business-registry") failures.push({ path: "manifest.json", reason: "unexpected dataset ID" });
  if (manifest.complete_national_business_registry !== false || manifest.status !== "published-partial") {
    failures.push({ path: "manifest.json", reason: "release is not explicitly marked partial" });
  }
  const uspsDependency = manifest.dependencies?.find((dependency) => dependency.dataset_id === "usps-operational-zip-assignments");
  const uspsDenominator = manifest.coverage?.authoritative_current_usps_zip_denominator;
  if (uspsDependency) {
    if (!uspsDenominator || uspsDenominator.dataset_id !== uspsDependency.dataset_id
      || uspsDenominator.release_id !== uspsDependency.release_id || !Number.isInteger(uspsDenominator.count)
      || uspsDenominator.count < 1 || uspsDenominator.evidence_scope !== "current-usps-area-district-5-digit-zip-assignments"
      || uspsDenominator.address_level_deliverability_asserted !== false
      || !["local-restricted", "permission-governed"].includes(uspsDenominator.distribution_policy)) {
      failures.push({ path: "manifest.json", reason: "invalid governed USPS Area/District ZIP denominator claim" });
    }
  } else if (uspsDenominator !== null) {
    failures.push({ path: "manifest.json", reason: "USPS ZIP denominator has no governed source dependency" });
  }
  for (const artifact of manifest.artifacts ?? []) {
    const artifactPath = path.resolve(releaseDirectory, artifact.path);
    try {
      assertContained(releaseDirectory, artifactPath, `Artifact ${artifact.path}`);
      const actual = await hashFile(artifactPath);
      if (actual.bytes !== artifact.bytes || actual.sha256 !== artifact.sha256) failures.push({ path: artifact.path, reason: "size or SHA-256 mismatch" });
    } catch (error) {
      failures.push({ path: artifact.path, reason: error.code === "ENOENT" ? "missing" : error.message });
    }
  }

  const entityArtifacts = (manifest.artifacts ?? []).filter((artifact) => artifact.artifact_type?.startsWith("canonical-"));
  const resolutionProfileArtifacts = (manifest.artifacts ?? []).filter((artifact) => artifact.artifact_type === "entity-resolution-location-profile-jsonl-gzip");
  const assertionArtifacts = (manifest.artifacts ?? []).filter((artifact) => artifact.artifact_type === "business-assertion-jsonl-gzip");
  const relationshipArtifacts = (manifest.artifacts ?? []).filter((artifact) => artifact.artifact_type === "business-relationship-jsonl-gzip");
  const entityIds = new Set();
  const entityCounts = { organization: 0, physical_site: 0, establishment: 0, service: 0 };
  for (const artifact of entityArtifacts) {
    try {
      const consume = (record) => {
        if (entityIds.has(record.entity_id)) throw new Error(`duplicate entity ${record.entity_id}`);
        if (!Object.hasOwn(entityCounts, record.entity_type)) throw new Error(`unsupported entity type ${record.entity_type}`);
        if (record.schema_version !== REGISTRY_SCHEMA_VERSION || !record.created_at || !record.updated_at) throw new Error(`invalid entity ${record.entity_id}`);
        entityIds.add(record.entity_id);
        entityCounts[record.entity_type] += 1;
      };
      let count = 0;
      if (artifact.path.endsWith(".gz")) count = await forEachGzipRecord(path.join(releaseDirectory, artifact.path), consume);
      else {
        const lines = (await readFile(path.join(releaseDirectory, artifact.path), "utf8")).trim().split("\n").filter(Boolean);
        for (const line of lines) consume(JSON.parse(line));
        count = lines.length;
      }
      if (count !== artifact.record_count) failures.push({ path: artifact.path, reason: "actual entity line count mismatch" });
    } catch (error) {
      failures.push({ path: artifact.path, reason: `entity validation failed: ${error.message}` });
    }
  }
  if (!entityIds.has(SNAP_SERVICE_ENTITY_ID)) failures.push({ path: "entities/services.jsonl", reason: "missing SNAP service entity" });

  let resolutionProfileCount = 0;
  if (manifest.publisher?.version === "1.2.0" && resolutionProfileArtifacts.length !== 100) {
    failures.push({ path: "resolution/location-profiles", reason: `expected 100 match-profile partitions; found ${resolutionProfileArtifacts.length}` });
  }
  const profileIds = new Set();
  for (const artifact of resolutionProfileArtifacts) {
    try {
      const zip2 = artifact.path.match(/zip2=(\d{2})/)?.[1];
      if (!zip2) throw new Error("missing ZIP2 partition");
      const count = await forEachGzipRecord(path.join(releaseDirectory, artifact.path), (profile) => {
        const matchKey = profile.normalized_address?.match_key;
        if (profileIds.has(profile.profile_id)) throw new Error(`duplicate profile ${profile.profile_id}`);
        if (profile.schema_version !== "1.0.0" || profile.profile_version !== "business-location-match-profile@1.0.0"
          || profile.zip_code?.slice(0, 2) !== zip2 || !entityIds.has(profile.site_entity_id)
          || !entityIds.has(profile.establishment_entity_id)
          || profile.normalized_address?.complete !== Boolean(matchKey) || profile.normalized_address?.zip_code !== profile.zip_code
          || (matchKey ? profile.address_match_key_sha256 !== digest(matchKey) : profile.address_match_key_sha256 !== null)
          || !validateProvenance(profile.source) || !profile.observed_at || !profile.export_policy) {
          throw new Error(`invalid match profile ${profile.profile_id ?? "<unknown>"}`);
        }
        profileIds.add(profile.profile_id);
      });
      if (count !== artifact.record_count) throw new Error("actual profile line count mismatch");
      resolutionProfileCount += count;
    } catch (error) {
      failures.push({ path: artifact.path, reason: `match-profile validation failed: ${error.message}` });
    }
  }
  if (manifest.publisher?.version === "1.2.0"
    && (resolutionProfileCount !== manifest.coverage?.resolution_location_profiles || resolutionProfileCount !== manifest.coverage?.physical_sites)) {
    failures.push({ path: "manifest.json", reason: "entity-resolution profile counts do not reconcile" });
  }

  const allowedSourceStatuses = new Set([
    "snap-authorized-as-of-source-update",
    "npi-active-as-of-source-release",
    "npi-reactivated-as-of-source-release",
    "reported-non-primary-practice-location-for-active-npi",
    "fdic-current-location-for-active-institution-as-of-index",
    "ncua-reported-us-branch-for-federally-insured-credit-union-as-of-final-quarterly-release",
    "listed-in-fsis-active-mpi-directory-as-of-release",
    "epa-echo-active-program-facility-as-of-source-release",
    "fmcsa-active-registration-as-of-daily-source-release",
    "listed-in-current-irs-eo-bmf-extract-as-of-source-posting",
  ]);
  let assertionCount = 0;
  for (const artifact of assertionArtifacts) {
    try {
      const assertionIds = new Set();
      const count = await forEachGzipRecord(path.join(releaseDirectory, artifact.path), (record) => {
        if (assertionIds.has(record.assertion_id)) throw new Error(`duplicate assertion ${record.assertion_id}`);
        assertionIds.add(record.assertion_id);
        if (!entityIds.has(record.subject_entity_id)) throw new Error(`missing assertion subject ${record.subject_entity_id}`);
        if (!validateProvenance(record.source) || record.export_policy !== "public") throw new Error(`invalid provenance or policy for ${record.assertion_id}`);
        if (!record.observed_at || !record.first_seen || !record.last_seen) throw new Error(`missing temporal scope for ${record.assertion_id}`);
        if (["establishment.source-status", "organization.irs-eo-source-status"].includes(record.predicate) && !allowedSourceStatuses.has(record.value?.value)) {
          throw new Error(`invalid source-specific status for ${record.assertion_id}`);
        }
        if (record.source.policy_id === "irs-eo-bmf") {
          const sourceFields = String(record.source.source_field ?? "").split("|");
          if (!record.subject_entity_id.startsWith("organization:irs_ein_") || !record.predicate.startsWith("organization.")) throw new Error(`IRS EO assertion targets a non-organization entity ${record.assertion_id}`);
          if (sourceFields.some((field) => ["ICO", "ASSET_AMT", "INCOME_AMT", "REVENUE_AMT"].includes(field))) throw new Error(`IRS EO excluded source field leaked for ${record.assertion_id}`);
        }
        if (record.source.policy_id === "fmcsa-company-census") {
          const sourceFields = String(record.source.source_field ?? "").toUpperCase();
          const forbidden = ["PHONE", "FAX", "CELL_PHONE", "EMAIL", "COMPANY_OFFICER", "DUNS", "MAILING", "CRASH", "REVIEW", "SAFETY_RATING"];
          if (record.subject_entity_id.startsWith("organization:") || record.predicate.startsWith("organization.")) throw new Error(`FMCSA assertion targets an inferred organization ${record.assertion_id}`);
          if (forbidden.some((field) => sourceFields.includes(field))) throw new Error(`FMCSA excluded source field leaked for ${record.assertion_id}`);
        }
      });
      if (count !== artifact.record_count) failures.push({ path: artifact.path, reason: "actual assertion line count mismatch" });
      assertionCount += count;
    } catch (error) {
      failures.push({ path: artifact.path, reason: `assertion validation failed: ${error.message}` });
    }
  }

  let relationshipCount = 0;
  for (const artifact of relationshipArtifacts) {
    try {
      const relationshipIds = new Set();
      const count = await forEachGzipRecord(path.join(releaseDirectory, artifact.path), (record) => {
        if (relationshipIds.has(record.relationship_id)) throw new Error(`duplicate relationship ${record.relationship_id}`);
        relationshipIds.add(record.relationship_id);
        if (!entityIds.has(record.subject_entity_id) || !entityIds.has(record.object_entity_id)) throw new Error(`missing relationship endpoint ${record.relationship_id}`);
        if (!validateProvenance(record.source) || !record.observed_at) throw new Error(`invalid relationship provenance ${record.relationship_id}`);
        if (record.source.policy_id === "irs-eo-bmf") throw new Error(`IRS EO filing-address record created a relationship ${record.relationship_id}`);
        if (record.source.policy_id === "fmcsa-company-census" && record.relationship_type !== "located_at") throw new Error(`FMCSA record created an unsupported relationship ${record.relationship_id}`);
        if (!["located_at", "provides_service", "operates"].includes(record.relationship_type)) throw new Error(`unsupported relationship ${record.relationship_type}`);
      });
      if (count !== artifact.record_count) failures.push({ path: artifact.path, reason: "actual relationship line count mismatch" });
      relationshipCount += count;
    } catch (error) {
      failures.push({ path: artifact.path, reason: `relationship validation failed: ${error.message}` });
    }
  }

  if (entityCounts.organization !== (manifest.coverage?.organizations ?? 0) || entityCounts.physical_site !== manifest.coverage?.physical_sites || entityCounts.establishment !== manifest.coverage?.establishments || entityCounts.service !== manifest.coverage?.services) {
    failures.push({ path: "manifest.json", reason: "entity counts do not reconcile" });
  }
  if (assertionCount !== manifest.coverage?.assertions) failures.push({ path: "manifest.json", reason: "assertion count does not reconcile" });
  if (relationshipCount !== manifest.coverage?.relationships) {
    failures.push({ path: "manifest.json", reason: "relationship count does not reconcile" });
  }

  const zipArtifact = manifest.artifacts?.find((artifact) => artifact.artifact_type === "registry-zip-coverage-jsonl");
  try {
    const rows = (await readFile(path.join(releaseDirectory, zipArtifact.path), "utf8")).trim().split("\n").filter(Boolean).map(JSON.parse);
    if (rows.length !== zipArtifact.record_count || rows.length !== manifest.coverage.zip_union_records) throw new Error("ZIP row count mismatch");
    if (new Set(rows.map((row) => row.zip_code)).size !== rows.length) throw new Error("duplicate ZIP coverage row");
    const siteTotal = rows.reduce((sum, row) => sum + row.registry_coverage.physical_site_count, 0);
    if (siteTotal !== manifest.coverage.physical_sites) throw new Error("ZIP physical-site counts do not reconcile");
    const irsEoOrganizationTotal = rows.reduce((sum, row) => sum + (row.registry_coverage.irs_eo_organization_filing_address_count ?? 0), 0);
    if (irsEoOrganizationTotal !== (manifest.coverage.irs_eo_organization_records ?? 0)) throw new Error("ZIP IRS EO organization counts do not reconcile");
    if (rows.some((row) => {
      const recordCount = row.registry_coverage.physical_site_count + (row.registry_coverage.irs_eo_organization_filing_address_count ?? 0);
      return row.registry_coverage.status !== (recordCount > 0 ? "record-level-source-contribution" : "denominator-only-no-record-level-contribution");
    })) throw new Error("ZIP record-level contribution status does not reconcile");
    if (rows.some((row) => row.registry_coverage.complete_all_businesses !== false)) throw new Error("ZIP coverage overstates business completeness");
    if (uspsDependency) {
      const listed = rows.filter((row) => row.current_usps_validity?.status === "listed-in-current-usps-area-district-file");
      if (listed.length !== uspsDenominator.count) throw new Error("USPS ZIP denominator count does not match listed coverage rows");
      if (rows.some((row) => !["listed-in-current-usps-area-district-file", "not-listed-in-current-usps-area-district-file"].includes(row.current_usps_validity?.status)
        || row.current_usps_validity?.deliverability_status !== "not-asserted"
        || row.current_usps_validity?.source_month !== uspsDenominator.source_month
        || row.current_usps_validity?.export_policy !== uspsDenominator.distribution_policy)) {
        throw new Error("ZIP coverage overstates or mislabels USPS assignment evidence");
      }
      if (zipArtifact.distribution_policy !== uspsDenominator.distribution_policy) throw new Error("ZIP artifact does not inherit USPS distribution policy");
    } else if (rows.some((row) => row.current_usps_validity?.status !== "unverified")) {
      throw new Error("ZIP coverage overstates USPS validity without a governed dependency");
    }
  } catch (error) {
    failures.push({ path: zipArtifact?.path ?? "derived/zip-coverage.jsonl", reason: `ZIP coverage validation failed: ${error.message}` });
  }

  if (failures.length) {
    const error = new Error(`National business registry verification failed for ${failures.length} check(s).`);
    error.failures = failures;
    throw error;
  }
  return {
    dataset_id: manifest.dataset_id,
    release_id: manifest.release_id,
    status: manifest.status,
    artifact_count: manifest.artifacts.length,
    coverage: manifest.coverage,
  };
}
