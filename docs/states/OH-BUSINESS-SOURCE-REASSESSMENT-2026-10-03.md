# Ohio business-source reassessment — 2026-10-03

Decision: HOLD. This refresh records official documentation evidence only. Acquisition, paid access, row-bearing preflight, connector implementation and production authority remain false. No contacts, accounts, orders, terms acceptance, source-row downloads or production changes occurred.

Revalidate official paid FTP ordering and current status guidance; avoid treating registry standing or filing reports as a complete operating-business master.

Form 200 specifies payment followed by FTP access for one-time data. Weekly/monthly downloads require a separate contract.

The official order form contains ordering fields, not the purchased dataset schema. Bulk keys, address roles, status encoding, row counts and integrity controls remain unverified.

The current official FAQ explains Active as exclusive use of a name and Held as temporary name protection. Registry Active must not be interpreted as verified current business operation.

Official privacy statement recognizes public records; the reviewed order form does not establish product-specific retention, automation or redistribution terms. Those remain unresolved, without inferring a prohibition.

Next action: Retain the paid-FTP preflight and resolve exact master scope, schema, change semantics, integrity controls and recurring delivery terms before an order. No contact, contract, payment or acquisition is authorized by this reassessment.

## Evidence and integration

The immutable record is `config/state-business-source-assessments/oh-2026-10-03.json`. The loader `runner/ca-id-nh-oh-business-source-reassessment.mjs` pins the complete reviewed JSON and rejects authority or evidence drift. Shared catalog integration is owned by the primary integrator. This assessment does not increase collection completion or create a data release.

- [Official source](https://www.ohiosos.gov/assets/200.pdf) — Form 200 revised 11/2023 lists one-time price, FTP delivery and separate weekly/monthly contract.
- [Official source](https://www.ohiosos.gov/business/ohio-business-roadmap/frequently-asked-questions) — Current official FAQ defines database name standing, agent data and limited regular-reporting duties.
- [Official source](https://www.ohiosos.gov/privacy-statement) — Public-records statement; not a bulk delivery/reuse contract.
- [Official source](https://www.ohiosos.gov/business/business-reports) — Prior free filing-report lead; direct fetch failed in this review, no report rows downloaded.

Verification: `node --test runner/ca-id-nh-oh-business-source-reassessment.test.mjs`. Rollback consists of removing this assessment from catalog selection; preserve historical records. No runtime migration is required.

