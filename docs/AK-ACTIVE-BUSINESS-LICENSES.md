# Alaska active business licenses

This source adapter ingests the official full `Business License Download` and `NAICS Download` CSV files published by the Alaska Department of Commerce, Community, and Economic Development (DCCED), Division of Corporations, Business and Professional Licensing. It accepts only license rows whose source status is exactly `Active` and records a coherent observation window covering both downloads.

The source describes a business license as required for the privilege of engaging in business in Alaska. DCCED also says submitted information is not verified and disclaims accuracy and reliability warranties. Accordingly, this layer preserves source-defined active-license evidence without treating it as independent proof that a business is continuously operating, open to the public, solvent, or compliant with every other requirement.

## Privacy and address limits

Owners and every mailing-address field are excluded before persistence. Live profiling found phone-like and other unstructured content in `PhysicalLine2`, so the raw value is also excluded; only conservative unit designators such as apartment, suite, unit, building, floor, room, hangar, lot, space, or `#` values may be retained.

One provisional organization is created per accepted active license. A provisional physical site and establishment are created only when the reported physical address is in the United States, contains a valid state or territory, street, city, and five-digit ZIP, and is not a P.O. Box. Foreign, incomplete, invalid, and P.O. Box addresses remain organization evidence only. The source provides only one physical address per license even when a business has multiple locations, so it is not a complete storefront inventory.

Business names can identify sole proprietors and reported physical addresses can be residences. Selected source artifacts are internal, normalized records are local-review-only, and aggregate redistribution requires a separate Alaska terms review. Current USPS ZIP validity remains unverified until an authorized operational ZIP denominator is integrated.

## NAICS and identity limits

The NAICS download is joined only by Alaska business license number. Duplicate identical license/NAICS pairs are collapsed; orphan rows, conflicting duplicates, and license-name disagreement fail the build. Source NAICS values are retained as source-reported classifications. No owner, parent-company, network-affiliation, or cross-source identity relationship is inferred.

## Commands

```powershell
npm run ak-business:build
npm run ak-business:verify
```

The build pins both CSV schemas, requires the two downloads to be observed within five minutes, hashes the privacy-minimized source snapshots, checks minimum row and NAICS-coverage floors, quarantines invalid core records, and publishes `current.json` atomically. The verifier independently checks every checksum, field allowlist, privacy exclusion, partition, identity, NAICS join, quarantine record, ZIP aggregate, source-release derivation, and coverage reconciliation.

## Application handoff readiness — September 7

Historical audit: the implementation gaps below are addressed incrementally in the subsequent network and cancellation sections. Industry enrollment and a source-contract update remain separate from those repairs.

A read-only peer audit found that this connector must not yet be enrolled in automatic industry refreshes. Its explicit baseline and isolated `--output` are compatible, but the CLI does not wire parent IPC cancellation; cancellation during verification/publication, owned staging cleanup, and network timeouts still need implementation and active fault tests. The existing pre-aborted build test does not prove these paths. Ordinary failed/resumable staging must remain distinct from cancelled staging. No Alaska schedule or source download was started by this audit.

The first prerequisite repair corrects acquisition backoff. Missing/invalid `Retry-After` uses bounded exponential delay instead of accidentally converting a missing header to zero. Seconds and HTTP dates follow the [HTTP Retry-After definition](https://www.rfc-editor.org/rfc/rfc9110.html#section-10.2.3); valid publisher delays are not shortened to 30 seconds. A delay exceeding the one-day local wait budget fails with `AK_RETRY_DEFERRED` rather than retrying early or overflowing a timer. This is a terminal acquisition error requiring a later operator decision, not a durable queued retry. Native waits accept the build AbortSignal, discarded retry-response bodies are cancelled, and request attempts are bounded from 1 through 10. No per-request timeout or complete CLI cancellation lifecycle is claimed by this change.

Four offline regressions cover missing/invalid/zero/seconds/date headers, body cancellation, excessive delays, actual abort of a long native wait, attempt limits, and network backoff. They supplement the existing normalization/publication verifier tests without making live provider requests. No data schema or release migration is required; reverting this repair would restore the premature-retry defect and is not recommended.

## Network handoff safeguards — September 7, 2026

The CSV request now applies a default 60-second deadline across response headers and body consumption. Timeout overrides are restricted to 1–300,000 milliseconds; byte limits must be positive safe integers (default 50 MB). Header-stage transient failures use bounded attempts and existing publisher-respecting waits. Partial body failures are not automatically replayed into an already-written source stream.

The streaming response enforces byte limits, interrupts pending reads on caller cancellation/deadline, and releases its timer and listeners on completion, cancellation or failure. Rejected metadata responses are cancelled without waiting indefinitely on provider cleanup. The CSV parser uses an error-coupled pipeline over the direct web-stream adapter, so schema/CSV rejection stops the body immediately rather than waiting for its deadline. No whole-body buffering was introduced.

Seven additional offline tests cover budgets, header/body stalls, caller cancellation, metadata rejection, timer disposal, streamed errors/oversize/schema rejection through a real build, and successful two-download fixture publication. A peer review caught delayed parser-failure cleanup in the first implementation; the direct adapter and before-deadline regression now cover it.

This is not scheduler enrollment or a full cancellation lifecycle. CLI IPC wiring, writer-error/backpressure handling, verifier/publication cancellation and cleanup of only owned cancelled staging remain required. Connector configuration is unchanged while the existing reconciliation pins it; no source download, source-policy change or production pointer change accompanies this repair.

Verification: the final full `npm run check` passed (531 tests, lint, web/desktop builds and desktop smoke), as did TypeScript and the zero-vulnerability production audit. No dataset migration is required. Reverting these two runner-file changes restores the prior unbounded/stalled stream behavior; keep enrollment disabled if reverting.

## Cooperative cancellation handoff — September 7, 2026

Build and verification CLIs now accept parent IPC cancellation and SIGINT/SIGTERM through the shared cancellation adapter. Builds, baseline reads, artifact hashing, gzip pipelines and verification share the signal. Long record loops yield to the event loop so cancellation messages can be processed. Failed writers and blocked backpressure reject rather than leaving acquisition waiting.

Before publication, a cancelled build closes its owned writers and removes only its new UUID staging directory after directory identity and canonical path checks. Prior releases, pointers and sibling staging are preserved. Ordinary failed staging remains for diagnosis. Cancelling an explicit `--resume-staging-run` publication retains that pre-existing staging for another verified attempt.

The publisher honors cancellation through verification and its final pre-rename check. Once staging-to-release rename begins, it completes the release/pointer commit without further cancellation checks. This is a cooperative commit boundary, not a guarantee against disk failure or process termination between those operations. Inspect retained artifacts after such a failure rather than assuming rollback or automatic resume.

Offline acceptance covers phase-boundary cancellation, prior/sibling preservation, resumed staging preservation, missing-gzip verifier failure, writer backpressure/error handling and actual CLI IPC cancellation without provider calls. The pinned connector JSON and industry catalog remain unchanged; update their declared cancellation/deadline contract and complete enrollment review before scheduling Alaska refreshes. No new source data or production changes are claimed by this work.

Verification: 23 focused Alaska tests and the full 537-test repository check passed, including lint, web/desktop builds and desktop smoke. TypeScript passed and the production audit found zero vulnerabilities. A directory-replacement regression confirms cleanup fails closed and preserves both replacement and moved staging. No data migration is needed; reverting cancellation wiring must also keep unattended enrollment disabled.
