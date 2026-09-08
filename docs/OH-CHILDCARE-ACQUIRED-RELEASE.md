# Ohio retained acquisition lifecycle

`runner/oh-childcare-acquired-release.mjs` owns durable storage around the guarded acquisition transport. Its original increment was exercised with injected synthetic responses only. The subsequent [app-owned native wrapper](OH-CHILDCARE-APP.md) uses this unchanged engine, records separate execution provenance and enrolls Ohio in managed industry collection. Enrollment does not change a production pointer or activate a schedule.

## Retention and verification

The lifecycle reserves an exclusive `.acquire.lock`, checks at least 400 MB free disk, and creates a UUID staging directory inside datahub. It then performs the following work in order:

1. Run the fixed full preflight and current-notice checks. Sync `prerequisite.json`, then sync `ready.json` binding that file's exact hash and recorded retention time. Only then permit ID or facility requests.
2. Validate and sync each inventory or selected-field page as `observation-NNNN.json` before requesting the next response. Unselected/private fields fail validation before journaling. Journal observations remain internal.
3. Recheck final inventory, metadata and notices. Retain the exact acquisition replay envelope separately inside `acquisition.json`, alongside the paired source-use packages and explicitly reported transport accounting.
4. Independently replay acquisition membership, source-use bindings, checkpoint linkage, journal order/content/times, counts and artifact hashes. Repeat verification after the final caller hook, check ownership, then atomically rename the staged bundle into `releases/oh-acquisition-<UUID>`.

The manifest is written last. There is no mutable current pointer: a future enrolled app operation must persist the returned immutable manifest path and hash in its operation receipt. Verification can inspect staging internally, but standalone reuse requires a completed immutable release.

Both the original before-row package and the final source-use package must match their exact acquisition preflights. Historical verification uses the recorded timestamps, not today's clock; this permits reuse without treating an expired prerequisite as approval for another acquisition. A ready checkpoint binds the actual retained bytes, not merely a reserialized equivalent. Journal reads are bounded by expected canonical envelope sizes and a 101 MB aggregate ceiling, after the acquisition envelope itself has passed validation.

All evidence is local/internal. The receipt explicitly does **not** establish native execution, provider authenticity, independently measured transport bytes, legal approval, current business operation, export approval or national reporting integration. Error/partial transport bytes are accounting only, not stored successful source observations. Full source error messages and private response bodies are not logged or retained by this lifecycle.

## Failure and recovery boundaries

- Ordinary failures retain already validated prerequisite/page evidence for inspection but publish no release. Incomplete journals are not completed acquisitions and cannot be automatically resumed or promoted.
- Cooperative cancellation removes only the current run's individually owned unpublished files and empty staging directory. Prior releases and foreign/replaced files are preserved.
- Exclusive ownership is checked using canonical paths, file identities and lock contents. Alias/hardlink and immutable-output protections reuse the existing offline release I/O contract.
- A process crash may leave staging and a lock. There is no age-based lock reclamation, automatic crash recovery, cross-root reservation or scheduler retry claim. Source-wide exclusion belongs to the existing managed industry runner when native enrollment is implemented.
- Publication's final rename is a commit boundary. A later finalization failure can leave an intact unreferenced immutable release; inspect and verify it instead of blindly downloading again.

## Standalone reuse

These commands require only the app's Node runtime, not an AI session:

```powershell
npm run oh-childcare:verify-acquired -- <immutable-acquisition-manifest.json>
npm run oh-childcare:reprocess -- <immutable-acquisition-manifest.json> --output <datahub-output-folder>
```

Reprocessing passes the verified in-memory acquisition snapshot to the existing offline normalizer, with no network. It emits a new offline local-review release plus the parent acquisition manifest/hash in its CLI result. It does not relabel the legacy normalization policy as live-acquisition approval. ZIP5 and ZIP4 remain separate; business coordinates remain latitude/longitude only. Existing offline manifests and policy versions are unchanged.

## Acceptance and next handoff

Synthetic regressions cover before-ID persistence, ordered page retention, partial failure, cancellation, exclusive writers, foreign locks, location guards, mutation/rehashed tampering, exact checkpoint bytes, padded/invalid journal rejection and real standalone verification/reprocessing child processes. Independent review identified and corrected the journal allocation and checkpoint-byte binding gaps.

Validation passed on September 8, 2026: all 913 repository tests, source discovery/assessment and connector checks, lint, web/desktop builds and desktop control-plane smoke. The production dependency audit reported zero vulnerabilities. The local management preview was restored successfully after exclusive lifecycle testing. This evidence covers synthetic acquisition and local reuse, not live publisher downloads or national completeness.

The [fixed native app entry and runtime readiness record](OH-CHILDCARE-APP.md) now connect verified acquisition/normalization receipts to managed collection. Only an accepted operation ID and persisted app receipt constitute a download handoff; no Codex polling loop should supervise it. National reporting/promotion remains a separate verified use of retained evidence.

Rollback is code-only: remove the new entry points and additive transport hook/IO exports. Do not delete retained evidence or rewrite historical releases, policies or production pointers.
