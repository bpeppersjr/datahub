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

## Live preflight evidence

Verification: all 588 repository tests, source/connector checks, ESLint, web and desktop builds, desktop control-plane smoke, and `npx tsc --noEmit` passed. `npm audit --omit=dev` reported zero vulnerabilities. The ten new offline tests cover the preflight and CLI, including source drift, response limits, cancellation and immutable receipt publication.

On September 7, 2026, the standalone command passed all eight observations and saved `data/business-sources/nj-licensed-childcare-centers/preflights/572b795a-adef-4b37-8f6f-9bd61b41d892.json` (46,794 bytes; SHA-256 `36ec52b2a310babcd9d0e65e4d45457edc22eea587d007b6cae707d8538427f9`). The source reported 4,075 rows; no business rows were acquired. This count is neither a unique-business count nor proof of complete New Jersey childcare coverage. Connector readiness, scheduling and export authorization remained false. The receipt is local runtime evidence, not a committed source dataset.
