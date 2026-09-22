# New York Business Registry active entities

This source layer publishes a governed, privacy-minimized snapshot of entities included in the official monthly **Active Corporations: Beginning 1800** dataset from the New York State Department of State, Division of Corporations (Open NY dataset `n9v6-gdp6`).

## Source and permitted use

The official catalog and anonymous Socrata API are at [data.ny.gov](https://data.ny.gov/Economic-Development/Active-Corporations-Beginning-1800/n9v6-gdp6). The source is governed by the OPEN-NY Terms of Use and has no dataset-specific catalog license. The connector records the distinct export policy `public-open-ny-terms` on normalized records and national-registry assertions instead of silently translating it to a generic policy.

The source is intended for general public knowledge. Inclusion is not legal documentation and is not proof of current legal status, current operations, legality, solvency, licensure, public access, or an open storefront. The monthly extract excludes inactive and temporarily suspended entities plus assumed names, so it is not a census of every business operating in New York or the United States.

## Data minimization and identity

The connector acquires only these 11 business fields:

- DOS ID, current entity name, initial DOS filing date, county, jurisdiction, and entity type;
- reported location address lines, city, state, and postal code.

DOS process/service-of-process names and addresses, CEO or chairman names and addresses, registered-agent names and addresses, and the source `location_name` field are excluded before acquisition. One unique one-to-eight-digit DOS ID becomes one provisional organization candidate. Legal name, registration profile, active-extract membership, external identifier, reported location address, and eligible ZIP/ZCTA remain separate assertions.

Reported locations are collected through biennial statements and may be absent for newer entities. They may be administrative, residential, virtual, incomplete, stale, out-of-state, or foreign. A reported location creates no physical site, establishment, owner, parent, relationship, or entity-resolution profile.

## Connector lifecycle

The connector:

1. validates the official catalog identity, publisher, publication stage, monthly frequency, `rowsUpdatedAt`, selected schema fingerprint, total row count, and distinct DOS-ID count;
2. writes a safe preflight artifact before acquisition;
3. requests only the approved fields from the exact HTTPS Socrata resource path using stable DOS-ID keyset pagination, one request at a time;
4. rejects redirects, schema drift, duplicate or non-increasing DOS IDs, count drift, and a source refresh during acquisition;
5. normalizes 16 immutable hash partitions, an internal quarantine partition, ZIP coverage, and a source summary;
6. independently replays every selected source row into normalization digests and reconciles every organization and ZIP count before atomically updating `current.json`.

Retries are bounded to HTTP 429, 5xx, and transient transport failures. No key, proxy, VPN, challenge bypass, IP rotation, or browser scraping is used.

## Current verified release

Release `ny-business-registry-20260903-005209518Z-d9e3551f` is the retained release selected by `current.json`. It represents source release `ny-business-registry-2026-09-02-9d8490fb18678e54`, whose catalog rows were updated at `2026-09-02T13:39:39.000Z`.

It independently verifies 4,273,072 selected source rows, 4,273,072 provisional organizations, zero quarantined rows, 350,933 eligible reported U.S. location-address/ZIP contributions across 8,646 source ZIPs, and 3,922,139 organizations without an eligible U.S. ZIP address. The 22 checksummed artifacts total 346,483,030 bytes. Physical-site and establishment counts are intentionally `null` in the source manifest.

The source ZIP view retains all 38,513 ZIPs in its Census ZBP/ZCTA plus source-evidence union. Current USPS ZIP validity remains unverified because no authorized current USPS denominator is integrated.

## Commands

```powershell
npm run ny-business:build
npm run ny-business:verify
```

Generated releases remain under `data/business-sources/ny-business-registry-active-entities/` and are excluded from Git. Contracts, source policy, connector configuration, tests, and this documentation are versioned.

## Refresh readiness in Co*Tive Collector

The Data Operations page provides a deterministic, read-only New York refresh preview. It revalidates the source policy, connector, assessment, actual `current.json` pointer, and retained manifest before producing a six-file hash-bound plan. Previewing creates no operation, allocation, receipt, network request, or pointer change.

Fresh acquisition, autonomous acquisition, and production-pointer changes remain unauthorized. Start is disabled, and a direct start request returns `ACQUISITION_NOT_AUTHORIZED` before any executor or receipt writer can run. A future monthly snapshot must be compared as registration evidence without interpreting absence or row-count changes as proof of closure or current operation.
