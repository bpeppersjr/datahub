# Iowa standalone collection ownership

The Iowa worker joins the existing Co*Tive industry queue as `state-ia-childcare-centers`, scoped only to Iowa childcare. It composes [bounded acquisition](IA-CHILDCARE-ACQUISITION.md) and [offline normalization](IA-CHILDCARE-NORMALIZATION.md); no new server or worker dispatch branch is required.

Native mode uses the fixed published map contract. Retained mode verifies an explicit existing acquired manifest and performs only local processing. Injected transport remains test-labelled, including when its retained evidence is read by a subprocess. Acquired releases use their own global unique IDs; normalized outputs belong to the app job. Before success, verification checks child hashes, source modes, timestamps, job-specific normalized paths and all receipt files.

The app persists immutable start, acquired, normalized and terminal evidence under its output root. Output ownership and native publisher exclusion prevent overlapping runs. Acquisition also enforces its own request exclusion. Cancellation drains child work before writing terminal cancellation evidence and releasing locks. Once a child manifest is committed, its final read-only verification drains without the cancelled signal and returns its descriptor for parent checkpointing; the parent records that reference before stopping at the next cancellation boundary. A regression test cancels at publication and proves the acquired release remains referenced and reusable with source requests disabled. There is no automatic retry, crash recovery or recurring refresh enabled by this enrollment. Unknown publication state and stale locks require inspection; preserved acquired releases can be explicitly reused.

Run from the repository without Codex or ChatGPT:

```powershell
node scripts/build-ia-childcare.mjs
node scripts/build-ia-childcare.mjs --acquired "<absolute acquired manifest path inside datahub>"
node scripts/verify-ia-childcare-app.mjs --receipt "<absolute app receipt path inside datahub>"
```

The first command performs a new bounded collection; the second reuses acquired data offline. Do not rerun native collection merely to promote or reprocess an existing verified release. The CLI accepts the queue's `--output` argument and `INDUSTRY_SEGMENT_RUN_ID` environment binding, and exits successfully only after independent receipt verification.

Enrollment and tests do not prove dispatch, successful collection or measured coverage. Actual handoff requires a managed operation ID and persisted receipt. After acceptance, Co*Tive owns downloads; agents return to validation/connector work without routine download polling. The state-access ledger keeps configured execution separate from national coverage and submitted operations.

Source records remain internal center/preschool candidates, not verified current businesses or unique establishments. Source ZIP5 and ZIP4 remain separate; unknown update clocks, address role, reported state and point accuracy remain quality gaps. No national production pointer, public export permission or recurring schedule changes here.

Release checks passed: `npm run check` (1,486 tests; 1,475 passed, 11 skipped, zero failures), lint, desktop build, desktop control-plane smoke, TypeScript and production dependency audit (zero vulnerabilities). Log: `data/tmp/ia-app-full-check.log`. All 82 held national production-plan pins stayed unchanged. App tests include a separate-process retained-input CLI run, independent CLI verification, overlap exclusion, cancellation, child-reference tampering and cancellation exactly at acquisition publication followed by successful offline reuse. The live management plan selected exactly one Iowa task; planning is not dispatch.

Any accepted operation will be recorded below. Rollback removes the Iowa industry entry and isolated app modules without deleting historical receipts or acquired/normalized artifacts.

## Verified app-owned collection — September 8, 2026 local

Co*Tive accepted operation `8681405a-0034-435a-bbe9-96263816381d` at `2026-09-09T02:14:33.325Z` and completed it at `2026-09-09T02:14:38.377Z`. The saved managed receipt is `data/managed-operations/8681405a-0034-435a-bbe9-96263816381d/receipt.json`, observed terminal SHA-256 `c9e8af1936171b54ef7bea0f5508991fe18400afe06146cfd159deb8a3685952`. Its exact selection was childcare / IA / `state-ia-childcare-centers`, one task. The application completed independently; no agent download-polling loop was used.

Independent offline verification then checked the terminal app receipt and fully replayed the normalized release:

- App run: `f2086679-2638-4fef-8749-42ae95979e7d`, receipt under `data/industry-segments/runs/8681405a-0034-435a-bbe9-96263816381d/state-ia-childcare-centers-IA/jobs/f2086679-2638-4fef-8749-42ae95979e7d/receipt.json`, SHA-256 `949da3f49aa4e7e8469114ce926a9cdd82762c66c8156afde8f77865f7f799ec`.
- Acquired run: `3b1d21b1-6a7f-4ae1-8ed3-1f16a33d69b1`, manifest under `data/business-sources/ia-childcare/acquired/3b1d21b1-6a7f-4ae1-8ed3-1f16a33d69b1/manifest.json`, SHA-256 `88be1a0cf36843fab8bbae6cd11ef01f9c540d71acc60d988034702d8eee1972`.
- Normalized run: `b03f002e-4a96-4b4c-a8b4-f631a924a54e`, manifest under the app root's `runs/f2086679-2638-4fef-8749-42ae95979e7d/normalized/jobs/b03f002e-4a96-4b4c-a8b4-f631a924a54e/manifest.json`, SHA-256 `f39c2acd1ef07aa075bd45565e29f331a7ef0811bec24fe478ecd5f1ea812acd`.

The response observed at `2026-09-09T02:14:36.039Z` was 6,125,885 decoded bytes, SHA-256 `1acbc5477708317e321a126b5216d40432d499479ff3532cfcdbd8a1ed3d9be1`. Its 3,201 rows yielded 1,476 selected center/preschool rows and 1,725 excluded rows. All 1,476 selected rows were accepted, with zero quarantine and zero duplicate selected rows. All have name/street/city, valid-format numeric ZIP5 and global-range source points; there are 404 distinct reported ZIP5 values. ZIP4 is absent for all records and remains separately null. The raw mixed response was not retained; only the reviewed center projection and request fingerprints were saved.

These counts measure the publisher cohort, not verified active businesses or statewide/national completeness. Address-state, source update time, address role and point accuracy remain unverified. No reporting adapter or national promotion is implied. The projection summary's `release_published:false` is a transformation-level claim; actual publication is established separately by the verified immutable manifest and app receipt. Next reporting must consume these retained bindings without a source repull.
