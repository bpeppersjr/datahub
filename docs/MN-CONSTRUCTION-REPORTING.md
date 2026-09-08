# Minnesota construction: reusable offline reporting

`runner/mn-construction-reporting.mjs` derives a versioned reporting summary from one independently verified app acquisition without source requests or national publication.

```powershell
node scripts/summarize-mn-construction.mjs --receipt data/industry-segments/runs/a01b1819-420b-4036-a5fb-40f9c29ba861/state-mn-residential-contractors-MN/jobs/ebfad910-440e-46bb-b42b-2fc44b6d32f3/receipt.json
```

The CLI emits a JSON summary to standard output. It does not write over a retained bundle, change current pointers or acquire data. Applications can call `summarizeMnConstructionAppJob` directly. A completed acquisition retained by a failed/cancelled app job may also be summarized after independent verification; a failure without an acquisition reference is rejected. The returned `app_status` keeps this distinction visible. Injected test acquisitions are not independently authenticated source observations; receipt provenance remains the authority for execution context.

## Verified residential evidence, September 8, 2026

Managed operation `a01b1819-420b-4036-a5fb-40f9c29ba861` failed overall because registrations failed, but its residential cohort succeeded. Independent offline verification confirms:

| Measure | Value |
| --- | ---: |
| Source rows | 59,158 |
| Accepted business-credential rows | 11,456 |
| Excluded nonliteral Business rows | 37,519 |
| Excluded non-Issued rows | 10,044 |
| Unsupported business credentials | 139 |
| Selected-field UTF-8 rejections | 0 |
| Reported MN-address rows | 10,899 |
| Other reported-state rows | 557 |
| Reported states represented | 34 |
| State/ZIP5 groups represented | 971 |
| Rows without a reported ZIP5 | 1 |
| Rows with ZIP4 | 0 |

Credential categories: residential building contractor 10,835; residential remodeler 425; residential roofer 139; manufactured-home installer 57. Reported MN addresses represent approximately 95.138% of this **accepted cohort**, not 95.138% of Minnesota businesses or national industry coverage. Out-of-state addresses do not establish out-of-state operations.

Record observation: `2026-09-08T13:11:41.678Z`; transfer start: `2026-09-08T13:11:41.686Z`. The original record timestamp is preserved separately rather than replaced by transfer start. Source release: `ebfad910-440e-46bb-b42b-2fc44b6d32f3-residential`.

| Evidence | SHA-256 |
| --- | --- |
| App receipt | `ae0dfe3d93e2edf7d19303774b3ac922c9ff423c56d930138fd313d86468e3eb` |
| Parent acquisition receipt | `e9e41b0776001f287a888ef576e21e56a726c439a311b2dfaee540857df584d1` |
| Child manifest | `8f4472b1f055ea814e57a2cfd8edba0756816b292ccf0543d8ef284f0453d393` |
| Normalized rows | `48693c3f7d085e1aa6e6b483590f5caf89955ae1dd506a1ba91a4ae9195ef0a3` |
| Complete acquired source bytes | `330a36c9b32a88f0443f0e9bfc879f8ec916c2b9189e6de6e6c87fffcbfa6ccd` |

Registrations app job `aa5ef9b0-4684-4496-b5ae-501c49a7e4e3` remains failed, with `source-csv-invalid` and no completed acquisition. It is unavailable, not measured zero. No registration retry or residential repull was performed during reporting implementation.

## Integrity and interpretation

Release validation: `npm run check` passed with 1,072 tests passed, 11 skipped and zero failures, including lint, web/desktop builds and desktop control-plane smoke. `npm audit --omit=dev` reported zero vulnerabilities. All 82 pending production code/configuration pins were unchanged. The real residential summary was generated and checked offline against the retained acquisition; no source requests were made.

The summarizer verifies the app/parent/child chain, matches the manifest's bytes to the pinned child checksum, streams normalized records through the existing bounded single-link file reader, checks the measured normalized hash and row count, then verifies the original app chain again. Unverified partial data cannot become a summary. Cancelled reads fail without returning a completed summary.

Summary output has no names, addresses, contacts or record identifiers. It reports only counts, provenance, categories, reported state/ZIP5 groups and explicit denominator labels. ZIP4 remains separate and is only counted, not concatenated into ZIP5. Source credential rows are not deduplicated into businesses. Active-business count, unique-business count and national completeness remain null; public-export authorization and national-reporting integration remain false.

Next integration must introduce a **credential reporting** projection, not borrow the childcare physical-site projection. This source provides no verified physical sites, geocodes, county/ZCTA membership or identity-matching eligibility. Reuse this successful cohort independently of its failed sibling. National writer changes and a new reviewed production plan are separate work; existing pinned production code and data were not changed here.
