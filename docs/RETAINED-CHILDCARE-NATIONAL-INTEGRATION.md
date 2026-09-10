# Retained childcare national reporting integration

This additive reporting contract reuses seven existing, explicitly selected local cohorts. It does not download, refresh, schedule, merge business identities, or authorize public export. Production execution requires a separately approved new plan; the historical Ohio memory plan is not modified or reused.

## Contract and counts

`retained-childcare-registry-input@1.0.0` is a versioned extension to the existing canonical registry/coverage publisher contracts. Canonical sites, establishments, matching profiles, their publisher versions and legacy `source_records` totals are unchanged. A registry manifest declares `retained_childcare_reporting`, `retained_childcare_candidate_rows`, and `source_records_including_retained_childcare`. The last is the legacy source-row count plus accepted retained candidates, not a count of distinct active businesses.

The reviewed selection contains PA 4,995; CT 1,390; MD 1,772; VT 503; CO 1,648; UT 422; IA 1,476: **12,206 accepted source rows**. Local replay found 1,979 rows without reported address state, 1,213 with separate ZIP4, and 8,178 with source coordinates. Coordinates preserve their source CRS and uncertainty; coordinate presence is not location verification.

Each internal candidate includes a release-scoped ID, name, reported address, separate ZIP5 and ZIP4, source geocode, normalized source fields, provenance, receipt/manifest/enrollment/artifact hashes, and the hash of the original normalized row. Original source geometry remains in retained evidence and is not copied into business records. Source claims remain historical; publishing this extension does not rewrite source manifests to claim they were nationally integrated at acquisition time.

## Geographic reporting

National registry-union views retain all candidates. State views use only the reported address state, never publisher scope. ZIP views join exactly on reported ZIP5; ZIP4 is not aggregated. Missing states and rows without an existing ZIP view remain explicit in the national extension declaration. Source totals and percentages use the seven selected cohorts as their denominator, not all U.S. childcare businesses.

County assignment is not implemented for these new candidate cohorts. County values are null with an explicit reason, not zero or guessed assignments. The existing map's canonical-site shading and identity-match totals are not inflated by candidate rows. This change supplies national reporting data; it does not claim a new candidate heatmap layer or complete industry coverage.

## Verification and production planning

The loader replays each source's native local verifier, then consumes the exact checksum-bound normalized artifact. Enrollment, receipt, manifest and selection pins are rechecked after reading. Registry verification independently reconstructs and compares every candidate, artifact count, dependency, and extension total. Coverage verification binds the original registry manifest and independently recomputes national/state/ZIP metrics and explicit county gaps. Candidate artifacts and extended coverage artifacts are internal.

The production planner accepts `--retained-childcare-selection config/retained-childcare-registry-selection.json`. This option is plan-only and incompatible with historical recovery. The resulting new plan pins the selection, seven enrollments/receipts/normalized manifests/normalized artifacts and a conservative runner/scripts/config implementation inventory, including PDF helpers. Execution re-plans and checks all pins before dispatch. Changing code or configuration after planning requires a new plan.

For a full national build, retain `--memory-profile national-12g`: this is a 12 GiB JavaScript old-space ceiling per sequential child, not storage, a reservation, or a total-process memory cap. Existing memory preflight still applies. Each output publishes separately; the overall multi-stage run is not an atomic transaction.

Rollback: before any production run, ordinary code rollback is sufficient because current data pointers have not changed. After a separately authorized run, preserve both old and new immutable releases and inspect its persisted receipt before choosing any pointer restoration. Do not delete retained source data or relaunch the old plan.

## Prepared review plan — September 10, 2026 (historical pre-execution state)

The native planner created `data/reconciliations/production-plans/production-childcare-retained-20260910-01.json` without running it. Its plan digest is `de8f4067ad1a95af04d9d0376a93fae5130057c8059a7c09e3ea3e6409d80e9d`. It retains the previous MA/NJ/TN/Ohio selections and adds the seven-cohort selection. All 996 implementation/configuration pins and 29 additional retained-evidence pins were checked after planning. Its eight stages contain no acquisition/download stage.

The old plan file remains byte-identical: SHA-256 `c90819edcb83ef9f491ff8dbf756c2a11c56e2e2400e445fd8996d0e1be7d2d`. Four of its 82 pinned code/config files intentionally changed under the new code-update approval: the registry, coverage publisher, production planner, and registry build command. The remaining 78 pins are unchanged. This is why the old plan must not be executed or repinned in place.

