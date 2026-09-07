# Production benchmark status recovery

The benchmark builder publishes an immutable review sample with status `awaiting-independent-labels`, not a `published`-prefixed status. The production controller now accepts exactly that benchmark status. Other output groups retain their published-status check; no label, precision or export gate is relaxed.

## Recover completed local work without acquisition or rebuild replay

The original run `production-20260907-durable-01` finished FAILED after registry build/verification and entity-resolution build/verification succeeded. The benchmark builder exited zero and wrote `business-entity-resolution-benchmark-sample-20260907-173232935Z-cabe188b`. The controller rejected that status and skipped remaining stages. This is a controller classification failure, not a failed download or missing benchmark.

The new optional plan argument is deliberately narrow:

```powershell
node scripts/reconcile-business-production.mjs plan --run-id <new-run-id> --recover-benchmark-from <failed-run-id>
node scripts/reconcile-business-production.mjs run --run-id <new-run-id> --confirm <returned-plan-sha256>
```

The planner validates the original plan digest, exact terminal failure class, stage order, successful first four exit codes, failed benchmark exit zero, untouched skipped stages and absence of an owner or stop request. It pins original plan, receipt and five completed stage logs. Original sources, connector configuration, baselines, builder/verifier scripts and implementation modules must match current pins. Current registry/resolution must match the successful receipt outputs and build-stage release pins, including semantic lineage. Coverage must be unchanged. The adopted benchmark must match the exact release, manifest path and status in the hash-checked build log, with dependencies matching the verified registry and resolution. Compatible-but-unrelated benchmark releases are rejected.

The resulting plan has only three stages: benchmark verification, coverage build, coverage verification. It uses the existing exclusive controller lock and rechecks inputs, adopted output pointers/manifests and historical evidence before and after children. Failed benchmark verification prevents coverage construction. Stop remains stage-boundary; it does not kill a child. A new immutable run directory contains fresh logs and receipt, with previously completed releases explicitly recorded as adopted—not falsely recorded as rebuilt. The failed receipt is never rewritten. No source connector, download or completed build is launched by this recovery.

This is not general crash/staging resume. An incompatible failure, changed input, ambiguous lock, newer output or changed historical evidence needs inspection. It never removes stale locks, fabricates successful old stages, or certifies independent labels. Like the full controller, publication is per dataset, not an atomic four-layer cutover. Reusing prior verification trusts the retained immutable artifacts; the planner checks their manifest/pointer hashes and recorded lineage, not a new byte scan of every prior registry/resolution artifact. The benchmark itself receives fresh verification before coverage.

## Verification and rollback boundary

Regression fixtures use the actual unlabelled benchmark status. Recovery tests cover the exact three-stage suffix, unchanged failed receipt, bad stage/log/source/output evidence, unrelated same-dependency samples, prelaunch and mid-verification evidence drift, lock exclusion, pre-cancellation and benchmark verifier failure. Existing controller tests retain broader pin, lineage, cancellation and no-overwrite checks.

The final full check passed 516 tests, lint, web/desktop builds and desktop control-plane smoke; TypeScript and the production dependency audit passed with zero vulnerabilities. Read-only peer review found no blocking defect. Direct verification of the retained live benchmark passed three artifacts, with 1,275 sampled candidates, zero submitted labels and benchmark gate false. The validated recovery plan is `production-20260907-benchmark-recovery-01`, SHA-256 `15bf09bd828da6e7ffcace552793013fc7dd4cc2cfd556764e4e7d18360ae844`. Planning and tests are not evidence that its remaining production stages finished; inspect its new runtime receipt for that outcome.

To stop a running recovery, use `node scripts/reconcile-business-production.mjs stop --run-id <new-run-id>`. Preserve plans, receipts, source releases and prior reporting releases. Reverting controller code does not roll back published dataset pointers; inspect those independently before any requested rollback. No migration or data deletion is required for the code correction.

## Live completion: 2026-09-07

Recovery `production-20260907-benchmark-recovery-01` finished SUCCEEDED. Its three stages all exited zero: benchmark verification; coverage build (17:43:25.692Z–17:44:13.940Z); coverage verification (finished 17:44:15.494Z). The controller lock was released and controller PID 33248 was absent on follow-up. Terminal receipt SHA-256: `45eb3a7f5393835d9ceb4014d076872ce92f8f311da0d70d0dacff4363b70f98`.

Current coverage is `national-business-coverage-views-20260907-174411739Z-4169d204`, manifest SHA-256 `66484ec880b47164d269318039e402fd7e304e4aef8f442e1ecc3b7d509a3d01`. The verifier checked seven artifacts totaling 587,635,246 bytes. It reports 8,011,817 source-preserving location profiles assessed, of which 995,292 have coordinate assignments; 7,016,525 do not. There are 48,190 ZIP views, 47,991 with record-level source contribution, and 33,791 Census ZCTA polygon views. The ZIP-view union is not an authoritative operational USPS denominator, and these counts are not unique active-business counts or national completeness percentages.

The refreshed state-access report is `data/state-access/reports/20260907174457-a6f317c8-a877-45a7-9af8-8969183abb61.json`. It hashes the new 212,091-byte state artifact as `4d02b711e45a4fd69f633f9f91349712f21066afd50c95926cdb89d01a5bb330` and tracks 357 industry cells across 50 states and D.C.: 202 national-dataset state evidence, three direct-state publisher cells, 100 missing and 52 unmeasured. The separate assessment catalog still references the September 2 coverage release; `assessmentCoverageMatchesCurrent` correctly remains false until its assessments are explicitly refreshed. No catalog freshness is fabricated by this report.

This completes the promoted cohort's local reporting recovery, not the nationwide business-collection goal. Independent labels remain unsubmitted, aggregate entity-resolution approval remains unmet, coordinate coverage is incomplete, and state/industry source gaps remain. Existing source artifacts and prior releases were reused and preserved; no acquisition or completed build replay was necessary. This completion note is documentation only and makes no new full-suite test claim beyond the implementation evidence above.
