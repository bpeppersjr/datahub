# State Business Source Discovery — Queue 4, wave 2

Date: 2026-09-03

Scope: NH, MT, RI, SD. Three independent state workers researched New Hampshire, Montana, and Rhode Island while the root worker researched South Dakota. Every lane used official primary sources only. No account was created, agreement accepted, purchase made, bulk record downloaded, portal enumerated, access control bypassed, or production pointer changed.

The machine-checkable companion is `config/state-business-source-discovery-queue-4-wave-2.json`. The repository-wide `npm run state-source-discovery:check` validates all three Queue 4 waves, including rank, coverage arithmetic, evidence, privacy exclusions, open gates, and the default-deny authorization boundary.

## Decision

| Rank | State | Current profiles | 2023 nonemployer baseline | Diagnostic gap | Official candidate | Decision |
| ---: | :---: | ---: | ---: | ---: | --- | --- |
| 1 | NH | 22,001 | 116,209 | 94,208 | NH QuickStart customized/direct access | **HOLD** — no published current bulk contract |
| 2 | MT | 25,619 | 109,660 | 84,041 | Corporate Records Bulk Data File | **HOLD** — paid product; identity, change, automation, and rights gates open |
| 3 | RI | 15,949 | 95,241 | 79,292 | Corporate Database Active and Inactive | **HOLD** — paid product; active and cadence semantics are unsafe as published |
| 4 | SD | 17,758 | 75,686 | 57,928 | Business Filings Database Download | **HOLD** — paid recurring product with unpublished file and derived-use contract |

The Census baseline is a different source universe and observation period. The gap and profile ratio rank acquisition work only; they are not business-completeness measurements.

## New Hampshire

[RSA 293-A:1.22](https://gc.nh.gov/RSA/html/XXVII/293-A/293-A-122.htm) permits paid direct access, customized lists, and electronic registry data. The registry scope defined effective in 2026 spans the major entity statutes, but no current official product page publishes a schema, format, price, cadence, authentication method, or reuse contract. [NH business FAQs](https://www.sos.nh.gov/corporations-0/business-faqs) equate Charter Number with Business ID Number. [Status definitions](https://www.sos.nh.gov/business-status-definitions) distinguish `Active`, `Good Standing`, `Not in Good Standing`, and dissolved or suspended authority; none establishes real-world operation.

Principal-office and mailing addresses are administrative evidence only. Exclude trade-name applicants and sole proprietors, registered agents/offices, officers, directors, managers, members, owners, every person-linked address, contacts, signatures, and images. Ask the [Corporation Division](https://www.sos.nh.gov/corporations-0/contact) for an existing person-free full-registry sample and contract; do not automate QuickStart.

## Montana

The Montana SOS publishes a [Corporate Records Bulk Data File catalog entry](https://sosmt.gov/business/business-services-catalog/), [technical specification](https://sosmt.gov/wp-content/uploads/BulkDownloadSpecs.pdf), and [record layout](https://sosmt.gov/Portals/142/Business/Corp_Bulk_Download_Data_Layout.pdf). The product is ZIP-compressed comma-delimited data at $0.02 per record. Its broad file mixes core legal entities with assumed names, foreign business names, trademarks, bonds, and numerous person-role child records. Only confirmed legal-entity rows could qualify for a broad layer.

`Business Entity Number` is a candidate key, but its relationship to Montana's filing/certified-file number needs written confirmation. Principal-office mailing addresses are not sites. No public source contract states as-of time, cadence, full/delta behavior, tombstones, counts, checksums, unattended retrieval permission, or derived-publication rights. Request a person-free sample, exact subtype and status dictionaries, key lifecycle, change mechanics, controls, quote, automation rules, and written rights before any purchase.

## Rhode Island

The official [data-subscription page](https://www.sos.ri.gov/divisions/business-services/business-data-hub/data-subscription) offers one-time active and inactive corporate text files for $250 and $50, or an annual active-and-inactive subscription for $3,600. The [subscription agreement](https://docs.sos.ri.gov/documents/BusinessServices/Subscriber_Agreement.pdf) provides SFTP access, but public material conflicts between daily and monthly availability and does not define full snapshots, deltas, or tombstones.

The product's `Active` population includes entities under a 60-day revocation notice and entities revoked for less than one year. Datahub therefore cannot treat the active file as current legal authority or operation. The nine-digit entity ID is only a candidate until its lifecycle and relationship to other identifiers are documented. Exclude agents, officers, directors, managers, members, owners, incorporators, stock details, person addresses, contacts, signatures, images, and free text. Request the complete person-free contract first; if it clears every gate, a $300 one-time active-plus-inactive evaluation still requires explicit authorization.

## South Dakota

The South Dakota SOS [database-download page](https://www.sdsos.gov/business-services/databasedownloads.aspx) and [FAQ](https://sdsos.gov/Division%20of%20Business%20Services/FAQs/default.aspx) document a full Business Filings Database with monthly and weekly updates. The current [subscription agreement](https://sdsos.gov/docs/ucc-docs/NEWBusinessUCCDatabaseSubscriptionForm.pdf) prices the initial setup/full database at $1,500, monthly updates at $750, and weekly updates at $250; it requires an approved subscriber form, PAD account, and payment.

The public agreement does not publish the business-file schema, exact legal-entity scope, Business ID lifecycle, status/address codebooks, row controls, checksums, correction/tombstone/replay behavior, or derived-publication rights. Filing forms show principal-executive and mailing addresses as well as registered-agent and person-role data. Retain only explicitly typed entity-level administrative addresses; exclude all person and registered-agent material. Request a non-ordering sample and written contract. Do not create an account, sign, or purchase first.

## Shared production gate

All four candidates remain `HOLD` until source scope, schema, stable identifier, status codebook, address role, change/tombstone contract, supported automation, retention/derived-publication rights, and privacy minimization are resolved. Discovery never authorizes acquisition, implementation, registry rebuild, coverage publication, Heatmap Builder admission, or pointer promotion.

The final Queue 4 wave should cover Vermont, West Virginia, North Dakota, Alaska, and the District of Columbia. Alaska and D.C. already have statewide license-scoped evidence but still lack broad jurisdiction organization layers.
