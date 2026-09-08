# Alaska and D.C. application handoff audit

Historical audit: later implementation and current limitations are recorded in [Alaska's connector evidence](../AK-ACTIVE-BUSINESS-LICENSES.md). Do not treat this September 7 gap list as current runtime state or as a new acquisition receipt.

Scope: one read-only Alaska peer audit in parallel with the integrator's D.C. connector inspection. These are code/contract readiness findings, not new live-source access, new state agents for other states, or newly acquired records. The existing production registry controller and child were confirmed alive and left independent of this work.

## Alaska

The two fixed public CSV endpoints, default verified Census ZBP prerequisite, and per-run `--output` isolation fit a future cross-industry business-license bucket. Names/address records remain local-review-only; license membership does not establish ongoing operation, complete storefront coverage, or ownership. Aggregate redistribution remains subject to the source's separate policy review.

The request retry defect is repaired and covered by four new offline regressions. Remaining enrollment gates are CLI IPC cancellation, active I/O/verification cancellation, an explicit pre-publication boundary, removal of only owned cancelled staging, preservation of ordinary recoverable failures, and bounded request execution. Do not add the source to industry scheduling until these gates are implemented and tested.

## District of Columbia (tracked separately from the 50 states)

`scripts/build-dc-basic-business-licenses.mjs` supports the isolated output flag and a default Census ZBP prerequisite, but does not create or pass a CLI cancellation signal. The underlying builder checks a caller signal during acquisition and some row reads; its retry sleep, group-normalization loop, verifier, and final publisher do not provide a complete cancellation lifecycle. Error paths close some writers but do not remove owned cancelled staging. These gaps must be fixed before enrollment.

The governed source is Active Basic Business License evidence, not all D.C. businesses. It retains distinct activity rows while grouping consistent customer premises, excludes owner/agent/billing fields, and keeps record-level data local-review-only. Neither this audit nor future enrollment permits changing those limits, inferring parent companies, or counting licensing coverage as national completeness.

No industry configuration, production source pointer, schedule, or acquisition receipt was changed. The next connector step is complete cancellation and cleanup, followed by offline handoff tests and read-only plan validation.

Verification: all 487 repository tests, lint, web/desktop builds, desktop smoke, TypeScript, and the zero-vulnerability production dependency audit passed. The first full check collided with the already-running development preview; the rerun passed after stopping that owned preview. Its empty scheduler state and exited PID 22908 were inspected, and the retained lock was moved to `data/refresh-schedules/owner-stopped-22908-20260907.lock` without deleting it before restoring the app. No automatic stale-lock recovery or full Windows shutdown guarantee is claimed.
