# Overture U.S. Places connector

## Purpose

`overture-us-places` provides a governed nationwide place-evidence layer for Co*Tive Collector. It selects Overture Places records that have at least one source-reported U.S. address, excludes source records marked `permanently_closed`, minimizes the source fields, and emits source-preserving physical-site and establishment candidates.

This is not a census of legal businesses. Overture Places also covers institutions, public facilities, cultural and recreational destinations, and geographic places. The connector never converts the source category or operating status into an unsupported claim that a record is a commercial, active, or legally registered business.

## Spatial boundary

The geography and business models remain separate:

- governed polygon geometry belongs only to the U.S., state, county, and ZIP/ZCTA geography layers;
- a business/place record stores only `geocode.latitude` and `geocode.longitude` from the Overture place point;
- `geometry` and `bbox` are removed during source preparation and are forbidden in selected and normalized artifacts;
- `zip_code` contains ZIP5 and `zip4` contains the separate optional four-digit suffix;
- no joined ZIP+4 value is created in the normalized dataset.

The coordinate is associated with Overture's place and reported address. It is not represented as a parcel, footprint, or address-range geometry.

## Safe acquisition sequence

The metadata-only preflight is safe to run and does not read the place GeoParquet data:

```powershell
npm run overture-us-places:preflight
```

On 2026-09-03 the live preflight pinned release `2026-08-19.0`, 16 immutable place assets, 73,631,092 declared global rows, and STAC fingerprint `36e62492e9474442b81f1f7bc3efc8b5d49308c75fe33c943169852abfa7f64f`. Those are global catalog counts, not U.S. or business counts.

Remote preparation is intentionally blocked unless the operator supplies the exact explicit confirmation shown by `--help`. This is a large cloud query and may consume substantial bandwidth, disk, CPU, and time. It uses DuckDB predicate and column pushdown and does not retain the global GeoParquet files.

```powershell
npm run overture-us-places:prepare -- --release 2026-08-19.0 --authorize-large-acquisition I-APPROVE-OVERTURE-LARGE-ACQUISITION
```

That authorization has **not** been exercised. No Overture place records have been downloaded or published.

Preparation writes an immutable minimized `selected-us-places.jsonl.gz` plus `source-metadata.json` under `downloads/overture-us-places`. It selects only:

- GERS ID and feature version;
- source operating status and relative existence confidence;
- primary/common name, Overture taxonomy, and basic category;
- websites and selected brand fields;
- one source-reported U.S. address;
- latitude and longitude derived from the source point bounds;
- source dataset, record ID, update time, confidence, and license provenance.

It excludes geometry, bounding boxes, emails, phone numbers, social URLs, and all unselected addresses before the selected snapshot is staged.

After preparation, build from the two exact returned paths:

```powershell
npm run overture-us-places:build -- --source downloads/overture-us-places/<prepared-release>/selected-us-places.jsonl.gz --source-metadata downloads/overture-us-places/<prepared-release>/source-metadata.json
npm run overture-us-places:verify
```

The builder validates the prepared checksum, complete Census ZBP prerequisite, exact selected-field contract, unique GERS IDs, taxonomy invariants, coordinate range, U.S. address selection, source provenance, quarantine threshold, ZIP aggregate reconciliation, artifact checksums, and the no-geometry/no-contact-field policy before atomically changing `current.json`.

## Status and classification semantics

- `open` becomes `source-indicated-continued-operation`; it is not current-hours or legal-status evidence.
- `temporarily_closed` remains a source-indicated temporary hiatus.
- an unreported status stays unreported.
- `permanently_closed` is excluded during remote preparation and quarantined if it appears in supplied input.
- `confidence` remains Overture's relative existence signal, not a calibrated probability or completeness measure.
- taxonomy top levels are retained for heat maps and drill-downs. The derived place scope is a candidate/context class only; `commercial_business_asserted` is always false.

## Licensing and attribution

Overture publishes the Places theme under source-specific permissive licenses. The current documented contributors use CDLA-Permissive-2.0, Apache-2.0, or CC0-1.0 terms. Foursquare data requires its Apache-2.0 NOTICE handling. Each normalized record retains source dataset and record identifiers plus the applicable mapped license class.

Record-level normalized output defaults to `local-review-only`. Every release includes `legal/NOTICE.txt`; it must travel with covered derivatives. Aggregate ZIP/category/status counts may be published only with Overture attribution, applicable source attribution/NOTICE, exact release/checksum provenance, and the connector's semantic limitations.

Primary references:

- [Overture Places guide](https://docs.overturemaps.org/guides/places/)
- [Overture Place schema](https://docs.overturemaps.org/schema/reference/places/place/)
- [Overture taxonomy schema](https://docs.overturemaps.org/schema/reference/places/types/taxonomy/)
- [Overture data quickstart](https://docs.overturemaps.org/getting-data/)
- [Overture attribution and licensing](https://docs.overturemaps.org/attribution/)
- [Overture STAC catalog](https://stac.overturemaps.org/catalog.json)

## Verification evidence

The offline test suite covers:

- latest-release and immutable-asset STAC validation;
- redirect and hostile-host rejection;
- mandatory large-acquisition authorization;
- selected-field and no-geometry contracts;
- coordinate and separate ZIP5/ZIP+4 normalization;
- candidate/status non-overstatement;
- source-provider license provenance;
- quarantine, duplicate, cancellation, checksum, count, ZIP aggregate, and atomic-publication behavior.

Rollback is code-only until an operator authorizes a source run. To roll back the connector, revert its runner, scripts, manifest, policy, schema, tests, documentation, package scripts, and DuckDB dependency. A future published release can be rolled back by atomically repointing `data/business-sources/overture-us-places/current.json` to a previously verified manifest; immutable releases should not be deleted.
