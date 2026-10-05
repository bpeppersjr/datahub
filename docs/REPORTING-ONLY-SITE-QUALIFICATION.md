# Reporting-only site qualification

The selected `reporting-only-site-qualification@1.1.0` is a pointer-free, local-review-only derived release for the already-retained MA, NJ, TN, and OH childcare reporting-location cohort. It is a separate denominator, never an extension of matching-profile or entity-resolution inputs. The selected release is `reporting-only-site-qualification-a125bbeb43928016c7d0abf7259572f9e248f85f22f997bf8572b503ff3e4fce`; its manifest SHA-256 is `e3e62ff1ad7d05c9fdfaf51e93783effb07d738a1f2236128183229c08b95e83`, registration SHA-256 is `0eb4e02a94d3618362b2d9fbc0f58c34a826481befbafbc0655a8a0a69b049ba`, and its 13,182-row gzip artifact SHA-256 is `c4d882b146cdd06f0817744ffa92ce8c9d9bf6b36dd5326aa1c10286953144ab`. The v1.0 release remains retained as immutable historical evidence and is not selected.

The source split is MA 3,007, NJ 4,075, TN 1,863, and OH 4,237. ZIP5 is present on 13,010 records and absent on 172 Tennessee records: 27 missing-source-ZIP and 145 invalid-source-ZIP-placeholder. ZIP4 remains a separate value. The retained point-evidence summary has 8,942 county assignments, 3 Tennessee missing-geocode rows, and 4,237 Ohio rows excluded by the source policy. A same-code ZCTA is only code correspondence; it is not polygon membership. USPS ZIP validity and deliverability are unverified, and no entity polygon is present.

All four state sources remain source-preserving: MA labels (including 13 `Expired` rows and 2 `Regional Enrollment Freeze` rows) are not proof of operation; NJ null status is layer membership, not active status; TN `Active` and OH `Open` are publisher terms, not independent current-operation verification. Every site has `current_operation_verified=false`, `active_business_verified=false`, `active_business_eligible=false`, and `identity_matching_eligible=false`. Repeated addresses are allowed; site, establishment, and source-record identifiers are conserved and unique. No source rows were fetched or changed.

The selected release binds the national registry manifest and all 10 reporting/location-evidence ZIP2/unassigned artifacts, the four exact source manifests and transformation versions, temporal and exact-ZIP temporal qualification evidence, Census geography, and the retained point-assignment summary. For each source it binds two intentionally distinct policy hashes: `source_manifest_policy_sha256` is the canonicalized policy object embedded in that source's immutable manifest; `policy_profile_path` plus `policy_profile_sha256` identify the authoritative policy JSON file by repository-relative path and raw bytes. The raw profile SHA-256 matches the corresponding temporal semantic row's `policy_sha256` and exact `policy_path`; the embedded-object hash is never substituted for it. The profile reader rejects traversal, symbolic links, hard links, oversize files, source/profile identity drift, and widened authorization, export, redistribution, or local-review semantics. The hashes are:

| State | Embedded manifest policy SHA-256 | Raw policy profile SHA-256 |
| --- | --- | --- |
| MA | `bc5877f6f0b12a875e59464a71814ce7395e2cd8d292abae57e42f93086d8201` | `8a2812e436c3b2bc9c4c88dd2299d406b8d8610cd88f851a9f5f664fa43a4742` |
| NJ | `79c0957df9fcdc66a856e5a6c242e24ef0296179eb93e4c8b298a32df2f61410` | `3a935abc814e7f46e6048bdb20ec25c67b3a70aa4cfb81b0d9494a35c9cb26cc` |
| TN | `78300cd344afafd62d3a662a30d913871bd3fbd96cb59b03793e11b0b60f3b1b` | `06b8b84549c26d2e3bcabdb89244463ef5fbd525c88170aab548b42267e1110e` |
| OH | `53ead19c9463f270ed5def5eb0f848e46d3288d2a59844c53a8b317cad0b5c98` | `f1aa0c95eb96ba2cb6d10e75ded2011890cea61816d7b8b337ef1081dda4b6e2` |

Its physical-site evidence arithmetic is `8,011,835 matching profiles + 13,182 separate reporting-only sites = 8,025,017 retained site-evidence rows`; this is not an all-business denominator or verified operation count.

The names API and local-review flat export attach this qualification to reporting-only records without matching them. National objective readiness exposes a separate partial requirement and lineage binding; it remains not accepted, with zero eligible/verified reporting-only sites and 13,182 USPS-unverified ZIP claims.

Rebuild and verify offline from retained inputs:

```powershell
npm run reporting-only-site:build
npm run reporting-only-site:verify
```

Generated release payloads stay in ignored local `data/reporting-only-site-qualification/releases/`. Git tracks the registration and executable verifier contract, not generated retained evidence. Missing or changed pinned artifacts fail closed.
