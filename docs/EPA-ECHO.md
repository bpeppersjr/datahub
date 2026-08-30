# EPA ECHO active regulated facilities

This connector builds a governed source layer from EPA's weekly ECHO Exporter. It publishes only rows where `FAC_ACTIVE_FLAG=Y` and the source reports a valid U.S. physical address and ZIP. It preserves source-specific meaning and must not be described as a complete list of U.S. businesses.

Official sources:

- [ECHO data downloads](https://echo.epa.gov/tools/data-downloads)
- [ECHO Exporter ZIP](https://echo.epa.gov/files/echodownloads/echo_exporter.zip)
- [ECHO Exporter column dictionary](https://echo.epa.gov/system/files/echo_exporter_columns_7-16-2025_0.xlsx)
- [ECHO Detailed Facility Report data dictionary](https://echo.epa.gov/help/reports/dfr-data-dictionary?check_logged_in=1)

## Commands

Stream the current official archive directly into a governed release:

```powershell
npm run echo:build
npm run echo:verify
```

Reuse an already completed official download inside `datahub`:

```powershell
npm run echo:build -- --archive downloads/epa-echo/echo_exporter.zip
npm run echo:verify
```

The build uses the exact HTTPS archive path, rejects redirects, caps compressed and uncompressed size, pins the complete 133-column schema fingerprint, verifies one unique `REGISTRY_ID` per source row, streams the 2+ GB CSV, and publishes `current.json` only after all quality gates pass.

## Published contract

Each accepted record creates one provisional physical-site candidate and one provisional establishment candidate keyed to the FRS `REGISTRY_ID`. The layer includes:

- reported facility name and physical address, including ZIP+4 when present;
- FRS and associated environmental-program identifiers;
- NAICS and SIC source classifications;
- ECHO program-association flags;
- reported NAD83 coordinates plus collection method, reference point, accuracy, and a centroid warning when applicable;
- reported and coordinate-derived county/ZIP context plus Census ZCTA linkage;
- source-specific status, release timestamp, checksum-bound provenance, and public export policy.

It does not create an organization, owner, or parent company from `FAC_NAME`. Enforcement, penalty, and neighborhood-demographic fields remain outside this business-registry normalization.

## What active means

EPA defines `FAC_ACTIVE_FLAG=Y` as indicating that at least one associated ICIS-Air, ICIS-NPDES, RCRAInfo, or SDWIS permit/facility is active. It is not independent proof that a business is generally operating, open to the public, or active in every program named on the row. EPA also cautions that RCRA active/inactive designations are data-management and public-information indicators without independent legal or regulatory significance.

Rows with `FAC_ACTIVE_FLAG=N` or blank are counted as source exclusions. Unexpected active-flag values and `Y` rows that fail identity, address, state, ZIP, coordinate, or other normalization rules are quarantined and counted. Every source row must reconcile to exactly one status category.

The default national quality gate requires at least 1,000,000 accepted active facilities and rejects publication if more than 10% of active or unexpected-status rows are quarantined. The manifest records the applied thresholds, actual rate, and counts by rejection reason.

## Coverage

`derived/zip-coverage.jsonl` preserves the Census ZBP/ZCTA union and adds any accepted five-digit U.S. ZIP reported by ECHO. A zero means no accepted ECHO-active regulated facility appeared in that ZIP for this snapshot; it does not mean the ZIP has no business or regulated facility. Current USPS ZIP validity remains unverified pending an authoritative denominator.

## Validated live release

The independently verified 2026-08-30 build produced dataset release `epa-echo-20260830-163250393Z-06b319e4` from source release `epa-echo-2026-08-30-382d612a42041dc0`. The official archive was 427,411,906 bytes with SHA-256 `382d612a42041dc0bdc031c02dbde7c7ac29941da4aadfcb351b74c13c42b12a` and a source `Last-Modified` timestamp of `2026-08-30T06:36:03.000Z`.

That snapshot contained 3,175,741 rows: 1,659,426 with `FAC_ACTIVE_FLAG=Y` and 1,516,315 with a blank/unknown flag. The connector published 1,517,826 active facilities over 38,401 source ZIPs and quarantined 141,600 active rows (8.5331%). Reasons were missing physical address (92,746), invalid or missing U.S. state/territory code (33,423), missing FRS ID (15,417), and missing facility identity (14). The source had 16,403 blank FRS IDs across all status categories and no duplicate nonblank IDs.
