# Colorado childcare source contract discovery — September 8, 2026

## Decision

Proceed to implement a bounded metadata/category preflight for the official [Colorado Licensed Child Care Facilities Report](https://data.colorado.gov/Early-childhood/Colorado-Licensed-Child-Care-Facilities-Report/a9rr-k8mu/about_data). This is source discovery, not completed acquisition or application enrollment. The separate Colorado business-registry policy covers another dataset.

[CDEC's official reports documentation](https://www.coloradoofficeofearlychildhood.com/oec/OEC_Resources?lang=&p=Resources&s=Reports-and-Data) identifies Colorado Information Marketplace as its public licensed-childcare source. It describes legal business names and physical addresses as reported in licensing applications. That provides source-address semantics, not independently verified sites or present operations.

## Observed metadata and policy

A peer's direct request to `https://data.colorado.gov/api/views/a9rr-k8mu.json` returned HTTP 200 and 79,475 UTF-8 bytes. It reported attribution `CDEC - Department of Early Childhood`, publisher team `CDEC Analytics & Reporting Team`, parent `CDEC`, and monthly manual uploads. `rowsUpdatedAt` was `1788278190` (`2026-09-01T15:56:30.000Z`). Its description scopes non-24-hour licensed facilities and disclaims guaranteed accuracy, currency, suitability and reliability; source inclusion is not an active-business verification.

Metadata declares `licenseId: PDDL`, with the Open Data Commons Public Domain Dedication and License. [The official PDDL text](https://opendatacommons.org/licenses/pddl/1-0/) permits use and reuse of the covered rights, while distinguishing rights outside its scope and disclaiming warranties. No observed source-specific permission barrier prevents a bounded internal center collector. Preserve provenance and applicable notices; do not impose a new approval gate based merely on ordinary accuracy disclaimers.

No metadata hash, exact metadata observation timestamp or owner object was emitted or saved by this discovery. Do not invent those values or treat these notes as a replayable preflight receipt. Root's web-reader opening of the metadata URL produced a non-retryable safe-open error, not evidence of publisher denial; it was not retried. The next native preflight must capture its own bounded, projected and checksummed evidence, excluding cached provider samples.

## Current schema and proposed selection

Observed schema: 27 columns. The initial selection is nine fields:

| Type | Selected fields |
| --- | --- |
| number | `provider_id`, `total_licensed_capacity` |
| text | `provider_name`, `provider_service_type`, `street_address`, `city`, `state`, `zip`, `county` |

Remaining observed fields (validate schema, do not collect their record values initially):

| Type | Fields |
| --- | --- |
| text | `ecc`, `ccrr`, `school_district`, `quality_rating`, `governing_body` |
| checkbox | `school_district_operated_program`, `cccap_fa_status_d1`, `cccap_authorization_status` |
| calendar_date | `award_date`, `expiration_date` |
| number | `licensed_home_capacity`, `licensed_infant_capacity`, `licensed_toddler_capacity`, `licensed_preschool_capacity`, `licensed_school_age_capacity`, `licensed_preschool_and_school_age_capacity`, `licensed_resident_camp_capacity`, `licensed_nyo_capacity` |

The current schema has no latitude/longitude fields despite geospatial metadata and older documentation mentioning geocoding. Start with null points. Rating award/expiration dates must not become license or operating dates. Numeric provider IDs are source licensing identifiers, not canonical business IDs; verify their delivery representation before defining normalization. Preserve ZIP5 and ZIP4 separately and retain unverified county labels without inferred FIPS.

## Aggregate evidence

One HTTP 200 grouped query was observed at `2026-09-08T21:29:58.678Z`:

```text
https://data.colorado.gov/resource/a9rr-k8mu.json?%24select=provider_service_type%2Ccount%28*%29+as+source_rows%2Ccount%28distinct+provider_id%29+as+distinct_licenses%2Ccount%28street_address%29+as+address_rows%2Ccount%28zip%29+as+zip_rows&%24group=provider_service_type&%24limit=30
```

For every category, returned `source_rows`, `distinct_licenses`, `address_rows` and `zip_rows` were equal numeric strings:

| Provider service type | Each count |
| --- | ---: |
| 3 under 18 Months Family Child Care Home | 78 |
| Child Care Center | 1648 |
| Experienced Family Child Care Home | 256 |
| Family Child Care Home | 431 |
| Infant/Toddler Home | 7 |
| Large Family Child Care Home | 511 |
| Neighborhood Youth Organization | 11 |
| Preschool Program | 499 |
| Resident Camp | 122 |
| School-Age Child Care Center | 965 |

Total: 4,528 source rows. Nonnull address/ZIP counts are not validity checks. The aggregate did not return individual license IDs or prove stable row membership; its raw body/hash was not retained. Search-indexed older counts must not replace this dated observation.

## Next implementation contract

Use the fixed public resource `https://data.colorado.gov/resource/a9rr-k8mu.json` with `provider_service_type = 'Child Care Center'` as the initial narrow cohort (1,648 observed rows). Separately classified preschools and school-age centers are explicit excluded segments, not silently counted as covered. Exclude family-home rows and unnecessary governing-body/contact-related data.

Implement paired metadata and bounded category/center aggregates, exact identity/schema/notice checks, count and distinct-license conservation, deadlines, serial pacing, cancellation and immutable offline-verifiable receipts. Source updates may change counts; pin contract semantics rather than assuming today's counts forever. Unknown lifecycle/geocode fields are quality gaps, not a reason to invent values. After that, validate selected delivery and build the bounded acquisition/normalization/app lifecycle. Only an accepted Co*Tive operation and persisted receipt establish collection handoff. No business records, identifier inventories, accounts, contacts, bulk downloads, schedules or coverage promotion occurred during this review.

## Repository verification

This source-discovery increment changes documentation only. `npm run check` passed: 1,341 tests, 1,330 passed, 11 skipped, zero failed; lint, web/desktop builds and desktop control-plane smoke passed. Log: `data/tmp/co-source-discovery-check.log`. Type checking passed, production dependency audit found zero vulnerabilities, and all 82 pending production pins remained unchanged. Both app queues were confirmed empty before the temporary development-service stop needed for desktop verification, and the service was restored afterward. These checks verify repository health, not a Colorado preflight, acquisition or coverage result.
