# Minnesota credential extension for registry and coverage

Latest status (September 10, 2026): the production-planner follow-up passed the complete rerun: 1,863 tests, 1,852 passed, 11 skipped, zero failures, plus lint, web/desktop builds and desktop control-plane smoke. TypeScript passed and the dependency audit found zero vulnerabilities. Final evidence: `data/tmp/mn-credential-production-full-check-rerun.log`. Plan `production-mn-credentials-20260910-01` is prepared and unexecuted. The attempt/rerun paragraphs below retain the validation history; they are not current blockers. No acquisition or production pointer changed.

This increment adds a separately versioned reporting extension to the national registry and national/state/reported-ZIP coverage builders. It reuses the existing verified Minnesota residential credential cohort. It does not acquire data, merge licenses into business identities, promote production or establish complete construction-industry coverage.

## Fixed source selection

`config/mn-credential-registry-selection.json` pins the immutable credential reporting manifest `data/credential-reporting/mn-construction/30cd9c0e-0a8d-467c-b416-150453e1513f/manifest.json` by SHA-256 `558182417940580140fbc4640e80ac177b6a9c1886a435f06ae8130b1f258b75`. It is an explicit selection, not a new acquisition or authorization. Neither a current pointer nor whichever release happens to be installed is an acceptable substitute.

`loadMnCredentialRegistryInput` verifies the full original app/acquisition/reporting chain, consumes the bounded credential artifact, checks its exact hash/bytes/count and re-verifies the source and selection afterward. It preserves all 11,456 existing reporting envelopes, including repeated credential numbers, their release-scoped row identities, original observation times, unparsed source dates and historical claims. The loader caps input at 150 MB and 250,000 rows; it is bounded in-memory processing, not an unlimited streaming national loader or an allocated RAM budget.

## Registry boundary

The optional `mnCredentialSelection` builder input and `--mn-credential-selection` registry CLI flag opt into this extension. The caller must also select the registry's usual baseline inputs and output scope. Do not invoke a default production build merely to test this flag. No production command was dispatched for this increment.

The registry writes `reporting/mn-construction/credentials.jsonl` as `mn-construction-credential-reporting-jsonl`, with `local-review-only` policy. `mn_construction_credential_reporting` binds the selection, source manifest, original app receipt and exact reporting summary. A distinct dependency identifies the retained credential release. `coverage.mn_construction_credential_rows` is separate from legacy `source_records`; no new composite total is presented as a business count.

The rows do not enter canonical organizations, physical sites, establishments, identity assertions, relationships or matching/location profiles. Original credential envelopes still contain their historical `national_reporting_integrated:false` claims; source history is not rewritten when a downstream extension is built. Extension presence identifies downstream inclusion, not retroactive source authorization or independently verified business operations.

The independent registry verifier runs for historical and extended manifests. Without a declaration, it rejects a reserved artifact path or type, dependency or credential count. With a declaration, it replays every source row, rejects duplicate dependencies and requires the exact restricted artifact policy. A relabeled reserved path cannot bypass the verifier. Registry processing time cannot precede the selected retained release.

## Coverage and percentage semantics

The coverage builder propagates the extension automatically from an explicitly extended registry. Credential metrics are separate fields, never additions to physical-site or matching totals.

- `registry-union` counts every row in the selected credential cohort.
- `50-states-and-dc` counts rows whose reported address state is one of those 51 jurisdictions.
- `all-census-us-areas` counts rows reporting a state-equivalent present in the selected Census state views. Publisher jurisdiction is never substituted for a missing reported address state.
- State and ZIP metrics group the reported fields. Unknown states and ZIPs absent from existing views are counted explicitly in the declaration rather than silently dropped.
- County credential counts are null: this source supplies no geocodes or governed county membership. Joining a ZIP does not establish ZCTA or county assignment.

The full retained source cohort is the denominator for `percent_of_selected_credential_cohort` and category share across that cohort. Category share within a selected geographic cohort uses that cohort's credential-row total. Zero denominators produce null. These percentages are not estimates of all U.S. construction businesses, and national completeness, unique-business and active-business counts remain null.

The retained dataset contains 10,899 MN-reported-address rows and 557 other-state rows. One ZIP5 is unavailable. ZIP5 and ZIP4 remain separate; coordinates remain null. Names, addresses, credential status and source dates remain publisher assertions, not verified physical premises, present operation, ownership or business lifecycle dates.

