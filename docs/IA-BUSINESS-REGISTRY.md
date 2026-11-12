# Iowa Business Registry active entities

This source layer publishes a governed, privacy-minimized snapshot of entities represented in the official monthly **Active Iowa Business Entities** dataset (Iowa Data Hub dataset `554`).

## Authority and meaning

The Office of the Secretary of State, State of Iowa publishes the dataset through Iowa Data Hub under CC BY 4.0. The official catalog describes the corporation number as unique and notes that home-office data can be unavailable for newly filed entities.

`Active` remains Iowa source-registration evidence. It is not translated into proof of current operations, legality, solvency, licensure, public access, or an open storefront. Sole proprietorships, partnerships, and other structures not required to register may be absent, so the dataset cannot be treated as every business operating in Iowa.

## Identity boundary

One unique six-digit Iowa corporation number becomes one provisional organization candidate. Legal name, corporation type, effective date, source-specific active status, home-office address, eligible ZIP/ZCTA, and optional source geocode remain separate assertions.

No physical site, establishment, owner, parent company, or relationship is inferred. Home-office coordinates remain source-reported organization evidence and are not treated as premise-level or deliverability guarantees.

## Governed acquisition

The connector:

1. retrieves official dataset metadata and the column schema, requiring dataset number `554`, expected metadata, and a pinned selected-field schema fingerprint;
2. manually validates the one signed `columns.json` redirect to the exact Iowa Data Hub storage object without retaining or logging its signed query string;
3. downloads the official archive with bounded retries, size limits, and one request at a time;
4. requires exactly one CSV member, validates the complete source header, and rejects archive-layout drift, duplicate corporation numbers, and source-row-count mismatch;
5. writes a complete run-scoped source archive and a hashed business-only selected-field snapshot before normalization;
6. partitions normalized entities into 16 immutable artifacts, quarantines invalid identities, and reconciles ZIP counts; and
7. changes `current.json` only after archive replay, artifact hashing, schema checks, and independent verification pass.

A complete staged archive can be revalidated and normalized into a new immutable run without downloading it again. A complete unpublished staging run can be independently verified and published by run ID.

## Field and privacy boundary

Approved fields are corporation number, legal name, corporation type, effective date, and source-defined home-office address, country, latitude, and longitude.

The connector excludes every registered-agent name, address, ZIP, coordinate, and location field. It also excludes the source home-office name and redundant location WKT. The complete official archive remains internal because it contains registered-agent personal data; normalized and national artifacts contain only the approved business fields with provenance and source limitations.

Home-office addresses can be administrative, residential, virtual, incomplete, stale, outside Iowa, or outside the United States. They are organization evidence only and create no physical site or establishment.

## Operations

Build and independently verify the release:

```powershell
npm run ia-business:build
npm run ia-business:verify
```

All outputs remain under `data/business-sources/ia-business-registry-active-entities`.

## Validated live release

Release `ia-business-registry-20260903-004117245Z-8e4bf874` is the retained release selected by `current.json`. It is bound to the source refresh at `2026-08-10T12:59:03.509Z` and source release `ia-business-registry-2026-08-10-9654242df778d3bb`. Independent verification replayed all 347,200 archive rows against the selected-field snapshot and rehashed and parsed all 23 artifacts totaling 198,106,162 bytes.

The snapshot publishes 347,200 active entity organizations with zero quarantined entities. Exactly 334,176 have an eligible U.S. home-office ZIP contribution, 330,664 preserve a complete source coordinate pair, and no coordinate pair was rejected as incomplete or invalid. The source contributes 9,901 distinct ZIPs; its complete Census-baseline/source union contains 38,176 ZIP rows. Physical-site and establishment counts remain `null`.

## Refresh readiness in Co*Tive Collector

The Data Operations page shows the retained August 10 snapshot alongside the catalog metadata observed on November 11, 2026. The deterministic, read-only preview revalidates the policy, connector, dataset configuration, assessment, `current.json` pointer, and its manifest. It produces a hash-bound plan with zero allocations, zero network requests, and no operation.

Iowa's public CC BY 4.0 catalog reports 351,617 rows and a November 8 update. The metadata endpoint gives the timestamp `2026-11-08T01:02:45.24117-06:00`. The November 7 Data.gov harvest gives `2026-11-07T09:10:30.011658+00:00` and supplies no row count. The review used metadata only. [Iowa Data Hub catalog](https://data.iowa.gov/catalog/dataset/554) · [Iowa metadata API](https://idh-be.iowa.gov/api/v1/datasets/554/) · [Data.gov harvest](https://catalog.data.gov/dataset/active-iowa-business-entities)

A future refresh requires separate authorization for acquisition and any production pointer change. A replacement snapshot must pass schema, count and hash verification, plus reconciliation of replacements and deletions. Start remains disabled and a direct start request returns `ACQUISITION_NOT_AUTHORIZED` before creating an operation or contacting the publisher.
