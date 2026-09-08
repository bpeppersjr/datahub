# Ohio app-owned acquisition

Ohio is selectable under **Childcare / OH** in Co*Tive's Data Operations collection flow. The fixed `scripts/build-oh-childcare.mjs` entry runs current prerequisites, acquisition, retention, verification and normalization without an AI session. It accepts only an optional output directory inside datahub, not URLs, query changes, transport functions, clocks, credentials or resource-limit overrides.

The immutable runtime enrollment is `config/oh-childcare-app-enrollment.json` (`oh-childcare-app@1.0.0`). It completes the previously conditional source-use decision's implementation prerequisite. The historical policy and source-use bindings are unchanged: their old readiness/dispatch flags remain stage-specific evidence, not rewritten history. The app checks the pinned runtime enrollment and policy/decision bytes before network access, and the transport still requires fresh matching notices before records and at completion.

## Durable job flow

1. Persist a UUID `jobs/<id>/start.json` before collection. Record the parent industry run ID when present.
2. Execute the [retained acquisition lifecycle](OH-CHILDCARE-ACQUIRED-RELEASE.md), then sync `acquisition-receipt.json` linking the completed immutable acquisition even if cancellation arrives immediately after its commit.
3. Read a verified in-memory acquisition snapshot and build the existing offline local-review normalized release without another download.
4. Prepare a nonterminal receipt candidate. Independently verify both releases, their exact source-evidence linkage, counts, hashes, processing chronology and job history. Recheck dependency snapshots after linkage reads.
5. Atomically rename the verified candidate to `receipt.json` with `SUCCEEDED`. Verification failure/cancellation cannot leave a newly published success receipt. The final commit is not interrupted by cooperative cancellation.

The managed service separately persists its operation ID and parent industry receipt. The industry log records the child's app receipt path/hash and the parent receipt hashes that log. A managed success therefore means the fixed child completed its own verification—not that Ohio evidence is already integrated nationally. Source raw records and logs are not made downloadable through the public management API.

The acquired manifest retains its original `injected-transport` **engine** classification. The separate app receipt records `fixed-native-fetch` for the production wrapper and `injected-test-transport` for the explicit test seam. Neither is cryptographic proof of native execution; `native_execution_independently_verified` and source-authenticity claims remain false. Test preloads are never imported by production entry points.

## Failure, cancellation and reuse

Ordinary acquisition failures preserve validated partial source evidence but no completed acquisition. Cooperative cancellation cleans only owned unpublished acquisition/normalization staging. App start and failure/cancellation receipts stay available. Once acquisition has committed, later normalization failure or cancellation preserves it and its recovery reference. Reuse it with:

```powershell
npm run oh-childcare:verify-acquired -- <acquisition-manifest.json>
npm run oh-childcare:reprocess -- <acquisition-manifest.json> --output <datahub-output-folder>
```

Do not start another acquisition merely to retry normalization or promote retained evidence. There is no automatic crash recovery, freshness-based download reuse, stale-lock reclamation or automatic schedule activation. Source/executable reservations come from the managed industry runner; app/acquisition output locks add same-root exclusion. A crash or finalization failure may leave a valid unreferenced release; inspect it before another download.

For standalone acquisition and completed-job verification:

```powershell
npm run industry:plan -- --industry childcare --state OH
npm run industry:run -- --industry childcare --state OH
npm run oh-childcare:verify-app -- <app-receipt.json>
```

The direct `oh-childcare:build` command also writes a durable app job but is synchronous. Routine UI downloads should be submitted through the managed collection service and left to the app after its operation receipt is accepted.

## Data and policy limits

Only the publisher's Open Child Care Center cohort and ten selected fields are acquired. Contacts, mailing fields, other care types/statuses and arbitrary metadata links are excluded. Complete current item notices and four reviewed linked/XML availability responses must match; changes stop collection for review. Their known availability gaps remain gaps, not proof that no additional terms exist.

Business records contain nullable latitude/longitude and separate ZIP5/ZIP4. Publisher county text is not a governed county assignment. Open membership and program numbers do not independently establish operation, license validity, unique business identity, ownership, closure or complete industry coverage. All-quarantine source evidence is retained; verified evidence conservation is not a passed business-quality gate. Internal source retention and local-review normalization do not authorize public redistribution, national reporting integration or automated promotion.

## Verification and rollback

Tests exercise pre-network identity, constrained native options, notice/persistence failure, cancellation through a real IPC child, preservation and reuse after normalization failure, concurrency/foreign locks, rehashed linkage tampering, verification-time dependency mutation and atomic terminal publication. A real industry child runs the production CLI against a test-only synthetic fetch preload, retaining ordinary one-second pacing and publishing a canonical industry receipt. It does not contact the publisher.

September 8 verification passed: all 925 repository tests, source discovery/assessment checks, the 47-connector registry, lint, web/desktop builds and desktop control-plane smoke. The production dependency audit reported zero vulnerabilities. Independent review confirmed the atomic-success and dependency-snapshot fixes. The state ledger explicitly keeps Ohio coverage unmeasured until a separate national reporting integration; catalog enrollment is not measured business access.

Rollback removes the Ohio industry entry and new app commands/contract. Preserve completed source releases, app/industry history and the earlier immutable policy/decision. No existing national production pointer is changed by enrollment.
