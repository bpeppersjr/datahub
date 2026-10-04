# South Carolina source reassessment — October 3, 2026

Decision: HOLD. Evidence is pinned in `config/state-business-source-assessments/sc-2026-10-03.json`; the September queue remains historical evidence.

The [published agreement](https://scdgs.sc.gov/sites/scdgs/files/Documents/06252025_SC_Subscriber_Agreement.pdf) supports the existing corporate-baseline assessment. Its new-filings option is a separate product. Acquisition planning must retain that distinction and avoid treating UCC services as corporate APIs.

The [portal notice](https://businessfilings.sc.gov/businessfiling/Home) adds a filing-login identity requirement effective September 10. This does not establish a change to bulk-delivery authentication. Its status disclaimer continues to distinguish legal existence from current operation.

Next work is a corporate product contract review covering schema, scope, identifier and address meanings, refresh controls and derived rights. Reading the public service pages incurred no purchase or account obligation. All action counters remain zero and all authority flags false; no source dataset, contact, portal search, production change or connector was created.

Validation: `node --test runner/sc-mn-al-business-source-reassessment.test.mjs`. The loader digest binds the complete dated record. Rollback consists of reverting these new evidence files and any separate catalog integration; no runtime data requires rollback.
