import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { createGunzip, gunzipSync } from "node:zlib";
import { APP_ROOT } from "./paths.mjs";
import { validateChildcareGeographicEvidence } from "./childcare-geographic-evidence.mjs";
import { validateTnChildcareGeographicEvidence, validateFreshTnChildcareGeographicEvidence } from "./tn-childcare-geographic-evidence.mjs";
import { mapReportingCompatibility } from "./business-map-compatibility.mjs";

const TN_SOURCE = "tn-dhs-active-childcare-centers";

async function readReportingRows(registry, artifact) {
  if (!Number.isSafeInteger(artifact.bytes) || artifact.bytes < 1 || artifact.bytes > 100_000_000) throw new Error("Reporting-only artifact byte limit.");
  const file = artifactPath(registry, item => item === artifact, "reporting-only location evidence");
  const chunks = [], hash = createHash("sha256"); let bytes = 0;
  for await (const chunk of createReadStream(file)) {
    bytes += chunk.length;
    if (bytes > artifact.bytes) throw new Error("Reporting-only location evidence checksum mismatch.");
    chunks.push(chunk); hash.update(chunk);
  }
  if (bytes !== artifact.bytes || hash.digest("hex") !== artifact.sha256) throw new Error("Reporting-only location evidence checksum mismatch.");
  const rows = new TextDecoder("utf-8", { fatal: true }).decode(gunzipSync(Buffer.concat(chunks, bytes), { maxOutputLength: 100_000_000 })).split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  if (rows.length !== artifact.record_count) throw new Error("Reporting-only artifact record count mismatch.");
  return rows;
}

const DEFAULT_COVERAGE_POINTER = path.join(APP_ROOT, "data", "business-coverage-views", "current.json");
const DEFAULT_GEOGRAPHY_POINTER = path.join(APP_ROOT, "data", "geography", "current.json");
const DEFAULT_REGISTRY_POINTER = path.join(APP_ROOT, "data", "business-registry", "current.json");
const DEFAULT_GDP_POINTER = path.join(APP_ROOT, "data", "business-baselines", "bea-regional-gdp", "current.json");
const SQ_METERS_PER_SQ_MILE = 2_589_988.110336;

const CATEGORY_DEFINITIONS = Object.freeze([
  {
    id: "retail-consumer",
    label: "Retail & consumer locations",
    group_id: "consumer",
    group_label: "Consumer-facing",
    fields: ["snap_authorization_evidence_count", "ny_retail_food_store_license_site_count", "ca_abc_active_issued_license_site_count"],
    source_ids: ["usda-snap-current-retailers", "new-york-agriculture-markets-retail-food-stores", "california-abc-daily-active-licenses"],
  },
  {
    id: "health-care",
    label: "Health-care organizations",
    group_id: "services",
    group_label: "Services",
    fields: ["nppes_primary_practice_location_count", "nppes_non_primary_practice_location_count"],
    source_ids: ["cms-nppes-monthly-v2"],
  },
  {
    id: "childcare",
    label: "Reported childcare centers",
    group_id: "services",
    group_label: "Services",
    fields: ["ma_childcare_center_site_count", "nj_childcare_center_site_count", "tn_childcare_center_site_count"],
    source_ids: ["ma-licensed-center-based-childcare", "nj-licensed-childcare-centers", TN_SOURCE],
  },
  {
    id: "financial-services",
    label: "Banks & credit unions",
    group_id: "services",
    group_label: "Services",
    fields: ["fdic_current_location_count", "ncua_reported_us_location_count"],
    source_ids: ["fdic-bankfind-current-structure", "ncua-final-quarterly-call-report"],
  },
  {
    id: "food-production",
    label: "Food production establishments",
    group_id: "regulated",
    group_label: "Regulated & industrial",
    fields: ["fsis_active_establishment_count"],
    source_ids: ["usda-fsis-active-mpi-directory"],
  },
  {
    id: "environmental-facilities",
    label: "Environmentally regulated facilities",
    group_id: "regulated",
    group_label: "Regulated & industrial",
    fields: ["epa_echo_active_facility_count"],
    source_ids: ["epa-echo-exporter-active-facility"],
  },
  {
    id: "transportation",
    label: "Active carrier principal offices",
    group_id: "regulated",
    group_label: "Regulated & industrial",
    fields: ["fmcsa_active_registration_principal_office_count"],
    source_ids: ["fmcsa-company-census-active-us-principal-office"],
  },
  {
    id: "licensed-businesses",
    label: "State & local licensed locations",
    group_id: "licensed",
    group_label: "Licensed & registered",
    fields: [
      "ak_active_business_license_provisional_physical_site_count",
      "la_active_business_registered_location_count",
      "tx_active_sales_tax_permitted_outlet_count",
      "chicago_active_business_license_site_count",
      "dc_basic_business_license_site_count",
      "nyc_dcwp_active_license_site_count",
    ],
    source_ids: [
      "alaska-dcced-active-business-licenses",
      "los-angeles-office-of-finance-active-businesses",
      "texas-comptroller-active-sales-tax-permits",
      "city-of-chicago-bacp-current-active-business-licenses",
      "dc-dlcp-active-basic-business-licenses",
      "nyc-dcwp-issued-licenses-active-premises",
    ],
  },
  {
    id: "registrations-nonprofits",
    label: "Organization, registration & nonprofit evidence",
    group_id: "licensed",
    group_label: "Licensed & registered",
    fields: [
      "irs_eo_organization_filing_address_count",
      "ct_business_registry_organization_reported_business_address_count",
      "de_business_license_organization_reported_business_address_count",
      "co_business_registry_organization_principal_office_address_count",
      "wa_lni_active_contractor_organization_mailing_address_count",
      "or_business_registry_active_registration_principal_place_address_count",
      "ia_business_registry_organization_home_office_address_count",
      "ny_business_registry_organization_reported_location_address_count",
      "fl_business_registry_organization_reported_principal_address_count",
      "pa_business_registry_organization_reported_business_address_count",
      "il_business_registry_organization_records_office_address_count",
    ],
    source_ids: [],
  },
]);

const ENHANCERS = Object.freeze([
  { id: "retained_childcare_county_points", label: "Retained childcare county points (PA)", kind: "source-candidate" },
  { id: "business_count", label: "Observed business evidence", kind: "business" },
  { id: "population_2020", label: "2020 Census population", kind: "population" },
  { id: "housing_units_2020", label: "2020 Census housing units", kind: "demographic" },
  { id: "businesses_per_1000_people", label: "Business evidence per 1,000 people", kind: "population-enhanced" },
  { id: "population_density", label: "Population per square mile", kind: "demographic" },
  { id: "employer_establishments", label: "2023 employer-establishment baseline", kind: "business-demographic" },
  { id: "nonemployer_establishments", label: "Census nonemployer establishments", kind: "business-demographic" },
  { id: "gdp_current_dollars", label: "BEA current-dollar GDP", kind: "economic" },
]);

const CATEGORY_BY_ID = new Map(CATEGORY_DEFINITIONS.map((category) => [category.id, category]));
const ENHANCER_IDS = new Set(ENHANCERS.map((enhancer) => enhancer.id));

