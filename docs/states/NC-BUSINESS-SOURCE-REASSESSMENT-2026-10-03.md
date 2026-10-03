# NC business-source reassessment — 2026-10-03

The HOLD remains. The [official search notice](https://www.sosnc.gov/divisions/business_registration) expressly prohibits scripted interactive searches. The [subscription description](https://www.sosnc.gov/online_services/data_subscriptions/about_the_data) remains the appropriate source-contract starting point.

The assessment distinguishes indexed official documentation from successful direct retrieval. Direct layout/manual fetches failed in this review; indexed relational field descriptions do not pin current production schema. The existing historical identity and address-role caveats remain.

## Implementation and scope

The immutable record is `config/state-business-source-assessments/nc-2026-10-03.json`. The loader `runner/wv-nd-nc-business-source-reassessment.mjs` verifies its complete content digest and returns a defensive copy. Revised observations require a separately dated record.

Only public documentation was inspected. No rows, accounts, purchases, publisher contacts, accepted terms, portal automation or production changes occurred. All eight authority fields remain false; action counters remain zero.

No connector or runtime migration is introduced. Integrator catalog wiring is a separate step. Rollback removes this record, documentation and loader integration together while preserving the historical assessment.

