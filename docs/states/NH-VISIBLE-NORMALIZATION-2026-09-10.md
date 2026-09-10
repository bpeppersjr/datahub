# New Hampshire offline address normalization

The six retained ZIP 03755 childcare source records now have six parsed addresses in a separate `nh-visible-results@1.1.0` normalization bundle. No source requests were made. The original native receipt, source address lines, identifiers, policy and observation timestamp remain unchanged; the historical 1.0.0 parser remains replayable.

## Retained evidence

- Source: [native visible-result receipt report](NH-RETAINED-VISIBLE-03755-2026-09-10.md).
- Original observation time: `2026-09-10T17:57:56.067Z`.
- Normalization run: `f0a36862-cb37-445c-be1c-5c5fa526138d`.
- Manifest: `data/business-sources/nh-childcare/visible-normalizations/f0a36862-cb37-445c-be1c-5c5fa526138d/manifest.json`.
- Manifest SHA-256: `938dca54e4c6dda0f47f368237855b7771aaa7d5d8db80f8fdc29bea51f6cb19`.
- Counts: six source rows, six parsed addresses, zero ZIP4 values, zero source coordinate pairs.

Normalization recognizes the literal full state label in a complete city/state/postal line. Address ZIP5 values come from the source address, not the search ZIP. ZIP4 remains a separate nullable field. Redacted, incomplete or malformed addresses remain unresolved. Names and addresses are not published in this Git report.

## Publication and recovery

The standalone CLI `scripts/normalize-nh-childcare-visible.mjs` supports `--run` for a new offline build and `inspect --manifest ABSOLUTE_PATH` for verification. For this already published run, use inspection, not another build. It accepts only the pinned retained source and publishes a run-scoped manifest after bounded validation; it is not a general source collector or scheduled job.

The first build published the artifact but exited unsuccessfully because its final inspector treated access-time changes caused by reading as file mutation. The inspector was corrected to compare stable identity and mutation fields, hashes, directory contents and deterministic bundle content. Independent inspection then accepted the **same** artifact; it was not rewritten or republished.

An isolated fixture proves that an extra pending-publication link or altered normalized counts causes rejection while retained source bytes remain unchanged. This simulates the observable interrupted state; it is not timing fault injection or automatic crash recovery. Failed/pending artifacts require inspection and are preserved.

## Boundaries and next step

This is internal retained-data normalization, not national production promotion, statewide completeness, independent source authentication or proof of current operations/physical premises. Latitude and longitude remain null. No entity geometries are added, no national pointer changes, and no public export is authorized. Oklahoma's failed query is not retried.

The next prerequisite is the separately versioned [parameterized ZIP-query evaluation contract](NH-PARAMETERIZED-QUERY-CONTRACT-2026-09-10.md). A collection-ready NH adapter and app-owned operation must still distinguish source acquisition from retained reprocessing and preserve policy, cancellation, limits and terminal receipts. This fixed sample alone does not authorize a statewide crawl. Rollback removes the new normalizer/CLI without deleting either historical source or normalized artifacts.

## Verification

All seven focused tests passed with the actual retained source and normalized manifest enabled, including independent repeated reads and isolated publication/tamper rejection. TypeScript checking passed; the production dependency audit reported zero vulnerabilities.

Full `npm run check` exited successfully: 1,789 tests, 1,778 passed, 11 skipped, zero failures; lint, web/desktop builds and desktop control-plane smoke passed. Log: `data/tmp/nh-visible-normalization-check.log`. Available PDF, Iowa reporting, retained-cohort, Overture runtime, Oklahoma spatial inventory, offline NH DOM, native retained NH and normalized-manifest checks were enabled. The full log includes the final isolated recovery fixture test passing. These checks do not prove broader source coverage or geocoding.
