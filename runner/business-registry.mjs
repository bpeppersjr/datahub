import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { finished } from "node:stream/promises";
import { createInterface } from "node:readline";
import { createGunzip, createGzip } from "node:zlib";

export const REGISTRY_SCHEMA_VERSION = "1.0.0";
export const REGISTRY_TRANSFORMATION_VERSION = "national-business-registry@1.0.0";
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

function registryZipCoverage({ snap, nppes, fdic, ncua, snapCounts, nppesPrimaryCounts, nppesSecondaryCounts, fdicLocationCounts, ncuaLocationCounts }) {
  const snapRows = new Map(snap.zipRows.map((row) => [row.zip_code, row]));
  const nppesRows = new Map((nppes?.zipRows ?? []).map((row) => [row.zip_code, row]));
  const fdicRows = new Map((fdic?.zipRows ?? []).map((row) => [row.zip_code, row]));
  const ncuaRows = new Map((ncua?.zipRows ?? []).map((row) => [row.zip_code, row]));
  const zipCodes = [...new Set([...snapRows.keys(), ...nppesRows.keys(), ...fdicRows.keys(), ...ncuaRows.keys(), ...snapCounts.keys(), ...nppesPrimaryCounts.keys(), ...nppesSecondaryCounts.keys(), ...fdicLocationCounts.keys(), ...ncuaLocationCounts.keys()])].sort();
  return zipCodes.map((zipCode) => {
    const snapRow = snapRows.get(zipCode);
    const nppesRow = nppesRows.get(zipCode);
    const fdicRow = fdicRows.get(zipCode);
    const ncuaRow = ncuaRows.get(zipCode);
    const foundation = nppesRow ?? snapRow ?? fdicRow ?? ncuaRow;
    if (!foundation) throw new Error(`Registry ZIP ${zipCode} has no source coverage row.`);
    const snapCount = snapCounts.get(zipCode) ?? 0;
    const primary = nppesPrimaryCounts.get(zipCode) ?? 0;
    const secondary = nppesSecondaryCounts.get(zipCode) ?? 0;
    const fdicLocations = fdicLocationCounts.get(zipCode) ?? 0;
    const ncuaLocations = ncuaLocationCounts.get(zipCode) ?? 0;
    if (snapCount !== (snapRow?.snap_retailer_snapshot?.retailer_count ?? 0)) throw new Error(`ZIP ${zipCode} USDA SNAP counts do not reconcile.`);
    if (nppes && (primary !== (nppesRow?.nppes_organization_provider_snapshot?.primary_practice_location_count ?? 0)
      || secondary !== (nppesRow?.nppes_organization_provider_snapshot?.non_primary_practice_location_count ?? 0))) {
      throw new Error(`ZIP ${zipCode} CMS NPPES counts do not reconcile.`);
    }
    if (fdic && fdicLocations !== (fdicRow?.fdic_current_location_snapshot?.location_count ?? 0)) throw new Error(`ZIP ${zipCode} FDIC location counts do not reconcile.`);
    if (ncua && ncuaLocations !== (ncuaRow?.ncua_quarterly_snapshot?.location_count ?? 0)) throw new Error(`ZIP ${zipCode} NCUA location counts do not reconcile.`);
    const locationCount = snapCount + primary + secondary + fdicLocations + ncuaLocations;
    return {
      schema_version: REGISTRY_SCHEMA_VERSION,
      zip_code: zipCode,
      registry_coverage: {
        status: locationCount > 0 ? "record-level-source-contribution" : "denominator-only-no-record-level-contribution",
        complete_all_businesses: false,
        physical_site_count: locationCount,
        establishment_count: locationCount,
        organization_primary_location_count: primary,
        snap_authorization_evidence_count: snapCount,
        nppes_primary_practice_location_count: primary,
        nppes_non_primary_practice_location_count: secondary,
        fdic_current_location_count: fdicLocations,
        ncua_reported_us_location_count: ncuaLocations,
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
      },
      current_usps_validity: foundation.current_usps_validity,
      geography: foundation.geography,
      employer_baseline: foundation.employer_baseline,
      baseline_coverage_status: foundation.baseline_coverage_status,
    };
  });
}

