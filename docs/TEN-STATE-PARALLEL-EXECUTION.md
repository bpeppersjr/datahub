# Ten-state parallel execution requirement

User direction, 2026-09-12: keep at least ten state workstreams progressing concurrently, using the same industry where the service supports efficient collection or different industries/publishers to spread load. Application workers, not ten live AI agents, own routine processing. Machine capacity does not remove publisher limits.

## Current evidence and gaps

- `config/industry-segments.json` sets `max_concurrency: 10`; `runner/industry-segments.mjs` can execute ten children within one industry operation. This is capacity, not proof of ten distinct active states.
- The queue is FIFO over sources, includes national tasks and can include multiple tasks for one state. It has no state-fair admission policy.
- Prerequisites and source/executable reservations are checked for the entire plan before execution. One missing prerequisite or occupied reservation can stop unrelated work.
- Generic source locks exclude duplicate source/executable runs, but do not provide a common publisher-rate budget across different connectors. Minnesota cohorts have a separate shared-publisher gate.
- The managed-operation manager allows one running supervisor. The refresh scheduler dispatches one due operation at a time. The source reviewer found no configured schedules in `data/refresh-schedules/state.json`; do not claim autonomous recurring refresh is active.
- Retained childcare cohorts for PA, CT, MD, VT, CO, UT and IA provide local-reuse candidates. Six builders support acquired-input reuse and Utah has a fixed retained adapter, but the generic executor currently forwards only `--output`. Enrolling them as-is can repeat acquisition rather than reuse retained data.

These are read-only implementation findings, not a new ten-state dispatch or source-access receipt.

## Required implementation through Spark

Keep one app-owned supervisor initially and make its worker queue state-aware. A broader increase in concurrent managed supervisors is not required to deliver ten state workers and must not bypass existing source exclusions.

1. Target ten distinct states progressing concurrently whenever ten eligible workloads exist. Fill freed slots continuously, with industry round-robin selection and fair rotation through the remaining states. Never count two tasks in the same state as two states.
2. Model each task explicitly: state, industry/source, publisher budget key, fresh versus retained mode, pinned inputs, prerequisites/approval, resource limits and durable status. Forward only typed, validated connector arguments—not arbitrary command-line text.
3. Acquire shared national datasets once as singleton dependencies. State projections use their retained releases. Show local processing separately from fresh source access; do not count a national task as ten active states.
4. Check readiness per task. Missing approvals, unavailable credentials, source-policy gaps or occupied publisher gates put that task into a visible waiting/blocked state without cancelling unrelated eligible work or taking an active worker slot.
5. Preserve connector pacing, host restrictions and cross-process publisher exclusions. Same-service optimization requires an actual supported batching/filter contract, not repeated nationwide requests for each state. Prefer another ready publisher/industry when one service is busy.
6. Reuse retained, verified releases without repulling for promotion or reporting. A refresh is separately explicit; no automatic retry of failed acquisitions or expansion of approved download budgets.
7. Persist actual start/finish times, mode and state for each admitted worker. Expose active distinct-state count, fresh-source versus local-processing counts, queued/waiting reasons and the reason a target of ten is not met. Never manufacture work or access claims to fill a dashboard.
8. Preserve cooperative cancellation, owned-file cleanup, locks through child completion, immutable receipts and explicit restart inspection. Stale PID/age alone never authorizes reclaiming a reservation or replaying an acquisition.

## Acceptance evidence

- Controlled integration test with at least twelve distinct-state workloads proves ten overlap, no duplicate active state, and automatic refill after completion.
- Same-publisher contention test proves publisher limits while independent states continue; waiting jobs do not occupy runnable capacity.
- A national-source fixture proves one acquisition followed by state processing, not one download per state.
- Retained-mode tests prove no source requests and correct input pins; absent/mutated inputs and missing approvals fail only the affected tasks before dispatch.
- Cancellation, restart/ownership and receipt tests prove no abandoned children or falsely successful tasks.
- A native app-managed operation with a persisted receipt is required before claiming live execution. If fewer than ten real workloads are eligible, report the exact shortfall rather than replacing them with synthetic production work.

The current JSON-download/font/coverage fix remains under Spark's verification. This is its next bounded implementation handoff, not a claim that the queue is already implemented or ten source pulls are running.
