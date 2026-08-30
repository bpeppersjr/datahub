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

## Boundary semantics

- States and counties use the TIGERweb **Current** layers as of retrieval.
- ZCTAs use the **2020 Census** layer; Census continues to use 2020 ZCTA geography in its current service.
- A ZCTA is a statistical approximation of a generalized ZIP service area. It is not a USPS routing boundary.
- Some valid USPS ZIP Codes—especially unique and PO Box-only ZIPs—have no polygon.
- ZCTAs can cross state and county boundaries. Assign them by spatial overlay when a downstream use needs jurisdiction shares; do not infer a state from the ZIP digits.
- Geometry is requested in EPSG:4326 and generalized by 0.0001 degrees by default, roughly 11.13 meters at the equator. Use full TIGER/Line data for survey-grade work.

The record contract is maintained in [the skill schema](../.codex/skills/build-us-geography/references/schema.md). Source policy is in [`config/source-policies/us-census-geography.json`](../config/source-policies/us-census-geography.json).
