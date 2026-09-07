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
