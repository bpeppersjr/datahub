# FDIC BankFind institution and location source

This connector adds a non-healthcare national record layer for FDIC-insured institutions and their current indexed offices and branches.

Official sources:

- [FDIC BankFind API documentation](https://api.fdic.gov/banks/docs/)
- [FDIC BankFind Suite](https://banks.data.fdic.gov/bankfind-suite/)
- [FDIC bulk data and definitions](https://banks.data.fdic.gov/bankfind-suite/bulkData/bulkDataDownload)

The API is public and its documentation states a key is currently not required. FDIC describes the institution and location products as current structure data updated weekly.

## Build and verify

```powershell
npm run fdic:build
npm run fdic:verify
```

The acquisition first pins the institution and location index names, creation timestamps, and totals. It then pages each endpoint in deterministic identifier order. Every page must retain the pinned metadata and exact expected count; an index change before publication invalidates the run.

Raw API records are retained in checksummed gzip JSON Lines. Normalized records are partitioned by certificate or ZIP prefix, and the manifest and `current.json` pointer are published last and atomically.

Foreign offices reported without a U.S. state and with state/county code `00` are counted and excluded from the U.S. location layer. This also catches foreign postal values that happen to resemble U.S. ZIPs. Other structurally invalid rows are quarantined rather than silently discarded.

## Identity and status

Each active FDIC certificate produces one provisional organization candidate. Each FDIC location unique number produces one provisional site and establishment candidate related to that organization. Certificate, institution unique number, location unique number, LEI, and Federal Reserve RSSD remain typed external identifiers rather than canonical primary keys.

The organization status means `ACTIVE=1` and `INACTIVE=0` in the pinned institutions index. Location status means the record appeared in the pinned current locations index and joined to an active institution. Neither status independently confirms public access, current hours, or every offered service.

Main-office flag, office name, established date, service-type code and description, reported address, coordinates, institution class, insurer dates, and source update dates remain separate source assertions when reconciled.

## ZIP coverage

`derived/zip-coverage.jsonl` preserves the Census ZBP/ZCTA union and adds any five-digit U.S. ZIP reported with a U.S. state in the FDIC snapshot. Counts distinguish main offices from branches. ZIPs with no FDIC record remain visible as source-specific gaps; absence does not mean no business. Current USPS validity remains unverified pending an authoritative denominator.

## Governed refresh authorization on November 12, 2026

Two metadata-only API queries used `limit=0`, returned no entity rows, and changed no production data. The current FDIC indexes reported 4,212 `ACTIVE:1` institutions and 78,011 indexed locations. The institution index was created at `2026-11-06T13:05:30Z`; the location index was created at `2026-11-06T12:54:15Z`.

The resulting assessment and reviewed source policy are hash-bound to the governed full-snapshot operation. Co*Tive may refresh this nationwide source once for all states and then partition retained evidence locally. Publication remains conditional on pinning both indexes, exact count reconciliation, foreign-office exclusion, artifact verification and atomic pointer replacement. The current index totals are not an all-bank, all-financial-business or all-business denominator, and changes between editions are not net business creation.
