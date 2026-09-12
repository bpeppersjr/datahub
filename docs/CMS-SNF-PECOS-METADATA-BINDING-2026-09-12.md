# PECOS SNF version and companion binding

September 12, 2026: metadata-only follow-up to the offline contract `e314426` and research `8bbe9ba`. No CSV, API data response, ADP resource or ownership record was downloaded. The offline policy still permits zero network requests/download bytes; these separately scoped research reads do not change it.

## Documented discovery route

The official [CMS API Guide v1.6](https://data.cms.gov/sites/default/files/2024-10/7ef65521-65a4-41ed-b600-3a0011f8ec4b/API%20Guide%20Formatted%201_6.pdf), pages 12-13, documents following a catalog distribution's `resourcesAPI`, then selecting a named resource's `downloadURL`. This is a metadata route. `/data` and `/data-viewer` both return records and were not called; neither was a `/stats` route. No guessed endpoint, row-limit-zero query or download HEAD/range request was needed.

A catalog HEAD returned HTTP 200/application-json with no Content-Length. One GET of [data.json](https://data.cms.gov/data.json), capped at 8 MiB / 30 seconds, yielded 3,044,433 bytes. Only the two exact SNF catalog entries were inspected. Two returned version-specific resources URLs were then fetched, each capped at 1 MiB / 30 seconds. All requests were sequential, HTTPS-only, no redirects/retries. The records below are metadata observations, not content hashes or full schema validation of the advertised CSVs.

Retained research files are under isolated `data/tmp/pecos-docs/`:

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| catalog.json | 3044433 | ee1b4fcf9ea93b77783940be67e8ec258ddb7b1b3a44ab4189ebac3eb4e2675d |
| enrollment-resources.json | 864 | 613231e74142067f30dd85ad94ccfa12393fa793453a5633fb41142006cd531c |
| owner-resources.json | 1305 | f65a917a7d38fc14be0aeb99813e6e72064fb981d84a77e663b3bc34a753ff4c |

The catalog lists both sources as public/Open, monthly, modified `2026-08-17`, with government-works license URL. Selected fixed temporal interval is `2026-08-01/2026-08-31`. This supersedes the earlier **indexed May candidates**, not any retained dataset (none exists). Exact timestamp/content hashes of the underlying CSVs remain unobserved. A catalog hash binds this observed metadata document; it is not a permanent source version guarantee.

## Exact source selection

| Role | Version-specific resource metadata | Resource name | Declared bytes |
| --- | --- | --- | ---: |
| Enrollments | [d756f18b-96d9-4abf-938c-4940c82e83a5](https://data.cms.gov/data-api/v1/dataset-resources/d756f18b-96d9-4abf-938c-4940c82e83a5) | SNF Enrollments Aug 2026 | 3891152 |
| Owners | [9804c9c8-9a23-48dc-a6b1-20ef6f3545ca](https://data.cms.gov/data-api/v1/dataset-resources/9804c9c8-9a23-48dc-a6b1-20ef6f3545ca) | SNF All Owners Aug 2026 | 53636677 |
| Additional NPIs | Same fixed enrollment resource document | SNF Additional NPIs Aug 2026 | 1255 |

Exact returned CSV URLs, recorded but **not requested**:

- `https://data.cms.gov/sites/default/files/2026-08/76343e4f-f990-41fc-90d9-33a3284ad997/SNF_Enrollments_2026.07.31.csv`
- `https://data.cms.gov/sites/default/files/2026-08/1d804c1b-cefd-4438-852d-a267890bb144/SNF_All_Owners_2026.07.31.csv`
- `https://data.cms.gov/sites/default/files/2026-08/SNF_Additional_NPIs_2026.07.31.csv`

The companion has no separately advertised dataset-version UUID. Its binding is the exact named entry in the fixed enrollment version's resources response, plus the response hash and July 31 filename. Do not invent a separate companion UUID or infer row counts from its 1,255-byte size. Directory-to-PECOS dates remain separately sourced even though both releases now have August labels.

## Remaining prerequisites and minimal next implementation

The current resource metadata identifies newer owner dictionary and guidance files:

- `https://data.cms.gov/sites/default/files/2026-07/SNF_All_Owners_Data_Dictionary.pdf`, declared 176,009 bytes (earlier reviewed owner document was 169,540).
- `https://data.cms.gov/sites/default/files/2026-07/SNF_Data_Guidance.pdf`, declared 325,892 bytes (earlier reviewed guidance was 309,492).
- Enrollment dictionary remains the July 2026 URL and declared 139,311 bytes, matching the earlier retained document's length, but length alone is not a hash replay.

Review/hash the current owner dictionary and guidance before adapting the offline selected-field contract to this edition. Preserve existing offline dictionary pins and historical semantics; version changes separately. The owner resource document also advertises ADP association/services files and their dictionary. Those are **out of scope**, not required to claim this limited enrollment/organization-owner/NPI relation, and not fetched.

Next source implementation can use a pure bounded metadata resolver over the three retained metadata bodies: exact unique titles; public/period/version agreement; fixed CSV-to-resource URL equality; exact unique companion name; strict data.cms.gov HTTPS paths; positive bounded advertised sizes; current dictionary/guidance roster; no latest-alias substitution; and all observed metadata hashes. It must return `acquisitionReady:false` until current-document conformance plus a separately reviewed full-cohort streaming acquisition lifecycle/policy exists. The prior 340 MiB proposal is not an approved budget. Advertised three-CSV total is 57,529,084 bytes, not bytes acquired or authorization to acquire them.

Acceptance tests for that resolver: duplicate matching titles/resources; missing companion; mismatched month/UUID; latest alias mistaken for fixed version; CSV URL disagreement; off-host/credential/query/redirect URL; invalid or excessive size; unrelated ADP entries ignored with count only; dictionary drift; malformed/truncated metadata; byte hash tamper; cancellation; no transport issuance from caller-supplied fixtures. No native CSV schema, current row counts, additional-NPI cardinality or matching directory coverage can be claimed from this metadata follow-up.

## Current document reconciliation and implementation

Subsequent authorized document-only reads returned HTTP 200: owner dictionary 176,009 bytes in 0.195392 seconds, guidance 325,892 bytes in 0.163377 seconds (curl elapsed measurements). Each was limited to 5 MiB / 30 seconds, no redirects/retries. New retained hashes:

- `owners-current.pdf`: `6fbedfb92400d654ab2585a73c498cef41d22b2f6123906a78c62913ca5e4ff0`.
- `guidance-current.pdf`: `1f76bd91a2e229cd7629f7bd6c1cfb05a95bf2940c7067d0190c324965ae871c`.

PDF skill extraction plus complete-page visual review covered owner pages 2-3 and guidance pages 11, 14-15 and 30. The current owner dictionary permits Y/N/blank for private-equity, REIT, chain-home-office and trust flags (older reviewed version said Y/blank), and its role table no longer lists 84. The current guidance still labels itself v1.8 but revision 8 is dated July 17, 2026; new sections 3.4/5.5 discuss repeated enrollment ownership percentages and inconsistent updates. It warns that percentages can exceed 100 percent and updates may differ across enrollments while being processed. No deduplication or forced ownership-total normalization is justified. Existing offline selected flags/fields remain conservative, but their old document pins are deliberately unchanged. [Current owner dictionary](https://data.cms.gov/sites/default/files/2026-07/SNF_All_Owners_Data_Dictionary.pdf), [current guidance](https://data.cms.gov/sites/default/files/2026-07/SNF_Data_Guidance.pdf).

The new independent version is `cms-snf-pecos-august-metadata-plan@1.0.0`, implemented by `runner/cms-snf-pecos-metadata-prerequisite.mjs`, its focused test, `config/source-policies/cms-snf-pecos-august-plan.json` and `scripts/plan-cms-snf-pecos.mjs`. Pure inspection accepts bounded metadata bytes; omitted documents produce `currentDocumentsReplayed:false`, while supplied documents must match all exact reviewed hashes. No caller-supplied metadata can mint native transport evidence. It resolves the fixed catalog distributions and resource membership, returns body hashes as null/unobserved, preserves advertised sizes, and counts unselected resources without projecting them.

The argument-free CLI reads only the three metadata files, two current documents and `enrollments.pdf`, checks canonical paths and bounded stable file identity/hashes before and after inspection, compares policy to its compiled declaration, and honors signal/IPC cancellation with a 30-second cooperative deadline. It writes only a JSON plan to stdout; no files, lease, external request or acquisition are created. Missing retained research inputs fail explicitly. The CLI is a local metadata-review tool, not an app acquisition operation.

Eight focused tests and owned-file lint passed (19 combined with the earlier offline linkage suite). The catalog identifier must exactly match each declared type's `https://data.cms.gov/data-api/v1/dataset/<typeId>/data-viewer` string; neither route is followed. Negative fixtures reject both mismatched and missing identifiers. A retained-document CLI run with global fetch forbidden returned EXIT 0: all three document hashes replayed, exact August version/companion binding, three unselected resource entries, 57,529,084 **advertised** data bytes, `acquisitionReady:false`, `approvedDownloadBudgetBytes:0`. An initial `node -e` invocation was correctly rejected by the argument-free CLI contract; the actual CLI invocation with a fetch-denying preload then passed. Neither invocation made requests.

The plan proposes 8 MiB enrollment, 64 MiB owners and 64 KiB companion ceilings (75,563,008 aggregate data bytes), 180-second data requests and 900-second session with sequential/no-retry behavior. These are **unapproved proposed bounds**, not a dispatch budget or implemented transport. The common physical CMS lock, streaming full-cohort conformance, durable intents, before/after source metadata checks, manifest-last output and independent acquired-body verifier remain required lifecycle work. No source acquisition may be inferred from a successful plan.

Research timing limitation: initial catalog/resource curl calls did not retain per-request start/end or duration. Their local file write completion times were approximately `2026-09-12T15:26:22Z` (catalog) and `15:26:36Z` (both resource documents), not native request receipts. Exact hashes/URLs/bytes are retained; do not manufacture missing transport timestamps or treat filesystem times as source release dates.
