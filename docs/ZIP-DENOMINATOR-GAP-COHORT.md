# ZIP denominator gap cohort

This pointer-free immutable local-review release binds the exact current national business-registry pointer, manifest, 48,194-row ZIP artifact, Census geography pointer and manifest, 33,791-row ZCTA index, and retained postal-migration candidate. It preserves every registry ZIP key in one mutually exclusive evidence class.

The cohort contains 33,791 same-code Census ZCTAs, 14,361 source-contributed keys outside that ZCTA set, 41 denominator-only keys outside it, and the governed `00000` placeholder. It marks the exact four production-only keys relative to the retained postal candidate: `01065`, `01385`, `02363`, and `45730`.

Rows retain source-contribution and source-native USPS-status provenance, but `usps_validity`, deliverability and inferred state remain null. Business count, current-operation count and completeness remain null. Publication performs no network request, acquisition, pointer write, enrollment or production execution.

The registered successor is `zip-denominator-gap-cohort-20261003072243230-9f1be37aa2eb`, manifest SHA-256 `792361841d937a508d0243b22cf3c7b3fe67e32d2749adadca299ad59c21f8ea`. It additionally pins the retained postal candidate pointer, manifest, release ID and ZIP artifact; enforces actual invocation time, per-row and total-output bounds; and rechecks retained input identities after audit replay. The verifier requires canonical millisecond ISO UTC, a lower bound of `2026-09-11T02:26:52.067Z` from the latest bound source release, at most five minutes future clock skew, and a created time no later than manifest mtime plus a documented 60-second filesystem tolerance. The release ID must reproduce both the 17 timestamp digits and the content-derived suffix. Earlier releases remain immutable history.

The implementation now uses one canonical build lock across invocation timestamps, identity-checks owned lock and staging directories, and preserves post-commit releases for inspection. Behavioral tests cover mid-read and mid-write cancellation, post-rename cancellation, concurrent contenders, foreign lock replacement, cleanup failure, rehashed and missing artifacts, manifest hardlinks, and reparse ancestry. These code-level safeguards do not change the registered release bytes.

```powershell
npm run zip-denominator-gaps:build
npm run zip-denominator-gaps:verify -- data/zip-denominator-gap-cohort/releases/<release-id>/manifest.json
```
