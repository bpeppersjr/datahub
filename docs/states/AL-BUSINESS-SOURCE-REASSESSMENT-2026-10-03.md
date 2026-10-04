# Alabama source reassessment — October 3, 2026

Decision: HOLD. Evidence is pinned in `config/state-business-source-assessments/al-2026-10-03.json`.

The [entity inquiry](https://www.sos.alabama.gov/government-records/business-entity-records?area=Business+Entity) and [forms catalog](https://www.sos.alabama.gov/business-entities/business-downloads) still do not establish a recurring business-entity export. The reviewed [bulk fee schedule](https://www.sos.alabama.gov/sites/default/files/form-files/FeeSchedule.pdf) prices UCC data; it is not a corporate export quote.

The next-action correction is eligibility: the [public-record request policy](https://www.sos.alabama.gov/public-records-request) specifies an Alabama-citizen request route. Project eligibility is unverified. General online public access does not resolve an export or automation contract. The [annual-report announcement](https://www.sos.alabama.gov/newsroom/secretary-state-wes-allen-applauds-final-passage-legislation-cutting-red-tape-alabama) also cautions against assuming annual filings establish current operations.

Resolve product existence and an eligible route before proposing an order or records request, followed by schema, scope, identity, address, status, refresh and rights review. All action counters remain zero and all authority flags false; no request, contact, rows, portal automation or production operation occurred.

Validation: `node --test runner/sc-mn-al-business-source-reassessment.test.mjs`. Rollback reverts the new evidence files and separate catalog references; no runtime data was changed.
