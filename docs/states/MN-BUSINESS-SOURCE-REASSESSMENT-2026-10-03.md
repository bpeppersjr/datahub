# Minnesota source reassessment — October 3, 2026

Decision: HOLD. Evidence is pinned in `config/state-business-source-assessments/mn-2026-10-03.json`.

The [current catalog](https://www.sos.mn.gov/business-liens/business-liens-data/business-data-available/) links a moved [full-bulk implementation guide](https://www.sos.mn.gov/media/d3skshdo/business-bulk-order-implementation-guide-and-record-layout.pdf). Full bulk has stronger identifier and address contracts than the separate Active Business Data product. Those guarantees cannot close Active-product gates by inference.

The [Active guide](https://www.sos.mn.gov/media/3974/business-data-active-user-guide.pdf) remains the governing technical evidence for that candidate. The [full-bulk license](https://www.sos.mn.gov/media/5125/business-bulk-la.pdf) supplies conditional use rights, but its applicability to Active delivery has not been established. Review must resolve the selected product, its license, identity lifecycle, address roles, scope discrepancy and refresh/delivery controls.

All action counters remain zero and all authority flags false. Public documentation examples were read; no source dataset, account, order, contact or production operation occurred. Sector-specific Minnesota credentials are a separate source and this assessment does not change them.

Validation: `node --test runner/sc-mn-al-business-source-reassessment.test.mjs`. The digest-bound loader rejects changed evidence or authority. Rollback reverts new evidence/catalog references only.
