# Oklahoma: next delivery contract

The September 10 parallel review verified the existing managed prerequisite manifest at `data/managed-operations/ec134ac1-f1ea-4a2f-b6d8-6b5bd8c3735f/output/jobs/a4fd7dfa-2028-4e0c-9b30-0291a012f568/manifest.json`, SHA-256 `feba9740fccd856c0b51822e32a6a4cfc711d993a742ebd72fc9462c5ad3c61b`. It still reports four center rows and four numeric coordinate pairs, with pagination unknown. No new search was submitted in this review.

Do not repeat that schema probe as if it could establish delivery completeness. The existing [profile-field contract](OK-CHILDCARE-PROFILE-FIELDS-2026-09-09.md) already supplies conservative address/ZIP and notice helpers. Unknown notice/currentness is not a reason to discard an otherwise useful internal listing, and notice absence is not evidence of an active business.

The next implementation should be a separate bounded delivery collector, preserving the old prerequisite and receipts:

1. Plan explicit ordinary center-only ZIP requests, with no empty statewide query, guessed endpoint, profile traversal, reports, maps or automatic retries.
2. Retain only source-native business fields needed for candidate evidence: source-local vendor identifier, program name, reported address lines, facility type and optional source coordinates, with source URL, observation time, row ordinal and response checksum. Exclude contacts and narratives.
3. Apply the existing address parser; keep ZIP5 and ZIP4 separate. Count query-ZIP matches, mismatches and unresolved addresses without assigning the query ZIP to a row.
4. Measure blank, duplicate and conflicting source identifiers. Keep identifier lifecycle unknown and never use the vendor ID as a canonical organization or site ID.
5. Distinguish a completely received response, a complete selected response and complete geographic coverage. Preserve pagination/cap signals and unknown denominators. An empty response does not establish an empty ZIP; overlap between samples does not prove completeness.
6. Keep observation-based first/last-seen timestamps separate from unavailable publisher-update and active-status facts. Build independent retained-row replay, count conservation, byte/time/request limits, cancellation, restart-without-retry and private artifact policy tests.
7. Only after source-bound verification and a scoped dispatch decision, hand the work to Co*Tive's managed operations with a persisted operation receipt. This note neither implements that collector nor authorizes a bulk run.

The remaining delivery questions are technical and semantic gaps, not an observed general prohibition on internal collection. The [source-use review](OK-SOURCE-USE-2026-09-09.md) supports a narrow public-lookup assessment; bulk scope and redistribution remain unestablished. Existing production releases, enrollment and schedules are unchanged.
