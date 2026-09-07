# Production reconciliation — September 7, 2026

## Launch authority and source gate

The normalized-US-postal source cutover committed as `20260907153645547-16d08121-7703-4d69-bcfc-9e75a5a36ffa`, state revision 53. The independently inspected production cohort reports 25/25 ready, zero blocked, zero rebuild-required, zero candidate pointers used, and frozen-plan SHA-256 `84738a309d340703420bd42ab56aefec583a34cb855ac83fcf42e08e0134a848`.

The authorized production downstream chain uses only existing local source releases. It performs no source acquisition or download, supplies no entity-resolution approval override, preserves unresolved coverage gaps, and leaves the benchmark in `awaiting-independent-labels` with its gate false unless independent labels are separately supplied through the governed workflow.

## Pre-launch production downstream pointers

| Layer | Release selected before launch | Updated at | Status |
| --- | --- | --- | --- |
| Registry | `national-business-registry-20260902-043657439Z-c1eab4dd` | `2026-09-02T04:36:57.439Z` | `published-partial` |
| Resolution | `business-entity-resolution-20260902-075624674Z-881e778c` | `2026-09-02T07:56:24.674Z` | `published-reviewable-partial` |
| Benchmark | `business-entity-resolution-benchmark-sample-20260902-075956925Z-c5f3d239` | `2026-09-02T07:59:56.925Z` | `awaiting-independent-labels` |
| Coverage | `national-business-coverage-views-20260902-115337634Z-ba689784` | `2026-09-02T11:53:37.634Z` | pointer carries no status field |

No duplicate registry, resolution, benchmark, or coverage builder/verifier process was present immediately before launch.

## Exact fail-fast chain

```powershell
node scripts/check-normalized-us-postal-migration.mjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm run registry:build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm run registry:verify
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm run entity-resolution:build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm run entity-resolution:verify
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm run entity-resolution:benchmark:build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm run entity-resolution:benchmark:verify
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm run coverage-views:build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm run coverage-views:verify
exit $LASTEXITCODE
```

Every command uses its production default pointers and output root. A downstream stage starts only after the preceding independent verifier exits zero.

## Interrupted launch evidence

At the September 7 continuation inspection, session `48083` was absent and an authoritative Windows process inventory contained no production registry, resolution, benchmark, or coverage builder/verifier. Registry and coverage pointers still selected their September 2 releases. The original registry staging directory `data/business-registry/.staging/4c92700e-e080-49bf-8bfc-879e2c1334e3` contained 676 partial files totaling 1,810,400,175 bytes, with no manifest. It is retained unchanged; these incomplete files are not a published or verified registry. The cause of the process exit is not established because the original launch did not persist its terminal output.

The production postal-readiness gate was rerun and still reported all 25 sources ready, zero candidate pointers, and unchanged cohort hash `84738a309d340703420bd42ab56aefec583a34cb855ac83fcf42e08e0134a848`. No source re-download is required. The registry has no supported partial-staging resume contract; a replacement run must rebuild derived artifacts from the retained source releases, with durable logs and stage receipts.

## Durable replacement launch

The [standalone production controller](PRODUCTION-RECONCILIATION-CONTROLLER.md) planned `production-20260907-durable-01` with plan SHA-256 `c5c566ac0ba15debee739628598b49d76e370d67c2dd9e099c04401f16327cbf`. Its plan is stored under `data/reconciliations/production-plans/`; the run's immutable plan copy, atomic receipt, and per-stage logs live under `data/reconciliations/production-runs/production-20260907-durable-01/`.

After checking the Windows process inventory and absence of the shared controller lock, the exact confirmed plan was launched with hidden `Start-Process` at `2026-09-07T16:12:48.555Z`. Controller PID `5768` and registry child PID `12784` were independently observed alive after the launcher command returned. The child log reported `Reconciled 16,968 USDA SNAP records.` Launcher stdout/stderr are retained under `data/reconciliations/launcher-logs/production-20260907-durable-01/`; initial stderr was empty. These PIDs and log observations are launch evidence, not permanent liveness or completion claims.

The controller, not a Codex agent, now owns the remaining sequential build/verifier execution. All 440 repository tests, lint, web/desktop builds, desktop smoke, TypeScript, and the zero-vulnerability production dependency audit passed. The final atomic stop-publication change also passed the 17-test focused controller rerun and lint. No production completion claim is made until the run receipt and all published output dependencies are independently checked after termination.
