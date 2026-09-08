# Delaware current business licenses

Standalone follow-up: [Delaware app jobs](DE-BUSINESS-APP.md) now provide a separate pinned app contract, explicit retained-release reuse, fixed native acquisition entry point and durable job receipts. Historical prerequisites below describe the staged migration; the app document records current enrollment and actual execution evidence. New source output does not automatically replace national reporting inputs.

This source adapter ingests the official Delaware Department of Finance, Division of Revenue `Delaware Business Licenses` dataset (`5zy2-grhr`). The catalog describes the feed as businesses currently licensed in Delaware, marks it Public Domain, and reports daily publication.

The adapter selects thirteen business-license and address fields plus the Socrata row identifier. It does not query owner, officer, principal, registered-agent, phone, email, or contact data. An immutable, checksummed selected-field snapshot is retained internally.

Repeated source rows with the same ten-digit license number are grouped. A consistent group becomes one provisional organization candidate, with distinct trade names and business activities preserved. A group with conflicting business names, address blocks, or license-validity periods is quarantined; accepted and quarantined rows must reconcile to the source snapshot and the quarantine rate may not exceed five percent.

## Address and identity limits

A Division of Revenue business address is not asserted as a physical operating site. It may be administrative, virtual, residential, stale, or outside Delaware. Consequently this layer creates no site or establishment entities. Valid U.S. ZIP5 and ZIP+4 values support aggregate ZIP coverage, but current USPS validity remains unverified until an authorized operational denominator is available.

Catalog geocodes are retained only as source-reported mapping aids. Coordinates for a reported Delaware address that fall outside broad Delaware bounds are flagged; no coordinate is independently validated.

Business names can identify sole proprietors and business addresses can be residences. Source and normalized record-level artifacts are therefore local-review-only. ZIP and source aggregates can be published with attribution, provenance, and the license and address limitations intact.

## Commands

```powershell
npm run de-business:build
npm run de-business:verify
```

The build pins catalog identity, attribution, Public Domain status, the current-license description, and a selected-schema fingerprint. It rechecks the catalog refresh and row counts before publishing `current.json`. The verifier independently checks every artifact checksum, selected source field, source-release identity, privacy classification, partition, quarantine record, normalized organization, and ZIP aggregate.

## Bounded transport prerequisite (September 8, 2026)

The HTTP helper now applies a 60-second per-attempt deadline through header and body delivery, an 80 MB declared/decoded streaming body ceiling, fatal UTF-8 decoding, and cancellation of unread error/retry bodies. Trusted programmatic options can lower the byte ceiling and select a deadline from 1–300,000 ms; they cannot raise the byte ceiling. No new CLI overrides are exposed. At most five attempts run serially. Retry-After seconds or dates are never shortened; waits exceeding one day defer with an error. Caller cancellation interrupts reads and retry waits. Transport and JSON errors omit response contents.

These transport limits apply per response; the cumulative acquisition limits and cooperative build deadline below additionally apply to builds. Existing source policy, connector contract and retained releases remain unchanged; no publisher-policy refresh or download is claimed.

## Cumulative acquisition limits (September 8, 2026)

Builds share one in-memory budget across initial metadata, preflight counts, pages, final metadata and final counts. The defaults and ceilings are 1,000 request attempts, 1,000,000,000 consumed decoded response bytes and 1,000,000 source rows. These are local safety ceilings, not a publisher allowance or performance target. Trusted programmatic `acquisitionLimits` may lower positive safe-integer limits but cannot raise them; malformed options fail before staging creation. No CLI or app override is exposed.

Every fetch attempt, including retries, charges the shared request counter before execution. Every consumed successful-response chunk, including partial transfers that later fail, charges the byte counter before buffering. Exhaustion returns finite `DE_ACQUISITION_BUDGET` diagnostics without another retry. Accounting is not a wire-traffic meter: unread/cancelled error bodies and transport prefetch are not measured, and the first over-limit chunk may already have arrived before it is rejected. Metadata and count responses consume bytes too. Declared source counts are checked before page acquisition, and actual source rows cannot exceed either the row ceiling or the preflight count. Failed acquisitions do not publish a pointer; ordinary-failure staging remains available for diagnosis.

