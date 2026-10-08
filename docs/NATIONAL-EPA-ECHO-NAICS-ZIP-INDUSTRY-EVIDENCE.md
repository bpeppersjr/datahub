# Retained EPA ECHO exact NAICS and reported ZIP5 evidence

`national-epa-echo-naics-zip-industry-evidence@1.0.0` is a separate, pointer-free local-review derivative. It reuses the exact retained ECHO release, existing national ECHO coverage, Census ZCTA index and governed ZIP-key cohort pinned in `config/national-epa-echo-naics-zip-industry-evidence.json`. It performs zero network requests or downloads, reads no current pointers, writes no current pointer, enrolls nothing in production and does not change the main industry matrix.

The unit is an accepted normalized ECHO source record as of the retained publisher update, 2026-08-30. `FAC_ACTIVE_FLAG=Y` means at least one associated environmental program interest is source-defined active. It does not verify general business operation, a unique enterprise, a distinct verified physical site, public access, every program's activity, business or industry completeness, or current USPS ZIP validity. EPA attribution and the source envelope are retained in the immutable manifest.

## Exact NAICS and geography semantics

The normalizer retained the sorted deduplicated union of source NAICS fields. This derivative preserves each exact 2–6 digit string, with no label lookup, edition assertion, prefix expansion, primary-code selection or operational-segment mapping. A row carrying `31`, `311` and `311111` contributes once to each of those exact codes; those memberships overlap and cannot be added to obtain a business, facility or site total. Duplicate codes in a normalized row fail validation rather than silently changing the retained list. Records without NAICS remain explicit missing classification evidence.

`states.jsonl` contains all 50 states and D.C. by the source-reported address jurisdiction. `territories.jsonl` contains AS, GU, MP, PR and VI separately. These reported-jurisdiction counts do not imply that ZIP or ZCTA boundaries belong to one state. National totals conserve both cohorts.

Ten `zip-naics/prefix=<digit>.jsonl.gz` partitions contain only positive exact ZIP5-by-NAICS source-record memberships. Omitted combinations have no retained membership row; this sparse output is not a complete national industry denominator. `zip5-evidence.jsonl.gz` contains all 48,194 governed ZIP-key cohort rows with accepted-source counts, classified and unclassified records, multiple-code records, assignment counts, exact-code counts, missingness status and retained geography classification. A zero accepted-source count means no accepted record in this pinned ECHO release, not zero businesses. ZIP4 is not joined. Same-code Census ZCTA availability is independently checked against the pinned 33,791-key index; no polygon overlay or USPS validity is inferred. `summary.json` includes the national exact-code roster, missingness and overlap accounting.

## Proof and publication

The builder and verifier independently stream the ten checksum-bound normalized accepted-source shards. They validate FRS identity uniqueness, exact source status/time/provenance, ZIP partition, reported state, sorted exact-code lists and ZIP/ZCTA relationships. They reconcile every retained ECHO coverage measure at national, reported-jurisdiction and ZIP level, including program associations and coordinate-quality counts. This is independent normalized-row replay; it does not rerun normalization from the raw Exporter archive or independently verify the publisher's NAICS edition, sites or current operations.

Processing retains no raw source-row collection. Global source identity tracking is capped at two million entries; exact-code dictionaries are capped at 10,000 codes, each record at 256 codes, and each prefix at one million sparse ZIP-code cells. Compressed input, decompressed input, JSONL lines and output bytes all have explicit limits. Fatal UTF-8 decoding, checksums, same-open-handle identity checks, canonical contained paths and rejection of symlink/hardlink input files apply. Any drift or failed conservation stops publication.

An exclusive build lock protects invocation-owned staging. Artifacts are closed before the manifest is written last, then an independent source replay reconstructs the complete manifest and artifact checksums in an owned verification directory. Only a verified stage is atomically renamed into `data/national-epa-echo-naics-zip-industry-evidence/releases/<release_id>`. Existing releases are never overwritten. Cancellation and failure settle streams and remove only the invocation's stage and verification directory; unrelated stages and releases are preserved. A process crash can leave a lock/stage for manual inspection; automatic stale-lock recovery is not claimed.

Build: `node scripts/build-national-epa-echo-naics-zip-industry-evidence.mjs`.

Verify: `node scripts/verify-national-epa-echo-naics-zip-industry-evidence.mjs --manifest <absolute-or-repository-relative-manifest-path>`.

Focused tests: `node --test runner/national-epa-echo-naics-zip-industry-evidence.test.mjs`.

## Retained result

The initial immutable release is `national-epa-echo-naics-zip-industry-evidence-cd5282edfa7dbf65ff781819c28e74f6f7c9e914c943fdada3daa83e51f7ccba`, with manifest SHA-256 `0526dd13e62b8e1f9cff8298ffa23b72b8de7691123f9eea75b17391f0fc4437`. It conserves 1,517,826 accepted source records: 1,512,971 in the states/D.C. and 4,855 in the five territories. Of those records, 1,015,850 have a retained NAICS code, 501,976 have none, and 140,303 carry multiple exact codes. The derivative contains 1,212,411 overlapping code assignments, 2,449 distinct exact strings and 572,842 positive ZIP5-by-exact-NAICS cells. Assignment totals are not facility, business or site counts. The registration pins this manifest without creating a runtime pointer.

The explicit next step is review of a versioned exact-NAICS-to-operational-industry crosswalk, its overlap/exclusion rules and independent admission evidence. That mapping and any main-matrix enrollment are outside this increment.
