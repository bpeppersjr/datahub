# Governed business flat-file export

`scripts/compose-flat-business-export.mjs` streams selected national business-registry location profiles to CSV, JSONL, or both without loading partitions into memory.

Example local-review export:

```powershell
node scripts/compose-flat-business-export.mjs --category retail-consumer --state TX --field business_name,street,city,state,zip_code,zip4,latitude,longitude --policy-mode local-review
```

The default `public-only` mode emits only the explicitly recognized record policies `public`, `public-open-ny-terms`, and `public-factual-fields-with-source-limitations`. Any missing, unknown, restricted, or local-review policy is rejected. `--policy-mode local-review` must be explicitly supplied to include `local-review-only` records; it still rejects unknown or more restrictive policies. These files remain local artifacts and are never a public publication action.

Category IDs and source IDs match `runner/business-map-store.mjs`. ZIP5 and ZIP+4 are separate columns, and latitude/longitude are emitted only as a valid pair. CSV values beginning with spreadsheet formula-control characters are prefixed with an apostrophe; ZIP strings retain leading zeroes. Selected columns always gain the mandatory row-provenance fields so every row remains traceable.

Each input must be a published governed pointer or release manifest. Every input artifact is checked against its declared byte count and SHA-256 before reading. Output is written beneath `datahub`, using stream backpressure. CSV/JSONL and summary hashes are recorded in `manifest.json`; that manifest is atomically renamed into place last and is the publication marker. On failure the incomplete run directory is removed.

Run `node --test runner/business-flatfile.test.mjs` for the offline fixture suite. The Windows launcher is `export-business.bat`; invoking it without arguments shows help. `npm run business:export -- <options>` is equivalent. Exports read source releases without modifying them; the current implementation scans every profile partition even when selecting one state.

Verify completed outputs with `npm run business:export:verify -- <manifest-path>`. This independently checks artifact bytes and hashes, CSV and JSONL row counts, selected columns, split postal fields, and paired coordinate ranges. It does not establish business accuracy or national completeness.

Live verification on September 7, 2026 exported 24,230 existing New York retail-food profiles from the production registry to `data/exports/flat-business/builds/ny-retail-food-20260907-verification/`. CSV and JSONL each contain 24,230 records and all three artifact hashes passed independent verification. This local-review export reflects the pinned production registry, not the newly acquired isolated source releases. A large-stream regression additionally verifies more than eleven backpressure cycles without accumulating error listeners.