The cumulative counters are not a disk-reservation, process-memory, restart or managed-enrollment guarantee. A fresh build receives a fresh budget; it is not a persisted provider quota. Explicit offline staging verification/resume does not fetch and does not impose new source-acquisition limits on historical releases. Normalized schemas and retained artifacts remain unchanged.

## Resource prerequisite and cooperative deadline (September 8, 2026)

Before fresh staging, baseline reads or any provider request, builds check the canonical output directory for at least 4 GiB of available disk, 1 GiB of free system memory and a Node heap limit of at least 512 MiB. The output directory may be created first, but no staging is allocated when this gate fails. Native observations use filesystem available blocks, OS free memory and the current V8 heap limit. Missing, malformed, below-threshold or unavailable observations fail closed with finite `DE_RESOURCE_PREFLIGHT` diagnostics. The successful build result and CLI output include the serializable `resource_preflight` thresholds and observations. The trusted programmatic probe seam is for testing, not exposed through CLI or job options.

These are point-in-time local safety prerequisites, not disk or RAM reservations, measured peak-memory requirements or guarantees against another process consuming capacity. They neither raise provider rates nor establish a scheduler-wide memory quota. A read-only native check on September 8 observed 279,853,957,120 available disk bytes, 51,291,619,328 free memory bytes and a 4,496,293,888-byte heap limit. Those historical observations do not establish future capacity.

Each build also has a 30-minute cooperative deadline, disposed on every exit. Trusted `executionTimeoutMs` can lower it but not exceed 1,800,000 milliseconds; no CLI override exists. It interrupts abort-aware resource probing, baseline reads, source requests, retry waits and precommit processing. A monotonic check after preflight and in the precommit hook catches delayed timer delivery. Fresh owned staging is cleaned under the existing cancellation rules; prior releases and uncertain/resumed staging are preserved. Synchronous code and OS I/O are not forcibly preempted. After publication's commit boundary, the existing bounded finalization path may finish beyond this deadline; success or publication-incomplete reporting takes precedence over claiming rollback. Offline explicit resume/verification is unchanged and does not acquire this new-build deadline.

Forty-eight focused cases passed across the resource gate, deadline, transport, budgets, lifecycle and CLI tests. They include stalled resource/source cancellation, precommit expiry with preserved prior pointer, successful postcommit finalization after expiry, and a real CLI process constrained to a 128 MiB old-space setting that fails the heap prerequisite before a deliberately missing baseline or injected network request. No source download was used. Managed Delaware enrollment still requires a separately identified app connector contract and validated wrapper/receipts; this change does not dispatch a refresh.

Resource-increment validation: `npm run check` passed with 1,148 tests (1,137 passed, 11 skipped, zero failures), lint, web/desktop builds and desktop control-plane smoke. TypeScript checking passed and the production dependency audit reported zero vulnerabilities. All 82 pending production code/config pins and the retained pointer/manifest hashes below stayed unchanged. Offline verification still reports 66,667 published license-based candidates, not unique active businesses. Rollback reverts the new resource/deadline wrappers and CLI observation output without deleting source data or run evidence.

Thirty-five focused tests passed, including an injected five-request complete build, exhaustion before its final count request, cumulative bytes across partial failed transfers, retry attempt accounting, invalid limits before staging, source row overruns, cancellation and publication fault handling. All network fixtures are synthetic and open no sockets. The subsequent collection cancellation migration is described below; app enrollment remains separate.

Budget-increment validation: `npm run check` passed with 1,131 tests (1,120 passed, 11 skipped, zero failures), lint, web/desktop builds and desktop control-plane smoke. TypeScript checking passed; the production audit reported zero vulnerabilities. All 82 pending production code/config pins remain unchanged. The retained Delaware release was independently reverified offline with unchanged pointer/manifest hashes listed below and 66,667 published license-based candidates. Rollback reverts the budget helper and its build wiring, not retained data; budget-failed staging remains diagnostic evidence and cannot be blindly resumed as a complete release.

## Cooperative local lifecycle