Coverage retains a checksum-bound internal registry manifest copy and independently replays the credential input and derived metrics. It checks copy policy/bytes/count, the exact registry dependency, restricted view policies and chronology. When childcare and credentials share an output, all view artifacts take the stricter `local-review-only` policy; the childcare verifier accepts this specific intersection without widening historical output rules. Missing declarations and dropped extensions are rejected.

## Verification, rollout and remaining work

Tests cover explicit selection, orphan/relabelled artifacts, repeated credentials, missing ZIPs, outside-state scope, zero denominators, exact source replay, mutated fields/policies/counts, processing chronology and legacy count preservation. Native builder tests use local isolated fixtures and the real retained credential input, not production pointers.

Validation on September 10, 2026: `npm run check` completed successfully with 1,857 tests (1,846 passed, 11 skipped, zero failures), lint, web/desktop builds and desktop control-plane smoke. The retained-data gates were enabled, including the new 11,456-row offline replay and combined Minnesota/childcare coverage test. Full evidence is retained in `data/tmp/mn-credential-national-extension-full-check.log`. Focused native registry and coverage checks also passed; TypeScript passed and `npm audit --omit=dev` reported zero vulnerabilities. No browser visual QA is claimed.

Production-planner follow-up is implemented in the current worktree but not yet released: `plan --mn-credential-selection <selection.json>` uses a separate evidence pin, reconstructs the selection at execution, checks retained files before and after each stage, and requires the credential dependency in registry output. It can coexist with retained childcare and rejects either historical recovery mode before readiness inspection. The real 16-file helper replay, CLI rejection tests and isolated Minnesota-only/combined eight-stage controller tests passed. Full repository validation remains pending; the successor plan below is prepared but unexecuted. No earlier plan approval authorizes a new publication. Flat-file export and map/UI consumers must explicitly adopt the credential evidence type before claiming that their national output includes these rows. The existing local credential panel remains separate.

### Production handoff contract

A read-only dependency audit identified 16 consumed local evidence/config files. The production pin helper must first replay `loadMnCredentialRegistryInput`, derive this linked roster, pin raw file SHA-256 and bytes, then replay again to detect changes. JSON-semantic enrollment/policy hashes are not substitutes for file-byte hashes.

- Three configuration files: the registry selection, `config/mn-construction-app-enrollment.json`, and `config/source-policies/mn-construction-internal-acquisition.json`.
- Two selected credential-release files: `manifest.json` and `credentials.jsonl`.
- Eleven files within original job `ebfad910-440e-46bb-b42b-2fc44b6d32f3`: `start.json`, `receipt.json`, `acquisition-checkpoint.json`, `notices-before.json`, `schema-preflight.json`, `publisher-wait.json`, acquisition receipt `acquisitions/c1135a10-c551-4f23-a260-7f132721be43.json`, and the four selected-release files (`manifest.json`, `selected.jsonl`, `selection-receipt.json`, `normalized.jsonl`) within `selected/fcbfe10a-745b-4f8f-96e3-56116414f77f`.

The acquisition receipt embeds after-notices; there is no separate after-notices file. Preserve the verified roster, including optional publisher-wait evidence where present. Do not recursively include unrelated acquisition trees, failed registrations, parent industry receipts, current pointers, live locks, or unconsumed enrollment configurations. No raw CSV reacquisition is needed.

The production implementation must keep Minnesota and retained childcare selections independent, allow their flags together on the registry stage, and deduplicate/sort implementation pins when either extension is present. Bind Minnesota evidence in pre/post-stage pin checks, plan reconstruction and expected registry dependencies. Both historical recovery modes must reject a newly added Minnesota selection; absent selection must preserve historical plan behavior. If dependency-version reproducibility is claimed, explicitly pin `package.json` and the lockfile as well as the imported verifier chain (selected-row replay uses `csv-parse`). These are implementation acceptance requirements, not an already prepared or approved production plan.

### Successor-plan preparation and validation history

Native planning completed successfully for `production-mn-credentials-20260910-01`, SHA-256 `f082d6f3b69a16e28881f368c6607cf9463c2177ca65b1bb1e50127f9f4969c5`, stored under `data/reconciliations/production-plans/`. It contains 25 base sources, four optional source bindings, seven retained childcare bindings, all 11,456 Minnesota credential rows, 16 Minnesota evidence pins and eight stages with `national-12g`. Comparison against the completed predecessor confirmed the entire optional-source and retained-childcare pin objects are unchanged. There is no execution receipt for this successor. This is a prepared plan awaiting validation/review, not production promotion or a new acquisition. Planning output is retained in `data/tmp/mn-credential-production-plan.log`. Any implementation changes after preparation require a new plan; do not rewrite this immutable plan.

