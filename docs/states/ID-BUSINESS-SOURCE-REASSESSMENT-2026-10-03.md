# Idaho business-source reassessment — 2026-10-03

Decision: HOLD. This refresh records official documentation evidence only. Acquisition, paid access, row-bearing preflight, connector implementation and production authority remain false. No contacts, accounts, orders, terms acceptance, source-row downloads or production changes occurred.

Refresh the official business-service route and distinguish the UCC XML filing service from a business-registry retrieval API.

Current official business resources describe search, filing, annual reports and certificates; no recurring business master contract was established.

No complete bulk business schema, identifier lifecycle, status dictionary, address-role layout or record controls established.

A certificate of existence evidences registration, not operating-establishment activity. No bulk active-selection codebook was established.

No current product-specific retention or redistribution terms established. The prior statutory lead for corporate-information lists is retained as an unresolved lead: the official statute URL could not be fetched during this review.

Next action: Keep the existing document-only preflight focused on whether a recurring person-free business-master product exists. Exclude UCC filing integration from this acquisition path. No contact, source query, account or acquisition is authorized by this reassessment.

## Evidence and integration

The immutable record is `config/state-business-source-assessments/id-2026-10-03.json`. The loader `runner/ca-id-nh-oh-business-source-reassessment.mjs` pins the complete reviewed JSON and rejects authority or evidence drift. Shared catalog integration is owned by the primary integrator. This assessment does not increase collection completion or create a data release.

- [Official source](https://sos.idaho.gov/business-resources/) — Current search, filing, certificate and agent guidance; former business-services-resources URL redirects here.
- [Official source](https://sos.idaho.gov/docs/pdf/UCCXMLImpGuide.pdf) — Official indexed implementation guide identifies an outbound filing submission service, not registry extraction.
- [Official source](https://legislature.idaho.gov/statutesrules/idstat/Title74/T74CH1/SECT74-120/) — Historical statutory lead from prior assessment; current official page retrieval failed, so no refreshed legal conclusion is asserted.

Verification: `node --test runner/ca-id-nh-oh-business-source-reassessment.test.mjs`. Rollback consists of removing this assessment from catalog selection; preserve historical records. No runtime migration is required.

