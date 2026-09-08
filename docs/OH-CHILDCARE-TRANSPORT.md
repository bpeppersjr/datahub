# Ohio bounded acquisition transport

`runner/oh-childcare-transport.mjs` connects the [acquisition replay contract](OH-CHILDCARE-PREFLIGHT.md) to serial bounded requests. Synthetic tests exercise the complete flow into an independently verified [offline release](OH-CHILDCARE-RELEASE.md). No live Ohio requests or facility downloads were performed for this increment.

## Execution boundaries

The native entry `acquireOhChildcare()` deliberately fails before any request with `OH_CHILDCARE_LIVE_NOT_ENROLLED`. It pins the existing development policy and rejects caller-supplied transport or endpoint overrides. Changing a JSON authorization boolean alone cannot activate it. Current notice/use binding and app-owned job enrollment remain required; this is not a claim that the source is prohibited or permanently unavailable.

`acquireOhChildcareWithTransport()` is an internal dependency-injection seam requiring an explicit transport function. Tests supply synthetic responses; it has no default network implementation. This seam is **not** a sandbox or authorization boundary against trusted caller code supplying a network-capable function. It is not exposed through the API, scheduler or collection CLI. Returned source-authenticity and acquisition/export authorization claims remain false.

## Request and resource contract

The sequence is a complete ten-observation preflight, initial ID inventory, deterministic selected pages, final ID inventory, and another complete ten-observation preflight. Every request uses an exact generated URL on `maps.ohio.gov`, rejects redirects, omits credentials and stays within 2,000 encoded URL bytes. No arbitrary endpoint, query filter, field list, token, proxy or CSV access-code option is accepted.

Pages contain at most 100 IDs, exactly the ten selected fields, publisher Open-center scope and explicit EPSG:4326 point geometry. Every page is validated before continuing. A final replay rejects changed metadata, status counts or ID membership even when total counts agree. Paired checks do not establish transactional snapshot isolation, source freshness or actual business operation.

Successful observations and stage transitions have one-second pacing. Retryable HTTP 429/5xx responses, network/header failures and deadline expiry allow at most three attempts. Publisher Retry-After seconds or dates are honored; a requested wait above 60 seconds defers rather than shortening the cooldown. Error bodies are cancelled unread so a hanging error page cannot hide its Retry-After header. Such unread bodies contribute zero **consumed** bytes; actual wire traffic is not measured.

The default 15-second attempt deadline covers headers and body consumption. Header waits are explicitly raced against cancellation/deadline even if an injected transport ignores AbortSignal; late responses are cancelled rather than adopted. Stream reads abort cooperatively. Fatal UTF-8 decoding, JSON errors, HTTP200 error envelopes, field/privacy/scope failures and byte-budget violations stop the flow without an unconditional retry.

Metadata bodies are capped at 128 KiB; query bodies at 8 MB; cumulative consumed bodies across both preflights, pages and partial failed attempts at 100 MB. Callers may lower, not raise, the cumulative limit. Decoded bytes are measured independently of Content-Length, which may describe a compressed body. Compressed Content-Length is never treated as proof of decoded size. The runtime returns request/consumed-byte accounting separately from replayable successful-response evidence; it does not claim durable failed-attempt receipts or verified wire-byte measurements.

Cancellation is checked before requests, during pacing and body reads, between stages and before returning a completed result. Tests also cover cancellation on the final metadata response. This module does not publish files, create a schedule, retry entire jobs automatically or recover interrupted acquisitions.

## Verification and remaining handoff

Eight synthetic tests cover the source-to-release flow, fixed options, disabled native entry, cooldowns, malformed/oversized/private responses, consumed-byte accounting across partial failures, header/body deadlines, late response cleanup, cancellation and same-count drift. Independent read-only review found no actionable defect.

The full repository check passed all 894 tests, source checks, lint, web/desktop builds and desktop control-plane smoke. The production dependency audit reported zero vulnerabilities. These tests prove synthetic transport behavior, not current publisher access or nationwide completeness.

Next bind current available source notices and explicit unavailable-resource observations to the scoped acquisition decision, then add the app-owned lifecycle and durable operation receipt. Download execution must be released to Co*Tive after accepted dispatch, not supervised by an occupied agent. Existing verified releases remain reusable for downstream promotion.

Rollback is additive code-only. This increment changes no source policy, production pointer, existing release or schedule.
