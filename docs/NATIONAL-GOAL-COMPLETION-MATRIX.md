# National goal-completion matrix

`npm run goal-completion:build` creates an immutable local report beneath `data/national-goal-completion-matrix/releases/<release-id>`. It reads the current retained coverage pointer, its pinned state/source aggregates, the governed national reporting catalog and the retained IRS state summary. It performs no provider request, source download, production reconciliation, approval, current-pointer update or stale-assessment rewrite.

The report contains exactly the 50 states and District of Columbia crossed with the seven categories declared by the eight-source national reporting denominator plus a `general-business` goal category requiring one broad jurisdiction organization layer. Every category cell includes its governed datasets, state record availability, retained-reporting authorization basis, source and coverage release evidence, current temporal review status, ZIP contribution, geocode rate and an explicit gap reason. `dataset_availability.percent` is the percentage of governed datasets in that category with retained evidence for that jurisdiction. It is not a percentage of businesses, industry establishments, ZIPs or source completeness. Every jurisdiction and category therefore retains `all_business_completion_percent: null`.

Authorization means only that a dataset is enrolled for retained reporting under the governed catalog and its declared export policy. The matrix does not infer permission for a new acquisition or broader redistribution. ZIP and geocode metrics are labeled source-release-wide because current retained aggregates do not support truthful per-state versions of those measures.

Publication writes `report.json` and then `manifest.json` into a new exclusive release directory. It intentionally creates no `current.json`; choosing a report for app-wide display remains a separate reviewed binding. The verifier rechecks the report hash, fixed 51-jurisdiction shape, null completeness claims, zero-network declaration and no-production-pointer declaration.

Native release identifiers and hashes are emitted by the CLI after independent verification. Each release is local derived evidence, not a production dataset or approval.

Validated native release `national-goal-completion-20260922120100-e89cb315` has report SHA-256 `91898b1eb2519f11de2ebc71f8c05676b3dd210503103b88fc6da73ccf42cb54`: 51 jurisdictions, eight categories and 408 jurisdiction/category cells. The broad-layer requirement is available in eight jurisdictions and explicitly missing in 43. Overall all-business completion remains null.

## Management view

The authenticated read-only route `GET /api/business-map/goal-completion` scans the immutable release directory and verifies the newest versioned release directly; it does not use or create a mutable pointer. Optional closed `state` and `category` query values select detail while retaining all 51 jurisdiction cells for the category. If the newest release is corrupt, the reader fails closed rather than silently substituting an older report.

Heatmap Builder shows this evidence in its existing right-hand summary. It reports governed dataset availability, broad state-layer gaps, source freshness, authorization state and geocode context. “All-business completion” remains **Unknown** because no authoritative all-business denominator exists. Dataset-presence percentages must not be presented as the percentage of U.S. businesses collected.
