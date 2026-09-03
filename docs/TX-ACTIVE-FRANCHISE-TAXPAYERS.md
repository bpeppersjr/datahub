# Texas Active Franchise Taxpayers metadata-only connector

## Status and boundary

This connector is **metadata/count preflight only**. It does not fetch taxpayer rows, normalize organizations, publish coverage, create a release, or write `current.json`. Large acquisition is default-denied and the row-acquisition implementation intentionally does not exist.

The connector uses the official Texas Comptroller dataset `9cir-efmm`:

- catalog: <https://data.texas.gov/dataset/Active-Franchise-Taxpayers/9cir-efmm>
- exact metadata endpoint: <https://data.texas.gov/api/views/9cir-efmm>
- exact count-only endpoint: <https://data.texas.gov/resource/9cir-efmm.json?$select=count(*)>
- official layout attachment: <https://data.texas.gov/api/views/9cir-efmm/files/297f2282-33fe-4e7b-86de-10f6ae5f07e3?download=true&filename=Franchise%20Layout.docx>
- Texas Comptroller tax-files page: <https://comptroller.texas.gov/data/openrec/requests/taxfiles.php>

Only the metadata path with no query and the records path with the sole `$select=count(*)` query are allowlisted. HTTPS is mandatory, redirects are rejected, there are no secret references, and the preflight executes the two requests serially. Host, path, query, response size, catalog identity, publisher, license status, exact schema, and count are validated before a receipt can be written.

## Run the bounded preflight

From the repository root:

```powershell
node scripts/preflight-tx-active-franchise-taxpayers.mjs
```

The default receipt directory is:

```text
data/business-sources/tx-active-franchise-taxpayers/preflights
```

Receipts use exclusive creation and will never overwrite a file with the same observation identity. Each contains the source refresh time, count, exact 18-field schema, schema and source-observation fingerprints, observation time, and explicit proof fields showing zero row requests, zero acquired rows, zero normalized records, and no release pointer. Use `--stdout-only` when a persistent receipt is not wanted. Any `--output` path is resolved and required to remain inside `datahub`.

The live metadata/count observation made while implementing this connector on 2026-09-03 reported:

- catalog `rowsUpdatedAt`: `2026-08-29T08:25:23.000Z`;
- count-only result: `3,435,798` source rows; and
- pinned schema fingerprint: `69878a85fb44b1c3541fb7477474c837252932a3cc1dfc1dc39e23a1f42117ac`.

These values are observations, not permanent facts. Every later preflight validates and records the current official state.

## Pinned source schema

The connector requires exactly these 18 catalog columns in this order, with the exact machine field name, source label, data type, and catalog position:

| Position | Machine field | Exact source label | Socrata type |
| ---: | --- | --- | --- |
| 2 | `taxpayer_number` | `Taxpayer Number` | `text` |
| 3 | `taxpayer_name` | `Taxpayer Name` | `text` |
| 4 | `taxpayer_address` | `Taxpayer Address` | `text` |
| 5 | `taxpayer_city` | `Taxpayer City` | `text` |
| 6 | `taxpayer_state` | `Taxpayer State` | `text` |
| 7 | `taxpayer_zip` | `Taxpayer Zip` | `text` |
| 8 | `taxpayer_county_code` | `Taxpayer County Code` | `number` |
| 9 | `taxpayer_organizational_type` | `Taxpayer Organizational Type` | `text` |
| 10 | `record_type_code` | `Record Type Code` | `text` |
| 11 | `responsibility_beginning_date` | `Responsibility Beginning Date` | `calendar_date` |
| 12 | `secretary_of_state_sos_or_coa_file_number` | `  Secretary of State (SOS) or COA File Number` | `text` |
| 13 | `sos_charter_date` | `SOS Charter Date` | `calendar_date` |
| 14 | `sos_status_date` | `SOS Status Date ` | `calendar_date` |
| 15 | `sos_status_code` | `SOS Status Code` | `text` |
| 16 | `right_to_transact_business_code` | `Right to Transact Business Code` | `text` |
| 17 | `current_exempt_reason_code` | `Current Exempt Reason Code` | `text` |
| 18 | `exempt_begin_date` | `Exempt Begin Date` | `calendar_date` |
| 19 | `_621111` | `NAICS Code` | `text` |

The leading spaces on the position-12 label and trailing space on the position-14 label are source metadata and are intentionally fingerprinted. The `_621111` machine field is anomalous. It is bound to the exact `NAICS Code` label and its future source value must be preserved; the machine field name must never be treated as a value of `621111`.

## Semantics for any future authorized records

The future record schema is [tx-active-franchise-taxpayer-organization.schema.json](../config/schemas/tx-active-franchise-taxpayer-organization.schema.json). It enforces these boundaries:

- the record may create only a provisional organization candidate;
- the taxpayer address is administrative evidence, not a physical site, establishment, storefront, operating location, polygon, or geocode;
- franchise-tax listing, SOS status, exemption, and right-to-transact values do not independently prove current operation;
- automatic reconciliation is allowed only on an exact Texas Comptroller taxpayer-number match;
- name, address, SOS/COA number, NAICS, and fuzzy similarity can support human review but are never authoritative automatic matches;
- ZIP5 is stored as `zip_code` and Plus4 as `zip4`; they are never joined in canonical output; and
- the catalog license is null/unreported, so future raw records are internal and normalized taxpayer-level records are `local-review-only` pending explicit rights and privacy review.

## Large-acquisition gate

The runner exports an exact acknowledgement gate:

```text
I-APPROVE-TX-FRANCHISE-3.4M-ROW-ACQUISITION
```

Absence of that exact value is a hard denial. Even with the exact value and a validated preflight, `acquireTxActiveFranchiseTaxpayers` stops with an actionable “not implemented” error before making any network request. The acknowledgement therefore cannot accidentally activate a bulk transfer in this version.

Before implementing acquisition, a separate approved change must specify source rights, selected fields, current metadata/count/schema, transfer and storage budgets, deterministic pagination or official bulk strategy, bounded concurrency and rate handling, resumable checkpoints, raw hashing, immutable run manifests, cancellation/restart behavior, privacy controls, normalization quality thresholds, exact taxpayer-number reconciliation, and atomic publication/rollback rules.

## Verification

The focused tests cover exact schema and label pinning, count-only network behavior, host/path/query allowlists, redirect and response-size denial, transient retry, cancellation, identity/license/schema/count drift, immutable receipt refusal to overwrite, ZIP5/ZIP4 separation, exact acknowledgement, and proof that the unimplemented acquisition sends no request:

```powershell
node --test runner/tx-active-franchise-taxpayers.test.mjs
```

Rollback is file-only: remove this connector's manifest, policy, future schema, runner, test, preflight script, and documentation. There is no dataset release or pointer to restore.
