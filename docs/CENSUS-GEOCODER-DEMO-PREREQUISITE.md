# Census public-demo wire prerequisite

Historical approved implementation scope; the subsequent single native observation is recorded below. Official API documentation was read directly on September 12: its address example (lines 129/135) is exactly `4600 Silver Hill Rd`, `Washington`, `DC`, `20233`. Do not substitute the physical headquarters' other mailing/locality descriptions. Source: https://geocoding.geo.census.gov/geocoder/Geocoding_Services_API.html.

The standalone fixed run uses catalog GET, one addressbatch POST, catalog GET. Explicit benchmark 8 / Public_AR_ACS2025 must appear uniquely in both byte-identical catalogs; missing selection fails before POST. Catalog equality is not an immutable underlying address-range-data pin. Limits: 64 KiB per response (192 KiB total), 1 KiB CSV, 4 KiB multipart, 30 seconds each request, 100 seconds whole session, 1 second cleanup; no redirects, credentials, retry, alternative address or output override. Opaque ID is unrelated to any source identifier. No CMS/user/business record is loaded or submitted.

Shared provider lease is exclusive, with no stale takeover. Unresolved transport cleanup or POST submission without a completed response retains the lease for inspection, even if local abort completes. Completed raw responses with invalid schema are retained as failure evidence but settled local work may release its owned lease. All completed request bodies/status/hash/time evidence survives validation failures. Durable run/request intents precede external action. Success manifests are immutable, last-published and independently replayed; failures are separate immutable receipts, not rewritten success. Native and synthetic execution roots and claims remain distinct.

One observed response variant can establish only that variant for this demo. No single result certifies unobserved Tie/No_Match/PR padding, broad batch readiness, address privacy/retention, exact structure location, current operations or public export. Coordinates, if observed, remain NAD83 with unknown realization and interpolation method; no WGS84 conversion or county/ZIP assignment. Broader geocoding remains a separate source-disclosure and lifecycle decision.

## Implementation and review boundary before native dispatch

`runCensusGeocoderDemo({signal?})` and argument-free `scripts/preflight-census-geocoder-demo.mjs` implement the fixed native operation. CLI validates arguments before importing the transport module and uses existing SIGINT/SIGTERM/IPC cancellation. Native execution remains unperformed pending root review. The immutable source policy is checked against compiled values before any external request and its exact bytes/identity checked again before success. The offline candidate dependency `e2d0852` was applied cleanly in this checkout as `f987dc8`; its original contract is not changed.

Native outputs use `data/business-sources/census-public-geocoder/jobs/<UUID>`; the shared provider lock is `data/business-sources/census-public-geocoder/.source-lease`. Synthetic fixtures use separate `data/tmp/census-geocoder-demo` roots and cannot pass the native verifier. Future Census address consumers must reuse the same provider lease path, not introduce an independent label-only budget. Cleanup verifies exact lease payload plus file identity; an altered same-inode marker is not deleted. A failed lease cleanup preserves any published run/manifest identity and forces inspection.

The multipart body is generated deterministically from the opaque ID and preserved byte-for-byte with its content type, SHA-256 and byte count. Completed responses are retained before HTTP/header/schema validation; an oversized content-type value is represented by a fixed over-limit diagnostic, not copied into the receipt. No response cookies, authorization or arbitrary headers are retained. A POST without a completed body remains submission-uncertain even when local cancellation succeeds; a complete invalid schema does not alone create a permanent provider lock.

`verifyCensusGeocoderDemo(manifestPath, sha256, {signal?})` enforces a fixed 100-second cooperative deadline, exact native directory/mode, roster and policy, all body hashes, reproducible multipart, opaque-ID/one-row conservation, catalog equality and selected benchmark, ordered request intents/status/timestamps, observed response variant, and reverse stable identity/hash reads of every file plus directory identity. Fixture verification is a distinct API. Neither mode authenticates a forged local file adversarially: native provenance rests on app-owned execution and protected retained evidence, not a digital signature or remote attestation. Filesystem calls and synchronous small-buffer parsing use cooperative limits, not an OS deadline.

Acceptance covers successful manifest-last independent replay, native/fixture rejection, missing benchmark before POST, malformed response retention, redirect/response cap without retries, shared lock contention, post-publication failure, incorrect rehashed status, policy drift before access, invalid CLI/options, noncooperative fetch/body/cancel, changed lease identity/payload, and oversized-header raw retention. An actual 30-second request timeout was tested against a never-settling fixture fetch: failure returned after about 31 seconds including bounded cleanup, with unresolved lease retained. The test harness removes only its own fixture evidence/lease afterward; production has no automatic uncertain-lock removal. No native POST, CMS address submission, data download, production pointer or app-managed registration was performed.

