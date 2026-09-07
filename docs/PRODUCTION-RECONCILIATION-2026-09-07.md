# Production reconciliation — September 7, 2026

## Launch authority and source gate

The normalized-US-postal source cutover committed as `20260907153645547-16d08121-7703-4d69-bcfc-9e75a5a36ffa`, state revision 53. The independently inspected production cohort reports 25/25 ready, zero blocked, zero rebuild-required, zero candidate pointers used, and frozen-plan SHA-256 `84738a309d340703420bd42ab56aefec583a34cb855ac83fcf42e08e0134a848`.

The authorized production downstream chain uses only existing local source releases. It performs no source acquisition or download, supplies no entity-resolution approval override, preserves unresolved coverage gaps, and leaves the benchmark in `awaiting-independent-labels` with its gate false unless independent labels are separately supplied through the governed workflow.

## Pre-launch production downstream pointers

| Layer | Release selected before launch | Updated at | Status |
| --- | --- | --- | --- |
| Registry | `national-business-registry-20260902-043657439Z-c1eab4dd` | `2026-09-02T04:36:57.439Z` | `published-partial` |
| Resolution | `business-entity-resolution-20260902-075624674Z-881e778c` | `2026-09-02T07:56:24.674Z` | `published-reviewable-partial` |
| Benchmark | `business-entity-resolution-benchmark-sample-20260902-075956925Z-c5f3d239` | `2026-09-02T07:59:56.925Z` | `awaiting-independent-labels` |
| Coverage | `national-business-coverage-views-20260902-115337634Z-ba689784` | `2026-09-02T11:53:37.634Z` | pointer carries no status field |

No duplicate registry, resolution, benchmark, or coverage builder/verifier process was present immediately before launch.

## Exact fail-fast chain

```powershell
node scripts/check-normalized-us-postal-migration.mjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm run registry:build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm run registry:verify
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm run entity-resolution:build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm run entity-resolution:verify
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm run entity-resolution:benchmark:build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm run entity-resolution:benchmark:verify
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm run coverage-views:build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm run coverage-views:verify
exit $LASTEXITCODE
```

Every command uses its production default pointers and output root. A downstream stage starts only after the preceding independent verifier exits zero.
