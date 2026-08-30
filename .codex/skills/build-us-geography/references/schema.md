# Geography release schema

Read this reference when implementing a consumer, changing normalized fields, or evaluating backward compatibility.

## Release manifest

`manifest.json` is the publication boundary. Required top-level fields are `schema_version`, `dataset_id`, `connector`, `release_id`, `run_id`, `retrieved_at`, `status`, `complete_national_release`, `coordinate_reference_system`, `geometry`, `coverage`, `sources`, `limitations`, and `artifacts`.

Each artifact entry contains a release-relative `path`, byte length, and SHA-256 digest. Geometry artifacts also declare feature count, geography type, and partition or scope when applicable.

## Normalized index record

The JSON Lines indexes contain one object per geography. Fields are:

| Field | Meaning |
|---|---|
| `geo_id` | Typed stable ID: `state:<GEOID>`, `county:<GEOID>`, or `zcta:<GEOID>` |
| `geo_type` | `state`, `county`, or `zcta` |
| `geoid` | Census geographic identifier, retained as a string |
| `name` | Census display name |
| `postal_abbreviation` | State/territory abbreviation for state records only |
| `state_fips` / `county_fips` | Components for county records; never inferred for ZCTAs |
| `zcta` | Five-character ZCTA identifier for ZCTA records |
| `state_equivalent_kind` | `state`, `district`, `territory`, or `other_state_equivalent` for state records |
| `is_50_states_or_dc` | Scope flag for state records |
| `area_land_m2` / `area_water_m2` | Census area measurements |
| `population_2020` / `housing_units_2020` | Present when the selected Census layer provides them |
| `centroid` | Census longitude/latitude pair when provided |
| `internal_point` | Census internal longitude/latitude pair when provided |
| `bbox` | `[west, south, east, north]` in EPSG:4326 |
| `geometry_file` | Release-relative source GeoJSON partition |
| `source_feature_id` | Census service feature identifier |

Additive fields are backward compatible within schema version 1. Removing fields, changing meanings, changing coordinate order, or changing typed-ID construction requires a major schema version.
