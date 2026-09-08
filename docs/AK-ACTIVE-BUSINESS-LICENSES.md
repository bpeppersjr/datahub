# Alaska active business licenses

Current handoff status: the September 8 transport/publication follow-up below closes additional timeout and ambiguous-error gaps. Managed Alaska enrollment remains separate; older audit notes are historical, not a description of the current code.

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

## Publication ownership repair — September 8, 2026

Publication now takes an exclusive `.publish.lock`, validates canonical app-contained paths and exact artifact membership, and binds file/directory ownership using BigInt filesystem identities. Existing pointers must describe a published Alaska release and remain unchanged. Staging is semantically verified again after the last awaited logger hook, then compared with its initial byte hashes and identities before rename. Foreign locks, replaced staging, undeclared files and hardlinks fail closed. Temporary pointer contents are checked against the intended bytes immediately before commit.

Publication reads are bounded: manifest 1 MB, pointer 10 KB, at most 64 artifacts, 100 MB per artifact and 250 MB total on-disk snapshot bytes. Gzip reading separately limits each decoded artifact to 500 MB, each line to 1 MB and each artifact to two million lines. These are local safety limits, not publisher request-rate permissions or guarantees against arbitrary concurrent filesystem attackers.

Ordinary failed staging is retained. Existing staging can be independently reverified and published without downloading its source again. A crash lock requires inspection, not automatic deletion; a disk failure after release rename can leave an unpointed immutable release. No automatic restart or rollback is claimed. Data schemas and production-pinned connector JSON are unchanged; contract migration, baseline readiness and app enrollment remain separate prerequisites. No Alaska download or production pointer update was performed.

Offline regressions cover post-verification mutation, foreign pointers/locks, concurrent resume, byte-identical directory replacement, undeclared artifacts, hardlinks, changed prior pointers and compressed record expansion. The original post-hook mutation regression failed against the old publisher and passes with the repair. Rolling back requires reverting the runner/test changes and keeping unattended enrollment disabled; existing releases need no migration.

Verification: all 931 repository tests passed, including 29 Alaska tests, followed by lint, web/desktop builds and desktop control-plane smoke. The production dependency audit found zero vulnerabilities. An unused-import lint warning was removed after the full check and lint was rerun. The local management app was restored after validation.

## Acquisition preflight ordering — September 8, 2026

Canonical output validation and baseline loading now run before staging creation or source requests. Output destinations inside `releases`, `.staging` or any manifest-bearing ancestor are rejected without modifying those datasets. Resume publication uses the same output-location guard. The regression reproduced a network attempt against an invalid output location before the repair; it now proves zero fetches and no output directory creation.

The Census pointer (10 KB), manifest (1 MB) and coverage (100 MB) use bounded canonical, non-aliased, single-link reads with file identity checks. Pointer and manifest release identities must agree. The exact coverage bytes that pass checksum validation are parsed, rather than hashing one read and parsing another. ZIP identities must be unique five-character strings, with at most 100,000 rows and 100,000 characters per line. Pointer/manifest bytes and identities are rechecked before returning the prerequisite. This is not a guarantee that unrelated baseline artifacts have been independently verified by every Alaska run.

Read-only verification of the retained production Alaska release `ak-active-business-licenses-20260903-003659626Z-9f5638ea` passed all 22 artifacts: 94,886 source license rows, 94,884 accepted organization candidates, 94,550 provisional physical sites and two quarantined records. Census baseline `census-zbp-2023-20260830-134622645Z-4da1edc0` independently verified 14 artifacts totaling 121,099,407 bytes. These are retained source assertions, not a new acquisition, verified business operations or all-business completeness. No Alaska download or pointer replacement was performed; downstream work should reuse this evidence.

Remaining app-enrollment work includes native policy/contract integrity validation, pre-acquisition disk checks, declared cancellation/deadline contract migration and a managed industry entry with subprocess acceptance evidence. Existing runtime tests do not prove those missing requirements. No schedule was enabled.

Verification: 31 focused Alaska tests and the complete 937-test repository suite passed, including lint, web/desktop builds and desktop smoke; the production audit found zero vulnerabilities. Rollback is code-only and preserves releases, but restores the late output rejection and separate hash/read baseline gap. Keep unattended Alaska enrollment disabled if reverting.

## Configuration and disk prerequisites — September 8, 2026

