# CMS hospital application-managed handoff

Status: next coding-agent slice, not implemented or included in the current heatmap release check. Data-service development remains independent. Do not restart an acquisition to make a retained source visible.

## Existing evidence and missing application connection

`scripts/acquire-cms-hospitals.mjs` runs the fixed application-owned acquisition lifecycle in `runner/cms-hospital-acquisition.mjs`. The native job `7140acea-6dfb-478e-8769-5dd991bc1875` already succeeded; manifest SHA-256 is `856992891a8ded15d0f924169991cd3c7d0bda6112de1a0702dd5600305e9239`. Its 5,419 directory rows are retained and independently replayed. The selected artifact is local-review-only; raw artifacts are internal.

The current `runner/managed-operations.mjs` does not register this CMS acquisition. The standalone CLI receipt is real evidence, but it is not evidence of a managed-operation ID, management-page visibility, automatic refresh, or restart recovery. Do not describe those as implemented.

## First implementation boundary

1. Add retained-run inspection/adoption through the application's existing authenticated operation architecture. Pin the known native manifest and replay `verifyCmsHospitalAcquisition`; preserve its original run ID, source dates, acquisition times and hashes. A new managed adoption operation is a separate event, never a replacement acquisition receipt.
2. Display the retained source and inspection outcome in the existing management interface. Report dated directory rows, states/DC versus territories, export restrictions, and inspection failures. Never translate these counts into unique businesses, current operating sites, or nationwide completeness.
3. If exposing a new acquisition action in this slice, dispatch the fixed CLI through the existing managed worker with cancellation and independent post-exit verification. Accept no arbitrary URL, source-path or output overrides. An existing retained source should be the default downstream input; a new acquisition must be an explicit refresh action, not a side effect of viewing, adopting, promoting or exporting it.
4. Bind success to the exact new run/manifest produced by that operation, not any older valid receipt. Persist failed or uncertain publication/cleanup outcomes for inspection. Never silently retry, steal a stale-looking lease, or mark an interrupted download succeeded solely because a file exists.

The nursing-home lifecycle is being developed separately and must use the same actual CMS exclusion lock as the unchanged hospital lifecycle. Do not modify pinned hospital implementation files just to add UI wiring. Nursing-home source readiness and native execution remain separate evidence.

## Acceptance evidence

- Retained adoption performs no network requests and preserves all original source hashes and timestamps; exact source replay is required, not count agreement alone.
- Authenticated management reads show source-specific status and actionable unavailable/failed/inspection-required states without exposing private source rows, tokens or raw response bodies.
- A malformed request, duplicate dispatch, lock conflict, cancellation, child failure, stale output, altered source artifact and restart interruption each retain truthful state and ownership.
- Any downloadable selected output is operation-bound, verified and governed; raw source/policy/notice artifacts do not become public downloads.
- Test launch behavior with `stop-collector.bat` before runtime work, then verify relaunch and leave the app available. Run focused tests, the full check and dependency audit before release.

No schedule is enabled by this handoff. A later refresh schedule must have an explicit implemented runtime and source-specific cadence; it must not depend on a live Codex agent.
