# Census Nonemployer Statistics baseline

`census-nonemployer-baseline` is the governed annual aggregate layer for businesses with no paid employees in the U.S. Census Bureau Nonemployer Statistics source universe. It complements ZIP Business Patterns, which covers employer establishments, without mixing the two denominators or claiming that either source is a named-business directory.

## Build and verify

```powershell
npm run nonemployer:build
npm run nonemployer:verify
```

The connector discovers the newest final combined archive from the Census FTP directory, permits only `www2.census.gov`, denies redirects, validates the exact three-file archive contract, pins all 25 source columns, preserves suppression/footnote/noise flags, and publishes the manifest and `current.json` pointer only after the quality gate passes.

## Artifact contract

```text
data/business-baselines/census-nonemployer/
|-- current.json
`-- releases/<release-id>/
    |-- manifest.json
    |-- source/NS<yy>00NONEMP.zip
    `-- derived/
        |-- geography-totals.jsonl
        `-- industry/
            |-- national.jsonl.gz
            |-- state.jsonl.gz
            `-- county.jsonl.gz
```

Every normalized row carries its Census geography, 2022 NAICS, legal form, receipt-size classification, reference year, measures and flags, source record identity, release, ingest run, transformation version, and policy profile. Geography totals select only the all-sector, all-legal-form, all-receipt-size row.

## Semantics and limits

Nonemployer Statistics covers businesses with no paid employees that are subject to federal income tax and meet the Census receipts threshold. A reference-year aggregate is evidence about that annual source universe, not proof that any particular business operates now.

The national/state/county file covers the 50 states and District of Columbia. It has no ZIP-level geography, names, street addresses, or individual records. Counts are never allocated to ZIPs/ZCTAs, joined to provisional businesses, or used to infer identity. Missing territories and ZIP allocation remain explicit coverage gaps.

The tracked contracts are [`config/connectors/us-census-nonemployer.json`](../config/connectors/us-census-nonemployer.json), [`config/datasets/census-nonemployer-baseline.json`](../config/datasets/census-nonemployer-baseline.json), [`config/schemas/census-nonemployer-geography-total.schema.json`](../config/schemas/census-nonemployer-geography-total.schema.json), and [`config/source-policies/us-census-nonemployer.json`](../config/source-policies/us-census-nonemployer.json).

## Current verified release

Release `census-nonemployer-2023-20260830-230249716Z-78268f89` pins the official 2023 combined source archive and independently verifies five artifacts totaling 51,622,242 bytes. The source contains 1,153,323 rows across all published geographies. The governed normalized layer retains 6,412 national, 94,825 state, and 701,010 county industry rows plus one national, 51 state/DC, and 3,143 county all-sector totals.

The published national and summed state/DC totals reconcile exactly to 30,427,808 nonemployer establishments. Published county totals sum to 30,427,807; the one-establishment difference remains explicitly unallocated rather than being forced into a county or ZIP.

## Selected county-industry context

The offline consumer derives a separate immutable release from the fixed retained release above. It currently selects exact 2022 NAICS totals for code `23` (Construction) and `62441` (Child Day Care Services); it does not change the baseline's `current.json` pointer or general business totals.

```powershell
npm run nonemployer:industry-context:build
npm run nonemployer:industry-context:verify -- <release-manifest-path>
```

Each output cell preserves the Census reference year, 2022 NAICS classification, measure flags, raw source values, source record ID, retained release ID, transformation version, and source manifest/artifact hashes. Flagged numeric counts, including zero, are retained as raw evidence while the usable count is null; a true unflagged zero remains zero. County geographies found in the retained all-sector total are represented for both industries; a county without a selected published cell is retained as an explicit missing cell, not as zero. National-minus-county and state-minus-county differences sum usable known county cells only; they do not measure completeness or missing businesses. These remain annual aggregate context, not named businesses, current operations, ZIP/ZCTA allocations, or evidence of collection completeness.

The first verified derived release is `census-nonemployer-industry-context-2023-e3fe540b-889b-4dc2-b279-8e9f515ac97e`; its manifest SHA-256 is `60bc303ec665df2472afb93277ed871c1448a6e891b6294903431b6d15c6715f`. It contains 6,390 cells over the 3,143 retained county geographies plus national/state denominators. Construction has 3,141 usable, one flagged, and one absent county cell; childcare has 3,000 usable, nine flagged, and 134 absent county cells. The differences from the sum of usable known county cells are 5 and 198 respectively. No `current.json` pointer was created.