The completed plan `production-childcare-retained-20260910-01` remains immutable. Its successor must preserve its four explicit optional source bindings (`maChildcare`, `njChildcare`, recovered `tnChildcare`, and `ohChildcareReceipt`), `config/retained-childcare-registry-selection.json` with all seven retained childcare cohorts, and `national-12g`. Add only `config/mn-credential-registry-selection.json`; do not silently substitute fresh Tennessee, omit childcare inputs, or use historical recovery. Read the original plan's exact manifest/receipt references when preparing the successor. Revalidate current source and output pointers for the new plan rather than copying the completed plan's prior-output assumptions. A new plan is still required before any production execution.

The production follow-up's focused checks passed, including exact retained roster replay, early historical-recovery rejection, CLI argument rejection, and the isolated controller's Minnesota-only and combined-input paths. The combined controller fixture uses one synthetic childcare binding; it does not claim a real seven-cohort production execution. The controller tests assert an eight-stage success and rejection of pre-launch evidence drift, rehashed-plan tampering, incorrect dependency multisets and a changed input during registry build (no subsequent stage launches). The test launcher removes inherited `NODE_TEST_CONTEXT` and requires positive child-test output, so a subprocess that exits without executing assertions cannot count as a pass. TypeScript and the dependency audit passed. Full validation is running in `data/tmp/mn-credential-production-full-check.log`; no result or production promotion is claimed yet.

### Pre-publication comparison baseline

The successor's pinned predecessor registry (`national-business-registry-20260910-132939322Z-176d0af2`) reports 33,992,773 legacy source records, 12,206 retained childcare candidates, and 34,004,979 source records including childcare. It reports 19,247,120 organization rows, 8,025,017 physical-site rows and 8,025,017 establishment rows. These are existing modeled/source counts, not independently verified unique active businesses. The Minnesota extension should leave these legacy counters unchanged and add only its separately named 11,456 credential-row count.

The pinned predecessor coverage has three national views, 3,235 county views and 48,194 ZIP-union views. Of the ZIP views, 47,995 have record-level source contributions and 199 do not; 33,791 have a ZCTA polygon and 14,403 do not. The ZIP union is not an authoritative count of currently valid USPS ZIPs, and absent ZCTA polygons do not authorize invented ZIP geometries. Production comparison must preserve the existing view scopes and contribution counts while verifying the new credential fields and missing-ZIP accounting. It must not relabel these baseline gaps as resolved by credential inclusion.

### Validation rerun

Validation follow-up: the first production full-check attempt ended with 1,851 passes, 11 skips and one development-supervisor failure reporting an existing vinext process on port 3000. Inspection afterward found that PID and all dev supervisors absent; no process was force-terminated or lock reclaimed. Both supervisor tests then passed without source changes (`data/tmp/mn-production-supervisor-recheck.log`). A complete rerun is underway in `data/tmp/mn-credential-production-full-check-rerun.log`. The first attempt did not reach lint/build completion and is not a full pass. The prepared plan remains unexecuted.

### Consumer implementation boundaries

`app/retained-credentials.tsx` currently labels its local evidence as not included in published national totals. Its `/api/retained-credentials` reader (`runner/retained-credentials-view.mjs`) verifies local reporting/coverage enrollment and returns `nationalReportingIntegrated:false`; it does not read the national production pointer. Preserve these original reporting claims. Once an extended national release actually exists, add a separately verified downstream-publication status, bound to the exact selected credential manifest and registry/coverage releases. Do not infer inclusion merely because this code or a plan exists, and do not use an unverified pointer as evidence.

The heatmap's existing retained county layer is for PA/MD childcare source points. Minnesota credentials have no coordinates or governed county/ZCTA membership, so this layer cannot render them as assigned points. Any credential view must use reported-state/reported-ZIP groups, retain missing-ZIP visibility, label cohort denominators explicitly, and leave county/point values unavailable. Flat-file support must explicitly select the credential artifact type and enforce its local-review-only policy; it must not route credentials through location profiles or silently omit restrictions. These consumer changes are not implemented by the production-planner increment.

The local preview was restored after the successful production-planner validation rerun, and an HTTP GET to `http://localhost:3000/` returned 200. Refresh scheduler ownership was not changed or reclaimed. No browser visual QA is claimed.

Rollback removes the optional extension selection, modules, builder hooks and CLI flag while preserving source evidence and any created isolated outputs. No source acquisition, refresh schedule, managed operation or current national pointer is changed by this code increment.
