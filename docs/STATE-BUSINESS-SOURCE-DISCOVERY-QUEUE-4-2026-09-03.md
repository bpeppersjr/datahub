# State Business Source Discovery — Queue 4, wave 1

Date: 2026-09-03

Scope: ID, NM, ME, WY. These are four of the 13 state/D.C. jurisdictions not assigned to the first three discovery queues and without a broad production organization layer. Three independent state workers researched Idaho, New Mexico, and Maine while the root worker researched Wyoming. Every lane used official primary sources only.

No account was created, agreement accepted, purchase made, bulk record downloaded, broad portal query executed, access control bypassed, or production pointer changed. The machine-checkable companion is `config/state-business-source-discovery-queue-4.json`; `npm run state-source-discovery:check` verifies its ranked scope, arithmetic, evidence floor, authorization boundary, open gates, and privacy controls.

## Decision

None of the four sources is authorized for autonomous ingestion.

| Rank | State | Current profiles | 2023 nonemployer baseline | Diagnostic gap | Official candidate | Decision |
| ---: | :---: | ---: | ---: | ---: | --- | --- |
| 1 | ID | 34,206 | 165,145 | 130,939 | SOSBiz / possible corporate information list | **HOLD** — no documented recurring entity export |
| 2 | NM | 40,433 | 140,015 | 99,582 | SOS Enterprise | **HOLD** — lookup registry, no documented recurring export/API |
| 3 | ME | 30,240 | 127,173 | 96,933 | InforME corporate bulk products | **HOLD** — paid recurring product, unpublished schema/change/rights contract |
| 4 | WY | 16,143 | 65,773 | 49,630 | Business Database Download | **HOLD** — paid monthly product, unpublished schema and derived-use contract |

The baseline is a different source universe and observation period. The gap and profile ratio are acquisition-priority diagnostics only, never business-completeness measurements.

## Idaho

The [Idaho SOSBiz search](https://sosbiz.idaho.gov/search/business) is a per-record name/file-number service. Idaho law recognizes a Secretary of State corporate information list, but does not define a current all-entity product, schema, cadence, or delivery contract. The separate [SOS UCC bulk service](https://sos.idaho.gov/ucc/) is documented but is lien data, not a business-entity master. Idaho's displayed total-registration count is not an active-release control total.

File Number is only a candidate source key until the state documents uniqueness, immutability, non-reuse, and continuity through merger, conversion, dissolution, and reinstatement. A future extract may contain principal-office street or mailing ZIP evidence, but that is administrative geography, not proof of an operating site. Assumed business names must remain distinct from legal entities. Exclude registered agents/offices, governors, officers, directors, members, managers, partners, owners, incorporators, signers, all person addresses, phones, emails, filing images, and free text.

**Next gate:** ask [SOS Business Services](https://sos.idaho.gov/sosbiz-help/) whether an existing corporate information list or broader product supplies a complete person-free recurring master, sample/schema, controls, status/address codebooks, File Number guarantee, change/tombstone semantics, supported automation, price, and written retention/derived-publication rights. Do not scrape SOSBiz.

## New Mexico

The New Mexico Secretary of State moved business filing into SOS Enterprise in December 2024. The current official [record-type lookup](https://enterprise.sos.nm.gov/api/GroupItems/BusinessRecordTypes/true) exposes 29 types and the [status lookup](https://enterprise.sos.nm.gov/api/GroupItems/BusinessStatusTypes/true) exposes 26 values, but the reviewed official material documents no complete recurring business-record export, download API, file schema, count, checksum, cadence, tombstone contract, or automation right. The UCC bulk interface is for submitting UCC filings, not exporting business entities.

Business ID/Record Number is a candidate key without a published lifecycle guarantee. `Active` is an SOS registration assertion and remains distinct from registered, legacy, suspended, revoked, dissolved, and other source statuses; it is not proof of operation. Retain only affirmatively typed organization principal/mailing address evidence and exclude agents, officers, directors, members, managers, organizers, incorporators, person addresses, contact data, signatures, tax/account/payment data, comments, documents, and free text.

**Next gate:** ask [SOS Business Services](https://www.sos.nm.gov/business-services/) whether an existing person-free SOSE export can provide a sample/dictionary, exact population and active count, Business ID guarantee, status/address codebooks, change semantics, checksum, price/authentication, supported automation, and binding derived-use rights. Do not enumerate the public search.

## Maine

The Maine Secretary of State [Bulk Data page](https://www.maine.gov/sos/corporations-commissions/bulk-data) lists a $600 monthly Corporate and UCC product, a $1,200 monthly Active/Inactive Corporate and UCC product, and $300 weekly Corporate Data updates. [InforME subscriber services](https://www.maine.gov/informe/subscribers/services) administers the request path. The public material does not define the corporate-only entity inventory, file layout, status codebook, current count, stable key, address fields, checksums, monthly/weekly full-versus-delta behavior, tombstones, replay, download protocol, automation, or derived-publication rights.

Charter Number is a candidate source key only. Annual-report good standing is legal/administrative evidence, and reinstatement must be handled without treating a prior administrative dissolution as permanent deletion. Principal/home-office addresses, if present, are administrative geography. Exclude clerks, registered agents, officers, directors, shareholders, members, managers, authorized people and all associated person/contact/document data.

**Next gate:** request the corporate-only order packet/addendum, sample and dictionary, exact entity/status scope, Charter Number lifecycle, principal-office/ZIP coverage, file controls, monthly/weekly change semantics, protocol, automation rules, complete price, and written derived-use rights from InforME and Maine SOS. Do not purchase first.

## Wyoming

The Wyoming SOS [Business Database Download agreement](https://sos.wyo.gov/Forms/Business/General/WYSOS-BusinessDatabaseDownload.pdf) documents a real monthly product delivered by a seven-day Google Drive ZIP link on the last Friday of each month. It costs $850 for a single month, $5,100 for six months, or $10,200 yearly and includes filing, party, and public annual-report information. The agreement prohibits sharing the download link and unlawful or misleading uses, but it does not publish the data schema, exact complete/current scope, identifier contract, status mapping, row/control counts, checksums, change semantics, safe organization-only projection, or explicit derived-publication/redistribution terms.

The source expressly mixes party data into the download. Any future implementation must exclude registered agents, officers, directors, other parties, their addresses, contact data, signatures, images, and free text before a retained normalized artifact is created. A mailing or principal address remains administrative evidence and cannot create a business site.

**Next gate:** request a non-production sample, dictionary, exact scope, entity-key and status contract, address roles, counts/checksums, full-versus-delta semantics, supported retrieval method, and written retention/derived-publication rights from Wyoming SOS. Do not subscribe first.

## Shared production gate

For every candidate, production remains false until all nine gates close: source scope, schema, stable identifier, status codebook, address role, change/tombstone contract, supported automation, retention/derived-publication rights, and person-data minimization. Clearing discovery does not authorize a purchase, connector implementation, source release, registry rebuild, or pointer promotion.

The next Queue 4 wave should cover NH, MT, RI, SD, VT, WV, ND, plus the existing statewide-scoped Alaska and District of Columbia gaps. Their current evidence remains national-sector or scoped—not broad jurisdiction coverage.
