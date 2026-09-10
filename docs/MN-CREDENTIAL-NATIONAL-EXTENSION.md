# Minnesota credential extension for registry and coverage

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

The production planner does not yet accept or pin this selection. Next add source/implementation evidence pins, runtime reconstruction and expected dependency checks, reject historical recovery additions, and prepare a new plan for review. No earlier plan approval authorizes a new publication. Flat-file export and map/UI consumers must explicitly adopt the credential evidence type before claiming that their national output includes these rows. The existing local credential panel remains separate.

### Production handoff contract

A read-only dependency audit identified 16 consumed local evidence/config files. The production pin helper must first replay `loadMnCredentialRegistryInput`, derive this linked roster, pin raw file SHA-256 and bytes, then replay again to detect changes. JSON-semantic enrollment/policy hashes are not substitutes for file-byte hashes.

- Three configuration files: the registry selection, `config/mn-construction-app-enrollment.json`, and `config/source-policies/mn-construction-internal-acquisition.json`.
- Two selected credential-release files: `manifest.json` and `credentials.jsonl`.
- Eleven files within original job `ebfad910-440e-46bb-b42b-2fc44b6d32f3`: `start.json`, `receipt.json`, `acquisition-checkpoint.json`, `notices-before.json`, `schema-preflight.json`, `publisher-wait.json`, acquisition receipt `acquisitions/c1135a10-c551-4f23-a260-7f132721be43.json`, and the four selected-release files (`manifest.json`, `selected.jsonl`, `selection-receipt.json`, `normalized.jsonl`) within `selected/fcbfe10a-745b-4f8f-96e3-56116414f77f`.

The acquisition receipt embeds after-notices; there is no separate after-notices file. Preserve the verified roster, including optional publisher-wait evidence where present. Do not recursively include unrelated acquisition trees, failed registrations, parent industry receipts, current pointers, live locks, or unconsumed enrollment configurations. No raw CSV reacquisition is needed.

The production implementation must keep Minnesota and retained childcare selections independent, allow their flags together on the registry stage, and deduplicate/sort implementation pins when either extension is present. Bind Minnesota evidence in pre/post-stage pin checks, plan reconstruction and expected registry dependencies. Both historical recovery modes must reject a newly added Minnesota selection; absent selection must preserve historical plan behavior. If dependency-version reproducibility is claimed, explicitly pin `package.json` and the lockfile as well as the imported verifier chain (selected-row replay uses `csv-parse`). These are implementation acceptance requirements, not an already prepared or approved production plan.

The existing local preview was restored after validation, and an HTTP GET to `http://localhost:3000/` returned 200. Refresh scheduler ownership was not changed or reclaimed.

Rollback removes the optional extension selection, modules, builder hooks and CLI flag while preserving source evidence and any created isolated outputs. No source acquisition, refresh schedule, managed operation or current national pointer is changed by this code increment.
