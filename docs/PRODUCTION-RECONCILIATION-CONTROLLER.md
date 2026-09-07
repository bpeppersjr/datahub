# Standalone production reconciliation

This controller rebuilds the four governed production reporting layers from the 25 already-promoted local business sources. It does not download source data, enable recurring schedules, approve entity-resolution labels, or turn partial source evidence into a complete business census.

```powershell
node scripts/reconcile-business-production.mjs plan --run-id <unique-id>
node scripts/reconcile-business-production.mjs run --run-id <unique-id> --confirm <exact-plan-sha256>
node scripts/reconcile-business-production.mjs stop --run-id <unique-id>
```

Planning freezes the production source cohort, baseline dependencies, implementation files, and existing downstream publications. Execution uses only fixed allowlisted build and verification scripts. A successful child exit without a new, correctly linked publication is a failure. Every completed stage has a local log hash and durable receipt; downstream stages do not start after failure. The candidate controller remains isolated and shares the exclusive controller lock, so these controllers cannot overlap.

The run uses the normal production publishers. They publish one layer at a time: this is not an atomic four-layer cutover. A later failure does not undo earlier successful publication. Previous immutable releases remain available. Do not manually replace pointers or delete staging to recover; inspect the receipt, live process ownership, and published dependencies first.

The shared lock excludes these controllers, not legacy builders started directly from a terminal. Do not run direct production builders or change source pointers alongside this controller. Input and output drift is checked between stages, but it does not roll back a competing publisher. Before replacing a previously interrupted run, inspect the actual operating-system process inventory rather than inferring liveness from old receipts.

Cancellation is stage-boundary only. The stop command persists intent for the named run, including when Windows has launched it in a hidden window. A stop request lets the current legacy builder or verifier finish; the controller then skips remaining stages. Accepted intent is not proof the child has stopped. There is no automatic partial-build resume or stale-lock reclamation. An interrupted receipt or lock is evidence of a recorded state, not proof that its process is still alive. A fresh run requires investigating the previous owner and re-planning against the actual current publications.

The CLI can run under a local operating-system process independently of Codex. Keep redirected launcher logs within `datahub` and use a hidden window for background Windows execution. Closing the computer or terminating its process can still interrupt work; this increment is not an installed Windows service, restart recovery engine, recurring scheduler, or Data Operations UI integration.

## Verification

The increment passed 440 repository tests, lint, web/desktop builds, desktop control-plane smoke, TypeScript, and a production dependency audit with zero vulnerabilities. Seventeen new offline tests cover plan scope, wrong/extra/inherited dependencies, old-pointer false success, source/implementation/output drift, verifier failure, duplicate runs, shared-lock exclusion, candidate-manifest redirection, junctions, and durable stage-boundary stop. A separate focused rerun passed after atomically publishing stop requests. The [September 7 launch record](PRODUCTION-RECONCILIATION-2026-09-07.md) documents actual hidden-process startup; full live-chain completion remains pending.
