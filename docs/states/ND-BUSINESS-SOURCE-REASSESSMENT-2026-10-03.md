# ND business-source reassessment — 2026-10-03

The HOLD remains. The [official product list](https://www.sos.nd.gov/services/data-list-requests) distinguishes active inventories, new-record subscriptions and the combined active/inactive product. Product choice must cover later changes, not merely additions. Sample links were observed without fetching workbook rows; the assessment makes no current schema claim.

## Implementation and scope

The immutable record is `config/state-business-source-assessments/nd-2026-10-03.json`. The loader `runner/wv-nd-nc-business-source-reassessment.mjs` verifies its complete content digest and returns a defensive copy. Revised observations require a separately dated record.

Only public documentation was inspected. No rows, accounts, purchases, publisher contacts, accepted terms, portal automation or production changes occurred. All eight authority fields remain false; action counters remain zero.

No connector or runtime migration is introduced. Integrator catalog wiring is a separate step. Rollback removes this record, documentation and loader integration together while preserving the historical assessment.

