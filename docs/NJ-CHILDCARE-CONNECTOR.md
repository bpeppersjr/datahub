# New Jersey childcare preflight

The application-side preflight checks the fixed public NJDEP source described in the [source handoff](states/NJ-CHILDCARE-ACCESS-2026-09-07.md). This is not a business-record downloader or an enrolled industry source. Acquisition, normalization, release verification, national integration and refresh scheduling remain separate work.

## Command and retained evidence

```powershell
npm run nj-childcare:preflight
```

`--help` performs no source requests. Other CLI arguments are rejected; callers cannot replace the source host, layer, query or output path. The command saves a UUID receipt under `data/business-sources/nj-licensed-childcare-centers/preflights` and prints only its path, checksum, size, count and readiness summary. It uses no AI session or credentials.

Eight paced observations check layer metadata, public catalog-item identity, total count and download-date aggregates in forward/reverse order. No object-ID inventories, record attributes or business geometries are requested. Aggregate JSON contains a statistics row, not a business entity. Requests have a 30-second header/body deadline, three bounded transient attempts, a one-megabyte response ceiling and one-second observation spacing. Publisher waits above 60 seconds defer instead of being shortened. Redirects and caller-supplied transport/query extensions are rejected; test-only transport/clock/timeout injection is bounded.

The layer schema pins 21 selected field names/types/lengths without acquiring their values. Its MapServer catalog omits nullable flags and objectIdField; the OID field identifies OBJECTID. Native Web Mercator identifiers, query/order/pagination/statistics capabilities, source count and a single non-null download date must remain consistent. Counts above 20,000 fail the local preflight ceiling. Item ownership, public access, type, source URL, dates and terms are checked. Variable item-view statistics are retained but not used as source-drift evidence.

Receipts preserve all observed layer/item JSON payloads, including distribution terms, and their parsed-payload hashes. Treat retained metadata/HTML as untrusted source evidence, not executable markup. Complete publisher XML metadata is not yet retained; the receipt explicitly records that requirement before acquisition. Terms presence does not establish legal approval. No current dataset pointer is published, and connector_ready, scheduled and export_authorized remain false.

## Failure and semantics

Malformed/oversized bodies, changed identities/schemas/counts/dates/terms, mixed or null aggregate dates and insufficient capabilities fail without a successful receipt. CLI cancellation propagates through IPC and process signals to requests and waits. Receipt publication uses exclusive temporary files, flush-before-rename and ownership checks; failed cleanup must preserve foreign paths, prior receipts and unrelated data. There is no automatic stale-data deletion or resume claim.

Publisher download and item modification dates remain distinct from observation time and license validity. Stable checks do not establish a transactional snapshot, current operations, unique business identity or complete childcare coverage. New Jersey's public-school inclusion differs from Massachusetts; do not treat the sources as identical denominators.

Next: preserve the full publisher metadata package and versioned policy contract; implement bounded ID/batch acquisition, source-specific normalization and release checks with offline fixtures; then hand collection to Co*Tive's childcare industry workers. Business entities will contain latitude/longitude only, and ZIP5/ZIP4 will remain separate. No production data migration is required for this additive preflight.

## Acquisition handoff contract

The next acquisition stage must preserve raw publisher XML bytes alongside the complete layer/item JSON and count/date/ID observations. The raw XML endpoint is not the rendered HTML metadata page, and its structure must not be assumed to match an FGDC title path. Retention is byte-for-byte: do not parse and reserialize the stored artifact or fetch links embedded in it. XML envelope checks are not schema validation, authenticity signatures or legal approval.

`runner/nj-childcare-metadata.mjs` now supplies `fetchNjChildcareMetadata()` for that stage. It returns unchanged raw bytes with their SHA-256, URL and observation time; it does not write files, publish releases or download business records. It enforces a one-megabyte ceiling, XML content type and strict UTF-8, rejects redirects, DTD/custom entity declarations and HTML, and checks the metadata envelope and dataset marker without executing or schema-validating XML. A 30-second header/body deadline, three bounded transient attempts and publisher Retry-After handling apply; cancellation propagates through fetch, body reading and retry waits.

A live utility call at 2026-09-07T19:45:56.197Z returned 137,808 bytes with SHA-256 `e9484bc27ecfcda7ebfc33212e5ee6d40109b6a9033d6e71b56858e32d215ad4`. This probe kept the bytes in memory only. Persistent XML retention remains the release builder's unfinished responsibility; the existing preflight receipt is not retroactively marked XML-complete.

Metadata utility verification: seven new offline tests and the full 595-test repository suite passed, along with source/connector checks, lint, web/desktop builds, desktop smoke and TypeScript. The production dependency audit found zero vulnerabilities. This additive utility has no runtime data migration; removing it before acquisition integration does not affect existing datasets or pointers.

The acquisition sequence is layer, item, XML, count, dates, ID inventory, bounded selected-field batches, then ID inventory, dates, count, XML, item and layer. Compare raw XML hashes, stable item identity/terms, layer schema, count, date aggregates and sorted unique ID inventories before publishing. Any drift fails the acquisition; matching observations still do not establish a transactional snapshot. Use at most 100 IDs per feature request and enforce the encoded URL byte ceiling before dispatch, rather than relying on the server's larger record limit.

The immutable release must contain `publisher-metadata.xml`, selected features, normalized records, quarantine, complete acquisition observations and a manifest linking every artifact checksum and policy. The verifier must replay normalization and reject missing metadata, mismatched ID coverage, undeclared/private fields, inconsistent dates, unsafe paths and excessive quarantine. Preserve the original Web Mercator CRS evidence and the requested WGS84 output transformation; normalized business entities contain only latitude/longitude, not geometry objects. Do not infer corporate parents or current operations from center names or layer membership.

Only after acquisition, normalization and release verification pass may the NJ source enter the app's childcare queue. App workers own subsequent collection; no AI session should be needed. Refresh scheduling, restart checkpoints and reuse decisions must be implemented and tested before they are advertised. A metadata utility alone does not enroll a source or authorize record-level exports.

## Live preflight evidence

Verification: all 588 repository tests, source/connector checks, ESLint, web and desktop builds, desktop control-plane smoke, and `npx tsc --noEmit` passed. `npm audit --omit=dev` reported zero vulnerabilities. The ten new offline tests cover the preflight and CLI, including source drift, response limits, cancellation and immutable receipt publication.

On September 7, 2026, the standalone command passed all eight observations and saved `data/business-sources/nj-licensed-childcare-centers/preflights/572b795a-adef-4b37-8f6f-9bd61b41d892.json` (46,794 bytes; SHA-256 `36ec52b2a310babcd9d0e65e4d45457edc22eea587d007b6cae707d8538427f9`). The source reported 4,075 rows; no business rows were acquired. This count is neither a unique-business count nor proof of complete New Jersey childcare coverage. Connector readiness, scheduling and export authorization remained false. The receipt is local runtime evidence, not a committed source dataset.
