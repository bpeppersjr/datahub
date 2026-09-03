# Business heat maps and state category alignment

Co*Tive Collector's **Business heat maps** section is a read-only spatial view over the current governed national business coverage, Census geography, and national registry releases. It does not publish a new data release or change a production pointer.

## Operator workflow

The **Heat map** tab starts with the 50 states and District of Columbia. Select a business category and a data enhancer, optionally set independent minimum-population and minimum-housing-unit filters, then click a state to show its counties, click a county to show the 2020 Census ZCTAs that materially intersect it, and click a ZCTA to inspect physical-location business names. Use the on-map controls or hold `Ctrl` while scrolling up or down to zoom. The breadcrumb returns to any broader scope. The response and UI disclose both the remaining and filtered-out polygon counts.

The category control is one hierarchy of source-preserving evidence:

- consumer-facing retail locations;
- health care and financial services;
- regulated food-production, environmental, and transportation locations;
- state/local licensed locations; and
- organization, registration, and nonprofit address evidence.

These are analytical source groups, not inferred NAICS classifications. One real business can occur in more than one source because the current coverage release deliberately does not apply entity-resolution aliases.

Business-name drill-down reads only the selected ZIP5 partition from the registry's governed location-profile layer. ZIP5 and ZIP+4 remain separate response fields. Categories containing organization-address assertions without physical-location profiles explain that names are unavailable rather than presenting an incomplete name list as complete. Record-level local-review restrictions remain visible.

The **State category alignment** tab provides two percentages for a selected category:

- **Within state**: the category's share of all relevant source-category evidence assigned to that state; and
- **Across U.S.**: the state's share of that category across the displayed states.

The compact category-mix bar shows the full within-state distribution. Territories can be included explicitly.

## Population and demographic enhancers

The map can color polygons by:

- selected-category source evidence;
- 2020 Census population;
- 2020 Census housing units;
- selected-category evidence per 1,000 people;
- population density per square mile; or
- the 2023 Census ZIP Business Patterns employer-establishment baseline.

Population and housing values come directly from the selected Census 2020 ZCTA records. State and county values are sums only for ZCTAs that have exactly one material state or county intersection. They are not full official state/county population totals.

## Geography and percentage safeguards

The view never multiplies a business, population, address, or establishment count by polygon-area weights. State and county category aggregates admit only a ZCTA with exactly one material jurisdiction intersection. Ambiguous cross-boundary ZCTAs and reported ZIP values without a usable ZCTA remain excluded from those aggregates, and every response reports the excluded record and evidence counts.

When a county is selected, all materially intersecting ZCTA polygons remain visible. A ZCTA's direct ZIP evidence is not represented as belonging wholly to the selected county, and cross-boundary counts are reported. ZCTAs approximate generalized ZIP service areas; they are not USPS delivery boundaries. ZIP+4 has no polygon.

All counts remain source-preserving evidence rather than deduplicated or complete active-business counts. The current coverage release's provenance, temporal limitations, source policy, export policy, completeness flag, and entity-resolution status remain authoritative.

## Local API

The loopback runner exposes:

- `GET /api/business-map/catalog` for category, enhancer, interaction, release, and semantic metadata;
- `GET /api/business-map/features?level=states&category=all&enhancer=business_count`;
- `GET /api/business-map/features?level=states&category=all&enhancer=business_count&min_population=100000&min_housing_units=40000`;
- `GET /api/business-map/features?level=counties&state_fips=01&category=all&enhancer=population_2020`;
- `GET /api/business-map/features?level=zips&state_fips=01&county_geoid=01001&category=retail-consumer&enhancer=business_count`;
- `GET /api/business-map/state-summary?include_territories=false`; and
- `GET /api/business-map/names?zip=35022&category=retail-consumer&query=&limit=25`.

Identifiers and demographic thresholds are validated before constructing artifact paths or filtering results. Thresholds must be non-negative whole numbers. Geometry and indexes must be declared by compatible published manifests, and the business-name registry release must match the registry release pinned in the coverage view when that lineage field is present. Responses contain no secrets.
