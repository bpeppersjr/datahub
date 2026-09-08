# Standalone production job visibility

Data operations now includes **National dataset rebuilds**, separate from managed collection/export history. It reads the app-owned production controller's saved receipts; opening the page never starts, stops, cancels, resumes or retries a job. Existing collection controls and scheduler behavior are unchanged. Wisconsin collection remains unapproved.

The local authenticated endpoint is `GET /api/data-operations/production-runs`. Other methods and job-control subpaths are not implemented. It uses the existing control-plane authentication and host/origin protections and returns only run IDs, recorded statuses/times, stage summaries, recorded output release IDs and bounded diagnostic flags. It never returns plans, raw errors/logs, filesystem paths, ownership tokens or PIDs.

The reader inspects only `data/reconciliations/production-runs/<run-id>/receipt.json`, not output manifests or business artifacts. Canonical path, alias/single-link, bounded UTF-8, exact run identity, known stage order/status and chronology checks reject unsafe or contradictory evidence. Reads are capped at 256 KiB per receipt and 500 directory entries per request. Oversized overall history returns an inspection error, not a false empty history. The default response includes the newest 20 readable runs (reader limit at most 50); omitted and unreadable counts remain explicit. No receipt or pointer is changed.

Process presence is a separate observation. A PID existence probe does not establish the process's identity or progress; a missing PID does not rewrite a running receipt as failed. Terminal receipts are not probed. Stage completion is not row progress, business completeness or verified operating status. Output IDs are historical records, not a claim those releases remain current. This view does not independently verify saved plans, logs or release artifact hashes.

The page refreshes every ten seconds while mounted, suppresses overlapping requests and aborts on unmount. Loading, empty history, partial inspection and request failure have different messages. A failed refresh retains the last snapshot with a visible stale-data warning; its failure does not disable collection/export controls or imply that any job stopped. The app-owned controller continues independently of this page and Codex.

Tests cover actual authenticated HTTP reads and rejected write/control routes, receipt projection and unchanged bytes, malformed/oversized/linked evidence, contradictory stage states/times, historical output semantics, polling overlap, unmount cancellation and stale/unreadable UI states. UI tests execute the component with a hook/request harness; no browser interaction or visual QA is claimed.

Rollback removes the read-only route/component/reader; keep all production receipts and outputs. The running reconciliation controller's pinned files must remain unchanged. No data migration, acquisition, schedule or deployment accompanies this feature.

Verification on 2026-09-08: `npm run check` passed all 967 tests, application builds and desktop control-plane smoke checks. `npm audit --omit=dev` reported zero vulnerabilities. The local management preview was restored; browser visual QA was not performed.
