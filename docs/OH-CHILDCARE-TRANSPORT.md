# Ohio bounded acquisition transport

`runner/oh-childcare-transport.mjs` connects the [acquisition replay contract](OH-CHILDCARE-PREFLIGHT.md) to serial bounded requests. Synthetic tests exercise the complete flow into an independently verified [offline release](OH-CHILDCARE-RELEASE.md). No live Ohio requests or facility downloads were performed for this increment.

## Execution boundaries

The legacy in-memory entry `acquireOhChildcare()` deliberately fails before any request with `OH_CHILDCARE_LIVE_NOT_ENROLLED`. It pins the existing development policy and rejects caller-supplied transport or endpoint overrides. Native acquisition instead uses the [durable app wrapper](OH-CHILDCARE-APP.md), with separate pinned runtime enrollment and current notice/use binding. Changing an authorization boolean alone cannot activate either path.

`acquireOhChildcareWithTransport()` is an internal dependency-injection seam requiring an explicit transport function. Tests supply synthetic responses; it has no default network implementation. This seam is **not** a sandbox or authorization boundary against trusted caller code supplying a network-capable function. It is not exposed through the API, scheduler or collection CLI. Returned source-authenticity and acquisition/export authorization claims remain false.

## Request and resource contract

The baseline sequence is a complete ten-observation preflight, initial ID inventory, deterministic selected pages, final ID inventory, and another complete ten-observation preflight. Metadata and record queries use exact generated URLs on `maps.ohio.gov`, reject redirects, omit credentials and stay within 2,000 encoded URL bytes. The optional required-source-use mode below adds four fixed notice URLs on `maps.ohio.gov` and `childrenandyouth.ohio.gov`. No arbitrary endpoint, query filter, field list, token, proxy or CSV access-code option is accepted.

Pages contain at most 100 IDs, exactly the ten selected fields, publisher Open-center scope and explicit EPSG:4326 point geometry. Every page is validated before continuing. A final replay rejects changed metadata, status counts or ID membership even when total counts agree. Paired checks do not establish transactional snapshot isolation, source freshness or actual business operation.

Successful observations and stage transitions have one-second pacing. Retryable HTTP 429/5xx responses, network/header failures and deadline expiry allow at most three attempts. Publisher Retry-After seconds or dates are honored; a requested wait above 60 seconds defers rather than shortening the cooldown. Error bodies are cancelled unread so a hanging error page cannot hide its Retry-After header. Such unread bodies contribute zero **consumed** bytes; actual wire traffic is not measured.

The default 15-second attempt deadline covers headers and body consumption. Header waits are explicitly raced against cancellation/deadline even if an injected transport ignores AbortSignal; late responses are cancelled rather than adopted. Stream reads abort cooperatively. Fatal UTF-8 decoding, JSON errors, HTTP200 error envelopes, field/privacy/scope failures and byte-budget violations stop the flow without an unconditional retry.

Metadata bodies are capped at 128 KiB; query bodies at 8 MB; cumulative consumed bodies across both preflights, pages and partial failed attempts at 100 MB. Callers may lower, not raise, the cumulative limit. Decoded bytes are measured independently of Content-Length, which may describe a compressed body. Compressed Content-Length is never treated as proof of decoded size. The runtime returns request/consumed-byte accounting separately from replayable successful-response evidence; it does not claim durable failed-attempt receipts or verified wire-byte measurements.

Cancellation is checked before requests, during pacing and body reads, between stages and before returning a completed result. Tests also cover cancellation on the final metadata response. This module does not publish files, create a schedule, retry entire jobs automatically or recover interrupted acquisitions.

## Verification and remaining handoff

### Required source-use execution mode

The internal transport seam now accepts `sourceUseRequired: true` only with an `onSourceUseBound` function. Incomplete gate options fail before any request; supplying that hook with the gate disabled is also rejected. The versioned policy/decision integrity check runs before network activity, so a modified notice URL cannot be fetched first and rejected only afterward.

This mode obtains the exact four reviewed availability responses after the initial preflight, then calls `bindOhChildcareSourceUse` against that same preflight and the freshly measured statuses, sizes, hashes and timestamps. It consumes expected 400/404 notice bodies under a 1 MiB cap because these bodies are the reviewed availability evidence. Other HTTP error bodies, including 429/5xx, remain cancelled unread with Retry-After honored. Notice bytes and partial failed reads count toward the same global body budget as metadata and queries.

The mode awaits `onSourceUseBound` with a deep-cloned prerequisite package before requesting even the ID inventory. The app-owned caller must persist it before returning. Hook failure or cancellation stops acquisition; mutations or replacement return values from the hook cannot change the internal evidence or grant approval. Hook completion alone is not independently verified durable storage. No generic API or scheduler caller currently exposes this option.

