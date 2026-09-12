# Credential heatmap backend view

Independent backend adapter only. `runner/credential-heatmap-view.mjs` does not register an endpoint, change business map categories/counts, launch the app, query a source or write a cache. Server/UI adoption remains a separate reviewed step.

## Three-file state geometry contract

The native geometry loader selects the fixed previously reviewed release `us-census-geography-20260830-132803990Z-3629abc0`, not `data/geography/current.json`. Its manifest SHA-256 is `5426cae150c0fba64f8ff43a48ca39c4e78b5b4ba8a8007fbd211615540d1c8b`.

Only these three files are read, then rehashed in reverse order with the manifest last:

| File relative to the release | Bound | Reviewed descriptor |
| --- | --- | --- |
| `manifest.json` | 1 MB | Exact fixed manifest hash |
| `derived/index/states.jsonl` | 100 KB / 56 records | 28,228 bytes; SHA-256 `1be852f9ad38113b0be04e6936b1de402bf3718837c452b8496f926d1edde806` |
| `source/states.geojson` | 8 MB / 56 features | 4,668,640 bytes; SHA-256 `5a285e53f248e8aae71ca5c597aea443754127f4aacdc36afdfb12c084bb8b6d` |

Descriptor hashes/counts come from the exact manifest. Existing `mnSelectionReadJson`/`mnSelectionReadLines` enforce app containment, no aliases, single-link files, fatal UTF-8 decoding and stable bounded reads. Cross-file reverse rereads require unchanged bytes and identity. No ZCTA, county, business coverage or source geometry acquisition occurs.

The loader requires EPSG:4326 and known FIPS/postal pairs. All source features, including five territories, are structurally validated; duplicate or contradictory identities reject. Polygon/MultiPolygon rings must be finite, geographically bounded and closed, with at most 500,000 coordinate positions across the collection. The existing normalized state-index projection is replayed against each matching source polygon. Only 50 states/DC are displayed. Valid territory identities are explicitly listed as excluded. Missing index/polygon joins are null-geometry display gaps, not zero counts; test fixtures exercise those gaps even though the fixed release declares all 56.

Synthetic geometry input is restricted to `data/tmp`, marked synthetic, and cannot mint native geography evidence.

## View and lifecycle API

`createCredentialHeatmapView()` returns `get(filters, options)` and `close()`. Filters accept only optional two-letter reported `state` and one of the five credential `category` labels. Options accept only `signal` and boolean `recheck`. Unknown keys, county IDs, arbitrary paths and business filters reject before any loader starts. Omitted category means all credential categories, never the business map's `all` bucket.

An explicit first load builds the fully verified retained aggregate and fixed geometry concurrently. Subsequent filters reuse one immutable in-memory snapshot. `get({}, {recheck:true})` invalidates the previous snapshot and starts a new generation; simultaneous rechecks share that generation. A recheck during an initial build cancels/supersedes the older generation. Failure leaves unavailable/null counts until another explicit recheck; ordinary reads do not silently retry or display stale evidence as newly verified. Source observation time and successful verification time are separate.

Each waiter has independent cancellation. One leaving caller does not abort the shared build while another waits. Once all leave, the build controller aborts; a late result cannot publish. A default 180-second deadline resolves unavailable and aborts underlying work. Generation guards prevent superseded, timed-out or closed builds from publishing.

At most one physical snapshot/geometry loader pair can remain outstanding. If cancellation or recheck supersedes a noncooperative pair, further reads/rechecks return `busy-cancelling-prior-build` with unavailable counts until both loaders settle; they cannot accumulate parallel abandoned builds. There is no automatic queued replacement or forceful termination claim. Retry an explicit recheck after settlement.

`close()` immediately stops admission, drops the snapshot and aborts pending callers/builds. Its promise waits up to one second for all outstanding loader promises, including abandoned generations, and reports `loaderCleanup: settled` or `unverified-timeout`. It does not claim forceful cancellation of noncooperative injected code. Native loaders use cooperative cancellation and close file handles in their existing `finally` blocks. A future server adapter must await `close()` during shutdown and handle its reported boundary. No retry or background refresh is scheduled.

Dependency injection is limited to tests/service construction; any custom snapshot or geography loader marks all successful responses synthetic. Network transport or request parameters cannot select a loader.

## Response semantics

`nationalStates` always contains the full 51-state category projection, independent of selected-state filtering. Each row has a canonical state/FIPS label, selected category heat count, full-cohort percentage, applicable category-within-state/state-share-of-category percentages and explicit geometry status. Business counts and demographic denominators are absent.

`postalGroups` and `summary` use the selected reported state/category. Missing ZIP remains a null-ZIP group; same ZIP in different reported states remains distinct. ZIP membership in existing views remains not-evaluated/null. Geometry gaps never subtract from summaries. All percentages retain the aggregate's full-cohort or explicitly named state/category denominators. Original source integration false remains immutable; this adapter does not assert a new downstream publication proof. All use remains local-review-only with unknown business/site/completeness counts.

## Verification boundary

Focused fixtures passed twelve tests and owned ESLint. Coverage includes rehashed invalid geometry/identities, hash and hardlink rejection, missing joins, territory exclusion, full national versus selected postal projections, independent/all-gone cancellation, immutable snapshot reuse, explicit failed recheck, generation protection, coalesced/superseding rechecks, repeated noncooperative cancellation/recheck attempts without physical pair accumulation, settled versus unverified-timeout close, and pre-load filter rejection. Initial validation was fixture-only; the subsequently authorized native proof is recorded below. No main/server/UI edits, runtime launch, full check, downloads or commits are claimed here.

## Authorized native retained-only proof

One view build completed at `2026-09-12T13:47:32.368Z` with all network entry points disabled and a 180-second cancellation deadline. Instrumented file-open/read guards allowed only the three declared geography files; no county, ZCTA or ZIP index was read. The full retained credential loader ran once. Subsequent MN and MN/residential-building-contractor reads reused generation 1 without rechecking source rows or geometry.

The proof confirms 56 validated index records and 56 validated source features, 51 displayed state/DC values, and five excluded territory FIPS (`60`, `66`, `69`, `72`, `78`). State and postal sums each conserve 11,456 credential rows. Reported MN has 10,899 rows; its residential-building-contractor subset has 10,374. The one missing ZIP remains included, existing ZIP-view membership remains unknown, and no state geometry gaps exist for this pinned snapshot. All credential, business-identity and geography-assignment restrictions remain unchanged. `close()` reported loader cleanup settled.

Aggregate-only proof (no polygons or source rows): `data/tmp/credential-heatmap-view-proof/proof-20260912.json` in the isolated Maine checkout; SHA-256 `206e9bffc502d9431078186645acd203d2d3e51a3705b150eec3428b97ba1e68`. Credential selection/reporting/artifact pins match the prior retained heatmap proof, and geography hashes match the contract above. Source observation remains September 8, not the verification date. Endpoint/UI adoption and full application verification remain pending.
