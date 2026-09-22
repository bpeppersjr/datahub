# CMS hospital application-managed handoff

Status: implemented as retained-only application-managed inspection. The implementation is in `8894714` and the native acceptance evidence is recorded in `docs/CMS-RETAINED-ADOPTION-APP.md` and `docs/SERVICE-INTEGRATION-QUEUE-2026-09-12.md`. Data-service development remains independent. Do not restart an acquisition to make a retained source visible.

Current acceptance evidence: managed operation `c6a20066-c2b7-4c9c-906e-eb85ab78b22f` succeeded at `2026-09-12T14:43:50.965Z` with adoption receipt SHA-256 `ade8191688046665ea795dd22c2679621872848b1e495f6ca6bce02d835c6ddb`. It replayed the retained native run `7140acea-6dfb-478e-8769-5dd991bc1875` without acquisition requests, preserving source manifest SHA-256 `856992891a8ded15d0f924169991cd3c7d0bda6112de1a0702dd5600305e9239`, 5,419 dated directory rows, 5,354 states/DC rows and 65 territory rows. This is application-owned inspection evidence, not a production promotion or completeness claim. No second adoption is needed for this documentation update.

## Existing evidence and implemented application connection

`scripts/acquire-cms-hospitals.mjs` runs the fixed application-owned acquisition lifecycle in `runner/cms-hospital-acquisition.mjs`. The native job `7140acea-6dfb-478e-8769-5dd991bc1875` already succeeded; manifest SHA-256 is `856992891a8ded15d0f924169991cd3c7d0bda6112de1a0702dd5600305e9239`. Its 5,419 directory rows are retained and independently replayed. The selected artifact is local-review-only; raw artifacts are internal.

`runner/managed-operations.mjs` registers a separate fixed retained-source adoption, not the historical acquisition itself. The successful managed receipt proves the adoption operation ID, authenticated management-page visibility, exact retained replay, and durable completed history. It does not prove automatic refresh or schedule execution; neither is enabled.

## Implemented boundary

1. Retained-run inspection/adoption uses the application's authenticated operation architecture. It pins the known native manifest, replays `verifyCmsHospitalAcquisition`, and preserves the original run ID, source dates, acquisition times, manifest hash, and selected-artifact hash. The managed adoption is a separate event and never replaces the acquisition receipt.
2. The management interface reports dated directory rows, states/DC versus territories, export restrictions, inspection failures, and the preserved hashes. It does not translate those rows into unique businesses, current operating sites, or nationwide completeness.
3. The adoption action accepts only the enrolled source ID. It accepts no URL, source path, output override, or refresh option and performs no acquisition as a side effect of viewing, adopting, promoting, or exporting retained evidence.
4. Success is bound to the operation-specific adoption manifest and independently verified retained source. Failed, cancelled, unknown, stale, or altered evidence remains unavailable/inspection-required; there is no silent retry or stale-lease takeover.

The separately governed nursing-home retained-recovery adoption now uses the same managed-operation pattern while preserving its failed historical acquisition and recovery identity. It remains separate evidence and does not change the hospital source receipt.

## Acceptance evidence

- Retained adoption performs no network requests and preserves all original source hashes and timestamps; exact source replay is required, not count agreement alone.
- Authenticated management reads show source-specific status and actionable unavailable/failed/inspection-required states without exposing private source rows, tokens or raw response bodies.
- A malformed request, duplicate dispatch, lock conflict, cancellation, child failure, stale output, altered source artifact and restart interruption each retain truthful state and ownership.
- Adoption outputs are metadata-only and not offered for download; raw source, selected rows, policy, and notice artifacts do not become public downloads.
- Test launch behavior with `stop-collector.bat` before runtime work, then verify relaunch and leave the app available. Run focused tests, the full check and dependency audit before release.

No schedule is enabled by this handoff. A later refresh schedule must have an explicit implemented runtime and source-specific cadence; it must not depend on a live Codex agent.
