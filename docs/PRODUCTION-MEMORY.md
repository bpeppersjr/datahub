# App-owned national rebuild memory

## Verified failure, September 8, 2026

Run `production-oh-childcare-20260908-01` failed at registry-build, exit 134, at `2026-09-08T10:51:24.163Z`. Its retained stage log reports JavaScript heap exhaustion after repeated garbage collection near 3.3 GB retained heap. Log SHA-256 `b3a3830d0855a03a42668c8402bf7d3e9bcebaffd0cd570937d194312d47dd50` matches the terminal receipt. Both recorded process handles were absent at inspection and the controller lock was released. The four original production pointers still match the failed plan; no completed registry was emitted by this run.

This was local processing, not a source download failure. Preserve its receipt, log and incomplete staging. Rebuild from the same verified retained sources in a new run; do not redownload or silently reuse an unverified partial registry. The log alone does not identify the exact retained structure responsible for peak memory.

## Explicit resource profile

Fresh production plans accept `--memory-profile national-12g`. The fixed policy records `oldSpaceMiB: 12288`, `minimumFreeMiB: 16384` and `minimumTotalMiB: 24576` in the hashed plan and receipt. Plans pin the controller and memory helper. Arbitrary limits, unknown profile names, rehashed policy edits and profile changes during execution are rejected through policy reconstruction and implementation pins.

Each native stage receives `--max-old-space-size=12288` before its script argument. Immediately before log creation and child launch, the app checks at least 16 GiB free and 24 GiB total host memory. Insufficient headroom fails the run without launching the stage, rather than silently lowering its budget. Inherited heap-related `NODE_OPTIONS` fail with a generic error; environment contents are not logged. Benign environment options remain unchanged.

The [Node option controls V8 old space](https://nodejs.org/api/cli.html#--max-old-space-sizesize-in-mib), not all process memory. This is a ceiling, not eager allocation, a memory reservation, a guaranteed working-set fit, or protection against another process consuming memory after the check. The app executes these eight stages sequentially under its existing controller lock; this change does not increase download concurrency or provider rates. More scalable streaming/partitioned processing remains appropriate if evidence shows continued memory pressure.

Legacy plans without a profile retain their previous launch behavior. The new profile requires a fresh retained-data plan; it cannot be grafted onto the narrow historical benchmark/resolution recovery modes. No old plan or receipt is rewritten. No general retry, crash resume or atomic four-dataset promotion is claimed.

## Verification and rollback

Tests exercise policy shape and exact limits, boundary capacity, malformed observations, rehashed plan changes, pinned modules and receipt propagation. A tiny real child reports its actual Node arguments and V8 heap ceiling without allocating 12 GiB. Native insufficient-capacity and inherited-heap-option cases prove no child or log is created. Synthetic controller success is not national production success.

Rollback reverts the memory helper, controller/CLI integration and tests while retaining historical evidence. Do not alter these pinned modules during an accepted run. Reverting restores the implicit heap limit, so do not retry the failed national workload with the same uncorrected launch settings.

Final verification on September 8, 2026: `npm run check` passed all 996 tests, lint, web/desktop builds and desktop control-plane smoke. The production dependency audit found zero vulnerabilities. Peer review identified the inherited heap-option risk, now guarded and covered by a real-launch no-child/no-log regression. Log: `data/tmp/production-memory-final-check.log`. The replacement plan retains exactly the previous source, optional-source, baseline and output selections; none were repulled or substituted.
