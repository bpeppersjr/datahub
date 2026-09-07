# Candidate reconciliation controller

The candidate reconciliation controller builds a standalone downstream proof from all 25 isolated normalized-postal source candidates. It never acquires source data, accepts a production source cohort, writes existing migration downstream pointers, promotes production, or performs cutover.

Plan and run are separate:

```powershell
node scripts/reconcile-business-candidates.mjs plan --run-id <safe-unique-id>
node scripts/reconcile-business-candidates.mjs run --run-id <same-id>
```

Planning requires 25/25 ready sources with `pointer_scope: candidate`. The CLI exclusively saves `data/reconciliations/plans/<id>.json`; the library planning API is read-only. The plan freezes candidate pointer, manifest, and connector-configuration hashes, freezes geography, crosswalk, nonemployer, and ZBP pointer/manifest hashes, and hashes all eight stage scripts plus their four implementation modules. Running exclusively creates `data/reconciliations/runs/<id>/plan.json` and the receipt. The registry command contains an explicit flag for every source; outputs remain below that run directory.

The eight stages run serially: registry build and verify, entity-resolution build and verify, benchmark build and verify, then coverage build and verify. Every launch rechecks the frozen candidate and script inputs. A successful build stage must publish a governed pointer/manifest whose dependency release IDs and manifest hashes match the candidate cohort or the earlier run outputs. Exit code zero alone is insufficient. Each transition is atomically recorded, including child PID, release identity, and local log byte count/SHA-256.

Only one controller may run at once. Its exclusive lock records the process and run identity. An abrupt OS shutdown can leave a last-recorded `RUNNING` receipt and lock; these are historical, unverified ownership evidence—not proof that work is still live—and require operator investigation because there is no automatic recovery. Logs are local and are not returned as API errors.

Cancellation is stage-boundary only because these legacy builders do not share a cancellation contract. Ctrl-C records the stop request but does not signal or kill the active child. After it exits and its output is checked, remaining stages become skipped and the receipt becomes `STOPPED`. This is not immediate cancellation.

## Verification and rollback

The September 7 increment passed 405 repository tests, lint, web/desktop builds, desktop control-plane smoke, TypeScript checking, and the production dependency audit (zero vulnerabilities). Fourteen controller tests use offline fixtures, including one real child that emits no release; they do not prove the complete national workflow. Read-only planning against the actual 25-source candidate cohort passed. No second live reconciliation was launched while the existing isolated rebuild was running.

This is additive: existing collection and publication paths are unchanged. To stop using the controller, stop at a stage boundary and use the established workflow. Retain its immutable plans, logs, and receipts for investigation; no production pointer rollback is needed because this controller never promotes them. Scheduled execution, crash recovery, and production cutover remain separate work.