export async function buildNationalBusinessRegistry({
  outputRoot,
  snapPointer,
  nppesPointer = null,
  fdicPointer = null,
  ncuaPointer = null,
  logger = console.log,
  now = () => new Date(),
} = {}) {
  if (!outputRoot) throw new Error("outputRoot is required.");
  if (!snapPointer) throw new Error("snapPointer is required.");
  const snap = await loadSnapRelease(snapPointer);
  const nppes = nppesPointer ? await loadNppesRelease(nppesPointer) : null;
  const fdic = fdicPointer ? await loadFdicRelease(fdicPointer) : null;
  const ncua = ncuaPointer ? await loadNcuaRelease(ncuaPointer) : null;
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
  }

  const snapCountsByZip = new Map();
  const nppesPrimaryCountsByZip = new Map();
  const nppesSecondaryCountsByZip = new Map();
  const fdicLocationCountsByZip = new Map();
  const ncuaLocationCountsByZip = new Map();
  const normalizedIds = new Set();
  const nppesNpis = new Set();
  const fdicCertificates = new Set();
  const fdicLocationIds = new Set();
  const ncuaCharters = new Set();
  const ncuaLocationIds = new Set();
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
  let assertions = 0;
  let relationships = 0;
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

  const artifacts = [];
  artifacts.push(...await closeGzipWriters([...siteWriters.values()], "canonical-physical-site-jsonl-gzip"));
  artifacts.push(...await closeGzipWriters([...establishmentWriters.values()], "canonical-establishment-jsonl-gzip"));
  if (nppes) artifacts.push(...await closeGzipWriters([...organizationWriters.values()], "canonical-organization-jsonl-gzip"));
  if (fdic) artifacts.push(...await closeGzipWriters([...fdicOrganizationWriters.values()], "canonical-organization-jsonl-gzip"));
  if (ncua) artifacts.push(...await closeGzipWriters([...ncuaOrganizationWriters.values()], "canonical-organization-jsonl-gzip"));
  artifacts.push(...await closeGzipWriters([...assertionWriters.values()], "business-assertion-jsonl-gzip"));
  if (nppes) artifacts.push(...await closeGzipWriters([...organizationAssertionWriters.values()], "business-assertion-jsonl-gzip"));
  if (fdic) artifacts.push(...await closeGzipWriters([...fdicOrganizationAssertionWriters.values()], "business-assertion-jsonl-gzip"));
  if (ncua) artifacts.push(...await closeGzipWriters([...ncuaOrganizationAssertionWriters.values()], "business-assertion-jsonl-gzip"));
  artifacts.push(...await closeGzipWriters([...relationshipWriters.values()], "business-relationship-jsonl-gzip"));

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

  const zipCoverage = registryZipCoverage({ snap, nppes, fdic, ncua, snapCounts: snapCountsByZip, nppesPrimaryCounts: nppesPrimaryCountsByZip, nppesSecondaryCounts: nppesSecondaryCountsByZip, fdicLocationCounts: fdicLocationCountsByZip, ncuaLocationCounts: ncuaLocationCountsByZip });
  artifacts.push(await writeArtifact(stagingDirectory, "derived/zip-coverage.jsonl", jsonLines(zipCoverage), {
    record_count: zipCoverage.length,
    artifact_type: "registry-zip-coverage-jsonl",
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
  };
  artifacts.push(await writeArtifact(stagingDirectory, "derived/source-contributions.json", json(sourceContribution), {
    artifact_type: "registry-source-contribution-summary",
  }));

  const manifest = {
    schema_version: REGISTRY_SCHEMA_VERSION,
    dataset_id: "national-business-registry",
    publisher: { id: "national-business-registry", version: "1.0.0" },
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
    ].join(", ")}, reconciled against the Census ZBP/ZCTA ZIP coverage union`,
    coverage: {
      source_records: snapRecords + nppesOrganizations + nppesSecondaryLocations + nppesOtherNames + fdicInstitutions + fdicLocations + ncuaInstitutions + ncuaLocations + ncuaTradeNames,
      snap_source_records: snapRecords,
      nppes_organization_records: nppesOrganizations,
      nppes_non_primary_practice_location_records: nppesSecondaryLocations,
      nppes_other_name_records: nppesOtherNames,
      fdic_institution_records: fdicInstitutions,
      fdic_location_records: fdicLocations,
      ncua_institution_records: ncuaInstitutions,
      ncua_location_records: ncuaLocations,
      ncua_trade_name_records: ncuaTradeNames,
      organizations: nppesOrganizations + fdicInstitutions + ncuaInstitutions,
      physical_sites: snapRecords + nppesPrimaryLocations + nppesSecondaryLocations + fdicLocations + ncuaLocations,
      establishments: snapRecords + nppesPrimaryLocations + nppesSecondaryLocations + fdicLocations + ncuaLocations,
      services: 1,
      assertions,
      relationships,
      zip_union_records: zipCoverage.length,
      zips_with_record_level_contributions: new Set([...snapCountsByZip.keys(), ...nppesPrimaryCountsByZip.keys(), ...nppesSecondaryCountsByZip.keys(), ...fdicLocationCountsByZip.keys(), ...ncuaLocationCountsByZip.keys()]).size,
      authoritative_current_usps_zip_denominator: null,
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
      ...(snap.manifest.dependencies ?? []),
      ...(nppes?.manifest.dependencies ?? []),
      ...(fdic?.manifest.dependencies ?? []),
      ...(ncua?.manifest.dependencies ?? []),
    ],
    contracts: {
      entity: "config/schemas/business-entity.schema.json",
      assertion: "config/schemas/business-assertion.schema.json",
      relationship: "config/schemas/business-relationship.schema.json",
    },
    export_policy: "public source layer only; restricted and licensed fields are not present",
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
      "SNAP authorization is source-specific evidence and does not independently prove that a business is open at retrieval time.",
      "Each source record creates provisional site and establishment identities; cross-record and cross-source entity resolution has not yet been applied.",
      "No brand, legal organization, parent company, ownership, or general operating-status claim is inferred from the source name.",
      "Current USPS ZIP validity remains unverified until an authoritative current ZIP denominator is integrated.",
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
  if (manifest.coverage?.authoritative_current_usps_zip_denominator !== null) {
    failures.push({ path: "manifest.json", reason: "unsupported authoritative USPS ZIP denominator claim" });
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

  const allowedSourceStatuses = new Set([
    "snap-authorized-as-of-source-update",
    "npi-active-as-of-source-release",
    "npi-reactivated-as-of-source-release",
    "reported-non-primary-practice-location-for-active-npi",
    "fdic-current-location-for-active-institution-as-of-index",
    "ncua-reported-us-branch-for-federally-insured-credit-union-as-of-final-quarterly-release",
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
        if (record.predicate === "establishment.source-status" && !allowedSourceStatuses.has(record.value?.value)) {
          throw new Error(`invalid source-specific status for ${record.assertion_id}`);
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
    if (rows.some((row) => row.registry_coverage.complete_all_businesses !== false || row.current_usps_validity?.status !== "unverified")) {
      throw new Error("ZIP coverage overstates completeness or USPS validity");
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
