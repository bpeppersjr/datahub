# California business-source reassessment — 2026-10-03

Decision: HOLD. This refresh records official documentation evidence only. Acquisition, paid access, row-bearing preflight, connector implementation and production authority remain false. No contacts, accounts, orders, terms acceptance, source-row downloads or production changes occurred.

Narrow the prior rights and field-definition gaps using the official filing-data use statement and search FAQ; preserve unverified bulk contract and access boundaries.

Official records page directs bulk orders to bizfile and manual pages 132-134. The indexed official manual describes login-required master and weekly orders.

Public search FAQ defines entity number, registration date, jurisdiction, status, executive-office address and mailing address. These are web definitions, not a verified bulk layout or key-lifecycle contract.

Active describes formation/registration and authorization to conduct business; it does not prove current operation. Foreign status concerns California registration. Bulk-code mapping remains unverified.

The official Terms Intellectual Property section expressly states SOS places no restriction on use of filing data, subject to third-party rights. The earlier absent-use-grant summary was overbroad. Portal restrictions and any bulk-specific terms still need reconciliation; this finding grants no source-action authority.

Next action: Use the documented filing-data reuse statement in the existing preflight. Resolve the actual bulk layout, master/weekly semantics and supported delivery method; seek clarification only for remaining product-specific terms. No account, order, contact or acquisition is authorized by this reassessment.

## Evidence and integration

The immutable record is `config/state-business-source-assessments/ca-2026-10-03.json`. The loader `runner/ca-id-nh-oh-business-source-reassessment.mjs` pins the complete reviewed JSON and rejects authority or evidence drift. Shared catalog integration is owned by the primary integrator. This assessment does not increase collection completion or create a data release.

- [Official source](https://www.sos.ca.gov/administration/public-records-act-requests/business-entity-records) — Bulk ordering route; listed entity families.
- [Official source](https://bpd.cdn.sos.ca.gov/ucc/ucc-online-help.pdf) — Official search-index excerpt of page 132 establishes login and listed master/weekly prices. Full PDF retrieval exceeded web-tool size limit; no complete PDF inspection claimed.
- [Official source](https://www.sos.ca.gov/business-programs/bizfile/privacy-warning-terms-and-conditions-use) — Filing-data reuse statement and distinct portal-access restrictions.
- [Official source](https://www.sos.ca.gov/business-programs/business-entities/cbs-field-status-definitions) — Web field/address definitions and Active registration semantics; not a bulk layout.

Verification: `node --test runner/ca-id-nh-oh-business-source-reassessment.test.mjs`. Rollback consists of removing this assessment from catalog selection; preserve historical records. No runtime migration is required.

