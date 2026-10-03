# New Hampshire business-source reassessment — 2026-10-03

Decision: HOLD. This refresh records official documentation evidence only. Acquisition, paid access, row-bearing preflight, connector implementation and production authority remain false. No contacts, accounts, orders, terms acceptance, source-row downloads or production changes occurred.

Narrow generic identifier and status gaps to product-specific mapping and lifecycle: the official FAQ already defines BID and the status page defines registry standing.

No named current recurring extract, scope, fee, schema or supported delivery contract established.

Official FAQ states Charter Number and Business ID Number (BID) identify registered businesses and differ from federal EIN. This does not establish bulk column names, key immutability or merger/conversion lifecycle.

The official status page defines Active for trade names/entities that do not file reports and Good Standing for entities with reports and fees filed. Neither alone proves current operation. Bulk code mapping and entity-family selection remain unresolved.

Current product-specific retention, derived-use and redistribution terms remain unverified. The official statutory URL failed retrieval during this review; no new legal conclusion asserted.

Next action: Carry published BID and registry-status definitions into the existing preflight, asking only for bulk mapping, lifecycle, source scope, delivery, controls and applicable terms that remain unknown. No contact, query or acquisition is authorized by this reassessment.

## Evidence and integration

The immutable record is `config/state-business-source-assessments/nh-2026-10-03.json`. The loader `runner/ca-id-nh-oh-business-source-reassessment.mjs` pins the complete reviewed JSON and rejects authority or evidence drift. Shared catalog integration is owned by the primary integrator. This assessment does not increase collection completion or create a data release.

- [Official source](https://www.sos.nh.gov/corporations-0/business-faqs) — Official FAQ defines BID/Charter Number and distinguishes EIN; describes searchable charter documents.
- [Official source](https://www.sos.nh.gov/business-status-definitions) — Official search-index content defines Active and Good Standing; direct fetch returned 403, without bypass.
- [Official source](https://www.gc.nh.gov/rsa/html/XXVII/293-A/293-A-122.htm) — Historical optional-service statutory lead; direct page could not be revalidated.

Verification: `node --test runner/ca-id-nh-oh-business-source-reassessment.test.mjs`. Rollback consists of removing this assessment from catalog selection; preserve historical records. No runtime migration is required.

