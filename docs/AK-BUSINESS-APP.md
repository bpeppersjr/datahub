# Alaska standalone business-license jobs

The app wrapper `runner/ak-business-app.mjs` exposes `runAkBusinessAppJob({outputRoot, signal, industryRunId, retainedManifest})` and the read-only `verifyAkBusinessAppJob(receiptPath, {signal})`. Unknown option keys are rejected. It does not replace or change historical Alaska connector contracts, source policy, manifests or pointers.

```powershell
node scripts/run-ak-business-app.mjs --output data/business-sources/ak-active-business-licenses/app --retained-manifest <immutable-release-manifest>
node scripts/verify-ak-business-app.mjs --receipt <job-receipt>
```

Omitting `--retained-manifest` selects **fresh acquisition**, not an implicit cache lookup. Native jobs use the existing Alaska builder with fixed publisher endpoints, default quality/CSV/resource limits and the existing Census ZBP prerequisite. They publish only inside their own `jobs/<UUID>/acquired` directory, never the historical global source pointer. Retained mode independently verifies an existing canonical immutable release and records its original path/hash without downloading or rewriting it.

The new app contract is `config/connectors/ak-active-business-licenses-app.json`, semantic SHA-256 `ce5b8e425cb17d2362709ee40446fa9d943704a6d2d762cf10007df9379f96ed`. Source policy semantic SHA-256 remains `e5444e478e878f49c1f71f12dfefdfc1ed873e7af0b48a692108d488f2b50d38`. These pins hash `JSON.stringify(parsedJSON)` for line-ending portability. Source-manifest and start-receipt hashes bind raw bytes.

Each invocation takes an exclusive root lock, allocates a UUID job, and durably records a start receipt. Success is written to a private candidate, independently replay-verified against source evidence, then promoted to `receipt.json`. The verifier rejects cross-job borrowing in native mode, modified source/receipt claims, unknown policy/configuration versions, path aliases and staging references. Its execution label is a recorded mode, not independent proof of network provenance. It verifies successful receipts only; failed/cancelled receipts are retained diagnostic records, not successful source attestations.

A cooperative 30-minute wrapper deadline includes prerequisite checks, acquisition and app verification. Source commit may finish its bounded noncancellable publication before the wrapper observes cancellation; cancelled control outcomes can therefore retain complete or partial data. Failure receipts mark inspection required. Receipt-write or lock-cleanup failures may leave start/candidate/source evidence without a clean terminal result; never automatically retry or delete that evidence. OS calls, synchronous work and forced process termination are not transactionally bounded or recovered. No recurring schedule or successful live acquisition is established by this implementation.

Counts preserve Alaska license-based organization candidates and eligible **provisional** site/establishment evidence, not independently confirmed operating businesses. Reported source-active status and NAICS classifications remain source assertions. ZIP5 and ZIP4 stay separate; no business polygons are introduced. Record-level output remains local-review-only, public export is false, and national reporting integration is explicitly false in the new job receipt until a separate verified promotion.

Native source work belongs to the standalone app. Retained promotion/review must reuse verified releases rather than repull them. An actual accepted operation ID and persisted receipt—not configuration alone—establish an app handoff.

Managed industry source/executable reservations prevent overlapping runs of the same enrolled source. The standalone wrapper lock is specific to its output root; it is **not a global publisher gate** across independently chosen output directories. Do not launch parallel standalone acquisitions to multiply publisher traffic.

## Observed retained app job — September 8, 2026

Standalone app job `f67a2428-ced8-48e6-80a2-25226a058bca` succeeded in `retained-local-verification` mode, from `2026-09-08T15:20:56.901Z` to `2026-09-08T15:20:59.379Z`. The independent app verifier checked its receipt at `data/business-sources/ak-active-business-licenses/app/jobs/f67a2428-ced8-48e6-80a2-25226a058bca/receipt.json`, SHA-256 `485445f597e34d1868f2b8d6019a407002a54a39ee229ce2a5e797ce6bf2697b`.

The job reused release `ak-active-business-licenses-20260903-003659626Z-9f5638ea`, manifest SHA-256 `1c190b403359e2f9a447479e509555011dcd640943366c804f5612cd6e035930`: 94,886 active-license source rows, 94,884 license-backed organization candidates, 94,550 provisional sites and two quarantined rows. These are not verified unique operating businesses. No new provider download, managed collection operation, recurring schedule or national promotion was dispatched by this retained job.

The industry configuration enrolls `state-ak-business-licenses` under `local-business-licenses`, publisher state `AK`, using the standalone CLI. Source selection and state-ledger tests distinguish enrollment from measured access and actual dispatch. Future explicit refreshes run in Co*Tive workers without occupying a Codex agent for download supervision.

Rollback: first check active app operations, then remove the Alaska source from industry configuration and revert the new wrapper, contract, CLIs and ledger mapping. Preserve all receipts, source releases and any locks or staging requiring ownership inspection. Historical source contracts and pending production pins are unchanged.

Validation: two offline acceptance groups exercise 80,000 synthetic license/NAICS rows through the native acquisition path, conservative counts, offline retained CLI verification, concurrency, failed/cancelled receipts, unsafe output, configuration drift and tampering. Fifty industry/ledger/catalog integration tests passed. `npm run check` passed with 1,174 tests (1,163 passed, 11 skipped, zero failures), lint, web/desktop builds and desktop smoke. TypeScript passed and `npm audit --omit=dev` reported zero vulnerabilities. All 82 pending production code/config pins remained unchanged. Historical Alaska pointer SHA-256 remains `7eaf153fabab8faa485f5df3be8df7ed880dd213faca3e1be8b5a855aae4e286`.