Freshness is revalidated after the hook and before each inventory/page attempt, including retries after pacing or provider cooldown. The four notice responses are collected and bound again after the final preflight, and changes prevent success. Chronology checks include availability after prerequisite completion, query timestamps after source-use checks, and completion no earlier than the final binding. Paired packages are returned as `source_use_evidence`; they are not silently inserted into the older acquisition/release schema or represented as a persisted app operation.

Six additional tests cover awaited persistence, cloned evidence, rejected/incomplete gates, stale prerequisites, cancellation, availability drift and body limits, configuration drift before requests, and a peer-found final clock rollback. The four public error-page bodies are retained as portable fixtures in `runner/fixtures/oh-childcare-availability.json`, after direct checks confirmed the recorded status/size/hash values. This adds retained test bodies without rewriting older research records that truthfully said raw bodies were not retained at their observation time. No facility record requests occurred for this fixture capture.

The [retained acquisition lifecycle](OH-CHILDCARE-ACQUIRED-RELEASE.md) now persists and independently replays these packages and an ordered response journal. The separate [native app path](OH-CHILDCARE-APP.md) supplies the fixed native fetch adapter and records wrapper provenance. Do not call injected transport tests live publisher acquisition.

The required-source-use follow-up passed the full repository check: all 904 tests, source checks, lint, web/desktop builds and desktop control-plane smoke. The production dependency audit reported zero vulnerabilities. The original eight transport tests remain compatible; the six added tests include the independently identified final-clock regression and its fix.

Eight synthetic tests cover the source-to-release flow, fixed options, disabled native entry, cooldowns, malformed/oversized/private responses, consumed-byte accounting across partial failures, header/body deadlines, late response cleanup, cancellation and same-count drift. Independent read-only review found no actionable defect.

The full repository check passed all 894 tests, source checks, lint, web/desktop builds and desktop control-plane smoke. The production dependency audit reported zero vulnerabilities. These tests prove synthetic transport behavior, not current publisher access or nationwide completeness.

The optional `onObservation` hook receives a clone only after inventory/page validation and is awaited before the next request. A hook failure is not retried as an HTTP failure. The acquired-release lifecycle uses it to sync each successful source observation. The existing transport's no-hook behavior remains compatible.

Download execution must be released to Co*Tive through its enrolled app path after accepted dispatch, not supervised by an occupied agent. Existing verified releases remain reusable for downstream promotion.

Rollback is additive code-only. This increment changes no source policy, production pointer, existing release or schedule.

## Response-envelope diagnosis — September 8, 2026

The failed app operation `0a4175ed-81ed-4ed9-a846-44a972c8ba9c` led to bounded diagnostics, not a blind full-job retry. Each diagnostic uses the existing fresh source-use checks and durable app wrapper, permits at most one feature request, and applies a 60-second overall deadline. Diagnostic output roots are isolated under `data/tmp/oh-first-batch-diagnostic-*`; execution remains explicitly marked injected-test transport rather than an enrolled native collection.

The first diagnostic isolated the failing gate to top-level envelope fields. The next identified exactly two otherwise-unaccepted known keys, `hasZ` and `hasM`, with no unknown keys. A corrected-path diagnostic confirmed both values are `false`. These optional flags are documented in the [ArcGIS feature-layer query response](https://developers.arcgis.com/rest/services-reference/enterprise/query-feature-service-layer/). The parser now permits only absent or explicitly false flags; true, null, strings, additional dimensions in points and unrelated keys still fail. No business geometries or additional business fields are introduced, and prior retained evidence remains replayable.

Separate fixed messages identify envelope, geometry type, CRS, extra dimensions, transfer-limit flag, object-ID field, display field, feature-array and feature-count rejection. They never echo unexpected provider keys, values, IDs or record bodies. Tests cover each gate and confirm a rejected page is neither journaled nor followed by another feature request. Source policy, export controls and publication requirements remain unchanged. This repair does not prove that a whole Ohio acquisition will pass every subsequent gate; do not promote diagnostic staging as a completed release.

The final bounded diagnostic at `data/tmp/oh-first-batch-diagnostic-b645b893-93f9-40ea-8f02-83ca5e1d34aa` made one feature request and rejected `returned schema` after passing the repaired envelope. The specific returned-field predicate still requires diagnosis. Across this increment, four separately gated diagnostics each made one feature request; none completed acquisition or normalization. No full collection was redispatched. Full verification passed 933 tests, lint, web/desktop builds and desktop smoke; the production audit reported zero vulnerabilities. The app was restored afterward. Rollback is a code revert only, preserving all original receipts and retained releases.
