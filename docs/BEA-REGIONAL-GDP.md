# BEA regional GDP baseline

The `bea-regional-gdp` connector publishes annual state and directly matched county GDP measures from the U.S. Bureau of Economic Analysis CAGDP1 County GDP Summary. It supplies the economic enhancer used by the Heatmap Builder without treating GDP as a business count or collection-completeness score.

## Source and policy

- Official archive: `https://apps.bea.gov/regional/zip/CAGDP1.zip`
- Download catalog: `https://apps.bea.gov/regional/downloadzip.htm`
- Table: CAGDP1, County GDP Summary
- Policy: `config/source-policies/bea-regional-gdp.json`
- Publisher: United States Bureau of Economic Analysis
- Ownership: U.S. federal government public-domain aggregate data; BEA asks users to cite the agency as the source.

The connector accepts only the exact HTTPS host and archive path above, denies redirects, requires no secret, and limits both compressed and uncompressed input sizes. An operator may instead supply a previously downloaded `CAGDP1.zip`, but the CLI requires that file to remain inside `datahub`.

## Governed output

Each successful run creates an immutable release under `data/business-baselines/bea-regional-gdp/releases/<release-id>` and atomically updates `current.json` only after all gates pass.

| Artifact | Meaning |
|---|---|
| `source/CAGDP1.zip` | Checksummed source archive retained for reproducibility |
| `derived/state-gdp.jsonl` | Exact 50-state-and-DC FIPS matches |
| `derived/county-gdp.jsonl` | Exact matches to the pinned governed county GEOID index |
| `derived/coverage-gaps.jsonl` | Unmatched source areas and current governed counties without direct source rows |
| `manifest.json` | Release, source, geography dependency, coverage, quality, units, and artifact hashes |

The normalized record stores:

- current-dollar GDP from line 3, converted from thousands to dollars;
- real GDP from line 1, converted from thousands of chained 2017 dollars to chained 2017 dollars;
- the line 2 chain-type quantity index, where 2017 equals 100;
- `(NA)`, `(NM)`, or missing flags as a null measure plus the unchanged flag;
- source record, source release, ingest run, transformation, policy, and pinned geography release provenance.

Business entities are not produced by this connector, and no geometry is copied into GDP records.

## Geography boundary

The build requires a complete published `us-census-geography` release and verifies checksums for both its state and county indexes. State rows join only when the BEA GeoFIPS is exactly `<state FIPS>000`. County rows join only when the five-digit BEA GeoFIPS exactly equals a governed county GEOID.

BEA combined areas are not counties. In particular, Maui plus Kalawao and BEA's Virginia combined areas are retained as source-area gaps; their GDP is not duplicated onto any constituent county. Historical Alaska and Connecticut source geography that does not exactly match the current governed county index also remains a gap. Conversely, each current governed county lacking an exact BEA row gets its own governed coverage-gap record.

BEA CAGDP1 does not publish official ZIP-level GDP. The connector therefore emits no ZIP or ZCTA artifact and never allocates state, county, combined-area, regional, or national totals to ZIP polygons. Heatmap ZIP views must report GDP as `unavailable-no-official-zip-gdp-do-not-allocate`.

## Commands

After the package scripts are registered, build and verify the current release with:

```powershell
npm run bea-regional-gdp:build
npm run bea-regional-gdp:verify
```

To use an archive already inside the repository:

```powershell
node scripts/build-bea-regional-gdp.mjs --source tmp/bea-regional-inspect/CAGDP1.zip
```

The independent verifier recomputes every artifact hash, reparses the retained CAGDP1 archive, checks the pinned field/line/unit contract, compares normalized measures to source rows, rejects duplicate geography identifiers, reconciles direct matches and gaps, enforces quality floors, and rejects geometry or ZIP fields.

## Known limitations

- GDP is a lagged annual aggregate estimate. It is not evidence that a named business is currently operating.
- GDP must not be included in business-record completeness or relative collection-alignment denominators.
- Direct county coverage is intentionally incomplete when BEA publishes a combined or historical statistical area instead of the current county-equivalent shape.
- The reference year is the final continuous year column in the selected all-areas archive and is recorded in every normalized row and the release manifest.
