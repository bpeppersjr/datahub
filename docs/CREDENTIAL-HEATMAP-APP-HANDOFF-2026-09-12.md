# Credential heatmap app handoff

Status: isolated UI/endpoint implementation ready for integration review; not yet runtime-validated or published. The reviewed aggregate and view are included in the isolated integration base. The preceding File Builder release has completed validation; this next slice does not modify its credential export workflow.

## Implementation boundary

Add a distinct MN credential visualization mode to `app/business-intelligence.tsx`, backed by a small separate service adapter around `buildMnCredentialHeatmap` and `selectMnCredentialHeatmap`. Do not append credentials to existing business categories, business totals or `countsFor('all')`. Keep the existing business map unchanged when this mode is inactive.

The state choropleth represents reported-address state, not independently verified operating locations. Use the separately verified state geography and its exact state-code join. State selection scopes the category controls, reported-ZIP heat tiles and right-hand alignment summary together. Postal tiles must include missing ZIP and codes without known polygon membership. They are not ZIP polygons, county assignments or business points. Disable county navigation, business-name drilldown and demographic filters in this mode, with a visible reason. Preserve CTRL+scroll zoom on the state map.

Keep the summary on the right of the map. Show selected credential category, reported state/ZIP, credential-row count, share of the full accepted credential cohort, and the applicable within-state/category percentage with its denominator labeled. Do not label these percentages collection completeness. Missing geometry must not subtract rows from summary counts. The five source credential categories remain distinct, including observed zero counts; unknown data must not render as zero.

## Service and lifecycle

Reviewed module boundary: `runner/credential-heatmap-view.mjs` owns the snapshot and geographic evidence; `app/credential-heatmap.tsx` owns credential-specific controls/rendering. Restrict existing-file changes to endpoint/shutdown wiring in `runner/server.mjs` and mode selection in `app/business-intelligence.tsx`. Do not reuse business `getFeatures()`, `FeatureMap` or `EntitySummary` wholesale: they load unrelated indexes or carry business-specific accessibility and tooltip semantics. Reuse only neutral rendering mechanics.

Keep all 51 category-specific state values on the national choropleth while reported-state selection scopes postal tiles and the right-hand summary. A missing geometry join is a display gap, not a reason to remove credential rows from totals. Verify unique state FIPS/postal mappings and geometry identity against bounded, pinned state geography evidence; do not load county/ZCTA indexes for this mode.

Use one authenticated, closed-query endpoint for this mode rather than extending business-profile queries. Accept only the documented category and reported-state filters. Reject county, arbitrary paths, source URLs and business filters. Build the full verified retained snapshot once on explicit load/recheck, reuse its immutable aggregates for filter changes, and surface source observation time separately from verification time. Pin identity is snapshot evidence, not a perpetual freshness guarantee. A recheck failure must show unknown/unavailable and must not silently present stale data as newly verified.

Bound and cancel the build when the service shuts down or the caller abandons its initial request. Coalesce simultaneous initial reads without allowing one client's cancellation to mislabel another client's result. No source acquisition, automatic download or production-pointer update is part of this integration.

The service-owned build needs its own controller and waiter count: one departing caller must not cancel other callers; all departed callers or shutdown must abort underlying work. An explicit recheck starts a new generation, and late responses cannot replace newer state. Propagate browser fetch cancellation through the endpoint rather than merely hiding late UI updates. Test both single-caller and all-caller cancellation, failed recheck, shutdown and late-generation responses.

## Acceptance evidence

- Existing business mode totals, state/county/ZIP navigation and right-hand summary remain unchanged.
- Mode switches clear incompatible filters and stale selection; delayed responses cannot cross-label the other mode.
- Native selected cohort has 11,456 credential rows: reported MN 10,899 and other reported states 557. State and postal-group sums each conserve 11,456. These are pinned-cohort expectations, not universal source constants.
- Missing ZIP remains visible; existing ZIP-view membership remains unknown. Repeated credential identifiers are not deduplicated into inferred businesses.
- Category/state filtering preserves full-cohort denominators; unknown and published zero remain distinguishable.
- Demonstrate 100% and 200% text sizes, right-hand summary, state click, category change, keyboard interaction, CTRL+scroll zoom and unavailable-evidence handling.
- Execute `stop-collector.bat` before runtime tests, verify successful relaunch, and leave the app available. Run the shared release checks before publication.

The native aggregate proof is recorded in the service contract. This handoff does not claim UI integration, endpoint availability, complete nationwide collection, current operations or new source authorization.

## Isolated implementation evidence

The new `app/credential-heatmap.tsx` and scoped stylesheet render a distinct credential mode. The existing business component is unchanged internally and unmounted on mode switches, resetting incompatible selections. Credential state/category changes withhold stale results, abort superseded requests and clear selected ZIP. The national state map retains all 51 category-specific observations; reported-ZIP tiles, including missing ZIP and observed zeros, synchronize the separate right-hand summary. Keyboard selection and CTRL+scroll zoom have focused interaction coverage. Large-text layout uses relative units and a separate map/summary grid; actual 100%/200% desktop validation remains pending.

`runner/credential-heatmap-http.mjs` is wired behind the shared control-plane guard at `/api/credential-heatmap`. GET uses the snapshot; empty POST explicitly rechecks. Only single `state` and `category` query values are accepted. Body-bearing framing, unsupported methods, duplicates and unrelated filters reject. The adapter rejects nonzero Content-Length or Transfer-Encoding before body iteration and closes rejected-body connections, avoiding unbounded body waits and iterator-triggered socket destruction. Disconnects abort the caller's waiter; the shared service retains its independent-waiter lifecycle. Shutdown awaits `close()` and warns if bounded cleanup was not verified.

Focused tests passed 32/32 with no skips: aggregate and view contracts, existing business rendering, mode replacement, credential controls/denominators/zeros, late-response cancellation and real authenticated loopback HTTP body/disconnect handling. The first real HTTP regression reproduced the nonempty-body timeout before the fix. Type-check and owned ESLint passed. Focused log: `data/tmp/credential-heatmap-focused.log` in the isolated `heatmap-app-integration` checkout. No source calls, new native aggregate build, production pointer change, running-app restart or global full check occurred in this isolated slice. Runtime and combined release verification remain required. Coding/testing used the disclosed Astra fallback while Spark was unavailable.
