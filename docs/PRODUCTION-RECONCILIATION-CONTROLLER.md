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

### Tennessee retained-source enrollment

`plan` accepts either `--tn-childcare <immutable recovered manifest>` or `--tn-fresh-childcare <immutable ordinary connector 1.1.0 manifest>` alongside optional MA/NJ manifests. The options are mutually exclusive. `run` uses only its confirmed plan and rejects source-selection flags. The registry CLI forwards these to `tnChildcareManifest` or `tnFreshChildcareManifest` respectively. Fresh releases must pass full ordinary-release verification and cannot be legacy connector 1.0.0, recovery releases, pointers or failed staging.

New Tennessee-enabled plans pin all 34 statically imported stage modules, eight scripts, selected source configurations and all retained source artifacts (five fresh, seven recovered). New non-Tennessee plans also pin the two fresh modules imported by the registry. Saved historical plans and receipts are never rewritten, and recovery still requires exact original input/code rosters. Changed source inputs or code pins cannot silently enter historical recovery. Fresh output uses registry 2.14.0 and coverage 2.10.0; recovered output retains registry 2.13.0 and coverage 2.9.0.

Offline tests exercise a real synthetic ordinary source release and verified plan selection followed by a fixture eight-stage executor and durable success receipt. That is controller handoff evidence, not a live nationwide build. Registry/resolution/benchmark and coverage/map/export have separate real-function integration tests. No new live production run, download or refresh schedule was launched by this integration. Review whether acquisition is needed first; reuse already retained verified inputs for promotion.

See [the Tennessee handoff record](TN-CHILDCARE-CONNECTOR.md#standalone-retained-data-production-enrollment) for actual plan and execution evidence. No source acquisition is part of this chain. A future coverage publication requires a separate exact-source reassessment before it becomes reviewed state-readiness evidence.

The increment passed 440 repository tests, lint, web/desktop builds, desktop control-plane smoke, TypeScript, and a production dependency audit with zero vulnerabilities. Seventeen new offline tests cover plan scope, wrong/extra/inherited dependencies, old-pointer false success, source/implementation/output drift, verifier failure, duplicate runs, shared-lock exclusion, candidate-manifest redirection, junctions, and durable stage-boundary stop. A separate focused rerun passed after atomically publishing stop requests. The [September 7 launch record](PRODUCTION-RECONCILIATION-2026-09-07.md) documents actual hidden-process startup; full live-chain completion remains pending.
