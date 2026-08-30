# USDA SNAP retailer connector

This connector publishes the first national named-business source in the registry program: the public USDA SNAP Retailer Locator snapshot of currently SNAP-authorized locations.

```powershell
npm run zbp:verify
npm run snap:build
npm run snap:verify
```

The source is a public, anonymous, read-only ArcGIS Feature Service. The builder captures item and layer metadata, freezes the data-edit timestamp, and pages by `ObjectId`. If the source changes before acquisition ends, the run fails rather than mixing snapshots.

## Output

```text
data/business-sources/usda-snap/
|-- current.json
`-- releases/<release-id>/
    |-- manifest.json
    |-- source/
    |   |-- item.json
    |   |-- layer.json
    |   `-- features.jsonl.gz
    |-- derived/
    |   |-- retailers/prefix=<first-zip-digit>.jsonl.gz
    |   |-- zip-coverage.jsonl
    |   `-- source-summary.json
    `-- quarantine/records.jsonl.gz
```

Each normalized record preserves USDA `Record_ID`, name, address, ZIP/ZIP+4, county, store type, coordinates, incentive program, field lineage, source release, ingest run, transformation version, and policy. It creates provisional physical-site and establishment candidate IDs; it does not guess organization, brand, or parent-company identity.

`zip-coverage.jsonl` reports the SNAP retailer count over the complete ZBP/ZCTA union. A zero means no retailer appeared in this complete SNAP source snapshot, not that the ZIP has no operating businesses.

## Status boundary

The source item describes its rows as currently SNAP-authorized and reports a recurring two-week update cadence. The normalized status is therefore `snap-authorized-as-of-source-update`. This is strong program-participation evidence tied to one owner/location permit, but it is not independent proof that a storefront is open at retrieval time.

Malformed identifiers, ZIPs, states, or coordinates are placed in quarantine. Publication is blocked if the quarantine rate exceeds one percent. Source, accepted, and quarantined counts must reconcile exactly.
