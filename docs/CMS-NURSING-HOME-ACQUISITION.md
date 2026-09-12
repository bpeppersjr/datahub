# CMS nursing-home national acquisition lifecycle

Implemented in isolation; native CSV execution remains unperformed and held for review. The earlier offline prerequisite remains independently useful and correctly reports acquisition readiness false. This new lifecycle/CLI is not managed-operation registration, production promotion, or evidence that any nursing-home CSV has been acquired.

`scripts/acquire-cms-nursing-homes.mjs` accepts no arguments or source/output overrides and handles SIGINT/SIGTERM/IPC cancellation through the existing CLI helper. `acquireCmsNursingHomes({signal})` uses fixed native fetch; injected fixture transport is separately exported and writes only to the fixture root. The native verifier rejects fixture paths/mode/notice and dictionary evidence. All paths stay within APP_ROOT.

## Source and policy

Dataset `4pq5-n9py` uses the prerequisite's closed metadata/distribution contract. Requests are sequential: metadata, pinned dictionary, pinned CMS reuse notice, metadata-selected national CSV, metadata. Dictionary and notice hashes must match before CSV access; before/after metadata must match before publication. The configured acquisition policy must equal its compiled contract before lease/source access. Policy is persisted and independently replayed, with raw internal, selected local-review-only, public export false.

Dictionary-only research was explicitly authorized and executed once on 2026-09-12 at 14:16:54.678Z–14:16:54.956Z: 644,126 bytes, SHA256 `2b55b0f65532e36fe7c49967993a37ddcb8c92e38234c94a2652c9a77feeb313`. Receipt and original PDF are retained under isolated `data/tmp/nh-dictionary-research`. PDF-skill visual inspection of pages 8, 12 and 25 confirmed selected field labels, CCN alphanumeric length and ZIP-fallback footnote 22. Independently hashing the previously retained CMS notice confirmed `6c45ef1ccb69bd3da4652769254472555bb83a87e8885d6c144e271cb0f53244`. No CSV was fetched during research or tests.

## Actual shared exclusion

The native exclusive lease is deliberately the existing hospital path `data/business-sources/cms-hospital-general-information/jobs/.source-lease`. Unchanged hospital code also opens exactly this path with `wx` and rejects any existing owner, regardless of its payload. Nursing-home ownership records its own profile/source and common CMS budget key. Thus either lifecycle blocks the other; this is not merely a matching label. Test mode shares `data/tmp/cms-hospital-acquisition/.source-lease`, never the native lease.

No hospital implementation/policy/receipt files are rewritten. Scope of this guarantee is these two cooperating lifecycles, not every unrelated CMS process on the machine. No stale takeover or automatic retry exists. Cleanup checks inode/device/type/link ownership; changed or unresolved ownership is retained for inspection. A lease retained after unknown network cleanup is not silently unlocked when a late response arrives.

## Bounds and evidence

Five GETs maximum, no redirects/retries, one simultaneous request; metadata 1 MiB/30 seconds each, dictionary 5 MiB/30 seconds, notice 1 MiB/30 seconds, CSV 32 MiB/90 seconds, aggregate 40 MiB, whole session 240 seconds. Cleanup races are bounded to one second. Source parser limits remain 25,000 rows, 128 columns, 64 KiB record. Raw completed responses survive validation failure internally with hashes; partial/derived artifacts are removed only when owned. No success manifest on prepublication failure.

Immutable UUID output under `data/business-sources/cms-nursing-home-provider-information/jobs`; fixture runs use `data/tmp/cms-nursing-home-acquisition`. Intent and each request intent precede access. Final manifest is published last; independent verifier checks every file/hash/request binding, compiled policy and documentary pins, source-to-selected byte equality, and reverse stable rereads. A cancellation/failure after publication preserves manifest/run/hash in inspection-required recovery, never claims clean success.

Selected rows retain typed string CCNs, original addresses, separate ZIP5/ZIP4, publisher's dated active-directory assertion, raw coordinates/footnote and eligibility classification. Independently verified operations, business/campus identities and completeness remain unknown. ZIP-fallback coordinates never become facility points; all point eligibility remains false pending a separate CRS/quality adoption contract. No NPI, parent-company or county inference is performed.

## Focused verification boundary

Fixture suite covers successful five-step replay, notice/dictionary mismatch before CSV, metadata drift, duplicates, hash-rewritten projection tampering, cancellation, response caps, manifest-last/postpublication uncertainty, cross-source exclusive-file contention, changed lease ownership, cleanup failures, noncooperative fetch/read/cancel, and actual internal 30-second metadata timeout. No native CSV, managed dispatch, UI, production pointer, broad repository check or runtime launch occurs in this slice. Full 90/240-second timers are not empirically exercised. Root owns review, commit/integration and any later single native execution decision.

The 25 focused cases comprise 10 prerequisite and 15 acquisition tests. Policy drift is exercised in a separate app-contained child root with fetch forbidden and no lease created; unsupported CLI arguments reject there without source activity. Fixture output fails native verification. Owned-file ESLint passes. The first CLI assertion used an incorrectly escaped test path; correcting the harness to `fileURLToPath` resolved it without changing acquisition behavior.
