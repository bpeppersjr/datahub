# U.S. geography foundation

`us-census-geography` is the shared spatial reference for Co*Tive Collector. It produces geocoded polygons for the United States, every Census state-equivalent area, every county/county equivalent, and every 2020 Census ZIP Code Tabulation Area (ZCTA).

The tracked dataset catalog contract is [`config/datasets/us-census-geography.json`](../config/datasets/us-census-geography.json). It lets other modules discover the runtime pointer and partition/index layout without hard-coding a release ID.

## Build

The complete build is explicitly network- and storage-intensive. It queries official Census TIGERweb services and writes all runtime data inside `datahub/data/geography`:

```powershell
npm run geography:build
```

Use the small verification build before changing acquisition logic:

```powershell
npm run geography:build -- --sample
```

Generated releases are ignored by Git. `data/geography/current.json` points to the immutable current release and its `manifest.json`. Every source or derived artifact in a release is checksummed in that manifest.

Verify the current release without contacting Census:

```powershell
npm run geography:verify
```

Pass a sample pointer or a release manifest as the first argument to verify a different release.

## Layout

```text
data/geography/
|-- current.json
|-- .staging/<run-id>/
`-- releases/<release-id>/
    |-- manifest.json
    |-- source/
    |   |-- states.geojson
    |   |-- counties/state=<state-fips>.geojson
    |   `-- zctas/prefix=<first-digit>.geojson
    `-- derived/
        |-- nation-all-census-us-areas.geojson
        |-- nation-50-states-and-dc.geojson
        `-- index/
            |-- states.jsonl
            |-- counties.jsonl
            `-- zctas.jsonl
```

The source GeoJSON keeps Census-native fields. Normalized JSON Lines indexes add stable typed IDs, numeric area fields, Census centroid and internal-point coordinates, bounding boxes, source feature IDs, and the file containing each geometry.

## Spatial ZIP polygon denominator

For ZIP-shaped spatial coverage, Co*Tive Collector uses the complete selected Census-published ZCTA5 polygon set as its authoritative spatial denominator. This authority is deliberately narrow: it applies to the declared Census ZCTA layer and vintage, not to the universe of USPS ZIP Codes or to delivery geography.

A release qualifies as the denominator only after independent verification confirms `complete_national_release: true`, validates every selected ZCTA artifact, and reconciles `coverage.zctas` exactly to `coverage.source_available_counts.zctas`. Consumers pin the geography release and manifest checksum and label percentages with that exact Census ZCTA5 denominator and vintage. The polygons are direct Census-published geometry, so no probabilistic confidence percentage is attached.

USPS operational ZIP evidence is optional supplemental routing evidence. Its absence does not block the Census ZCTA5 spatial denominator, and its presence does not create or change polygon geometry. ZIP+4 is a routing/address refinement and has no polygon in this contract.

## Boundary semantics

- States and counties use the TIGERweb **Current** layers as of retrieval.
- ZCTAs use the **2020 Census** layer; Census continues to use 2020 ZCTA geography in its current service.
- A ZCTA is a statistical approximation of a generalized ZIP service area. It is not a USPS routing boundary.
- Some valid USPS ZIP Codes—especially unique and PO Box-only ZIPs—have no polygon.
- ZCTAs can cross state and county boundaries. Assign them by spatial overlay when a downstream use needs jurisdiction shares; do not infer a state from the ZIP digits.
- Geometry is requested in EPSG:4326 and generalized by 0.0001 degrees by default, roughly 11.13 meters at the equator. Use full TIGER/Line data for survey-grade work.

The governed many-to-many spatial overlay is published separately as [`us-census-zcta-jurisdiction-crosswalk`](ZCTA-JURISDICTION-CROSSWALK.md). Its area weights must not be represented as population, address, establishment, or business allocation.

The record contract is maintained in [the skill schema](../.codex/skills/build-us-geography/references/schema.md). Source policy is in [`config/source-policies/us-census-geography.json`](../config/source-policies/us-census-geography.json).
