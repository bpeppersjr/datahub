# Standalone fixed-August PECOS acquisition

Implementation review candidate only. **No native CSV acquisition has occurred.** Version `cms-snf-pecos-acquisition@1.0.0` has compiled/configured `nativeExecutionAuthorized:false` and `approvedDownloadBudgetBytes:0`; the native entry rejects before taking a lease or making requests. Removing that hold requires a separately reviewed policy/version decision, not a CLI switch or environment override. This service does not depend on app UI integration and does not update any production pointer, registry, map or existing source receipt.

The Co*Tive management catalog now exposes a read-only service card with the exact authorization and budget hold, retained-document prerequisite status, and truthful absence of a native acquisition receipt. The card has no dispatch request and the server has no PECOS acquisition route. This is a future app-owned handoff boundary, not enrollment or approval.

## Independent handoff

- `runner/cms-snf-pecos-acquisition.mjs`: `acquireCmsSnfPecos({signal?})` and `verifyCmsSnfPecosAcquisition(absoluteManifestPath, sha256, {signal?})`.
- `scripts/acquire-cms-snf-pecos.mjs`: argument-free worker CLI, SIGINT/SIGTERM/IPC cancellation. No source, URL, output, budget or approval override.
- `runner/cms-snf-pecos-stream.mjs`: separate versioned full-cohort projection `cms-snf-pecos-august-projection@1.0.0`. It does not mutate the earlier dictionary-driven offline 10k-row contract/policy.
- `config/source-policies/cms-snf-pecos-acquisition.json`: exact current compiled policy checked initially, before every GET, after local preparation, and after the publication hook immediately before linking the final manifest.

Success returns immutable run/manifest path/hash. Failure returns a fixed inspection-required recovery descriptor; post-publication failures preserve the published manifest identity. The injected transport and its verifier use a distinct per-process `data/tmp/cms-pecos-acquisition-<pid>/jobs` namespace and `synthetic-fixture-only` mode. No native verifier accepts that synthetic path/mode. No test hook is accepted by the native entry. Future native evidence is app-owned execution evidence, not a cryptographic signature against an adversarial local filesystem writer.

## Fixed source and proposed request budget

The reviewed [metadata binding](CMS-SNF-PECOS-METADATA-BINDING-2026-09-12.md) fixes enrollment version `d756f18b-96d9-4abf-938c-4940c82e83a5`, owner version `9804c9c8-9a23-48dc-a6b1-20ef6f3545ca`, and the additional-NPI resource named in that enrollment version. Exact August CSV URLs are compiled from that binding, never predicted or followed during tests. Both catalog type identifiers are checked as strings; neither data nor data-viewer routes are requested.

The nine-response itinerary is strictly sequential:

1. Catalog GET, fixed enrollment resources GET, fixed owner resources GET.
2. Enrollment CSV GET, owner CSV GET, additional-NPI CSV GET.
3. Catalog GET, the same fixed enrollment resources GET, the same fixed owner resources GET.

Current retained PDFs are copied into each new job before data access, not downloaded: `data/tmp/pecos-docs/enrollments.pdf`, `owners-current.pdf`, `guidance-current.pdf`. Native preparation checks their exact reviewed hashes and sizes; the job records original relative paths and `downloadedThisRun:false`. Missing/drifted retained documents fail rather than initiating extra requests. Total retained document bytes are 641,212. Before/after metadata replay binds exact selected versions, dates, distribution/resource membership, document URLs/sizes/hashes and companion identity. Unrelated global catalog entries may change; every actual metadata hash remains separately recorded, without pretending global catalogs were byte-identical.

| Proposed bound | Limit |
| --- | ---: |
| Enrollment data | 8,388,608 bytes |
| Owner data | 67,108,864 bytes |
| Additional-NPI data | 65,536 bytes |
| Aggregate data | 75,563,008 bytes |
| Each catalog / each resource metadata | 8 MiB / 1 MiB |
| Aggregate nine response bodies | 96,534,528 bytes |
| Metadata request / data request / session | 30 s / 180 s / 900 s |
| Each cleanup race | 1 s |
| Enrollment / owner / additional-NPI source rows | 50,000 / 500,000 / 50,000 |
| Each selected JSONL / aggregate selected bytes | 512 MiB / 768 MiB |

These remain **proposals, not approved download budgets**. Metadata advertises 57,529,084 aggregate CSV bytes; native conformance requires each completed data body to equal its declared size as well as satisfy its cap. A changed size fails safely, not silently raising limits. Zero retries/redirects/credentials; no ADP or per-state downloads. Selected-byte and row caps fail without truncated success. Prospective total disk includes raw data, copied documents, metadata, selected output and small intents/manifests; memory does not scale with projected row count.