Production pointers still name the September 8 registry, resolution, benchmark and coverage releases. No production run, new download, scheduler change, or public export was dispatched. The new plan remains subject to separate execution approval; successful planning or tests are not evidence of production publication.

Validation: `npm run check` passed with 1,717 total tests, 1,706 passed, 11 skipped, zero failures, followed by successful lint, application builds and desktop smoke. The new native integration test reconstructed and verified all 12,206 registry candidates and isolated coverage artifacts without publishing national outputs. TypeScript passed and the production dependency audit found zero vulnerabilities. The complete local check log is `data/tmp/retained-childcare-integration-full-check.log`.

## Approved production outcome — September 10, 2026

The user subsequently approved this exact plan. Run `production-childcare-retained-20260910-01` completed at `2026-09-10T15:11:10.653Z`: all eight build/verification stages succeeded with exit code zero. Its immutable execution evidence is recorded in `data/reconciliations/production-runs/production-childcare-retained-20260910-01/receipt.json` and the adjacent stage logs. This supersedes the pre-execution pointer and approval status above; it does not rewrite historical acquisition claims.

The four current pointers and corresponding manifest SHA-256 values were independently compared with the terminal receipt and matched:

| Output | Published release |
| --- | --- |
| Registry | `national-business-registry-20260910-132939322Z-176d0af2` |
| Entity resolution | `business-entity-resolution-20260910-150446108Z-be92beec` |
| Benchmark sample | `business-entity-resolution-benchmark-sample-20260910-150758574Z-84c0bf72` |
| Coverage views | `national-business-coverage-views-20260910-150931456Z-e22ce20b` |

The registry reports 33,992,773 legacy source records plus 12,206 retained childcare candidate rows, for 34,004,979 combined source rows. These are not distinct active-business counts. This execution reused retained evidence; it did not acquire new source data or enable scheduled refreshes. ZIP5 and ZIP4 remain separate, and the candidate layer remains internal with no inferred identity matches or county assignment.

### State-access reconciliation

The state-access ledger now consumes the published, checksum-bound state candidate extension rather than inferring integration from local app enrollment. PA, CT, MD, CO and UT expose `published-direct-state-candidate-count` evidence for 10,227 reported-address-state rows. Every evidence item identifies its source, coverage release and state artifact and explicitly disclaims verified identity, physical site, current operations and national completeness. The unchanged direct-publisher status identifies a source-evidence class, not a verified-business count. Prerequisites and app dispatch remain independently gated; this projection submits no jobs.

VT and IA remain unmeasured for reported-address-state coverage: their 1,979 candidates are retained nationally but cannot be assigned by publisher jurisdiction. Historical local receipt claims are not rewritten. The regenerated ledger `data/state-access/reports/20260910151531-3be4bd38-d070-4aa0-bbf0-ae6a5caa2250.json` contains 13 direct-publisher cells, 202 national-evidence cells, 188 missing and 56 unmeasured across the nine configured industry buckets. This is not an all-industry completeness estimate.

The September 10 reassessment is an exact predecessor transition with pinned manifest and state-artifact hashes. It permits only the reviewed release lineage, Ohio's 4,237 reporting-only records (zero coordinate assignments), and the separate retained-candidate fields. All other state-view fields must remain deeply equal. It recursively preserves original historical eligibility and source-policy holds; current readiness policy classifications are unchanged. Future releases and unrelated changes remain rejected. Focused regression tests cover candidate count conservation, orphan declarations, unknown states, lineage drift and inflated identity/export claims; full integration validation is recorded separately.

Production artifact verification is not a matching-accuracy approval. The benchmark remains `awaiting-independent-labels`: 1,275 sampled candidates (425 in each of three strata), zero submitted labels, and `benchmark_gate_passed: false`. Registry, resolution and coverage outputs remain explicitly partial. Next work must address independent benchmark review and measured source/geography gaps; neither national completeness nor public export is established by this successful run.

### Post-publication integration validation

`npm run check` passed with 1,722 total tests: 1,711 passed, 11 skipped, zero failures, followed by successful lint, application builds and desktop control-plane smoke. The run enabled installed PDF, Iowa reporting, retained-cohort and Overture-runtime test prerequisites; its local log is `data/tmp/state-ledger-promotion-check-rerun.log`. TypeScript validation passed and `npm audit --omit=dev` reported zero vulnerabilities.

The first full-check attempt had one development-supervisor test failure because the existing vinext development server owned this checkout. It did not indicate a production data failure. After verifying its ownership and cooperatively stopping that development session, both focused supervisor tests and the complete rerun passed. No production run was repeated and no retained data was removed.