function inside(base, target) {
  const relative = path.relative(base, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function loadPointer(pointerPath, datasetId, statuses) {
  let pointer;
  try {
    pointer = JSON.parse(await readFile(pointerPath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
  if (pointer.dataset_id !== datasetId || !pointer.release_id || !pointer.manifest) throw new Error(`${datasetId} current pointer is invalid.`);
  const root = path.dirname(pointerPath);
  const manifestPath = path.resolve(root, pointer.manifest);
  if (!inside(root, manifestPath)) throw new Error(`${datasetId} manifest path escapes its dataset directory.`);
  const manifestBytes = await readFile(manifestPath);
  const manifest = JSON.parse(manifestBytes);
  if (manifest.dataset_id !== datasetId || manifest.release_id !== pointer.release_id || !statuses.has(manifest.status)) {
    throw new Error(`${datasetId} manifest is not a compatible published release.`);
  }
  return { pointer, manifest, manifestPath, manifestSha256: createHash("sha256").update(manifestBytes).digest("hex"), releaseDirectory: path.dirname(manifestPath) };
}

function artifactPath(release, predicate, description) {
  const artifact = (release.manifest.artifacts ?? []).find(predicate);
  if (!artifact?.path) throw new Error(`${release.manifest.dataset_id} is missing ${description}.`);
  const resolved = path.resolve(release.releaseDirectory, artifact.path);
  if (!inside(release.releaseDirectory, resolved)) throw new Error(`${description} escapes its release directory.`);
  return resolved;
}

async function readJsonLines(filePath, visitor) {
  const lines = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity });
  for await (const line of lines) {
    if (line) visitor(JSON.parse(line));
  }
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function finiteOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function coordinateOrNull(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value.trim() || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function geocodeForLocation(location) {
  const coordinates = location?.type === "Point" && Array.isArray(location.coordinates)
    ? location.coordinates
    : [location?.longitude, location?.latitude];
  const longitude = coordinateOrNull(coordinates[0]);
  const latitude = coordinateOrNull(coordinates[1]);
  if (latitude === null || longitude === null || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}

function gdpProperties(release, record, geographyType) {
  if (geographyType === "zip") {
    return {
      gdp_current_dollars: null,
      gdp_reference_year: null,
      gdp_units: null,
      gdp_source_release_id: release?.manifest.release_id ?? null,
      gdp_geography_kind: null,
      gdp_status: "unavailable-no-official-zip-gdp-do-not-allocate",
    };
  }
  if (!release) {
    return {
      gdp_current_dollars: null,
      gdp_reference_year: null,
      gdp_units: null,
      gdp_source_release_id: null,
      gdp_geography_kind: geographyType,
      gdp_status: "unavailable-no-governed-bea-gdp-release",
    };
  }
  if (!record) {
    return {
      gdp_current_dollars: null,
      gdp_reference_year: finiteOrNull(release.manifest.reference_year),
      gdp_units: "current dollars",
      gdp_source_release_id: release.manifest.source_release?.source_release_id ?? release.manifest.release_id,
      gdp_geography_kind: geographyType,
      gdp_status: `unavailable-no-direct-bea-${geographyType}-match`,
    };
  }
  const currentDollars = finiteOrNull(record.gdp_current_dollars);
  return {
    gdp_current_dollars: currentDollars,
    gdp_reference_year: finiteOrNull(record.reference_year),
    gdp_units: record.units?.gdp_current_dollars ?? null,
    gdp_source_release_id: record.provenance?.source_release_id ?? release.manifest.release_id,
    gdp_geography_kind: record.geography_type ?? geographyType,
    gdp_status: currentDollars === null ? "unavailable-bea-value-not-published" : "available-direct-bea-estimate",
  };
}

function nonemployerProperties(record, geographyType) {
  if (geographyType === "zip") {
    return {
      nonemployer_establishments: null,
      nonemployer_receipts_thousands_usd: null,
      nonemployer_reference_year: null,
      nonemployer_source_release_id: null,
      nonemployer_status: "unavailable-not-published-at-zip-do-not-allocate",
    };
  }
  const baseline = record?.nonemployer_baseline;
  const status = typeof baseline?.status === "string"
    ? baseline.status
    : "unavailable-no-governed-nonemployer-baseline";
  const published = status === "published-annual-aggregate";
  return {
    nonemployer_establishments: published ? finiteOrNull(baseline.nonemployer_establishments) : null,
    nonemployer_receipts_thousands_usd: published ? finiteOrNull(baseline.receipts_thousands_usd) : null,
    nonemployer_reference_year: finiteOrNull(baseline?.reference_year),
    nonemployer_source_release_id: baseline?.source_release_id ?? record?.lineage?.census_nonemployer_release_id ?? null,
    nonemployer_status: status,
  };
}

function countsFor(registryCoverage) {
  const counts = {};
  let all = 0;
  for (const category of CATEGORY_DEFINITIONS) {
    const count = category.fields.reduce((sum, field) => sum + number(registryCoverage?.[field]), 0);
    counts[category.id] = count;
    all += count;
  }
  counts.all = all;
  return counts;
}

function emptyAggregate() {
  return {
    zip_unavailable_business_evidence: 0,
    category_counts: Object.fromEntries(["all", ...CATEGORY_DEFINITIONS.map(({ id }) => id)].map((id) => [id, 0])),
    population_2020: 0,
    population_known_zcta_count: 0,
    housing_units_2020: 0,
    housing_known_zcta_count: 0,
    area_land_m2: 0,
    employer_establishments: 0,
    employer_known_zcta_count: 0,
    observed_business_units: 0,
    observed_physical_sites: 0,
    observed_organization_primary_locations: 0,
    zcta_count: 0,
  };
}

function addAggregate(target, zip) {
  for (const [category, count] of Object.entries(zip.category_counts)) target.category_counts[category] += count;
  if (zip.population_2020 !== null) target.population_2020 += zip.population_2020;
  target.population_known_zcta_count += zip.population_known_zcta_count;
  if (zip.housing_units_2020 !== null) target.housing_units_2020 += zip.housing_units_2020;
  target.housing_known_zcta_count += zip.housing_known_zcta_count;
  target.area_land_m2 += zip.area_land_m2;
  if (zip.employer_establishments !== null) target.employer_establishments += zip.employer_establishments;
  target.employer_known_zcta_count += zip.employer_known_zcta_count;
  target.observed_business_units += zip.observed_business_units - (zip.jurisdiction_assignment_ineligible_count ?? 0);
  target.observed_physical_sites += zip.observed_physical_sites - (zip.jurisdiction_assignment_ineligible_count ?? 0);
  target.observed_organization_primary_locations += zip.observed_organization_primary_locations;
  target.zcta_count += zip.zcta_count;
}

function completeZctaMetric(aggregate, valueField, knownCountField) {
  if (aggregate.zcta_count <= 0 || aggregate[knownCountField] !== aggregate.zcta_count) return null;
  return aggregate[valueField];
}

function aggregateMetricStatus(aggregate, knownCountField, metric) {
  if (aggregate.zcta_count <= 0) return "unavailable-no-uniquely-assigned-zcta";
  if (aggregate[knownCountField] === aggregate.zcta_count) return `available-complete-sum-of-uniquely-assigned-zcta-${metric}`;
  if (aggregate[knownCountField] === 0) return `unavailable-no-published-zcta-${metric}`;
  return `unavailable-incomplete-uniquely-assigned-zcta-${metric}-not-summed`;
}

function valueFor(aggregate, categoryId, enhancerId, economic = {}) {
  const businessCount = aggregate.category_counts[categoryId] ?? 0;
  const population = completeZctaMetric(aggregate, "population_2020", "population_known_zcta_count");
  const housing = completeZctaMetric(aggregate, "housing_units_2020", "housing_known_zcta_count");
  const employers = completeZctaMetric(aggregate, "employer_establishments", "employer_known_zcta_count");
  if (enhancerId === "business_count") return businessCount;
  if (enhancerId === "population_2020") return population;
  if (enhancerId === "housing_units_2020") return housing;
  if (enhancerId === "businesses_per_1000_people") return population !== null && population > 0 ? (businessCount / population) * 1000 : null;
  if (enhancerId === "population_density") return population !== null && aggregate.area_land_m2 > 0 ? population / (aggregate.area_land_m2 / SQ_METERS_PER_SQ_MILE) : null;
  if (enhancerId === "nonemployer_establishments") return economic.nonemployer_establishments ?? null;
  if (enhancerId === "gdp_current_dollars") return economic.gdp_current_dollars ?? null;
  return employers;
}

function decorate(feature, aggregate, categoryId, enhancerId, extra = {}) {
  const geoid = String(feature.properties?.GEOID ?? feature.properties?.ZCTA5 ?? "");
  const population = completeZctaMetric(aggregate, "population_2020", "population_known_zcta_count");
  const housing = completeZctaMetric(aggregate, "housing_units_2020", "housing_known_zcta_count");
  const employers = completeZctaMetric(aggregate, "employer_establishments", "employer_known_zcta_count");
  return {
    type: "Feature",
    geometry: feature.geometry,
    properties: {
      geoid,
      name: feature.properties?.NAME ?? feature.properties?.BASENAME ?? `ZCTA5 ${geoid}`,
      postal_abbreviation: feature.properties?.STUSAB ?? null,
      category_id: categoryId,
      business_count: aggregate.category_counts[categoryId] ?? 0,
      zip_unavailable_business_evidence: aggregate.zip_unavailable_business_evidence ?? 0,
      population_2020: population,
      population_status: aggregate.population_status ?? aggregateMetricStatus(aggregate, "population_known_zcta_count", "population"),
      population_known_zcta_count: aggregate.population_known_zcta_count,
      housing_units_2020: housing,
      housing_status: aggregate.housing_status ?? aggregateMetricStatus(aggregate, "housing_known_zcta_count", "housing"),
      housing_known_zcta_count: aggregate.housing_known_zcta_count,
      employer_establishments: employers,
      employer_baseline_status: aggregate.employer_baseline_status ?? aggregateMetricStatus(aggregate, "employer_known_zcta_count", "employer-baseline"),
      employer_known_zcta_count: aggregate.employer_known_zcta_count,
      demographic_zcta_count: aggregate.zcta_count,
      observed_business_units: aggregate.observed_business_units,
      observed_physical_sites: aggregate.observed_physical_sites,
      observed_organization_primary_locations: aggregate.observed_organization_primary_locations,
      population_density: valueFor(aggregate, categoryId, "population_density"),
      businesses_per_1000_people: valueFor(aggregate, categoryId, "businesses_per_1000_people"),
      heat_value: valueFor(aggregate, categoryId, enhancerId, extra),
      ...extra,
    },
  };
}

function category(categoryId) {
  if (categoryId === "all") return { id: "all", label: "All source categories", source_ids: CATEGORY_DEFINITIONS.flatMap((item) => item.source_ids) };
  const result = CATEGORY_BY_ID.get(categoryId);
  if (!result) throw Object.assign(new Error("Unsupported business category."), { statusCode: 400 });
  return result;
}

function enhancer(enhancerId) {
  if (!ENHANCER_IDS.has(enhancerId)) throw Object.assign(new Error("Unsupported heat-map enhancer."), { statusCode: 400 });
  return enhancerId;
}

function fips(value, length, field) {
  const result = String(value ?? "");
  if (!new RegExp(`^\\d{${length}}$`).test(result)) throw Object.assign(new Error(`${field} must contain exactly ${length} digits.`), { statusCode: 400 });
  return result;
}

function optionalWholeNumber(value, field) {
  if (value === null || value === undefined || value === "") return null;
  const text = String(value);
  if (!/^\d+$/.test(text)) throw Object.assign(new Error(`${field} must be a non-negative whole number.`), { statusCode: 400 });
  const result = Number(text);
  if (!Number.isSafeInteger(result)) throw Object.assign(new Error(`${field} exceeds the supported range.`), { statusCode: 400 });
  return result;
}

function percentage(numerator, denominator) {
  return Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0
    ? Number(((numerator / denominator) * 100).toFixed(4))
    : null;
}

function median(values) {
  const ordered = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!ordered.length) return null;
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}

function peerMedianForFeatures(features) {
  return median(features
    .filter((feature) => feature.properties.employer_establishments > 0)
    .map((feature) => feature.properties.business_count / feature.properties.employer_establishments));
}

function peerMedianForAggregates(aggregates, categoryId) {
  return median(aggregates
    .map((aggregate) => ({ aggregate, employers: completeZctaMetric(aggregate, "employer_establishments", "employer_known_zcta_count") }))
    .filter(({ employers }) => employers !== null && employers > 0)
    .map(({ aggregate, employers }) => (aggregate.category_counts[categoryId] ?? 0) / employers));
}

function addRelativeCoverageAlignment(features, { peerMedian, peerScope = "displayed peer geographies" } = {}) {
  const resolvedPeerMedian = peerMedian === undefined ? peerMedianForFeatures(features) : peerMedian;
  return {
    peerMedian: resolvedPeerMedian,
    features: features.map((feature) => {
      const evidencePerEmployerEstablishment = feature.properties.employer_establishments !== null && feature.properties.employer_establishments > 0
        ? feature.properties.business_count / feature.properties.employer_establishments
        : null;
      const relativeCoverageAlignmentPercent = resolvedPeerMedian && evidencePerEmployerEstablishment !== null
        ? Number(((evidencePerEmployerEstablishment / resolvedPeerMedian) * 100).toFixed(2))
        : null;
      return {
        ...feature,
        properties: {
          ...feature.properties,
          evidence_per_employer_establishment: evidencePerEmployerEstablishment,
          relative_coverage_alignment_percent: relativeCoverageAlignmentPercent,
          relative_coverage_alignment_peer_scope: peerScope,
          relative_coverage_alignment_basis: `selected-category evidence per Census employer establishment versus the ${peerScope} median; 100 equals the median and this is not true business-universe completeness`,
          gdp_current_dollars: feature.properties.gdp_current_dollars ?? null,
          gdp_reference_year: feature.properties.gdp_reference_year ?? null,
          gdp_status: feature.properties.gdp_status ?? "unavailable-no-governed-bea-gdp-release",
        },
      };
    }),
  };
}

export function createBusinessMapStore({
  coveragePointerPath = DEFAULT_COVERAGE_POINTER,
  geographyPointerPath = DEFAULT_GEOGRAPHY_POINTER,
  registryPointerPath = DEFAULT_REGISTRY_POINTER,
  gdpPointerPath = DEFAULT_GDP_POINTER,
} = {}) {
  let indexKey = null;
  let indexPromise = null;
  const geometryCache = new Map();

  async function buildIndex(coverage, geography, gdp) {
    const compatibility = mapReportingCompatibility(coverage.manifest);
    const tnCoverage = compatibility.tennessee;
    if (compatibility.ohio) {
      const pin = coverage.manifest.dependencies.find(item => item.dataset_id === "national-business-registry");
      const descriptors = coverage.manifest.artifacts.filter(item => item.artifact_type === "retained-registry-manifest-json");
      const descriptor = descriptors[0];
      if (descriptors.length !== 1 || descriptor.path !== "evidence/registry-manifest.json" || descriptor.export_policy !== "internal"
        || descriptor.sha256 !== pin.manifest_sha256) throw new Error("Map retained registry declaration differs.");
      const { ohioBoundedRead } = await import("./oh-childcare-release.mjs");
      const raw = await ohioBoundedRead(path.join(coverage.releaseDirectory, descriptor.path), 4_000_000);
      if (raw.length !== descriptor.bytes || createHash("sha256").update(raw).digest("hex") !== descriptor.sha256) throw new Error("Map retained registry checksum differs.");
      const declared = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw));
      if (declared.dataset_id !== pin.dataset_id || declared.release_id !== pin.release_id || declared.publisher?.id !== "national-business-registry"
        || declared.publisher.version !== compatibility.registryVersion || declared.status !== "published-partial"
        || declared.complete_national_business_registry !== false || declared.tn_childcare_origin !== coverage.manifest.tn_childcare_origin) throw new Error("Map retained registry identity or origin differs.");
    }
    async function readCoverage(file, visitor) {
      if (!tnCoverage && !compatibility.ohio) return readJsonLines(file, visitor);
      const artifacts = coverage.manifest.artifacts.filter(item => path.resolve(coverage.releaseDirectory, item.path) === file);
      if (artifacts.length !== 1) throw new Error("TN coverage artifact descriptor differs.");
      const artifact = artifacts[0];
      if (!Number.isSafeInteger(artifact.bytes) || artifact.bytes < 0 || artifact.bytes > 1_000_000_000
        || !Number.isSafeInteger(artifact.record_count) || artifact.record_count < 0 || artifact.record_count > 100_000 || !/^[a-f0-9]{64}$/.test(artifact.sha256 ?? "")) throw new Error("TN coverage artifact bound differs.");
      const hash = createHash("sha256"), decoder = new TextDecoder("utf-8", { fatal: true });
      let bytes = 0, count = 0, pending = "";
      const consume = line => {
        if (line.length > 4_000_000) throw new Error("TN coverage line bound exceeded.");
        if (line.trim()) { if (++count > artifact.record_count) throw new Error("TN coverage record count mismatch."); visitor(JSON.parse(line)); }
      };
      for await (const chunk of createReadStream(file)) {
        bytes += chunk.length;
        if (bytes > artifact.bytes) throw new Error("TN coverage checksum mismatch.");
        hash.update(chunk); pending += decoder.decode(chunk, { stream: true });
        let newline;
        while ((newline = pending.indexOf("\n")) !== -1) { consume(pending.slice(0, newline)); pending = pending.slice(newline + 1); }
        if (pending.length > 4_000_000) throw new Error("TN coverage line bound exceeded.");
      }
      pending += decoder.decode(); consume(pending);
      if (bytes !== artifact.bytes || hash.digest("hex") !== artifact.sha256 || count !== artifact.record_count) throw new Error("TN coverage checksum or count mismatch.");
    }
    const statesIndexPath = artifactPath(geography, (item) => item.path === "derived/index/states.jsonl", "state index");
    const zctaIndexPath = artifactPath(geography, (item) => item.path === "derived/index/zctas.jsonl", "ZCTA index");
    const coveragePath = artifactPath(coverage, (item) => item.artifact_type === "zip-coverage-view-jsonl", "ZIP coverage view");
    const stateCoveragePath = artifactPath(coverage, (item) => item.artifact_type === "state-coverage-view-jsonl", "state coverage view");
    const countyCoveragePath = artifactPath(coverage, (item) => item.artifact_type === "county-coverage-view-jsonl", "county coverage view");
    const states = new Map();
    const zctaDemographics = new Map();
    const stateCoverage = new Map();
    const countyCoverage = new Map();
    await Promise.all([
      readJsonLines(statesIndexPath, (row) => states.set(row.geoid, row)),
      readJsonLines(zctaIndexPath, (row) => zctaDemographics.set(row.geoid, row)),
      readCoverage(stateCoveragePath, (row) => {
        const geoid = String(row.state_fips ?? "");
        if (!/^\d{2}$/.test(geoid) || row.view_type !== "state" || stateCoverage.has(geoid)) {
          throw new Error("State coverage view contains an invalid or duplicate geography record.");
        }
        stateCoverage.set(geoid, row);
      }),
      readCoverage(countyCoveragePath, (row) => {
        const geoid = String(row.county_geoid ?? "");
        if (!/^\d{5}$/.test(geoid) || row.view_type !== "county" || countyCoverage.has(geoid)) {
          throw new Error("County coverage view contains an invalid or duplicate geography record.");
        }
        countyCoverage.set(geoid, row);
      }),
    ]);
    const stateGdp = new Map();
    const countyGdp = new Map();
    if (gdp) {
      const stateGdpPath = artifactPath(gdp, (item) => item.path === "derived/state-gdp.jsonl", "state GDP index");
      const countyGdpPath = artifactPath(gdp, (item) => item.path === "derived/county-gdp.jsonl", "county GDP index");
      await Promise.all([
        readJsonLines(stateGdpPath, (row) => {
          const geoid = String(row.geoid ?? "");
          if (!/^\d{2}$/.test(geoid) || (row.geography_type && row.geography_type !== "state") || stateGdp.has(geoid)) {
            throw new Error("BEA state GDP index contains an invalid or duplicate geography record.");
          }
          stateGdp.set(geoid, row);
        }),
        readJsonLines(countyGdpPath, (row) => {
          const geoid = String(row.geoid ?? "");
          if (!/^\d{5}$/.test(geoid) || (row.geography_type && row.geography_type !== "county") || countyGdp.has(geoid)) {
            throw new Error("BEA county GDP index contains an invalid or duplicate geography record.");
          }
          countyGdp.set(geoid, row);
        }),
      ]);
    }
    const zips = new Map();
    const zipsByState = new Map();
    const zipsByCounty = new Map();
    const stateAggregates = new Map();
    const countyAggregates = new Map();
    const excluded = {
      state: { ambiguous: 0, unmatched: 0, ambiguous_business_evidence: 0, unmatched_business_evidence: 0 },
      county: { ambiguous: 0, unmatched: 0, ambiguous_business_evidence: 0, unmatched_business_evidence: 0 },
    };
    await readCoverage(coveragePath, (row) => {
      const code = String(row.zip_code ?? "");
      const demographic = zctaDemographics.get(code);
      const relationships = (row.jurisdiction_overlay?.relationships ?? []).filter((item) => item.material_intersection);
      const stateIds = [...new Set(relationships.map((item) => String(item.state_geo_id ?? "").replace("state:", "")).filter(Boolean))];
      const countyIds = [...new Set(relationships.map((item) => String(item.county_geo_id ?? "").replace("county:", "")).filter(Boolean))];
      const hasZcta = row.spatial_zip_polygon_membership?.status === "included" && Boolean(demographic);
      const population = hasZcta ? finiteOrNull(demographic?.population_2020) : null;
      const housing = hasZcta ? finiteOrNull(demographic?.housing_units_2020) : null;
      const employerPublished = row.employer_baseline?.status === "published";
      const employers = employerPublished ? finiteOrNull(row.employer_baseline.establishments) : null;
      const zip = {
        zip_code: code,
        category_counts: countsFor(row.registry_coverage),
        population_2020: population,
        population_status: population === null ? "unavailable-census-zcta-population-not-published" : "available-direct-census-zcta-2020",
        population_known_zcta_count: population === null ? 0 : 1,
        housing_units_2020: housing,
        housing_status: housing === null ? "unavailable-census-zcta-housing-not-published" : "available-direct-census-zcta-2020",
        housing_known_zcta_count: housing === null ? 0 : 1,
        area_land_m2: number(demographic?.area_land_m2),
        employer_establishments: employers,
        employer_baseline_status: employerPublished && employers === null ? "unavailable-published-employer-baseline-value-missing" : (row.employer_baseline?.status ?? "unavailable-no-employer-baseline-status"),
        employer_known_zcta_count: employers === null ? 0 : 1,
        observed_business_units: number(row.registry_coverage?.establishment_count),
        observed_physical_sites: number(row.registry_coverage?.physical_site_count),
        observed_organization_primary_locations: number(row.registry_coverage?.organization_primary_location_count),
        state_ids: stateIds,
        county_ids: countyIds,
        has_zcta: hasZcta,
        zcta_count: hasZcta ? 1 : 0,
      };
      if (compatibility.ohio) {
        const ineligible = row.registry_coverage?.oh_childcare_center_site_count;
        if (!Number.isSafeInteger(ineligible) || ineligible < 0 || ineligible > zip.observed_business_units
          || ineligible > zip.observed_physical_sites) throw new Error("Ohio ZIP assignment exclusion cannot be reconciled.");
        zip.jurisdiction_assignment_ineligible_count = ineligible;
      }
      zips.set(code, zip);
      for (const stateId of stateIds) {
        if (!zipsByState.has(stateId)) zipsByState.set(stateId, new Set());
        zipsByState.get(stateId).add(code);
      }
      for (const countyId of countyIds) {
        if (!zipsByCounty.has(countyId)) zipsByCounty.set(countyId, new Set());
        zipsByCounty.get(countyId).add(code);
      }
      if (!zip.has_zcta || stateIds.length === 0) {
        excluded.state.unmatched += 1;
        excluded.state.unmatched_business_evidence += zip.category_counts.all;
      } else if (stateIds.length === 1) {
        const aggregate = stateAggregates.get(stateIds[0]) ?? emptyAggregate();
        addAggregate(aggregate, zip);
        stateAggregates.set(stateIds[0], aggregate);
      } else {
        excluded.state.ambiguous += 1;
        excluded.state.ambiguous_business_evidence += zip.category_counts.all;
      }
      if (!zip.has_zcta || countyIds.length === 0) {
        excluded.county.unmatched += 1;
        excluded.county.unmatched_business_evidence += zip.category_counts.all;
      } else if (countyIds.length === 1) {
        const aggregate = countyAggregates.get(countyIds[0]) ?? emptyAggregate();
        addAggregate(aggregate, zip);
        countyAggregates.set(countyIds[0], aggregate);
      } else {
        excluded.county.ambiguous += 1;
        excluded.county.ambiguous_business_evidence += zip.category_counts.all;
      }
    });
    const totals = coverage.manifest.coverage?.tn_childcare_reporting;
    if (totals && !tnCoverage) throw new Error("TN map reporting requires exact coverage 2.9.0 recovered or 2.10.0 fresh.");
    if (tnCoverage) {
      const validate = value => {
        if (!value || ![value.records, value.with_zip, value.without_zip, value.missing_points, ...Object.values(value.missing_zip_reasons ?? {})].every(n => Number.isSafeInteger(n) && n >= 0)
          || value.records !== value.with_zip + value.without_zip || value.zip_inferred !== false || value.missing_points > value.records
          || Object.keys(value.missing_zip_reasons ?? {}).sort().join(",") !== "invalid-source-zip-placeholder,missing-source-zip"
          || Object.values(value.missing_zip_reasons).reduce((sum, n) => sum + n, 0) !== value.without_zip) throw new Error("Invalid TN map ZIP accounting.");
      };
      validate(totals);
      let stateMissing = 0, countyMissing = 0;
      for (const [views, aggregates, isState] of [[stateCoverage, stateAggregates, true], [countyCoverage, countyAggregates, false]]) {
        for (const [id, view] of views) {
          const stats = view.registry_evidence?.tn_childcare_reporting;
          validate(stats);
          if (isState && stats.records && states.get(id)?.postal_abbreviation !== "TN") throw new Error("TN reporting state differs.");
          const aggregate = aggregates.get(id) ?? emptyAggregate();
          aggregate.category_counts.childcare += stats.without_zip;
          aggregate.category_counts.all += stats.without_zip;
          aggregate.observed_business_units += stats.without_zip;
          aggregate.observed_physical_sites += stats.without_zip;
          aggregate.zip_unavailable_business_evidence = stats.without_zip;
          aggregates.set(id, aggregate);
          if (isState) stateMissing += stats.without_zip; else countyMissing += stats.without_zip;
        }
      }
      if (stateMissing !== totals.without_zip || countyMissing > stateMissing) throw new Error("TN map missing-ZIP totals differ.");
    }
    return { coverage, geography, gdp, compatibility, states, stateCoverage, countyCoverage, stateGdp, countyGdp, zips, zipsByState, zipsByCounty, stateAggregates, countyAggregates, excluded };
  }

  async function ensureIndex() {
    const [coverage, geography, gdp] = await Promise.all([
      loadPointer(coveragePointerPath, "national-business-coverage-views", new Set(["published-partial-local-aggregate"])),
      loadPointer(geographyPointerPath, "us-census-geography", new Set(["published"])),
      loadPointer(gdpPointerPath, "bea-regional-gdp", new Set(["published"])),
    ]);
    if (!coverage || !geography) return null;
    if (gdp) {
      const dependency = gdp.manifest.geography_dependency;
      if (dependency?.dataset_id !== "us-census-geography" || dependency.release_id !== geography.manifest.release_id) {
        throw new Error("BEA GDP geography dependency does not match the active governed geography release.");
      }
    }
    const key = `${coverage.manifest.release_id}:${coverage.manifestSha256}:${geography.manifest.release_id}:${geography.manifestSha256}:${gdp?.manifestSha256 ?? "no-gdp"}`;
    if (key !== indexKey) {
      indexKey = key;
      geometryCache.clear();
      indexPromise = buildIndex(coverage, geography, gdp).catch((error) => {
        indexKey = null;
        indexPromise = null;
        throw error;
      });
    }
    return indexPromise;
  }

  async function geoJson(index, relativePath, verify = false) {
    if (verify) {
      const artifact = index.geography.manifest.artifacts.find(item => item.path === relativePath);
      if (!artifact) throw new Error('Governed county layer geometry is not declared.');
      const { mnSelectionReadJson: boundedRead } = await import('./mn-construction-retained-selection.mjs');
      const meter = {}, parsed = await boundedRead(artifactPath(index.geography, item => item.path === relativePath, relativePath), 20_000_000, undefined, meter);
      if (meter.sha256 !== artifact.sha256 || meter.bytes !== artifact.bytes || parsed.type !== 'FeatureCollection' || !Array.isArray(parsed.features)) throw new Error('Governed county layer geometry failed integrity checks.');
      return parsed;
    }
    if (geometryCache.has(relativePath)) return geometryCache.get(relativePath);
    const filePath = artifactPath(index.geography, (item) => item.path === relativePath, relativePath);
    const parsed = JSON.parse(await readFile(filePath, "utf8"));
    if (parsed.type !== "FeatureCollection" || !Array.isArray(parsed.features)) throw new Error(`${relativePath} is not a GeoJSON FeatureCollection.`);
    if (!relativePath.startsWith("source/zctas/")) {
      geometryCache.set(relativePath, parsed);
      if (geometryCache.size > 8) geometryCache.delete(geometryCache.keys().next().value);
    }
    return parsed;
  }

  async function getCatalog() {
    const index = await ensureIndex();
    if (!index) return { available: false };
    const groups = [];
    for (const item of CATEGORY_DEFINITIONS) {
      let group = groups.find(({ id }) => id === item.group_id);
      if (!group) {
        group = { id: item.group_id, label: item.group_label, categories: [] };
        groups.push(group);
      }
      group.categories.push({ id: item.id, label: item.label, business_name_drilldown: item.source_ids.length > 0, evidence_fields: item.fields, source_ids: item.source_ids });
    }
    return {
      available: true,
      coverage_release_id: index.coverage.manifest.release_id,
      geography_release_id: index.geography.manifest.release_id,
      geography_manifest_sha256: index.geography.manifestSha256,
      gdp_release_id: index.gdp?.manifest.release_id ?? null,
      export_policy: index.coverage.manifest.export_policy,
      complete_all_businesses: false,
      entity_resolution_applied: false,
      categories: [{ id: "all", label: "All source categories", business_name_drilldown: true }, ...CATEGORY_DEFINITIONS.map(({ id, label, group_id, group_label, fields, source_ids }) => ({ id, label, group_id, group_label, business_name_drilldown: source_ids.length > 0, evidence_fields: fields, source_ids }))],
      category_groups: groups,
      enhancers: ENHANCERS,
      interaction: { levels: ["states", "counties", "zips"], zoom_gesture: "Ctrl+wheel", business_names_available_at: "selected-five-digit-ZIP", zip_unavailable_business_names_available_at: "selected-state-reporting-only" },
      semantics: {
        business_count: "Source-preserving evidence counts; categories are mutually exclusive source groups, but businesses are not deduplicated across sources.",
        jurisdiction_assignment: "ZIP evidence uses exactly one material ZCTA intersection, with no area allocation. Coverage 2.9 additionally retains disjoint TN ZIP-unavailable rows by reported state and unambiguous point-assigned county; it does not infer ZIPs.",
        population: "2020 Census ZCTA population and housing. State/county values sum only uniquely assigned material ZCTAs.",
        nonemployer: "Census Nonemployer Statistics are direct state/county annual aggregates. They are not current operating-status or completeness measures and are never allocated to ZIP/ZCTA geography.",
        zip: "Five-digit ZCTA/ZIP evidence only. ZIP+4 is not joined and has no polygon.",
        gdp: "BEA current-dollar GDP estimates are joined only by exact state or county GEOID. No GDP is allocated to ZIP/ZCTA geography or used in relative coverage alignment.",
      },
    };
  }

  async function getFeatures({
    level = "states",
    stateFips,
    countyGeoid,
    categoryId = "all",
    enhancerId = "business_count",
    minPopulation,
    minHousingUnits,
  } = {}) {
    category(categoryId);
    enhancer(enhancerId);
    const populationFloor = optionalWholeNumber(minPopulation, "min_population");
    const housingFloor = optionalWholeNumber(minHousingUnits, "min_housing_units");
    const index = await ensureIndex();
    if (!index) return { available: false, type: "FeatureCollection", features: [] };
    let collection;
    let features;
    let meta;
    let alignmentPeerMedian;
    let alignmentPeerScope;
    if (level === "states") {
      collection = await geoJson(index, "source/states.geojson", enhancerId === 'retained_childcare_county_points');
      features = collection.features.filter((feature) => index.states.get(String(feature.properties?.GEOID ?? ""))?.is_50_states_or_dc).map((feature) => {
        const geoid = String(feature.properties?.GEOID ?? "");
        return decorate(feature, index.stateAggregates.get(geoid) ?? emptyAggregate(), categoryId, enhancerId, {
          level: "state",
          scope_assignment: index.compatibility.tennessee ? "unique-material-zcta-state-plus-reported-state-zip-unavailable" : "unique-material-zcta-state",
          ...nonemployerProperties(index.stateCoverage.get(geoid), "state"),
          ...gdpProperties(index.gdp, index.stateGdp.get(geoid), "state"),
        });
      });
      meta = {
        assignment_semantics: index.compatibility.tennessee ? "unique-material-zcta-state-plus-disjoint-reported-state-zip-unavailable-no-area-allocation" : "unique-material-zcta-state-no-area-allocation",
        excluded_ambiguous_zcta_count: index.excluded.state.ambiguous,
        excluded_unmatched_zip_count: index.excluded.state.unmatched,
        excluded_ambiguous_business_evidence: index.excluded.state.ambiguous_business_evidence,
        excluded_unmatched_business_evidence: index.excluded.state.unmatched_business_evidence,
        excluded_territory_state_equivalents: [...index.states.values()].filter((row) => !row.is_50_states_or_dc).length,
      };
      alignmentPeerScope = "50 states and District of Columbia peer";
    } else if (level === "counties") {
      const state = fips(stateFips, 2, "state_fips");
      collection = await geoJson(index, `source/counties/state=${state}.geojson`, enhancerId === 'retained_childcare_county_points');
      features = collection.features.map((feature) => {
        const geoid = String(feature.properties?.GEOID ?? "");
        return decorate(feature, index.countyAggregates.get(geoid) ?? emptyAggregate(), categoryId, enhancerId, {
          level: "county",
          state_fips: state,
          scope_assignment: index.compatibility.tennessee ? "unique-material-zcta-county-plus-point-assigned-zip-unavailable" : "unique-material-zcta-county",
          ...nonemployerProperties(index.countyCoverage.get(geoid), "county"),
          ...gdpProperties(index.gdp, index.countyGdp.get(geoid), "county"),
        });
      });
      meta = {
        state_fips: state,
        assignment_semantics: index.compatibility.tennessee ? "unique-material-zcta-county-plus-disjoint-point-assigned-zip-unavailable-no-area-allocation" : "unique-material-zcta-county-no-area-allocation",
        excluded_ambiguous_zcta_count: index.excluded.county.ambiguous,
        excluded_unmatched_zip_count: index.excluded.county.unmatched,
        excluded_ambiguous_business_evidence: index.excluded.county.ambiguous_business_evidence,
        excluded_unmatched_business_evidence: index.excluded.county.unmatched_business_evidence,
      };
      alignmentPeerScope = `county peers within state ${state}`;
    } else if (level === "zips") {
      const state = fips(stateFips, 2, "state_fips");
      const county = fips(countyGeoid, 5, "county_geoid");
      if (!county.startsWith(state)) throw Object.assign(new Error("county_geoid does not belong to state_fips."), { statusCode: 400 });
      const selected = index.zipsByCounty.get(county) ?? new Set();
      const prefixes = [...new Set([...selected].map((code) => code[0]))].sort();
      const rawFeatures = [];
      for (const prefix of prefixes) {
        const partition = await geoJson(index, `source/zctas/prefix=${prefix}.geojson`);
        rawFeatures.push(...partition.features.filter((feature) => selected.has(String(feature.properties?.ZCTA5 ?? feature.properties?.GEOID ?? ""))));
      }
      features = rawFeatures.map((feature) => {
        const geoid = String(feature.properties?.ZCTA5 ?? feature.properties?.GEOID ?? "");
        return decorate(feature, index.zips.get(geoid) ?? emptyAggregate(), categoryId, enhancerId, {
          level: "zip",
          state_fips: state,
          county_geoid: county,
          scope_assignment: "direct-zcta-evidence-not-county-allocated",
          ...nonemployerProperties(null, "zip"),
          ...gdpProperties(index.gdp, null, "zip"),
        });
      });
      meta = {
        state_fips: state,
        county_geoid: county,
        assignment_semantics: "ZCTA-materially-intersects-selected-county; direct-ZIP-values-are-not-county-allocated",
        cross_boundary_zctas: features.filter((feature) => (index.zips.get(feature.properties.geoid)?.county_ids.length ?? 0) > 1).length,
      };
      const statePeerAggregates = [...(index.zipsByState.get(state) ?? new Set())]
        .map((code) => index.zips.get(code))
        .filter((zip) => zip?.has_zcta && zip.state_ids.length === 1 && zip.state_ids[0] === state);
      alignmentPeerMedian = peerMedianForAggregates(statePeerAggregates, categoryId);
      alignmentPeerScope = `uniquely state-assigned ZCTA peers within state ${state}`;
    } else {
      throw Object.assign(new Error("Unsupported heat-map geography level."), { statusCode: 400 });
    }
    const aligned = addRelativeCoverageAlignment(features, {
      peerMedian: alignmentPeerMedian,
      peerScope: alignmentPeerScope,
    });
    features = aligned.features;
    const unfilteredFeatureCount = features.length;
    if (populationFloor !== null) features = features.filter((feature) => feature.properties.population_2020 !== null && feature.properties.population_2020 >= populationFloor);
    if (housingFloor !== null) features = features.filter((feature) => feature.properties.housing_units_2020 !== null && feature.properties.housing_units_2020 >= housingFloor);
    let retainedCountyStatus;
    if (enhancerId === 'retained_childcare_county_points') {
      const { loadRetainedCountyDisplay, retainedCountyMetric } = await import('./retained-childcare-county-display.mjs');
      let countyData;
      try { countyData = await loadRetainedCountyDisplay(); } catch { countyData = { status: 'verification-failed' }; }
      retainedCountyStatus = countyData.status;
      features = features.map(feature => {
        const metric = retainedCountyMetric(countyData, { level: feature.properties.level, geoid: feature.properties.geoid,
          categoryId, geographyManifestSha256: index.geography.manifestSha256 });
        return { ...feature, properties: { ...feature.properties, heat_value: metric.value,
          retained_childcare_county_rows: metric.value, retained_childcare_county_status: metric.status,
          relative_coverage_alignment_percent: null,
          relative_coverage_alignment_basis: 'Not applicable to retained source-point relationships; no business-universe completeness estimate.' } };
      });
    }
    const heatValues = features.map((feature) => feature.properties.heat_value).filter(Number.isFinite);
    return {
      available: true,
      type: "FeatureCollection",
      level,
      category_id: categoryId,
      enhancer_id: enhancerId,
      coverage_release_id: index.coverage.manifest.release_id,
      geography_release_id: index.geography.manifest.release_id,
      geography_manifest_sha256: index.geography.manifestSha256,
      gdp_release_id: index.gdp?.manifest.release_id ?? null,
      meta: {
        ...meta,
        ...(retainedCountyStatus ? { retained_county_status: retainedCountyStatus } : {}),
        feature_count: features.length,
        unfiltered_feature_count: unfilteredFeatureCount,
        filtered_out_feature_count: unfilteredFeatureCount - features.length,
        demographic_filters: { min_population: populationFloor, min_housing_units: housingFloor },
        peer_median_evidence_per_employer_establishment: aligned.peerMedian,
        relative_coverage_alignment_peer_scope: alignmentPeerScope,
        relative_coverage_alignment_semantics: `100% equals the selected-category evidence density of the ${alignmentPeerScope} median; values may exceed 100%. This is not measured completeness of the business universe.`,
        gdp_status: level === "zips"
          ? "unavailable-no-official-zip-gdp-do-not-allocate"
          : index.gdp
            ? "available-direct-matches-only"
            : "unavailable-no-governed-bea-gdp-release",
        heat_min: heatValues.length ? Math.min(...heatValues) : null,
        heat_max: heatValues.length ? Math.max(...heatValues) : null,
      },
      features,
    };
  }

  async function getStateSummary({ includeTerritories = false } = {}) {
    const index = await ensureIndex();
    if (!index) return { available: false, states: [] };
    const stateRows = [...index.states.values()].filter((row) => includeTerritories || row.is_50_states_or_dc);
    const categoryIds = CATEGORY_DEFINITIONS.map(({ id }) => id);
    const national = Object.fromEntries(categoryIds.map((id) => [id, 0]));
    for (const row of stateRows) {
      const counts = index.stateAggregates.get(row.geoid)?.category_counts ?? emptyAggregate().category_counts;
      for (const id of categoryIds) national[id] += counts[id];
    }
    const nationalTotal = categoryIds.reduce((sum, id) => sum + national[id], 0);
    const states = stateRows.map((row) => {
      const aggregate = index.stateAggregates.get(row.geoid) ?? emptyAggregate();
      const stateTotal = categoryIds.reduce((sum, id) => sum + aggregate.category_counts[id], 0);
      const population = completeZctaMetric(aggregate, "population_2020", "population_known_zcta_count");
      const housing = completeZctaMetric(aggregate, "housing_units_2020", "housing_known_zcta_count");
      return {
        state_fips: row.geoid,
        state_name: row.name,
        postal_abbreviation: row.postal_abbreviation,
        state_equivalent_kind: row.state_equivalent_kind,
        category_counts: Object.fromEntries(categoryIds.map((id) => [id, aggregate.category_counts[id]])),
        percent_of_state: Object.fromEntries(categoryIds.map((id) => [id, percentage(aggregate.category_counts[id], stateTotal)])),
        percent_of_category_nationwide: Object.fromEntries(categoryIds.map((id) => [id, percentage(aggregate.category_counts[id], national[id])])),
        all_category_evidence_count: stateTotal,
        zip_unavailable_business_evidence: aggregate.zip_unavailable_business_evidence ?? 0,
        population_2020: population,
        population_status: aggregateMetricStatus(aggregate, "population_known_zcta_count", "population"),
        housing_units_2020: housing,
        housing_status: aggregateMetricStatus(aggregate, "housing_known_zcta_count", "housing"),
        uniquely_assigned_zcta_count: aggregate.zcta_count,
      };
    });
    return {
      available: true,
      coverage_release_id: index.coverage.manifest.release_id,
      geography_release_id: index.geography.manifest.release_id,
      categories: CATEGORY_DEFINITIONS.map(({ id, label }) => ({ id, label })),
      national_category_counts: national,
      national_all_category_evidence_count: nationalTotal,
      national_category_percent_of_collected_evidence: Object.fromEntries(categoryIds.map((id) => [id, percentage(national[id], nationalTotal)])),
      national_percentage_basis: {
        geography_scope: includeTerritories ? "selected Census state equivalents including territories" : "50 states and District of Columbia",
        numerator: "selected category source-evidence count assigned to included states",
        denominator: "sum of all category source-evidence counts assigned to included states",
        unit: "source-evidence records; overlapping sources may count the same business more than once",
        universe_completeness_percent: null,
        universe_completeness_status: "unavailable-no-comparable-complete-business-universe",
      },
      states,
      assignment: {
        semantics: index.compatibility.tennessee ? "Direct ZIP evidence in ZCTAs with one material state intersection plus disjoint TN ZIP-unavailable evidence by reported state; no area allocation or inferred ZIP." : "Only direct ZIP evidence in ZCTAs with one material state intersection; no area allocation.",
        percentage_semantics: "Category shares are null when their denominator is zero or unavailable; a numeric zero means a measured zero numerator over a positive denominator.",
        excluded_ambiguous_zcta_count: index.excluded.state.ambiguous,
        excluded_unmatched_zip_count: index.excluded.state.unmatched,
        excluded_ambiguous_business_evidence: index.excluded.state.ambiguous_business_evidence,
        excluded_unmatched_business_evidence: index.excluded.state.unmatched_business_evidence,
      },
      complete_all_businesses: false,
      entity_resolution_applied: false,
    };
  }

  async function listNames({ zipCode, stateFips, categoryId = "all", query = "", limit = 25 } = {}, missingZipOnly = false) {
    const zip = missingZipOnly ? null : fips(zipCode, 5, "five-digit ZIP");
    const state = missingZipOnly ? fips(stateFips, 2, "state_fips") : null;
    const selectedCategory = category(categoryId);
    const sourceIds = new Set(selectedCategory.source_ids);
    const cappedLimit = Math.max(1, Math.min(100, Number.isInteger(Number(limit)) ? Number(limit) : 25));
    const scopeFields = missingZipOnly ? { state_fips: state, scope: "source-zip-unavailable", zip_inferred: false, limit: cappedLimit } : {};
    const cleanQuery = String(query ?? "").trim().toLocaleLowerCase("en-US").slice(0, 120);
    if (sourceIds.size === 0) {
      return { available: true, zip_code: zip, ...scopeFields, category_id: categoryId, total: 0, records: [], limitation: "This category has organization-address assertions but no physical-location profile name index." };
    }
    const index = await ensureIndex();
    if (!index) return { available: false, zip_code: zip, ...scopeFields, category_id: categoryId, total: 0, records: [] };
    const registry = await loadPointer(registryPointerPath, "national-business-registry", new Set(["published-partial"]));
    if (!registry) return { available: false, zip_code: zip, ...scopeFields, category_id: categoryId, total: 0, records: [] };
    const pinnedRegistryId = index.coverage.manifest.lineage?.registry_release_id;
    if (pinnedRegistryId && pinnedRegistryId !== registry.manifest.release_id) throw new Error("Business-name registry release does not match the coverage view lineage.");
    const files = [];
    if (!missingZipOnly) {
      const suffix = `resolution/location-profiles/zip2=${zip.slice(0, 2)}.jsonl.gz`;
      files.push({ path: artifactPath(registry, item => item.artifact_type === "entity-resolution-location-profile-jsonl-gzip" && item.path === suffix, `location-profile partition ${zip.slice(0, 2)}`), reporting: false });
    }
    const reportingSuffix = `reporting/location-evidence/zip2=${missingZipOnly ? "unassigned" : zip.slice(0, 2)}/records.jsonl.gz`;
    const reportingArtifacts = registry.manifest.artifacts.filter((item) => item.artifact_type === "business-reporting-location-evidence-jsonl-gzip" && item.path === reportingSuffix);
    if (reportingArtifacts.length > 1) throw new Error("Duplicate reporting name partition.");
    const reportingArtifact = reportingArtifacts[0];
    if (missingZipOnly && ((index.coverage.manifest.coverage?.tn_childcare_reporting?.without_zip ?? 0)
      + (index.coverage.manifest.coverage?.oh_childcare_reporting?.without_zip ?? 0)) > 0 && !reportingArtifact) throw new Error("Missing unassigned childcare name partition.");
    if (reportingArtifact) {
      files.push({ rows: await readReportingRows(registry, reportingArtifact), reporting: true });
    }
    const categoryBySource = new Map(CATEGORY_DEFINITIONS.flatMap((item) => item.source_ids.map((sourceId) => [sourceId, item.id])));
    const OH_SOURCE = "oh-dcy-publisher-open-childcare-centers";
    // Names are reported-address evidence, not input to the county/ZCTA aggregation.
    if (index.compatibility.ohio && ["all", "childcare"].includes(categoryId)) sourceIds.add(OH_SOURCE);
    categoryBySource.set(OH_SOURCE, "childcare");
    let ohioContext = null, ohioApi = null;
    const ohioSites = new Set(), ohioRecords = new Set();
    const records = [];
    const seen = new Set();
    const tnSites = new Set(), tnSourceRecords = new Set();
    let total = 0;
    for (const file of files) {
    const input = file.reporting ? null : createReadStream(file.path), decoded = file.reporting ? null : createGunzip();
    input?.on("error", (error) => decoded.destroy(error));
    const lines = file.reporting ? null : createInterface({ input: input.pipe(decoded), crlfDelay: Infinity });
    try {
    for await (const line of file.rows ?? lines) {
      if (!line) continue;
      const row = file.reporting ? line : JSON.parse(line);
      if (["ma-licensed-center-based-childcare", "nj-licensed-childcare-centers", TN_SOURCE, OH_SOURCE].includes(row.source?.source_id) && !file.reporting) throw new Error("Childcare source cannot appear in matching-profile artifacts.");
      if (file.reporting) {
        if (row.source?.source_id === OH_SOURCE) {
          if (!index.compatibility.ohio || registry.manifest.publisher?.version !== "2.15.0"
            || registry.manifest.tn_childcare_origin !== index.coverage.manifest.tn_childcare_origin) throw new Error("Ohio names require exact registry/coverage pairing and origin.");
          const pins = index.coverage.manifest.dependencies.filter(item => item.dataset_id === "national-business-registry");
          if (pins.length !== 1 || pins[0].release_id !== registry.manifest.release_id || pins[0].manifest_sha256 !== registry.manifestSha256) throw new Error("Ohio names registry differs from coverage dependency.");
          if (!ohioContext) {
            ohioApi = await import("./oh-childcare-coverage-evidence.mjs");
            ohioContext = await ohioApi.loadOhioCoverageContext(registry.manifest);
            const { isDeepStrictEqual } = await import("node:util");
            if (!isDeepStrictEqual(index.coverage.manifest.oh_childcare_source, ohioContext.input.source)) throw new Error("Ohio map source declaration differs.");
          }
          ohioApi.validateOhChildcareGeographicEvidence(row, ohioContext.input.verificationContext);
          if (reportingArtifact.export_policy !== "local-review-only" || reportingSuffix !== `reporting/location-evidence/zip2=${row.zip_code?.slice(0, 2) ?? "unassigned"}/records.jsonl.gz`) throw new Error("Ohio name partition or policy differs.");
          if (ohioSites.has(row.site_entity_id) || ohioRecords.has(row.source.source_record_id)) throw new Error("Duplicate Ohio name evidence.");
          ohioSites.add(row.site_entity_id); ohioRecords.add(row.source.source_record_id);
        } else if (row.source?.source_id === TN_SOURCE) {
          const freshTn = index.compatibility.freshTn;
          if (registry.manifest.publisher?.version !== index.compatibility.registryVersion || !index.compatibility.tennessee
            || (index.compatibility.ohio && registry.manifest.tn_childcare_origin !== index.coverage.manifest.tn_childcare_origin)) throw new Error("TN names require the exact registry/coverage pair and origin.");
          (freshTn ? validateFreshTnChildcareGeographicEvidence : validateTnChildcareGeographicEvidence)(row);
          if (registry.manifest.publisher.id !== "national-business-registry" || index.coverage.manifest.publisher.id !== "national-business-coverage-views") throw new Error("TN names publisher identity differs.");
          const registryPins = index.coverage.manifest.dependencies?.filter(item => item.dataset_id === "national-business-registry") ?? [];
          if (registryPins.length !== 1 || registryPins[0].release_id !== registry.manifest.release_id || registryPins[0].manifest_sha256 !== registry.manifestSha256) throw new Error("TN names registry differs from pinned coverage dependency.");
          if (reportingArtifact.export_policy !== "local-review-only" || reportingSuffix !== `reporting/location-evidence/zip2=${row.zip_code?.slice(0, 2) ?? "unassigned"}/records.jsonl.gz`) throw new Error("TN name partition or artifact policy differs.");
          if (tnSites.has(row.site_entity_id) || tnSourceRecords.has(row.source.source_record_id)) throw new Error("Duplicate TN name evidence.");
          tnSites.add(row.site_entity_id); tnSourceRecords.add(row.source.source_record_id);
          const dependencies = registry.manifest.dependencies?.filter(item => item.dataset_id === TN_SOURCE) ?? [];
          if (dependencies.length !== 1 || dependencies[0].release_id !== row.evidence.release_id || dependencies[0].manifest_sha256 !== row.evidence.manifest_sha256) throw new Error("TN names source dependency differs.");
        } else validateChildcareGeographicEvidence(row);
        if (missingZipOnly && (![TN_SOURCE, OH_SOURCE].includes(row.source?.source_id) || row.zip_code !== null)) throw new Error("Unassigned name partition must contain only supported ZIP-unavailable evidence.");
      }
      const sourceId = row.source?.source_id;
      if (row.zip_code !== zip || !sourceIds.has(sourceId)) continue;
      if (missingZipOnly && row.address.state !== index.states.get(state)?.postal_abbreviation) continue;
      for (const name of row.names ?? []) {
        const businessName = String(name.raw ?? "").trim();
        if (!businessName || (cleanQuery && !businessName.toLocaleLowerCase("en-US").includes(cleanQuery))) continue;
        const address = {
          street: row.address?.street ?? null,
          ...([TN_SOURCE, OH_SOURCE].includes(sourceId) ? { street2: row.address.street2 } : {}),
          city: row.address?.city ?? null,
          state: row.address?.state ?? null,
          zip_code: row.address?.zip_code ?? zip,
          zip4: row.address?.zip4 ?? null,
        };
        const key = file.reporting
          ? `reporting\u0000${sourceId}\u0000${row.source.source_record_id}\u0000${row.site_entity_id}`
          : `${businessName.toLocaleUpperCase("en-US")}\u0000${JSON.stringify(address)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        total += 1;
        if (records.length < cappedLimit) records.push({
          business_name: businessName,
          address,
          geocode: geocodeForLocation(row.location),
          category_id: categoryId === "all" ? categoryBySource.get(sourceId) ?? "all" : categoryId,
          source_id: sourceId,
          source_release_id: row.source?.source_release_id ?? null,
          source_record_id: row.source?.source_record_id ?? null,
          transformation_version: row.source?.transformation_version ?? null,
          policy_id: row.source?.policy_id ?? null,
          observed_at: row.observed_at ?? null,
          export_policy: row.export_policy ?? "local-review-only",
          ...(file.reporting ? { identity_matching_eligible: false, source_status: row.source_status, source_evidence: row.evidence } : {}),
          ...(sourceId === OH_SOURCE ? { governed_geographic_assignment_eligible: false } : {}),
        });
      }
    }
    } finally { lines?.close(); input?.destroy(); decoded?.destroy(); }
    }
    if (ohioContext) await ohioApi.verifyOhChildcareGeographicMembership(ohioContext.input.rows, ohioContext.input.verificationContext);
    return {
      available: true,
      zip_code: zip,
      ...(missingZipOnly ? { state_fips: state, scope: "source-zip-unavailable", zip_inferred: false } : {}),
      category_id: categoryId,
      total,
      limit: cappedLimit,
      records,
      limitation: categoryId === "all"
        ? "Business names include governed location profiles and reporting-only childcare evidence; organization-address evidence included in the map count is excluded from this name list. Ohio reported names are not included in geographic category counts."
        : categoryId === "childcare" && index.compatibility.ohio
          ? "Ohio names are source-reported address evidence, excluded from geographic category counts and county assignment. This list and the heatmap have different eligible populations."
          : null,
      registry_release_id: registry.manifest.release_id,
      local_review_only: records.some((record) => record.export_policy !== "public"),
    };
  }

  const listBusinessNames = options => listNames(options);
  const listStateBusinessNames = (options = {}) => listNames({ ...options, categoryId: options.categoryId ?? "childcare" }, true);
  return { getCatalog, getFeatures, getStateSummary, listBusinessNames, listStateBusinessNames };
}
