# USPS City State offline package admission

Co*Tive has a protected, offline-only managed-operation path for an operator-supplied licensed USPS City State projection. The capability performs no network request and grants no license, permission, production admission, redistribution right, current pointer, deliverability claim, or ZIP/ZCTA equivalence.

The accepted directory must be one direct or nested child of `data/imports` and contain exactly `manifest.json`, `authorization.json`, `source-declaration.json`, `status-mapping.json`, and `projection.jsonl`. Files are copied with byte limits and stable-identity checks into the operation directory before parsing. JSONL must be fatal UTF-8, use LF only, end in LF, contain one closed object per line, be strictly sorted by unique ZIP5, cover all standard, PO Box, unique, and military classes, and have a reviewed status mapping for every and only every observed status. ZIP+4, ZCTA geometry, and deliverability are absent.

Both approval registries are intentionally empty:

- `config/usps-city-state-authorization-registry.json`
- `config/usps-city-state-projection-schema-registry.json`

Consequently no real package can currently pass. Adding an approval is a separate reviewed governance change requiring evidence of the operator's applicable license or written permission and an authenticated source-layout/transformation receipt. A package's own authorization statement is insufficient.

When those prerequisites eventually exist, a successful operation preserves a pointer-free local-restricted package release, creates the existing metadata-only admission, builds the existing four-class candidate, and independently replays both. It never writes a current pointer or enrolls production.

The local API accepts only:

```json
{"packageDirectory":"data/imports/<directory>"}
```

at `POST /api/data-operations/usps-city-state-admissions`. The request remains behind the shared control-plane authorization guard.
