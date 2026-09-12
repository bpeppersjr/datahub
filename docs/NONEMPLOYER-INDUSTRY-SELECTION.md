# Explicit nonemployer industry selection

`runner/nonemployer-industry-selection.mjs` exposes a frozen, versioned selector and retained-data consumer adapter. It does not edit the existing alignment reader, app category definitions, acquisition configuration or production pointers.

## Consumer interface

`getNonemployerIndustrySelectionCatalog()` returns five reviewed choices with exact retained source labels, classification level, official classification URL, scope warning and context-only app category reference. Context is not an equivalence or a business-record NAICS assignment. No option is selected by an app category automatically.

`readSelectedNonemployerIndustry({naicsVersion:'2022',referenceYear:2023,naics:'4451',states:['17'],signal})` invokes the existing pinned retained reader once. The result embeds its complete immutable `alignment` unchanged, including official national denominator, filtered state rows, all-51 reconciliation, flags, source hashes and local-review policy. Omitted states displays all 51; empty states displays none without changing the national denominator. Explicit single-code selection rejects arrays, combined codes, aliases, arbitrary codes/years, source overrides and extra fields. Thus overlapping NAICS parents and children cannot be summed through this API.

The separately named fixture adapter uses the existing data/tmp-confined fixture reader and retains `synthetic-test-input`; it cannot select the native reader or claim transport authenticity. Neither path writes, downloads, refreshes or uses a mutable pointer. Tests establish pre-abort here; underlying alignment tests separately cover mid-decompression cancellation.

## Reviewed choices and boundaries

| Published NES code | Retained label | Classification level | Context only |
|---|---|---|---|
| 44-45 | Retail trade | Sector | Retail/consumer source cohorts are not the sector universe. |
| 4451 | Grocery and convenience retailers | Industry group | Includes vending machine operators; not grocery-only or verified physical stores. |
| 45611 | Pharmacies and drug retailers | NAICS industry | Not all healthcare/NPPES organizations or verified physical pharmacies. |
| 62441 | Child care services | NAICS industry | Not equivalent to state licensed-center-only cohorts. |
| 23 | Construction | Sector | Not contractor credential rows or employer establishments. |

The retained national total-cell roster was inspected before implementation. It publishes these levels; this catalog deliberately does not invent equivalent 445110/456110/624410 cells or silently substitute a parent when a requested code is unavailable. Static labels preserve the observed NES spelling; they are not a live classification lookup. The existing alignment reader verifies code/year/provenance but does not return labels; this adapter does not claim a new per-read label check.

Classification evidence reviewed September 12, 2026: [Census 2022 sector list](https://www.census.gov/programs-surveys/economic-census/data/tables/industry.html), [4451 definition](https://www.census.gov/naics/?details=4451&input=4451&year=2022), [Census pharmacy classification](https://www.census.gov/naics/?details=456110&input=45&year=2022), and [Census identification of 62441](https://www.census.gov/newsroom/stories/childs-day.html). The five-digit 62441 industry is also represented in the retained NAICS2022 rows. Official classification documentation is not evidence that the app's source cohorts have matching population scope. No employer Economic Census counts enter this adapter.

## Native retained-only compatibility proof

After six focused tests and lint passed, five sequential explicit reads used MAIN's retained files read-only via child `DATAHUB_ROOT`, with fetch disabled and a cooperative 180-second signal deadline. No source archive replay, network request, acquisition or pointer change occurred. Each selected only Illinois for display while preserving the complete 51-state reconciliation. All five national/state total sets were published, unflagged and reconciled with zero residual.

| Code | Official 2023 NES national count | Illinois count | Illinois national share |
|---|---:|---:|---:|
| 44-45 | 2,081,566 | 83,615 | 4.016927640055612% |
| 4451 | 73,117 | 2,369 | 3.240012582573136% |
| 45611 | 9,138 | 259 | 2.8343182315605167% |
| 62441 | 533,596 | 27,456 | 5.145465858064903% |
| 23 | 2,917,631 | 94,739 | 3.247120694837695% |

Manifest: `data/business-baselines/census-nonemployer/releases/census-nonemployer-2023-20260830-230249716Z-78268f89/manifest.json`, SHA256 `7ebdba43630506d1c6bf859fdc91fe57566c0d0b95c4b8f872c40c2c71670f06`.

- `derived/industry/national.jsonl.gz`: 133,669 bytes / 6,412 rows, SHA256 `9b0afbc8c1afd52dcf12e2bc49bc6af642a3b0abc2eb925ead61f9c4f9c5406f`.
- `derived/industry/state.jsonl.gz`: 2,352,418 bytes / 94,825 rows, SHA256 `e9ca23af356cda3f12de164165f633252145601e66405797f082ab4ca80f6a14`.

These are annual nonemployer establishments, not named businesses collected, active operations, employer establishments, credentials or ZIP allocations. Do not sum table rows: retail is a parent of grocery/pharmacy. Collection completeness remains null. UI adoption remains separate; callers should expose exact code/year/population and scope warnings alongside every percentage.
