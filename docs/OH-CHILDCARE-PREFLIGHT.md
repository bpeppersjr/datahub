# Ohio publisher-open childcare prerequisite

`node scripts/preflight-oh-childcare.mjs` runs ten serial fixed-endpoint metadata/aggregate/count requests and publishes an immutable prerequisite receipt. `--help` makes no request; arbitrary endpoints and other arguments are rejected. This is not a facility downloader, acquisition approval, schedule or national integration.

The source and initial subset are specified in [the status follow-up](states/OH-CHILDCARE-STATUS-2026-09-08.md). Preflight binds the current layer and publisher item, 28-field schema, exact source Web Mercator WKT, Query/pagination/statistics capabilities, complete item `licenseInfo`/description strings and selected layer notices. Explicit projections exclude private endpoint metadata. Stored publisher HTML is untrusted evidence, not executable/renderable UI content.

The sequence is layer, item, status aggregate, all-center count, Open-center count, then the reverse. Paired projections must match. The three reviewed status groups must sum to the independent center count, and Open must equal the independent selected count. Changed counts can pass in a later consistent run; today's totals are not hardcoded. Unknown/null/duplicate status groups, unexpected response fields containing facility attributes, transfer-limit indicators, mismatched counts and changed metadata fail closed for review. Enforcement is never relabeled closed. Paired checks are not a transactional snapshot or proof of actual operation.

Transport has a 128 KiB per-response cap, UTF-8 validation, 15-second deadline covering body reads, three maximum attempts and one-second spacing between successful observations. Retryable 429/5xx responses honor Retry-After; waits above 60 seconds defer rather than bypassing the provider delay. No redirects, tokens, login fallback or CSV access-code flow is used. Cancellation stops subsequent requests and aborts stalled reads. Errors do not echo publisher body text or caller-provided URLs.

Receipt publication validates full deterministic reconstruction, confines canonical paths to datahub, rejects junctions and release/staging/bundle destinations, synchronizes an exclusively created temporary file and publishes without replacing another receipt. Concurrent calls produce different immutable files. Cancellation before publication removes only the owned temporary file; publication is the commit boundary. Receipts are structural evidence, not cryptographic proof that a caller-provided transport actually contacted a publisher.

## Live evidence

The live run from `2026-09-08T05:05:08.173Z` through `2026-09-08T05:05:18.499Z` retained:

```text
data/business-sources/oh-dcy-publisher-open-childcare-centers/preflights/958574ce-359d-4e48-a6d4-146477065d82.json
SHA-256: 70d79fd5e9f86d8c7e8cbc652126d28bcb64d1abc34e86e2f245a16db020fe71
Bytes: 36631
```

Ten observations replay successfully: 4,237 publisher-open center rows, 102 Inactive and five Enforcement, totaling 4,344 center-directory rows. Zero facility rows or IDs were requested. Raw HTTP bodies, linked notices and XML are not claimed retained by this version. Prior XML unavailability observations remain in the separate research document, not falsely promoted into this receipt.

## Remaining acquisition work

The offline acquisition contract is now implemented in `runner/oh-childcare-acquisition.mjs` (`oh-childcare-acquisition@1.0.0`). It builds fixed selected-field queries with numeric sorted ID batches capped at 100 records and 2,000 encoded URL bytes. Replay checks two fully reconstructed preflights, unchanged projected metadata/status counts, matching before/after inventories, exact page membership, hashes, chronology, and 8 MB individual/100 MB cumulative declared-response and serialized-payload ceilings. Agreement between inventories does not excuse pages with different members. These are supplied-evidence checks, not proof of actual network traffic or a transactional snapshot.

Returned records must contain exactly the ten selected native fields, with publisher `Open`/`Child Care Center` and Ohio scope. Contact and mailing fields are rejected. Point responses must explicitly identify EPSG:4326; missing, empty, zero, globally impossible and outside-padded-Ohio points carry distinct quality reasons. Partial/nonnumeric points, incompatible CRS and nonpoint geometry fail. The padded envelope is not a governed boundary or address verification. Nullable/blank ZIP strings and native finite Double program-number anomalies are retained for later normalization, not silently converted into identifiers. ZIP5/ZIP4 normalization and typed identifier validation are still pending.

Seven synthetic offline tests cover membership replacement, privacy/schema drift, scope, point quality, resource ceilings, evidence chronology, cancellation and input preservation. Replay performs no network, file publication, agreement acceptance or policy authorization; its authorization/export/transport-verification flags remain false. The development policy is not promoted by passing these tests. Raw-source retention, bounded HTTP execution, normalization, immutable release verification and app enrollment remain required before a live acquisition handoff.

- Follow-up [notice/XML availability review](states/OH-CHILDCARE-NOTICES-2026-09-08.md) confirms unchanged retained item notice strings, explicit XML errors and unavailable linked department notices. The new `oh-childcare-local-review@1.0.0` development policy fixes scope without granting live acquisition. The map includes rated and unrated programs; do not label this cohort SUTQ-rated-only. Earlier preflight receipts remain unchanged.
- Review complete available linked notices and retain explicit XML availability evidence; bind a source-use policy. Missing XML by itself is not a permanent universal prohibition, but this partial metadata check is not policy approval.
- Connect the offline ID/page and point contract to bounded HTTP acquisition, source-native retention, normalization with separate ZIP5/ZIP4, temporal provenance, quarantine and independent immutable-release replay.
- Enroll the validated connector in Co*Tive with a persisted operation ID and receipt. The app owns routine downloads/refreshes. Do not occupy an agent with progress polling or repull retained data for promotion.

Rollback is code-only for this additive prerequisite. Preserve retained research/preflight receipts and existing business releases. No production pointer or schedule is changed by this implementation.

## Verification boundaries

September 8 acquisition-contract follow-up: the full repository check now passes all 870 tests, source checks, lint, web/desktop builds and desktop control-plane smoke; the production dependency audit reports zero vulnerabilities. The additional peer-requested same-inventory/different-page regression also passed in the focused seven-test suite. The older prerequisite-only failure below is historical and was resolved by the separate Tennessee reassessment work. No live source acquisition or production data changes were performed for the offline acquisition contract.

Ten Ohio tests pass, including independent-review regressions rejecting nested unvalidated field lengths. The live receipt replays after that fix. The full test invocation covered 843 tests: 842 passed, with the development-supervisor test blocked by the active preview. An exclusive rerun with TEMP/TMP inside datahub passed both supervisor tests and all ten Ohio tests. Lint, TypeScript, web/desktop builds, desktop control-plane smoke and the production dependency audit (zero vulnerabilities) passed.

`npm run check` itself did **not** pass: source-discovery validation rejected the newly published Tennessee coverage release because its exact reassessment transition is not yet implemented. Do not describe component checks as a clean full-check result. The app's terminal production receipt records success at `2026-09-08T05:02:04.618Z`; the next separate integration change must review that release against the retained MA/NJ predecessor, not weaken the guard. All 40 production implementation/script pins were unchanged during Ohio work.
