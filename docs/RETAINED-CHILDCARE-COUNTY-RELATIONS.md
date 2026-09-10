# Retained childcare: coordinate-derived county relationships

## Actual offline result

The standalone derivative accounts for all **12,206** retained childcare candidate rows and assigns **4,930 Pennsylvania source points to 66 Census counties**. The other 7,276 rows remain explicit gaps. No source records were downloaded again, no business geometry was added, and no national reporting pointer changed.

| Disposition | Candidate rows |
|---|---:|
| One county intersected by eligible PA source point | 4,930 |
| Missing source point | 4,028 |
| Unknown coordinate system (Iowa) | 1,476 |
| Source not enabled for this overlay version (Maryland) | 1,772 |
| Invalid, outside all county polygons, or ambiguous boundary | 0 |

These are source-candidate relationships, not distinct businesses, verified physical locations, or current operating establishments. The 66 positive county buckets do not imply that the remaining Pennsylvania county has no childcare businesses. Missing-point records and incomplete source scope prevent that inference.

- Run: `35c6318f-aa0b-4d21-acd4-9581dd660db4`.
- Created: `2026-09-10T18:30:17.735Z`; this is processing time, not a replacement source observation time.
- Manifest: `data/retained-childcare-county-relations/35c6318f-aa0b-4d21-acd4-9581dd660db4/manifest.json`.
- SHA-256: `68dfec10cde09b9e2be0fff07a7e4395ea12dc30f5207096af83755e7972887c`.
- Version: `retained-childcare-county-relations@1.0.0`.

## Evidence and interpretation

The loader independently replays the seven selected source chains through the published registry extension. It pins the registry manifest, Census manifest, Pennsylvania source policy and all 57 consumed county index/geometry artifacts. The existing Census release contains 3,235 county equivalents across 56 state/territory equivalents. Original candidate IDs, reported state, ZIP5 and separate ZIP4 are retained; county GEOID and derived state FIPS are additional relationship fields. No ZIP/ZCTA membership is inferred from a county polygon, and no reported address is overwritten.

The spatial lookup reuses the existing county-point routine with a strict numeric coordinate guard. The index handles antimeridian geometry. Missing/partial/invalid coordinates, unknown CRS, non-enabled sources, no match and shared boundaries remain distinct outcomes. Assigned rows retain a reported-state comparison; all 4,930 native assignments matched the PA reported state. Original observations, source assertions and notices remain in their immutable source chains referenced by the report's source bindings.

Only PA's EPSG:4326 source points are enabled in this version. Maryland's initial internal acquisition profile excluded inferred county/ZCTA membership; **this is not an identified publisher prohibition**. Inspection of retained preflight `data/business-sources/md-childcare/preflights/c0154770-2fbc-4fdf-92c4-fdee52e61824.json` (SHA-256 `aed115a076f53ae9c04dca57cbbd81a41940b64c6b2840f70a5555cfcc815914`) found a notice that anticipates derived data with Maryland acknowledgment and unchanged original metadata. A separately versioned derived-evidence policy can be reviewed without rewriting historical acquisition receipts. Iowa's retained CRS remains unknown; numeric values alone do not establish it.

## Standalone use and recovery

`node scripts/build-retained-childcare-county-relations.mjs --run` builds a new immutable offline derivative from the fixed pins. For the existing result, use `inspect --manifest ABSOLUTE_PATH`; do not rebuild or reacquire merely to verify it. No AI session, source API, recurring schedule or public export is required or enabled.

The output is a single bounded manifest (20 MB ceiling) published without overwrite after a temporary-file write and reread. Final inspection recomputes relationships from verified inputs and checks content hashes, stable file/directory identity, exact directory contents and creation chronology. Cooperative cancellation before publication cleans only the run's ownership-verified pending file/directory; unexpected contents or changed ownership prevent deletion. Published evidence, ordinary failures and crash-left staging require inspection; no automatic crash recovery is claimed. Source loading and spatial work are bounded in-memory operations, not an unlimited streaming pipeline or a process-wide RAM quota. Cancellation is checked between bounded operations.

Rollback stops consuming this derivative and reverts the new helper/CLI; preserve the original sources and generated run. Existing national county totals are unchanged. The next integration must version the county reporting extension/verifier and production successor explicitly, with all dispositions conserved and candidate counts separate from business completeness.

## Validation

Focused synthetic checks passed for point dispositions, coordinate coercion rejection, postal preservation, duplicate identities, geography metadata, antimeridian handling, cancellation/owned cleanup, path admission and creation chronology. The native build independently replayed the retained inputs and returned success.

Full `npm run check` exited successfully: 1,806 tests, 1,795 passed, 11 skipped, zero failures; lint, web/desktop builds and desktop control-plane smoke passed. Log: `data/tmp/retained-county-relations-check.log`. It includes the final owned-cleanup test and independent replay of the actual county manifest (46.8 seconds). Available PDF, Iowa reporting, retained-cohort, Overture runtime, Oklahoma inventory, offline NH DOM, retained NH and normalized-NH checks were enabled. TypeScript passed and the production dependency audit reported zero vulnerabilities. Oklahoma's approval scope stayed unchanged; no source retry, production promotion or cloud deployment occurred.
