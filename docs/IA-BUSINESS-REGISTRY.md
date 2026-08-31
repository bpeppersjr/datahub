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

Release `ia-business-registry-20260831-053540425Z-9f568d56` is bound to the source refresh at `2026-08-10T12:59:03.509Z` and source release `ia-business-registry-2026-08-10-8fdff50d81e1617a`. Independent verification replayed all 347,200 archive rows against the selected-field snapshot and rehashed and parsed all 23 artifacts totaling 198,106,268 bytes.

The snapshot publishes 347,200 active entity organizations with zero quarantined entities. Exactly 334,176 have an eligible U.S. home-office ZIP contribution, 330,664 preserve a complete source coordinate pair, and no coordinate pair was rejected as incomplete or invalid. The source contributes 9,901 distinct ZIPs; its complete Census-baseline/source union contains 38,176 ZIP rows. Physical-site and establishment counts remain `null`.
