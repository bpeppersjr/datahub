# Minnesota credential publication-status reader

The standalone data-service helper `runner/mn-credential-publication-status.mjs` exposes verified downstream publication separately from historical source claims. It does not modify retained records, production pointers, the existing retained-credentials API/UI, managed operations or export behavior. See [the adoption-gap audit](MN-CREDENTIAL-ADOPTION-GAP-2026-09-12.md) for the remaining consumer work.

## API and consumer handoff

Call `loadMnCredentialPublicationStatus({signal})`. The optional `root` is for an app-contained checkout/fixture root; ordinary application consumers should omit it. The helper accepts no caller-selected production receipt, arbitrary release, evidence hash or source URL. Invalid options are rejected, and caller cancellation propagates instead of being mislabeled as unavailable evidence.

Successful native metadata verification returns `status:'verified-downstream-publication'`, `verificationMode:'retained-metadata-read'`, `included:true`, `credentialRows:11456` and `recordUnit:'publisher-business-credential-row'`. It includes the reporting, production, registry and coverage release/hash bindings, the original `sourceObservedAt` separately from `productionFinishedAt`, and read-count/byte diagnostics. It returns no provider values, raw source bodies or local receipt paths.

`historicalSourceNationalReportingIntegrated:false` remains false. This reports the original source contract; it is not overwritten by downstream inclusion. Unique/active business counts, physical sites and national completeness remain null; geographic assignment and public-export authorization remain false, and policy remains `local-review-only`. Consumers must not add these credential rows to business, identity-matching or physical-site totals.

Missing enrollment returns `status:'not-enrolled'`; missing referenced evidence returns `evidence-unavailable`; changed, malformed, unsupported or mismatched proof returns `evidence-unverified`. All three return `included:null` and `credentialRows:null`. None asserts that a national release was never published. The coding lane can use this independent object to replace the stale panel exclusion text while preserving existing historical flags; the helper itself performs no consumer integration.

## Verification boundary and limits

The only production receipt pin is the already reviewed completed run `production-mn-credentials-20260910-01`, SHA-256 `b4e594d2b74058e6519e0e88ca5272247bd87c29c14312940713ade97ffcc3c5`. The reporting manifest pin is the existing reviewed `30cd9c0e-0a8d-467c-b416-150453e1513f` selection, SHA-256 `558182417940580140fbc4640e80ac177b6a9c1886a435f06ae8130b1f258b75`. No new release or evidence pin was invented.

The helper checks 14 files: credential coverage enrollment, production receipt, all four current pointers and their manifests, registry selection, selected reporting manifest, original app reporting enrollment and original app receipt. Output hashes are bound to the pinned completed production receipt. Reporting selection, source artifact descriptors, counts, source clock, chronology, native original-app mode and restricted claims are cross-checked. All files are read again to detect graph drift.

Reads use the existing app-contained, bounded, single-link/stable-file JSON reader. Configs/pointers are capped at 10 KB, receipts at 1 MB, individual manifests at 4 MB, and cumulative bytes across both passes at 32 MB. There is no persistent status cache. The helper never opens stage logs, credential row artifacts, national/state/ZIP views or the original large source chain. `sourceReplayThisRead`, `stageLogsReplayedThisRead` and `credentialArtifactRehashedThisRead` are explicitly false. It verifies the retained publication proof and descriptor bindings, not a new replay or revalidation of all 11,456 row bytes. A future production pointer requires a separately reviewed supported proof and currently returns unverified status.

The separate `loadMnCredentialPublicationStatusWithTestReader` entrypoint is for fabricated graphs only. Its mode is `synthetic-test-reader`, success is `synthetic-fixture-matched`, and `included` remains null even when the fixture matches. It cannot mint a native verified-publication response.

## Focused evidence

Six tests passed with zero failures or skips, including synthetic graph links, missing/drifted proof, changed flags/counts/pointers/chronology, second-read drift, size limits, cancellation, invalid root/accessors, and the opt-in real small-chain check. The real check returned `included:true`, 11,456 credential rows and original observation `2026-09-08T13:11:41.678Z`; it read exactly 14 files twice, totaling 1,205,694 bytes. This was metadata-only local validation, with no source requests, row replay, stage-log replay or production rebuild.

Run `node --test runner/mn-credential-publication-status.test.mjs` for fixture coverage. Set `MN_PUBLICATION_REAL_ROOT` to an existing approved local datahub root to enable the real small-chain test; it launches an isolated reader process with that root and performs no writes. Without that variable, the real-data case is explicitly skipped. No full-check, application runtime, consumer/UI validation, acquisition or export claim is made by this slice.