New builds validate the bounded, canonical connector and source-policy files before staging or requests. Canonical JSON SHA-256 pins are connector `c5930d1fe5c8d40bc0c4f3eb41b8f5634776f0d3c796cde6b53bfe9301ff8043` and policy `e5444e478e878f49c1f71f12dfefdfc1ed873e7af0b48a692108d488f2b50d38`. Drift stops acquisition for review. These pins prove local reviewed configuration identity, not fresh publisher terms, changed legal permissions or independent source authenticity. Historical verification and explicit staging resume do not depend on these new-build gates.

Build response budgets must be positive safe integers no greater than 50 MB; deadlines must be integer milliseconds from 1 through 300,000. Invalid values fail before output inspection or baseline reads. Existing fixture quality thresholds remain usable. The default provider pacing and request counts are unchanged.

Before staging, `statfs` checks the nearest existing canonical output directory and requires at least 500 MB available. This is point-in-time headroom, not a disk reservation or a guarantee against later exhaustion. A subprocess regression substitutes an empty filesystem-capacity result and proves the real builder performs zero fetches and creates no output directory. The app exposes no disk-check bypass. Policy/contract drift and malformed budget tests complement existing cancellation, path, publication and retained-source regressions.

No Alaska source refresh or production pointer change accompanied this work. The pinned contract still needs its deliberate cancellation/deadline declaration migration before managed industry enrollment, followed by actual managed subprocess acceptance evidence. Rollback removes these preflight safeguards only; preserve existing releases and do not treat rollback as permission to enroll an unchecked connector.

Verification: all 940 repository tests passed, including 34 Alaska tests, followed by lint, web/desktop builds and desktop smoke. The production dependency audit found zero vulnerabilities, and independent read-only review found no concrete defect. The local management page was restored successfully.

## Transport completion and publication outcomes — September 8, 2026

Header acquisition and injected retry waits now race caller cancellation rather than assuming the transport honors AbortSignal. A response arriving after abort has its unread body cancelled. Monotonic checks reject headers and chunks received after the per-attempt deadline even when synchronous work delayed the timer callback. Native retry timers still observe cancellation, publisher cooldowns are not shortened, and partially consumed CSV bodies are never replayed automatically. Transport, body and retry errors use finite redacted messages instead of exposing injected/provider payload details. These changes do not create a whole-job elapsed or cumulative request budget.

From the final release-rename boundary onward, publication failures report `AK_PUBLICATION_INCOMPLETE` with the verified release ID and one of `release-rename`, `pointer-write`, `pointer-rename` or `post-publication`. Postcommit logger/cleanup failures receive the same outcome. Secondary cleanup errors and concurrent cancellation do not mask an already recorded publication failure or cause uncertain staging to be deleted. An orphan immutable release or completed pointer may exist: inspect before retry or resume. This is not automatic rollback, crash recovery or protection from every filesystem race.

The build CLI prioritizes publication-incomplete output over ordinary cancellation, limits phase/release hints, rejects duplicate/missing flags and unwinds help through cancellation disposal. The verification CLI rejects extra arguments and provides help without accessing source evidence. CLI failures no longer print arbitrary error details or source-derived failure arrays; the retained data and direct verifier remain available for diagnosis.

Forty-seven focused tests passed. New coverage includes a transport ignoring abort, late-response cleanup, stalled injected cooldowns, delayed timer delivery, redaction, actual publication filesystem faults and concurrent-abort outcomes, malformed CLI arguments and publication-error precedence. Two historical transport assertions were updated to expect the intentional redacted messages. Synthetic fault tests open no provider connections and do not establish a managed acquisition receipt.

The retained release `ak-active-business-licenses-20260903-003659626Z-9f5638ea` independently reverified all 22 artifacts after the changes: 94,886 source rows, 94,884 license-backed organization candidates, 94,550 provisional site/establishment candidates and two quarantined records. These are not verified active-business or nationwide completeness counts. Pointer SHA-256 remained `7eaf153fabab8faa485f5df3be8df7ed880dd213faca3e1be8b5a855aae4e286`; manifest SHA-256 remained `1c190b403359e2f9a447479e509555011dcd640943366c804f5612cd6e035930`.

Next handoff work is a deliberately versioned app contract/entry point and durable job receipts, with execution/resource requirements assessed against the actual runtime. No Alaska industry enrollment, schedule, source refresh or production promotion occurred in this increment. Rollback reverts these code/tests/CLI changes while preserving retained releases, staging and inspection-required locks; do not restore unattended enrollment based on old readiness notes.

Final validation: `npm run check` passed with 1,170 tests (1,159 passed, 11 skipped, zero failures), lint, web/desktop builds and desktop control-plane smoke. TypeScript passed and the production dependency audit found zero vulnerabilities. All 82 pending production code/config pins remained unchanged. Independent publication/CLI review found no must-fix issue within this bounded migration.
