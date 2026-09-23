# Broad-organization ZIP evidence derivative

The offline `broad-org-zip` derivative projects only the eight source layers CO, CT, DE, FL, IA, NY, OR, and PA selected by the shared descriptor contract. It reads their exact retained normalized releases and requires the exact selected national registry release to pin each source release and manifest. Source policy bytes and source transformation versions are included in the immutable manifest and independently rechecked by the verifier.

The build streams one normalized source record at a time into two-digit ZIP5 prefix shards under `derived/organizations/zip-prefix=NN.jsonl.gz`. Records without an eligible normalized five-digit ZIP5 go into separate publisher-state shards such as `zip-prefix=missing/state=OR.jsonl.gz`; all eight state shards are present, including empty ones, so no single missing/ineligible artifact can grow without bound. The complete source-native normalized record, administrative status, address semantics, provenance, ZIP5, and ZIP4 are retained separately. A global limit of 50 million derived address rows fails closed on pathological one-to-many expansion; each artifact remains independently subject to the 2 GB limit. Output includes registration/organization assertions only—not physical sites, current operations, unique businesses, USPS validity, or contributions to the general business/site/national totals.

Oregon assumed business names remain distinct `brand` rows, separate from legal-entity registrations. Delaware rows remain `local-review-only`; the source policy fields and restrictions are retained. No status is upgraded beyond each publisher's own administrative status semantics. ZIP5 partitions describe reported address values and are not state or Census polygon allocations.

The build writes an immutable release below `data/business-sources/broad-organization-zip-evidence/releases/` and writes its manifest last. It does not create or update a `current.json` pointer. Staging is cleaned only when owned by the interrupted build. Inputs are bounded by declared artifact/record limits, hashed before and after streaming, and current source/registry pointers are checked for changes. Cancellation stops input and output streaming.

Run only when the local retained release size and disk budget have been reviewed; a complete build is intentionally not part of routine validation:

```powershell
npm run broad-org-zip:build
npm run broad-org-zip:verify -- <release-directory>
```

The verifier independently validates source, registry, policy and transformation pins, re-derives every expected record from the retained normalized source artifacts, compares exact rows by ZIP shard, checks for orphan output rows, and reconciles per-source input/address/ZIP/exclusion counts. Tampered, mixed-release, incomplete, or schema-drifted outputs fail closed. The regular test suite uses small retained fixtures and does not build the full derivative.

## Verified retained release — September 22, 2026

The local retained build published and independently replay-verified `broad-organization-zip-evidence-20260923-002630301Z-9cdbdcd319f2`. Its manifest SHA-256 is `ee5896c32daf5b50a8b1ac44717ccd4a3005b91d1ca65dfc869c04490d441a7e`. The immutable release contains 109 files totaling 1,572,630,122 bytes and has no `current.json` pointer.

The release conserves 14,340,575 selected source records into 14,340,583 address-evidence rows: 9,940,777 rows have an eligible reported ZIP5 and 4,399,806 are retained in publisher-state missing/ineligible partitions. Oregon contributes the eight-row address expansion and preserves 116,429 assumed-business-name registrations as `brand` records separate from 443,453 legal registration records. These are source-native record and address units, not unique businesses, verified physical sites, current operations, or nationwide completeness.
