# Texas Active Franchise Taxpayers — source preflight

The bounded implementation of this contract is documented in [Texas Active Franchise Taxpayers metadata-only connector](TX-ACTIVE-FRANCHISE-TAXPAYERS.md).

## Acquisition status

**NOT ACQUIRED.** This document records a source contract and a count-only preflight. No taxpayer rows, bulk export, or derived business records have been downloaded or published by this work.

The observed source contains **3,435,798 rows**. Any row-level acquisition is therefore a separate, explicit large-acquisition gate. That gate must approve the expected transfer size, storage footprint, rate and retry policy, resumability, source-policy compliance, validation thresholds, and publication plan before a connector may fetch records.

## Official source endpoints

| Purpose | Official URL |
| --- | --- |
| Dataset page | <https://data.texas.gov/dataset/Active-Franchise-Taxpayers/9cir-efmm> |
| SODA records API | <https://data.texas.gov/resource/9cir-efmm.json> |
| SODA count-only query used for preflight | <https://data.texas.gov/resource/9cir-efmm.json?$select=count(*)> |
| Dataset metadata | <https://data.texas.gov/api/views/9cir-efmm> |
| Official Franchise Layout attachment | <https://data.texas.gov/api/views/9cir-efmm/files/297f2282-33fe-4e7b-86de-10f6ae5f07e3?download=true&filename=Franchise%20Layout.docx> |
| Texas Comptroller tax-files page | <https://comptroller.texas.gov/data/openrec/requests/taxfiles.php> |

The count-only API response observed during preflight was **3,435,798**. The metadata reported `rowsUpdatedAt` as **2026-08-29T08:25:23Z**. Both values are observations, not immutable properties: a future gated acquisition must capture fresh metadata and a fresh count in its run manifest.

## Observed source schema

The metadata exposes these 18 source fields. Source names must be retained in raw provenance even if a future normalized schema uses different names.

| # | Source field | Source label / meaning |
| ---: | --- | --- |
| 1 | `taxpayer_number` | Taxpayer Number |
| 2 | `taxpayer_name` | Taxpayer Name |
| 3 | `taxpayer_address` | Taxpayer Address |
| 4 | `taxpayer_city` | Taxpayer City |
| 5 | `taxpayer_state` | Taxpayer State |
| 6 | `taxpayer_zip` | Taxpayer ZIP |
| 7 | `taxpayer_county_code` | Taxpayer County Code |
| 8 | `taxpayer_organizational_type` | Taxpayer Organizational Type |
| 9 | `record_type_code` | Record Type Code |
| 10 | `responsibility_beginning_date` | Responsibility Beginning Date |
| 11 | `secretary_of_state_sos_or_coa_file_number` | Secretary of State (SOS) or Certificate of Authority (COA) File Number |
| 12 | `sos_charter_date` | SOS Charter Date |
| 13 | `sos_status_date` | SOS Status Date |
| 14 | `sos_status_code` | SOS Status Code |
| 15 | `right_to_transact_business_code` | Right to Transact Business Code |
| 16 | `current_exempt_reason_code` | Current Exempt Reason Code |
| 17 | `exempt_begin_date` | Exempt Begin Date |
| 18 | `_621111` | NAICS Code |

The API field name `_621111` is anomalous: the metadata labels it **NAICS Code**, while its machine identifier resembles a NAICS value rather than a stable semantic field name. A future connector must bind it by both source field name and metadata label, preserve it verbatim in raw provenance, validate its observed values, and fail closed if the source changes its identifier or meaning. It must not silently assume that `621111` is the value for every row.

## Permitted interpretation

This source may be used only as:

- organization and Texas franchise-tax status evidence;
- administrative-address evidence associated with the taxpayer record; and
- an exact-identifier reconciliation source when the **taxpayer number** matches exactly.

It must **never** be represented as evidence of a physical business site, storefront, service location, or geocoded operating location. A taxpayer address is administrative and may be a registered, mailing, accounting, legal, or other non-operating address.

It must **never** be represented as proof that an organization is currently operating. Tax registration, SOS status, and right-to-transact fields retain their source-specific meanings and dates; they are not substitutes for independently governed operating-status evidence.

Taxpayer-name, address, SOS/COA number, NAICS, or fuzzy similarity may produce review candidates, but they may not create an automatic entity match under this contract. **Only an exact taxpayer-number match is authoritative for automatic reconciliation.** Conflicts must remain visible with both sources and their observation dates preserved.

## Requirements for the separate large-acquisition gate

Before any record-level fetch, the operator must approve and record:

1. the intended business purpose and permitted normalized fields;
2. current official metadata, schema, row count, and source update timestamp;
3. bulk-download or paginated SODA strategy, bounded concurrency, throttling, retries, resumable checkpoints, and request receipts;
4. maximum transfer and storage budgets plus staging and rollback paths;
5. raw-source hashing, immutable run manifest, source-policy version, and publication pointer rules;
6. schema-drift checks, uniqueness/null-rate profiling, date parsing, ZIP separation rules, and validation of the anomalous `_621111` field;
7. safeguards that prevent administrative addresses from becoming physical-site records or lat/long business locations without a separate authorized location source; and
8. reconciliation reporting that distinguishes exact taxpayer-number matches, unresolved candidates, conflicts, and nonmatches.

Until that gate is approved and a governed acquisition completes all validation and publication checks, downstream code and user interfaces must report this source as **preflight only / not acquired** and must not count it toward business-entity coverage or completeness.
