# Childcare reporting integration

## Contract and scope

MA center-based childcare and NJ licensed childcare-center records are source-preserving provisional site/establishment evidence. They do not establish unique businesses, continuous operations, ownership, or nationwide childcare completeness. NJ includes public-school programs; MA's center-based source omits family-based care and other programs outside its published scope. Preserve these differences in interpretation.

The integration adds a separate `business-reporting-location-evidence-jsonl-gzip` artifact under `reporting/location-evidence/zip2=XX/records.jsonl.gz`. Each row carries site/establishment IDs, name, separated ZIP5/ZIP4 address fields, nullable latitude/longitude, source-native status, observation time, provenance, and source evidence. Its `identity_matching_eligible` is always false and `export_policy` is always `local-review-only`. It is not an identity-resolution profile and must not enter matching or benchmark input selection.

Every provisional site must have exactly one matching-profile or reporting-only representation in a newly integrated registry, with the two site-ID sets disjoint. Source-specific assertions and retained source-release evidence remain authoritative; a geographic row's internal consistency alone is not proof of publisher authenticity.

Coverage consumes reporting-only evidence using the same coordinate-assignment checks as existing location profiles, while retaining separate matching/reporting counts and coordinate gaps. ZIP evidence must not be replaced with ZCTA membership or silently allocated to counties. Business entities retain point coordinates only; USA/state/county/ZCTA polygons remain separate governed geography.

The map backend adds the **Reported childcare centers** category and includes reporting-only names in ZIP drill-downs. The flat-file builder accepts the `childcare` category; records are excluded in default public-only mode and available only under explicit `--policy-mode local-review`. Select `source_status`, `source_evidence` and `identity_matching_eligible` to retain these additional fields in an extract. Source and output-release lineage remains required. Percentages describe the collected evidence universe, not the share of all U.S. childcare businesses found.

## Retained input selection

Use the already acquired MA release `ma-childcare-2fd11c60-e9e8-488f-8693-f44bd03582d6` and the NJ reprocessed release `nj-childcare-c79b679e-3267-4238-b4c6-6b43dbef9812`. Expected accepted inputs are 3,007 MA and 4,075 NJ records. Select one manifest per source; do not include NJ's original and reprocessed releases together. Reprocessing does not renew source observation dates; retain NJ's parent manifest and distinct processing time.

The production planner's optional manifest arguments are separate from the existing 25-source postal-migration cohort. Planning must pin the optional manifests, retained artifacts and implementation dependencies. The app-owned run must independently verify these inputs, require exact emitted dependency lineage and retain ordered build/verify receipts. Neither optional selection nor a successful fixture test is a production publication receipt.

## Rollout and rollback

Integration verification passed: all 661 repository tests, source discovery/readiness checks, connector checks, lint, web/desktop builds, desktop control-plane smoke and TypeScript. The production dependency audit reported zero vulnerabilities. Independent review closed assertion and relationship shape gaps with seven self-consistently rehashed negative cases; matching-profile artifacts are byte-identical in the same-version baseline versus childcare fixture comparison.

The application, not a live AI task, owns routine acquisition and this retained-data reconciliation. A hidden standalone controller uses durable local plans, receipts and child-stage logs with no Codex IPC dependency. Source-specific limits still govern concurrency and request rates. Graceful stop finishes the active stage before stopping; abrupt shutdown is not resumable and requires lock/receipt inspection, never blind lock removal.

Run focused integration and policy-negative tests, the full repository check, TypeScript and the production dependency audit before preparing a new production plan. Review its explicit retained-source pins and output scope before executing it. Do not start downloads to perform this integration.

Until a new app-owned run finishes all stages and its outputs are checked, production remains the verified September 7 D.C. refresh without childcare integration. Its completion evidence is in [the D.C. review](DC-CANDIDATE-COHORT-REVIEW-20260907.md#verified-production-reporting-completion). Historical source releases and reporting outputs must remain retained. Rollback requires explicit governed selection/rebuild from the desired retained inputs; do not rewrite immutable releases, old receipts, or historical source-policy decisions.

## Standalone production handoff

`production-childcare-20260907-01` started at `2026-09-07T22:55:26.038Z` as a hidden standalone Node controller (initial PID 7716; registry child 31452). The durable receipt confirmed `RUNNING`, registry-build active and seven subsequent stages pending. This is launch evidence, not completed publication. The operator may close Codex; keep Windows running for the local process.

Plan digest: `c06dd9a2d33ab65b7661589e5f1b64e03c9c1ef3be27e8c2f61feeb1f13d6630`. The explicit plan retains all 25 baseline sources plus exactly two optional releases: MA manifest `c6d811e5743a03d7126d1e34b3763f4c1acbd495a5b4cf68f82c716c50fba1fc` and reprocessed NJ manifest `b873a912c61e1cc13b53bac9ad6265380625344e3d9bb7795217913b8632049e`. Before dispatch, all 7,082 real contributions, 66,717 assertions and 7,082 relationships passed the exact current contracts locally with network access disabled. No source repull is part of this run.

Inspect `data/reconciliations/production-runs/production-childcare-20260907-01/receipt.json` for current status. Controller output is retained in `data/tmp/production-childcare-20260907-01.stdout.log` and `.stderr.log`; child logs are run-scoped. Outputs publish sequentially, not atomically as one cohort. Do not alter pinned code/inputs or start another reporting publication while this controller owns its lock. A new childcare coverage release will require explicit source-roster reassessment before claiming refreshed state-readiness review.

Graceful stop: `node scripts/reconcile-business-production.mjs stop --run-id production-childcare-20260907-01`.
