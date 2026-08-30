# Census ZIP Business Patterns baseline

`census-zbp-baseline` is the governed denominator for employer establishments by ZIP and NAICS. It does not provide business names. As of August 30, 2026, the latest published reference year is 2023; Census has announced that 2024 data is expected in September 2026.

## Build and verify

The geography foundation is an explicit prerequisite. The builder verifies the current ZCTA index before downloading Census data.

```powershell
npm run geography:verify
npm run zbp:build
npm run zbp:verify
```

Generated releases remain under `data/business-baselines/census-zbp` and are ignored by Git. Source ZIP archives are retained unchanged. The 291 MB uncompressed industry file is streamed into ten normalized gzip-compressed CSV partitions rather than loaded into memory.

## Published artifacts

```text
data/business-baselines/census-zbp/
|-- current.json
`-- releases/<release-id>/
    |-- manifest.json
    |-- source/
    |   |-- zbp<yy>totals.zip
    |   `-- zbp<yy>detail.zip
    `-- derived/
        |-- zip-coverage.jsonl
        |-- naics-coverage.jsonl
        `-- zip-naics/prefix=<first-digit>.csv.gz
```

`zip-coverage.jsonl` is the union of published ZBP ZIP rows and 2020 ZCTAs. It uses explicit statuses:

- `zbp-and-zcta`
- `zbp-without-zcta`
- `zcta-without-published-zbp`

An absent Census row remains `not-published-for-zip` with null measures. It is never converted to zero.

## Interpretation limits

- ZBP covers establishments with paid employees that operated during at least part of the reference year. It is an aggregate historical baseline, not a current named-business directory.
- Nonemployer businesses and most self-employed people are not covered.
- Census disclosure avoidance and publication thresholds cause suppressed fields and omitted rows.
- A published ZBP ZIP is evidence of employer activity during the reference year, not proof that the ZIP is currently active in the USPS master list.
- A ZCTA polygon does not prove USPS validity and is not an exact delivery-route boundary.
- The credential-gated HUD-USPS crosswalk will add quarterly current ZIP evidence, but HUD documents that it excludes PO Box-only ZIPs and a small number of ungeocoded ZIPs. A licensed USPS master source remains the only basis for claiming every valid ZIP.

The tracked dataset contract is [`config/datasets/census-zbp-baseline.json`](../config/datasets/census-zbp-baseline.json), and its source policy is [`config/source-policies/us-census-zbp.json`](../config/source-policies/us-census-zbp.json).
