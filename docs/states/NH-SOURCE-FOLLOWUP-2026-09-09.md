# New Hampshire source follow-up — September 9, 2026

## Decision

Concrete public CSV-export lead found; **not acquisition-ready**. This advances the September 8 triage, which had not queried the public search. No provider rows or dataset were acquired, no application operation was dispatched, and NH business coverage remains unmeasured.

## Official evidence

The [DHHS public childcare search](https://new-hampshire.my.site.com/nhccis/NH_ChildCareSearch) renders a provider-results download control and a separate search-results download control. It offers program-type, street, city and ZIP inputs. Program choices distinguish licensed group programs, licensed family programs, exempt facilities/families and residential programs. These controls establish an export lead, not proof of complete statewide delivery.

The search describes a free public service and warns that some program-maintained information is not verified by DHHS. Its stated purpose is helping the public find childcare. Neither that purpose nor a download control establishes unrestricted redistribution, automated request rates or retention rights. Those policy dimensions remain unresolved; do not infer prohibition either.

The [official detail-page template](https://new-hampshire.my.site.com/nhccis/NH_childcaresearchaccountdetail) exposes status, capacity, care type and licensing-history sections. No populated detail record was inspected, so current-status values, their meaning and completeness are unverified.

The [licensing rules, He-C 4002.01(h)](https://gc.nh.gov/rules/state_agencies/he-c4000.html) define center-based programs across group-center, infant/toddler, night-care, preschool and school-age types, including combinations. Therefore a portal group-program label must not be presumed equivalent to every statutory center subtype. Require an observed value crosswalk before center-only normalization.

## Public page implementation observations

Three bounded HTTP GETs of the same public search HTML returned 200. Only static export-function excerpts were inspected in memory; no remoting request, search submission or export action was executed. These observations are implementation evidence, not a stable documented API contract:

- The provider-download function invokes a provider-list action and constructs `ProviderResults.csv`; search export constructs `SearchResults.csv` from search results.
- Serializer fields include name, enrollment status, shipping and billing addresses/postal codes, record type, provider/license number, issue/expiration dates, capacity and program type. No ZIP+4-specific column was observed. Actual values, physical-versus-mailing address semantics and identifier stability remain unvalidated.
- The serializer contains public-contact redaction logic. Preserve redactions; do not recover hidden fields from an underlying response. Do not substitute billing addresses for redacted physical addresses.
- CSV conversion appears outside the asynchronous provider-list callback. This suggests a possible first-click timing problem, not a verified runtime failure. Locale-formatted dates and quote escaping also need an actual downloaded-file test.

The DHHS licensing landing page returned HTTP 403 through the research fetch. No retry or access workaround was attempted. The public search itself remained readable.

## Concrete next action and boundaries

Validate one small, ordinary public-UI search/export with a tightly bounded result set before implementing acquisition: verify CSV headers, quoting, date format, redactions, center subtype values, address roles and status semantics. Then establish whether the provider-results control is complete statewide delivery or capped, and review applicable source-use terms. Do not invoke undocumented remoting methods directly or guess endpoints.

Only after those gates should Co*Tive receive a governed connector with explicit rate/resource limits, fixtures, cancellation, immutable source retention and a persisted application-operation receipt. Recurring acquisition belongs to the app, not an agent polling loop. Keep ZIP5 and ZIP4 separate, record unknown status honestly, and do not treat a licensed or scholarship-enrolled program automatically as a currently operating unique business.

No account, contact request, terms acceptance, CAPTCHA interaction, bulk download, runtime/configuration change or production-plan change occurred. Research-only documentation; no claim of connector readiness, statewide completeness or redistribution authorization.
