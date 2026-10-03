# Retained childcare ZIP evidence

`retained-childcare-zip-evidence@1.1.0` is a separate immutable, pointer-free,
internal-use-only lookup over the authenticated seven-source cohort view. It does
not enroll a national denominator or change any current pointer.

## Source and meaning

Publication and independent verification call `buildRetainedChildcareCohortView()`
and require all PA/CT/MD/VT/CO/UT/IA enrollments to replay successfully. The fixed
native cohort conserves 12,206 accepted candidate rows. The root view is saved
unchanged as `cohort-root.json`; its digest, enrollment/receipt/normalized/acquired
manifest and artifact identities, and Utah retained-origin pins bind the release.
Captured source bytes are bounded, hashed and identity-rechecked before and after
source replay and installation. This preserves the root's explicit
`atomic_cross_source_snapshot_verified:false` rather than upgrading its guarantees.

ZIP-prefix shards hold separate publisher/source/reported-state candidate counts.
No candidate is deduplicated into a business or site. An absent ZIP returns a null
row, not a zero-business result or invalid-USPS determination. Maryland's one
unusable ZIP is invalid (`invalid-source-zip-range`), not missing. Separate
missing/invalid counts and source-level reason buckets reconcile to the authenticated
root quality counts: ZIP-present + missing + invalid = accepted candidates.
The closed reason vocabulary is `missing-source-zip`, `invalid-source-zip-format`,
`invalid-source-zip-placeholder`, and `invalid-source-zip-range`. Unknown or
unconserved reasons fail closed. Reason buckets do not invent a reported-state
cross-tab unavailable in the aggregate root; original state/ZIP buckets remain in
`cohort-root.json`. Lookup and HTTP validate this distinction against source quality,
not merely a replacement manifest hash.
Vermont and Iowa reported states remain null; publisher scope is not address state.
ZIP4 stays separate in retained records and is not aggregated or joined to ZIP5.

Lookup includes the entire original source-specific status, provenance, quality,
claims, candidate/credential metrics and clocks (excluding bulk ZIP/county tables).
These source summaries describe each **whole retained cohort**, not ZIP-filtered
quality counts. PA's county table remains unchanged in the saved root, but this
service makes no county assignment. Source percentages retain their own cohort
denominators; the service introduces no combined national/business denominator.

Keep the following distinctions visible in any consumer:

- CT has 1,390 candidates but 1,364 distinct credentials; these are not deduped sites.
- MD's publisher cohort date, observation and edit clocks differ; none is current-operation proof.
- UT is retained-local PDF adoption, not a new fetch or a freshness event.
- IA's 1,476 source points have unverified accuracy and no governed CRS admission;
  point presence does not make them eligible for polygon assignment.
- Source missing points and ZIP4 presence remain quality evidence only. The service
  copies no coordinates, performs no reprojection and infers no geocodes.

All business/site/current-operation/completeness counts remain null; USPS,
production, public-export and national-denominator claims remain false. Root
publisher-authentication limitations are preserved without upgrading them.

## Interfaces and limits

- `publishRetainedChildcareZipEvidence({createdAt, signal?})`
- `verifyRetainedChildcareZipEvidence(manifestPath, {signal?})`
- `readRetainedChildcareZipEvidence({zip5, signal?})`
- `retainedChildcareZipHttp(request, response, url, {authorize}, json)`

Runtime reads fixed registration, one manifest, at most one 2 MB/1,000-ZIP shard,
and bounded enrolled metadata; it never runs source replay, PDF extraction, refresh,
acquisition or fallback scans. It does not reverify every source artifact on each
lookup. Changed metadata, registration or requested shard fails closed.

The HTTP adapter requires the existing full Host/Origin/bearer guard, exact empty
GET with one five-digit `zip` query, a 30-second deadline, cancellation/disconnect
cleanup, 200 KB maximum response and no-store caching. Its closed response
validator checks pinned source metadata/claims and absent/present consistency.
Server wiring is a separate integrator-owned change.

Publication/verification use canonical single-link files, streamed 64 KB chunks,
64 MB per raw source artifact, a 128 MB aggregate acquired/normalized-input budget,
500 snapshot entries and bounded JSON metadata. The existing root loaders retain
their own additional replay/runtime limits, including Utah's PDF runtime checks.
Publication uses exclusive release locks, synced owned staging, manifest-last
verification and atomic rename. Cancellation cleans only owned unpublished files;
post-install failures preserve evidence and require inspection. Crash-held locks
are not automatically reclaimed. Filesystem checks are not an OS-level guarantee
against a privileged writer racing every syscall.

```powershell
npm run retained-childcare-zip:build -- --created-at <ISO-UTC>
npm run retained-childcare-zip:verify -- <retained-manifest>
node --test runner/retained-childcare-zip-evidence.test.mjs runner/retained-childcare-zip-http.test.mjs
```

## Native release

Release: `retained-childcare-zip-evidence-6a696d16df9ccec8836e7bd38872feda3942293d9ff19ad5f528ac41a088fada`.
Manifest SHA-256: `6ca80e31d73f033a5e6945f54badf34c4ceb73b21e7e0ddbdae66a77d80ce48b`.
Created at `2026-10-03T04:26:00.196Z` using `new Date().toISOString()` at invocation;
16 artifacts / 604,580 bytes.
It indexes 2,359 reported ZIP values, representing 12,205 candidates plus one
separately retained invalid-ZIP candidate and zero missing-ZIP candidates. Source counts remain PA 4,995; CT 1,390;
MD 1,772; VT 503; CO 1,648; UT 422; IA 1,476.

The metadata-only registration is
`config/datasets/retained-childcare-zip-evidence.json`. Build and a separate full
verification use retained local evidence only; no source acquisition, production
enrollment, pointer writes or national completeness changes are authorized.

Earlier releases remain unchanged but are superseded. The initial 1.0.0 release
mislabeled Maryland's invalid range as missing. Both earlier releases also used
future-dated supplied derivative clocks; those clocks are not actual publication
times and those releases are not the final registered publication evidence.
