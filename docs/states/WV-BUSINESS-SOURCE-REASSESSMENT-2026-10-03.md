# WV business-source reassessment — 2026-10-03

The HOLD remains. The current [statute](https://code.wvlegislature.gov/59-1-2A/) changes the interpretation of filing freshness: missing annual filings can reflect a valid biennial election. The versioned assessment records that distinction and the unresolved current request-form pricing.

The [published file descriptions](https://apps.wv.gov/sos/bulkdata/Forms/FileDescriptions.aspx) distinguish snapshots and new-company deliveries. New-company files cannot be assumed to carry later corrections or closures. Current source-schema continuity, organization address selection and retrieval/reuse terms still need evidence.

## Implementation and scope

The immutable record is `config/state-business-source-assessments/wv-2026-10-03.json`. The loader `runner/wv-nd-nc-business-source-reassessment.mjs` verifies its complete content digest and returns a defensive copy. Revised observations require a separately dated record.

Only public documentation was inspected. No rows, accounts, purchases, publisher contacts, accepted terms, portal automation or production changes occurred. All eight authority fields remain false; action counters remain zero.

No connector or runtime migration is introduced. Integrator catalog wiring is a separate step. Rollback removes this record, documentation and loader integration together while preserving the historical assessment.