## Transport, ownership and publication

Native jobs: `data/business-sources/cms-snf-pecos/jobs/<UUID>`. Shared native lease: **the existing** `data/business-sources/cms-hospital-general-information/jobs/.source-lease`, also used by hospital/nursing acquisition. This is actual exclusive `wx` ownership, not a provider-label-only promise. Lease release checks exact original payload plus inode/device/single-link identity; changed markers are not deleted. No stale takeover. Tests prove contention against an existing marker and equality with the existing nursing lock path; they do not dispatch either native source to test contention.

Run intent and each request intent are synced before transport. Bodies stream into exclusively owned files under byte caps. Completed bounded bodies are retained before HTTP/content-type/conformance checks, including malformed/HTTP-error responses. Unknown/incomplete bodies are removed only when exact owned file identity is known; completed raw bodies survive failure. Derived/pending outputs are removed by owned identity when unpublished. Errors never contain raw body, source values or provider personal fields.

Fetch/read cancellation is raced; cleanup is bounded. Unresolved provider/read/cancel ownership retains the source lease and requires inspection; late responses are disposed, never a basis for automatic unlocking/retry. Several cleanup phases can each consume their one-second grace. Deadlines are cooperative for local filesystem/projector work, not OS-enforced hard wall-clock kills. A process crash or ambiguous local ownership leaves evidence for inspection rather than stealing a lock.

Policy and output ownership are rechecked immediately before publication. A pending manifest is fully independently replayed, then exclusively linked last; final published replay and cancellation check precede terminal success. The reader requires exact artifact/request roster, schema/mode/run identity, timestamps/order/limits/status/content type, all body hashes, source/document/policy bindings and count equality. It re-streams each raw CSV into expected selected hashes/bytes, independently compares each selected JSONL, then rehashes/rechecks every file and directory identity. No acquired-body verifier relies solely on manifest claims.

## Full-cohort projection and meaning

CSV is incrementally UTF-8 decoded and parsed with bounded records and backpressure; one JSONL record is written per source row, with no retained array of 500k projected rows. Required selected headers must occur exactly once; unknown headers are counted, not emitted. Every selected row carries raw hash + logical CSV row identity, typed enrollment/PAC/CCN/NPI values, August source period and projection version. Repeated identifiers/relations remain repeated source rows; acquisition is not canonical deduplication or a Cartesian linkage build.

Enrollment rows preserve the publisher's approved-to-bill-at-snapshot assertion, not independent current operations. Exact raw dates remain unparsed. Invalid optional IDs remain raw/null with status; malformed required selected enrollment IDs reject. Required provider type is `00-18`. CCN strings are not padded/truncated or inferred as NPI. Owner organization rows retain only the reviewed organization relationship fields; individual/unknown-owner rows emit exclusion markers with source-row identity/type/reason, not owner PAC/name/address. The three counts reconcile organization + individual + unknown to owner source rows. Percentages are raw assertions, never normalized to 100 percent; parent flags never establish a canonical parent. Additional NPIs remain a separate row stream; downstream exact joins and cross-file quality reporting are separate work.

All raw files are internal; all selected artifacts are local-review-only. No public export, business/site count, complete ownership claim, geographic assignment or full-native-schema certification follows. The current PDFs describe selected field semantics; the actual native wire header roster/date formats/row totals remain unobserved until a future authorized run. Schema drift retains raw evidence and fails, without a permissive historical bypass.

## Focused evidence and remaining boundary

Offline lifecycle fixtures cover successful nine-response acquisition and independent replay; synthetic/native rejection; completed HTTP/schema failures retained; unrelated catalog changes accepted but selected version drift rejected; existing lease contention; changed lease payload preserved; post-publication descriptor retention; selected tamper with rehashed manifest rejected; noncooperative fetch/read/cancel; malformed CLI; final policy drift preventing publication. A real fixed 30-second metadata timer returned with retained uncertainty after approximately 31.06 seconds. The 180-second data and 900-second session timers are implemented, not independently wall-clock exercised.

Stream fixtures cover 11,000 rows (exceeding the old offline cap), **exactly 500,000 owner rows accepted and 500,001 rejected** from an incremental generator, UTF-8 split across chunks, slow consumer/backpressure, sink error cleanup, timer cancellation, explicit unknown/individual exclusions, malformed organization/enrollment dates retained, invalid optional IDs and required-key rejection. No native dataset body or business record was obtained by these fixtures.

Native execution remains blocked in compiled policy. Root review must approve the precise budgets/dispatch policy and any source-specific wire changes; app registration can independently consume the stable CLI/receipt contract later. Once dispatched by the application, routine progress belongs to its worker/receipt lifecycle, not an agent polling loop.