Build, verification and staging publication accept AbortSignal. Source and replay loops yield to cancellation; gzip readers and writers close on errors. Fresh UUID staging is created exclusively beneath canonical non-symlink app directories. Cancellation removes only a freshly allocated staging directory whose BigInt filesystem identity still matches; uncertain ownership is retained. Ordinary failures and cancelled explicit resumes retain staging. Sibling staging and previous releases are not removed.

Publication uses an exclusive lock, canonical artifact checks, unchanged prior-pointer bytes, repeated semantic verification and artifact snapshots before its final cancellation check. After the commit boundary, bounded local rename/pointer finalization ignores cancellation. A commit failure reports DE_PUBLICATION_INCOMPLETE with phase and releaseId, retaining evidence; it can leave an unpointed release or a completed pointer and must not be described as rollback or automatically retried. This is not adversarial filesystem transaction isolation, a complete resource-budget migration, or managed enrollment. The pinned connector's older cancellation description remains unchanged pending a separate contract migration.

Build cancellation destroys all registered writers with an error to release backpressure waits and waits for both gzip and file stream closure. Precommit artifact writes, hashes and rename retries observe cancellation. Commit rename retries deliberately do not: their maximum scheduled wait exceeded the former ten-second industry grace. The subsequent [collection cancellation migration](COLLECTION-CANCELLATION.md) now provides 60 seconds for source workers and 75 for collection supervisors, with real nested-process cooperative finalization evidence and explicit publication-ambiguity receipts. OS stalls remain unbounded. A separate app connector contract and receipt enrollment remain prerequisites to managed Delaware acquisition; the resource prerequisite is implemented above.

Prior transport-increment validation: 15 focused Delaware tests passed, including late response cleanup, stalled streams, chunked and declared byte ceilings, invalid limits before requests, native and injected retry-wait cancellation, and monotonic deadline rejection after synchronous work. That repository check passed with 1,100 tests passed, 11 skipped and zero failures. It predates the lifecycle work below.

## Lifecycle verification and retained-data continuity

The build and verification CLIs wire SIGINT, SIGTERM and parent IPC cancellation through the shared cancellation controller, including explicit staging resume. They dispose their IPC listeners on completion. Duplicate and missing build flag values are rejected before execution. Publication-incomplete output takes precedence over ordinary cancellation, emits bounded phase/release hints, and warns that a release or pointer may already exist.

Twenty-six focused tests passed for transport, lifecycle and CLI behavior. Real child-process regressions interrupt an injected stalled source request and an injected stalled local Census baseline read, with no sockets opened. They verify process exit, removal of only the fresh cancelled staging, and preservation of an existing pointer and sibling staging. Fault tests cover precommit cancellation, postcommit cancellation completing publication, resumed staging preservation, rename retries, pointer-write failure with a retained unpointed release, and logger/lock cleanup faults that cannot erase the primary publication-incomplete phase. These are cooperative fault tests, not proof against process death, disk failure, malicious filesystem races or every operating-system delay.

The existing release `de-business-licenses-20260903-002309163Z-f955c045` was independently reverified after these changes without a provider request. Its 67,829 source license rows, 66,667 published license-based organization candidates and 49 quarantined source rows remain intact. Physical-site and establishment counts remain null. These are not unique active-business counts.

Unchanged retained pointer SHA-256: `01f31232fdbdd0e945daffa40dae334d3d52d0cf71f219a3d0f2776f8d33e505`. Unchanged manifest SHA-256: `5ab0bfe8e04ad2fffdd6cb66d3881639c18006311dba1cd52730ef25e8427eba`.

Final repository validation: `npm run check` passed (1,122 tests, 1,111 passed, 11 skipped, zero failures), including web/desktop builds and desktop control-plane smoke. TypeScript checking passed, the production dependency audit reported zero vulnerabilities, and all 82 pending production code/config pins remained unchanged. The local app was restored and returned HTTP 200 at `http://localhost:3000/`.

Rollback reverts lifecycle code/CLI changes after inspecting active work; it does not delete staging, releases, pointers or publisher locks. Complete staging can use the explicit resume command after inspection. An already moved release or incomplete publication requires separate recovery assessment, not a blind resume or new download. No managed enrollment, refresh, national promotion, source-contract migration or prior data rewrite is claimed here.
