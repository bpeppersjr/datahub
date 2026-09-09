# Utah retained-source adoption and normalized evidence

The registered `ut-childcare-centers-normalization@1.0.0` contract links the retained September 2026 report to its original assessment receipt, replays the complete selected PDF output with the app-owned runtime, and produces internal source-candidate records. It performs no network requests. Registration of this offline contract is not managed collection/refresh enrollment or national reporting promotion.

## Source chain and limits

`runner/ut-childcare-retained-origin.mjs` pins the original assessment manifest, request receipt, source PDF, successful `e3332e6b-da88-4110-820b-24ad87758caf` prerequisite receipt and selected artifact. Inputs are bounded, canonical, single-link files beneath `datahub`. The original request's temporary `file` value is historical metadata and is never followed as a current input path.

The original receipt records an HTTP 200 GET, URL, file hash/length, ETag and modification header. It does **not** record a redirect chain, Content-Type or TLS attestation. The new verifier does not invent these facts or relabel that assessment download as historical app acquisition. It compares the entire selected output—ordered observations, all fields, source page/row references, category counts and claims—with a fresh local decoder execution, including matching runtime and implementation fingerprints. Original files are reread after replay. Nothing is refetched for adoption or normalization.

This initial contract is deliberately release-specific. A changed report, parser/runtime or prior prerequisite requires reviewed new evidence/version pins, not a silent fallback to another file or a download retry. Existing releases remain preserved.

## Normalized fields

The normalizer emits the existing source-candidate envelope with business name, typed Utah facility identifier, source page/row, reported address, separate five-digit ZIP and nullable ZIP4, capacity, license calendar facts and source/processing provenance. Initial regulation is not a business opening date; expiration is not proof of current operation. Address role and coordinates stay unknown. No business geometry is created. Phone fields and non-center categories are excluded from the selected derivative, while the original report stays unmodified in its separate source layer.

Each row includes the source PDF hash, original request/prerequisite hashes, source release/ingest run, transformation and policy versions, original observation time, processing time and selected-field lineage. The pure projection does not authenticate its caller's evidence; the surrounding release manifest separately records completed origin linkage and full local replay. All records remain internal candidates—not independently verified active businesses, physical sites or unique canonical entities. USPS assignment and national completeness remain unverified.

## Standalone commands

With the [app-owned runtime](UT-CHILDCARE-PDF-RUNTIME.md) provisioned:

```powershell
node scripts/build-ut-childcare-retained.mjs
node scripts/build-ut-childcare-retained.mjs --verify 'data/business-sources/ut-childcare/normalized/RUN-ID/manifest.json'
```

The builder requires 64 MB free disk, creates a fresh UUID directory, and writes `normalized.jsonl` and `summary.json` before publishing `manifest.json`. Invalid selected data fails the whole release; there is no silent row drop or partial success. The manifest binds the complete origin verification, normalization/connector/policy configuration and artifact hashes. The CLI prints counts and artifact references only, not business names or addresses.

Before publication, semantic verification replays the original PDF and normalization, comparing every record and aggregate. File hashes and filesystem identities are checked again before the no-overwrite manifest link. Rehashing matters: a same-size rewrite can occur without distinguishable timestamps. Post-publication verification repeats the source and normalized replay. Failure/cancellation removes only owned unpublished files; a committed or uncertain output is preserved for inspection rather than overwritten. Abrupt process termination can leave an incomplete directory, which is not a completed release without a verified final manifest.

## Verification and remaining work

Tests cover source purpose/identity/chronology and negative claims, exact field selection, malformed source fields, calendar dates, duplicate observations, postal separation, cancellation, whole-source replay, record/claim tampering and late same-size artifact mutation. Integration tests use `DATAHUB_TEST_APP_PDF=1` and the retained source; they never acquire a publisher file.

Next enroll the retained-source adoption/normalization path in Co*Tive's managed operations, define approved future-edition acquisition and refresh behavior, then add state reporting with explicit coverage gaps. Do not promote this cohort into national active-business totals or treat all licensed childcare programs as one business category. Rollback removes the new offline contract/module registration while preserving retained source and completed normalized evidence.

### Verified retained release — September 8, 2026 (Central)

The standalone builder completed run `6aaca68b-f0cc-4ada-a301-0ada860574b8` with processing timestamp `2026-09-09T00:29:36.503Z`. A separate `--verify` invocation replayed the retained source and all normalized records successfully. The preserved release is `data/business-sources/ut-childcare/normalized/6aaca68b-f0cc-4ada-a301-0ada860574b8/manifest.json`, SHA-256 `1ff46a94e79a75629707438492f0caa6e9cbc8961fa282748406d38f0c2aec43`.

All 422 selected center observations were accepted, with zero quarantine, 113 distinct reported ZIP5 values, zero supplied ZIP4 values and zero supplied coordinates. The 2,166,589-byte normalized JSONL has SHA-256 `6212861a181acbf3560da6b51bfb926a4b499bbd6077b67046cd8418e413fe6b`; the 795-byte summary has SHA-256 `06a902c5cda1596dd866df6dc41bb8afdd7944c120e960b84dacdd248106aaa5`. These are source candidates, not verified current businesses or national completeness estimates.

Full `npm run check` passed with 1,427 tests: 1,416 passed, 11 skipped, zero failures; lint, web/desktop builds and desktop control-plane smoke also passed. The local log is `data/tmp/ut-origin-normalization-full-check-final.log`. TypeScript and production Node dependency audit passed, and all 82 pending production pins remained unchanged.

This UUID identifies a local normalized release, **not** a managed application operation. Future routine acquisition belongs to Co*Tive workers after tested enrollment and an accepted operation ID with persisted receipt. Agents must not remain occupied polling ordinary download progress. Existing verified evidence should be reused, while provider limits and explicit refresh policies remain enforced independently of available RAM.
