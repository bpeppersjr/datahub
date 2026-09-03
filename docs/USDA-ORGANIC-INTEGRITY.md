# USDA Organic INTEGRITY governed preflight and offline staging

## Status and safety boundary

This connector is **metadata-only on the network and local-review-only offline**. It does not download the approximately 79.4 MB official monthly workbook, call the INTEGRITY API, create a production release, write `current.json`, enter the national registry, alter coverage, or feed Heatmap Builder.

The official workbook host currently ignores HTTP byte-range requests and returns the full body. For that reason, this version makes **zero requests to any workbook URL**. Its only permitted network request is one bounded GET of the exact Data History HTML page. The response must declare at most 64 KiB and is also read through a streaming 64 KiB hard cap. The connector extracts an exact link matching:

```text
https://organic.ams.usda.gov/Integrity/MonthlyReports/INTEGRITY_Data_YYYYMM01.xlsx
```

The host, port, user information, case-sensitive path, filename date, empty query, and empty fragment are all validated. Redirects are denied. If the bounded HTML does not expose such a link—as can occur with the current server-rendered application—the preflight fails closed and makes no workbook request.

Authoritative references:

- [Organic INTEGRITY Database](https://organic.ams.usda.gov/integrity/Default)
- [Data History](https://organic.ams.usda.gov/integrity/Reports/DataHistory)
- [USDA Ag Data Commons catalog record](https://agdatacommons.nal.usda.gov/articles/dataset/The_Organic_INTEGRITY_Database/24661722)
- [INTEGRITY Data Dictionary for Certifiers, version 6.1](https://www.ams.usda.gov/sites/default/files/media/INTEGRITY%20Data%20Dictionary.pdf)

The Ag Data Commons catalog labels the dataset U.S. Public Domain. That label is retained as evidence, but it is not treated as a standalone production-redistribution approval. Required attribution, source terms, privacy review, and production admission remain separate gates.

## Metadata-only preflight

Run from the repository root with the exact monthly link expected in the official history response:

```powershell
node scripts/preflight-usda-organic-integrity.mjs `
  --workbook-url https://organic.ams.usda.gov/Integrity/MonthlyReports/INTEGRITY_Data_20260901.xlsx
```

Receipts default to:

```text
data/business-sources/usda-organic-integrity/preflights/
```

Each immutable receipt records the bounded history response hash and byte count, discovered workbook link and report month, full eight-value operation-status vocabulary, exact U.S. country identity, and the fact that workbook network requests, workbook response bytes, acquired source records, and production pointers are all zero. Use `--stdout-only` to avoid persistence.

The preflight does **not** learn or claim the workbook content length, hash, sheets, headers, row count, or record schema. Those remain `unverified-awaiting-authorized-source-inspection`.

Live acquisition is separately default-denied. Even the exact exported acknowledgement:

```text
I-APPROVE-USDA-INTEGRITY-LIVE-WORKBOOK-ACQUISITION
```

stops with a “not implemented; no workbook request was made” error. It cannot activate a transfer in this version.

## Source identity and selection boundary

The USDA NOP data dictionary defines the NOP ID as a 10-digit identifier: the first three digits identify the certifier and the remaining seven are assigned by that certifier. The connector rejects any other form and publishes it as typed external identifier `usda_nop_operation_id`, not as a canonical business key.

The complete version-6.1 operation-status vocabulary is pinned:

1. `Certified`
2. `Surrendered`
3. `Suspended`
4. `Revoked`
5. `Transitional`
6. `Denied Certification`
7. `Withdrew with NONC`
8. `Withdrew from Transitional`

Only `Certified` records are selected. The Data History snapshot is treated as USDA NOP-scoped; no unverified `Program` workbook column is invented. U.S. selection requires both the official country code `USA` and exact current source label `UNITED STATES OF AMERICA (THE)`. The normalized record retains those source values and separately supplies the human normalization `United States of America`. Older or informal country labels do not silently pass.

Certification means certification evidence. It is not independent proof of current sales, an active storefront, a currently operating establishment, or general business activity.

## Offline XLSX conformance profile

The public documentation says operations/scopes and products are on separate sheets but does not prove the current live workbook's exact sheet names or headers. Therefore, the exact workbook profile implemented here is explicitly a **conformance profile**, not a claim about the uninspected official file. It lets tests and operator-prepared, SHA-256-pinned inputs exercise the complete normalization and verification boundary before a large acquisition is authorized.

The profile has exactly four sheets, in order:

- `Operations`: Operation ID, name, exact country code/name, status/effective date, certifier, and source-designated physical and mailing address fields.
- `Scopes`: Operation ID plus one of Crops, Livestock, Wild Crops, or Handling.
- `Services`: Operation ID plus one pinned version-6.1 operation service.
- `Products`: Operation ID, NOP scope, numeric category ID/name, and numeric item ID/name.

The profile fingerprint, sheet order, exact headers, status vocabulary, scope vocabulary, and service vocabulary are recorded in the preflight and staging manifest. Every child Operation ID must reference an operation row. Duplicate operation IDs and duplicate child keys fail. A category or item ID mapping to conflicting names fails.

`createUsdaIntegrityFixtureWorkbook` in `runner/usda-organic-integrity-xlsx.mjs` creates small deterministic XLSX conformance fixtures for tests. The parser uses the existing `unzipper` dependency and a narrow OpenXML reader; no spreadsheet dependency was added. It rejects:

- formulas;
- macros/VBA;
- external links and relationships;
- ActiveX, controls, embedded or OLE objects;
- defined names, file sharing, hyperlinks, and merged cells;
- archive path traversal and duplicate parts;
- sheet/header drift; and
- compressed archives over 128 MiB, more than 2,048 archive parts, individual expanded parts over 512 MiB, or total expanded contents over 1 GiB.

These size caps can hold the known monthly archive size, but the unverified official layout will still fail closed until a separately authorized source inspection establishes its real sheets and headers.

## Offline build

The source file, preflight receipt, and output must resolve inside `datahub`. Pin the source independently before running:

```powershell
$source = "data/imports/usda/INTEGRITY-conformance.xlsx"
$hash = (Get-FileHash -Algorithm SHA256 $source).Hash.ToLowerInvariant()

node scripts/build-usda-organic-integrity-offline.mjs `
  --source $source `
  --source-sha256 $hash `
  --preflight data/business-sources/usda-organic-integrity/preflights/<receipt>.json `
  --acknowledgement I-APPROVE-USDA-INTEGRITY-OFFLINE-LOCAL-REVIEW-BUILD
```

The run is written exclusively under:

```text
data/business-sources/usda-organic-integrity/.staging/<UUID>/
```

The output contains only selected operation records and a manifest. It does not copy the raw workbook. It records the operator-supplied source hash, preflight fingerprint, source record ID, ingest run ID, transformation version, policy, effective date, certifier, scopes, services, structured product taxonomy, and physical-versus-mailing source designation. The workbook-to-official-release relationship remains explicitly `unverified-operator-supplied-conformance`: the local staging release ID is distinct from its hash-derived source evidence ID. Snapshot reference date, observation time, first/last seen, and certification validity fields remain separate.

ZIP5 is stored as equal `zip_code` and `postal_code` aliases. ZIP+4 is a separate nullable `zip4` field. They are never joined in canonical output. No coordinate, polygon, geometry, geocoded location, physical-site entity, or establishment entity is created. Source-designated physical addresses remain address evidence and are not promoted to verified operating sites.

The exact input profile excludes contact names, phones, emails, client IDs, agents or other people, websites, additional information, `Other Item`, and item varieties. This does not make the source non-personal: operation names and physical or mailing addresses may still identify individuals or residences. Normalized output remains `local-review-only`.

Verify a staging run independently:

```powershell
node scripts/verify-usda-organic-integrity.mjs `
  data/business-sources/usda-organic-integrity/.staging/<UUID>/manifest.json
```

The verifier recomputes artifact hashes and counts; checks manifest identity, selection reconciliation, schema/vocabularies, 10-digit IDs, postal separation, provenance, local-review policy, no-production assertions, no geocodes/sites, certification semantics, and privacy exclusions; and rejects self-consistent content tampering even when an artifact hash is rewritten.

## Attribution and non-endorsement

Use:

> Source: USDA Agricultural Marketing Service, National Organic Program, Organic INTEGRITY Database.

This product is not endorsed or certified by USDA. Do not use USDA names or logos to imply endorsement.

## Verification and rollback

Focused verification:

```powershell
node --test runner/usda-organic-integrity.test.mjs
npx eslint runner/usda-organic-integrity.mjs runner/usda-organic-integrity-xlsx.mjs runner/usda-organic-integrity.test.mjs scripts/preflight-usda-organic-integrity.mjs scripts/build-usda-organic-integrity-offline.mjs scripts/verify-usda-organic-integrity.mjs
```

Tests cover the single history request, zero workbook requests, exact URL/country/status selection, default-denied acquisition, source-hash tampering, cancellation, sheet/header drift, formulas, macros, foreign-key orphans, postal separation, privacy exclusion, no invented geocodes, independent artifact verification, and self-consistent semantic tampering.

Rollback is file-only: remove this connector's USDA-INTEGRITY-specific runner, scripts, connector manifest, source policy, output schema, tests, and this document. No production pointer or shared registry state is changed.