Final demo fixture suite: 15/15 passed, including both review corrections and actual timer expiry (31.04 seconds). Owned implementation/CLI/test lint passed. Broader application release checks are outside this isolated service slice.

## Subsequent single native observation and byte-preserving adoption

Root executed committed `7376e90` once: run `c1d9ca28-069e-4e58-b0a4-2aeb957aee3b`, September 12, 2026, `15:01:31.138Z` to `15:01:32.022Z`. Root's independent verifier with fetch forbidden exited 0. Exactly three HTTP 200 responses: catalog GET 547 bytes, one demo POST response 196 bytes (`text/plain`), catalog GET 547 bytes. Both catalog hashes equal `fc858d2ecef3eab9475b0b6c2a1b2e671f0805e1e62ba7d9d1256e3092114106`, explicitly selecting 8 / Public_AR_ACS2025. The 88-byte demo CSV was submitted in a 402-byte multipart body. The provider lease released; the result did not require inspection.

Observed response: one row, eight fields, `Match`, `Exact`, opaque ID conserved. Response SHA-256 `3675f4b66c7b16c44acae2719263ee08e9e76e8881e86c076c943ceb75dae3de`. Manifest SHA-256 `6763d425b5126c6e09cf800ddf0dc6aa20d024c9b570bc0d7cce774b59157827`. This proves only this observed variant. It does not certify No_Match, Tie, PR, broad batch readiness, exact structure position or current business operation. The source was the documented public example, never CMS or other business rows. No repeat POST was made.

With explicit root authorization, the specialist copied exactly eleven files / 9,300 bytes, preserving every byte, from `C:/Master Data/datahub/data/worktrees/maine-provider-preflight/data/business-sources/census-public-geocoder/jobs/c1d9ca28-069e-4e58-b0a4-2aeb957aee3b` to the matching previously absent `C:/Master Data/datahub/data/business-sources/census-public-geocoder/jobs/c1d9ca28-069e-4e58-b0a4-2aeb957aee3b`. Before copying, the source passed full independent verification; every absolute destination was confirmed absent and app-contained. Copy used exclusive no-overwrite semantics, canonical nonsymlink directories and regular single-link files. Full source replay after copying and all source/destination hashes matched. Original evidence remains intact; no pointer was changed. Main's full replay remains root's next step after integrating the helper; copying alone is not that replay.

| Copied file | Bytes | SHA-256 |
| --- | ---: | --- |
| manifest.json | 4205 | 6763d425b5126c6e09cf800ddf0dc6aa20d024c9b570bc0d7cce774b59157827 |
| intent.json | 1233 | 01d353d948472b2959d825e6b3c3e1d14257e0dbe805da130d409b887853a5e3 |
| request-1.json | 279 | 1af22ab442ea620f87d273230e2537ba6e701872ae8a29ba857fb8453f6e84bb |
| request-2.json | 432 | 406835ab52dadddb3524daac847053848073bd5e9326efa2d48a616fa5c7264c |
| request-3.json | 279 | a6481cacc1d69f287a65ad2d22980515ef5e1620f5c546a66b15063e52398c3d |
| policy.json | 1092 | 973c709d74180132edc6bd941e1b0ed16d6280286c8d97152dca6f9020ba243e |
| upload.csv | 88 | 054231b118d21d58c2ddfa4bf30f8b9483e5748b58d01dc0129558b2f748ad37 |
| multipart.bin | 402 | 4f427712745c0b7102d5183586129b7ad949615b398b4b485146a052bd4ad086 |
| catalog-before.json | 547 | fc858d2ecef3eab9475b0b6c2a1b2e671f0805e1e62ba7d9d1256e3092114106 |
| response.csv | 196 | 3675f4b66c7b16c44acae2719263ee08e9e76e8881e86c076c943ceb75dae3de |
| catalog-after.json | 547 | fc858d2ecef3eab9475b0b6c2a1b2e671f0805e1e62ba7d9d1256e3092114106 |

Next source work is a separately reviewed hospital-address disclosure policy and bounded immutable geocoding lifecycle, reusing verified retained source evidence and this observed wire prerequisite. Another demo submission is neither needed nor authorized by this adoption.
