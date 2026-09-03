# Texas Active Franchise Taxpayers governed preflight and offline staging

## Status and boundary

The network connector is **metadata/count preflight only**. It never fetches taxpayer rows. A separate default-denied offline command can transform an operator-supplied file already stored inside `datahub` into an immutable, local-review-only `.staging` run. Neither path publishes coverage, creates a production release, writes `current.json`, or supplies the registry or Heatmap Builder. Automated large acquisition remains unimplemented.

The connector uses the official Texas Comptroller dataset `9cir-efmm`:

- catalog: <https://data.texas.gov/dataset/Active-Franchise-Taxpayers/9cir-efmm>
- exact metadata endpoint: <https://data.texas.gov/api/views/9cir-efmm>
- exact count-only endpoint: <https://data.texas.gov/resource/9cir-efmm.json?$select=count(*)>
- official layout attachment: <https://data.texas.gov/api/views/9cir-efmm/files/297f2282-33fe-4e7b-86de-10f6ae5f07e3?download=true&filename=Franchise%20Layout.docx>
- Texas Comptroller tax-files page: <https://comptroller.texas.gov/data/openrec/requests/taxfiles.php>
- public portal CSV export: <https://data.texas.gov/api/views/9cir-efmm/rows.csv?accessType=DOWNLOAD>
- authenticated monthly-file service (SIFT): <https://data-secure.comptroller.texas.gov/>

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

Receipts use exclusive creation and will never overwrite a file with the same observation identity. Each contains the source refresh time, count, exact 18-field schema, schema and source-observation fingerprints, observation time, and explicit proof fields showing zero row requests, zero acquired rows, zero normalized records, and no release pointer. Use `--stdout-only` when a persistent receipt is not wanted. Any `--output` path is resolved and required to remain inside `datahub`. Offline builds require a fresh `1.1.0` receipt; older receipts remain audit records but cannot authorize a new build.

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

The staged record schema is [tx-active-franchise-taxpayer-organization.schema.json](../config/schemas/tx-active-franchise-taxpayer-organization.schema.json). It enforces these boundaries:

- the record may create only a provisional organization candidate;
- the taxpayer address is administrative evidence, not a physical site, establishment, storefront, operating location, polygon, or geocode;
- franchise-tax listing, SOS status, exemption, and right-to-transact values do not independently prove current operation;
- automatic reconciliation is allowed only on an exact Texas Comptroller taxpayer-number match;
- name, address, SOS/COA number, NAICS, and fuzzy similarity can support human review but are never authoritative automatic matches;
- ZIP5 is duplicated only as the required equal aliases `zip_code` and `postal_code`; Plus4 is stored separately as `zip4` and never joined in canonical output; and
- the catalog license is null/unreported, so raw records are internal and normalized taxpayer-level records are `local-review-only` pending explicit rights and privacy review.

The normalized schema deliberately contains no geometry, latitude, longitude, location, physical-site entity, or establishment entity. For organizational types `ES`, `IS`, `PI`, `PZ`, `S`, and `TR`, every normalized address, postal, and county field is withheld because the record has elevated natural-person or residential-address risk. Source rows remain internal.

## Build and verify an operator-supplied file offline

Supported inputs are `.csv`, `.csv.gz`, `.jsonl`, `.jsonl.gz`, `.ndjson`, and `.ndjson.gz`. CSV must have the exact 18 machine headers or exact 18 official labels in the documented order; JSONL must have exactly the 18 machine fields. The layout attachment documents fields and code dictionaries but does **not** document fixed byte widths, a delimiter, encoding, header behavior, or an inner archive filename. The implementation therefore makes no fixed-width `FTACT` parsing claim.

The source and receipt must already be inside `datahub`. The command performs no download:

```powershell
npm run tx-franchise:build-offline -- `
  --source data/imports/texas/Active_Franchise_Taxpayers.csv.gz `
  --preflight data/business-sources/tx-active-franchise-taxpayers/preflights/<receipt>.json `
  --acknowledgement I-APPROVE-TX-FRANCHISE-OFFLINE-LOCAL-REVIEW-BUILD
```

Optionally pass `--tx-sales-tax <pointer>` to create exact taxpayer-number links. The dependency must independently verify and use Texas sales-tax connector version `1.0.1` or newer; during the pending postal migration, do not point this at the legacy production release. No name, address, SOS number, or fuzzy match creates an automatic link.

The build uses a fresh preflight (48-hour default), hashes the operator file, requires its row count to equal the preflight count, validates the exact 18-field contract, quarantines recognized record defects under a bounded rate, separates ZIP5/ZIP+4, and independently verifies 22 artifacts. It creates only:

```text
data/business-sources/tx-active-franchise-taxpayers/.staging/<UUID>/
```

The run directory is exclusive and cannot be reused. Verification is explicit:

```powershell
npm run tx-franchise:verify-offline -- data/business-sources/tx-active-franchise-taxpayers/.staging/<UUID>/manifest.json
```

The manifest truthfully records that exact schema and row count match the preflight, but it does not claim a cryptographically proven complete publisher snapshot because Texas does not supply a checksum binding the operator file to that metadata observation. The source is excluded from business-unit, site, geocode, operating-status, GDP, completeness, registry, coverage, and Heatmap calculations.

## Large-acquisition gate

The runner exports an exact acknowledgement gate:

```text
I-APPROVE-TX-FRANCHISE-3.4M-ROW-ACQUISITION
```

Absence of that exact value is a hard denial. Even with the exact value and a validated preflight, `acquireTxActiveFranchiseTaxpayers` stops with an actionable “not implemented” error before making any network request. The acknowledgement therefore cannot accidentally activate a bulk transfer in this version.

Before implementing automated acquisition or production admission, a separate approved change must specify source rights, selected fields, current metadata/count/schema, transfer and storage budgets, deterministic pagination or official bulk strategy, bounded concurrency and rate handling, resumable checkpoints, publisher-bound source identity where available, privacy controls, normalization quality thresholds, and atomic publication/rollback rules. Offline staging is not that approval.

## Verification

The focused tests cover exact schema and label pinning, count-only network behavior, host/path/query allowlists, redirect and response-size denial, transient retry, cancellation, identity/license/schema/count drift, immutable receipt refusal to overwrite, ZIP aliases and ZIP+4 separation, exact acknowledgements, proof that automated acquisition sends no request, offline fixture build/verification, immutable run IDs, privacy withholding, quarantine reconciliation, no production pointer, and checksum plus self-consistent semantic tampering:

```powershell
node --test runner/tx-active-franchise-taxpayers.test.mjs runner/tx-active-franchise-offline.test.mjs
```

Rollback is file-only: remove this connector's manifest, policy, schema, runners, tests, scripts, and documentation. Offline runs exist only under this source's `.staging` directory; there is no production dataset release or pointer to restore.
