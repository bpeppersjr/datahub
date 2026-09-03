# State Business Source Discovery — Queue 3

Date: 2026-09-03

Scope: official-source discovery for governed national active-business/entity and ZIP coverage
Exact queue: TX, GA, SC, AL, MO, OK, NV, AR, KS, NE

## Executive decision

No broad state entity source in this queue is ready for autonomous production ingestion without another authorization, contract, schema, or migration gate.

- **Strongest immediate bounded action: Oklahoma preflight.** Oklahoma publishes a complete monthly business-entity database for $500, weekly filing updates for $150, an official 19-record relational layout, and trailer control totals. Before spending money, obtain written authorization for scheduled acquisition and downstream use, plus the weekly change/tombstone contract, Filing Number guarantees, status mapping, and entity-address role.
- **Strongest published recurring alternatives:** Georgia offers a $5,000/year weekly secure-FTP extract, but its public schema and data-use terms are absent. Nebraska offers statutorily priced recurring full FTP snapshots and explicitly permits FTP retrieval, but its schema/use rights are not public and its filing platform is scheduled to change before the end of 2026. Arkansas offers recurring downloads at approximately $24,150 for the first year but publishes no schema or change contract.
- **Texas has useful scoped additions, not a complete replacement.** The existing Datahub Texas sales-tax connector covers permit/outlet records. A separate free Comptroller Active Franchise Taxpayers source is a conditional organization/tax-status candidate. Neither is a complete SOS entity register. The broad SOS bulk catalog remains HOLD pending specifications and rights.
- **HOLD:** South Carolina, Alabama, Nevada, and the current public Kansas route do not evidence an authorized complete recurring corporate-registry feed. Missouri confirms a bulk product exists, but its current terms/specifications are not public.

Registry `Active`, `Exists`, `Good Standing`, franchise-tax standing, and license standing are legal/administrative evidence, not proof that a business is operating. Principal, executive, records, mailing, registered, or tax addresses are organization/administrative geography unless an official source proves a physical operating site. Registered agents, officers, directors, members, managers, owners, governors, incorporators, filers, partners, natural persons, and all their addresses are excluded.

## Exact ten-state queue and decisions

| Rank | State | Official candidate | Decision | Primary reason |
| ---: | :---: | --- | --- | --- |
| 1 | TX | SOSDirect entity bulk; Comptroller Active Franchise Taxpayers | **HOLD broad SOS; conditional GO scoped tax layer** | SOS fees/products are public but schema/change/rights contracts are not; Comptroller data are recurring and documented but tax-scoped |
| 2 | GA | SOS Georgia Corporations List | **HOLD now; strong conditional procurement GO** | Official weekly secure FTP exists, but schema, exact entity scope, snapshot mechanics, and reuse rights are unpublished |
| 3 | SC | SOS Business Entities Online / FOIA | **HOLD** | CAPTCHA search and per-entity records only; FOIA does not establish a recurring extract or automation/reuse rights |
| 4 | AL | SOS Government Records Inquiry | **HOLD / NO-GO** | Individual lookup only; no documented bulk/API/feed, weak address freshness after annual-report repeal, and no reuse authorization |
| 5 | MO | SOS corporate bulk download | **HOLD; conditional procurement GO** | Official reports prove bulk sales exist, but current product URL, price, schema, cadence, automation, and rights are not public |
| 6 | OK | SOS Business Entities Bulk Orders | **HOLD pending authorization; strongest technical candidate** | Complete monthly master and weekly updates have a public relational layout; rights, delta semantics, status map, and address role remain open |
| 7 | NV | SilverFlume / Commercial Recordings | **HOLD** | No supported recurring bulk/API published; mixed license/entity population, confidentiality, platform migration, and address-substitution risks |
| 8 | AR | SOS/Arkansas.gov corporation database bulk | **HOLD; conditional paid-source candidate** | Recurring bulk service exists, but schema, key/status/change contracts, automation limits, and reuse rights are unpublished |
| 9 | KS | SOS active-entity files / INK inquiry | **HOLD; bounded procurement path** | One-time active files exist; recurring corporate-registry product is unproven, and the $1,500/month bulk service is UCC, not corporate data |
| 10 | NE | SOS entire business-entity database | **HOLD production; GO for contract/spec preflight** | Recurring full FTP snapshots are authorized, but schema/status/use rights are absent and a 2026 platform cutover is pending |

## Coverage-gap diagnostics

Source: verified local review release `national-business-coverage-views-20260902-115337634Z-ba689784`. `Reported profiles` are source-preserving provisional location profiles, not deduplicated businesses. `Coordinate profiles` are the subset with assigned coordinates. The comparison baseline is 2023 Census nonemployer establishments, a different universe and date. `Profiles / baseline` and `baseline minus profiles` are prioritization diagnostics only, never completeness estimates.

| Rank | State | Reported profiles | Coordinate profiles | 2023 nonemployer baseline | Baseline minus profiles | Diagnostic ratio |
| ---: | :---: | ---: | ---: | ---: | ---: | ---: |
| 1 | TX | 1,370,398 | 28,374 | 3,092,631 | 1,722,233 | 44.3% |
| 2 | GA | 235,468 | 11,900 | 1,163,944 | 928,476 | 20.2% |
| 3 | SC | 81,827 | 6,345 | 445,689 | 363,862 | 18.4% |
| 4 | AL | 89,981 | 6,394 | 388,978 | 298,997 | 23.1% |
| 5 | MO | 94,218 | 7,351 | 485,486 | 391,268 | 19.4% |
| 6 | OK | 78,908 | 5,178 | 327,441 | 248,533 | 24.1% |
| 7 | NV | 44,174 | 2,766 | 299,815 | 255,641 | 14.7% |
| 8 | AR | 43,591 | 3,957 | 244,688 | 201,097 | 17.8% |
| 9 | KS | 54,812 | 3,556 | 219,072 | 164,260 | 25.0% |
| 10 | NE | 52,111 | 2,577 | 154,971 | 102,860 | 33.6% |

Texas includes 885,093 profiles from `texas-comptroller-active-sales-tax-permits`. Those are taxpayer/outlet permit pairs and provisional permit locations, not broad SOS entity coverage. No state-specific broad organization source appears among the largest current contributors for the other nine states; their profiles are mainly national/scoped layers such as FMCSA carriers, NPPES providers, EPA facilities, SNAP retailers, and regulated financial institutions.

## Parallel dispatch record

The requested policy ceiling was up to **10 state workers**, but this runtime exposed **4 total concurrent slots**. With the root task and this manager occupying two slots, the work executed with **2 state workers concurrently**, not ten. Each worker held one distinct state assignment at a time, with no overlapping state research:

1. Wave 1: Texas and Georgia
2. Wave 2: South Carolina and Alabama
3. Wave 3: Missouri and Oklahoma
4. Wave 4: Nevada and Arkansas
5. Wave 5: Kansas and Nebraska

Research used official/primary sources only. No account was created, terms accepted, purchase made, paid API called, bulk file downloaded, broad portal search executed, CAPTCHA or access control bypassed, or production pointer changed.

## Evidence and source decisions

### 1. Texas — hold broad SOS; conditional scoped tax layer

#### Existing scoped Datahub source

The existing `tx-active-sales-tax-permits` connector is based on the Comptroller [Active Sales Tax Permit Holders](https://data.texas.gov/d/jrea-zgmq) dataset. It represents taxpayer/outlet permits and provisional permit locations. An active permit is not proof of current operation, and the layer is not a substitute for the statewide SOS legal-entity register.

#### Broad SOS entity source

[SOSDirect](https://www.sos.state.tx.us/corp/sosda/index.shtml) is the official entity search/order system. Current [Form 806](https://www.sos.state.tx.us/corp/forms/806_boc.pdf) lists Business Entity Bulk Data products: previous master unload $1,350; previous master by entity description $175; new master unload $1,750; new master by entity description $200; CSV list by entity description $200; daily update/replacement subscription $60 or one-time $65; weekly update/replacement subscription $20 or one-time $22; and weekly new-filings CSV subscription $20. The fee schedule does not define fee units, `previous` versus `new`, active/all/history scope, layout, status codes, source-key guarantees, update/replacement semantics, deletions/tombstones, replay, current rows/bytes, checksums, delivery windows, API/SFTP, unattended acquisition, or data-use rights.

SOS reports [more than three million active registered entities](https://www.sos.state.tx.us/about/newsreleases/2025/110525.shtml), a legal-registry population rather than operating businesses. SOS file number is the candidate key but needs a written lifecycle guarantee. Official [address-source guidance](https://www.sos.state.tx.us/corp/amendmentsfaqs.shtml) shows that entity addresses can mean principal office, mailing address, LP records address, or a foreign principal office. Treat them as organization/admin evidence; exclude registered offices/agents and all natural-person data.

#### Conditional Comptroller organization layer

The free [Active Franchise Taxpayers](https://data.texas.gov/d/9cir-efmm) dataset is a separate tax-status source. The Comptroller's [frequently requested files](https://comptroller.texas.gov/data/openrec/requests/taxfiles.php) document a monthly active file (`FTACT.zip`) and weekly new-taxpayer files. Its official layout includes taxpayer number/name/address, organization and record type, responsibility date, SOS/COA file number, SOS status, right-to-transact status, exemption fields, and NAICS. The Texas open-data portal supports automated downloads and a reuse/redistribution posture. Taxpayer number is the tax source key; SOS file number is populated only for some record types. Preserve both SOS and right-to-transact codes. Exclude individual/sole-owner/estate records and never treat the taxpayer mailing/admin address as a site.

**Gate:** ask SOS Bulk Orders for the master/update specification, fee units, stable key, active/all scope, update/tombstone rules, automation channel, control counts, and binding retention/derived-publication/redistribution terms. The Comptroller source may proceed separately only as an organization/admin-ZIP and tax-status layer with record-level redistribution held until policy maps the portal-wide reuse statement.

### 2. Georgia — strong conditional procurement candidate

The [Georgia SOS Corporations page](https://sos.ga.gov/corporations) links the official Georgia Corporations List store. A [one-time extract](https://georgiasecretaryofstate.net/collections/corporations-list/products/idm) is $500. The [annual subscription](https://georgiasecretaryofstate.net/collections/corporations-list/products/annual-subscription-for-a-weekly-extract-of-the-georgia-corporations-list) is $5,000/year and provides weekly secure-FTP extracts described as all active and inactive registered corporations. An account and checkout terms are required.

The official [Active Entities Report](https://sos.ga.gov/page/georgia-corporations-active-entities-report) reported 1,617,352 active entities as of 2026-09-02, including corporations, LLCs, nonprofits, and other types. Use it as a dated reconciliation control only. Confirm that the paid product's use of `corporations` covers all relevant entity types.

Control Number is the candidate opaque source key. [Georgia Rule 590-7-1](https://rules.sos.ga.gov/gac/590-7-1) distinguishes compliant active/existing entities from dissolved, cancelled, terminated, voided, administratively dissolved, merged-out, withdrawn, revoked, and inactive entities. Initial normalization should accept exact `Active/Compliance` only after a current codebook is received. Principal office is a mailing/admin address and can be a PO box. Registered agent is a service mailbox. Exclude agents, officers, directors, people, and unnecessary filing history.

**Gate:** non-ordering request for sample/data dictionary, entity-type inventory, counts/bytes, Control Number rules, status/address codebooks, exact weekly full-vs-delta/tombstone behavior, SFTP automation/retry policy, and commercial retention/derived-publication/redistribution/attribution terms.

### 3. South Carolina — hold

The SOS [Business Entities page](https://sos.sc.gov/online-filings/business-entities) and [search catalog](https://sos.sc.gov/searches) offer human Business Entities Online lookup and registered-agent search. The entity search uses CAPTCHA. The only advertised purchases are per-entity documents and certificates, not a current corporate bulk/API/subscription product.

[SC.gov terms](https://www.sc.gov/terms-and-conditions) prohibit screen scraping, data mining, and other bulk gathering except as allowed through FOIA; they also restrict selling access to or large compilations of site data. The [SOS FOIA policy](https://sos.sc.gov/node/39) permits requests for existing records at actual cost, but [S.C. Code § 30-4-30](https://www.scstatehouse.gov/code/t30c004.php) does not require creating an electronic version that does not exist. FOIA therefore does not prove a complete recurring feed or downstream reuse rights.

The public portal says Good Standing means not dissolved on SOS records and expressly does not mean currently operating. Registered office/agent is service-of-process infrastructure and is excluded. A principal-office ZIP, if present in a future extract, remains organization/admin evidence and needs entity-type coverage measurement. Filing images/free text are excluded because they can contain personal information.

**Gate:** written confirmation of an already-existing current organization-only export, stable entity key, codebook, as-of/count, principal-address coverage, recurring full/delta/tombstone delivery, authorized automated retrieval, and commercial retention/derived-publication terms.

### 4. Alabama — hold / no-go

The [Alabama SOS Business Entity Records](https://www.sos.alabama.gov/government-records/business-entity-records?area=Business+Entity) page provides anonymous name/number/person lookup. The apparent [Business Downloads](https://www.sos.alabama.gov/business-entities/business-downloads) page contains forms, not entity data. No official current bulk export, API, subscription, full/delta/tombstone feed, cadence, SLA, automation permission, or dataset-use terms were found.

The SOS [records disposition authority](https://www.sos.alabama.gov/sites/default/files/sos-rda-2021-10-27.pdf) describes an internal permanent business-entity database and fields including entity ID, name, city, type, and status, but it is not a public schema. The lookup page says Entity ID expanded from six to nine digits by adding three leading zeros; preserve the nine-digit string, but permanence/non-reuse is not documented.

Alabama ended SOS annual reports for corporations effective 2024-10-01. Registry status and principal/address information may therefore remain stale unless updated by amendments, merger, dissolution, withdrawal, reinstatement, or registered-office events. `Exists`/`Dissolved` is legal status, not operation. The registered office is for service and need not be the business location. Principal/mailing is organization/admin evidence only. Exclude all agents, officers, directors, members/managers, owners, incorporators, and people.

**Gate:** SOS must offer a machine-readable complete recurring master/change feed with schema, Entity ID guarantee, codebook, event/tombstone behavior, counts/checksums, address roles, automation permission, and binding reuse/retention/redistribution terms. Do not scrape the CGI lookup.

### 5. Missouri — conditional procurement candidate

The official SOS [administration accomplishments report](https://www.sos.mo.gov/CMSImages/SOSMain/AshcroftAdministrationAccomplishments.pdf) says corporate bulk-data downloads were implemented in November 2022, and the 2023 office report records bulk-data sales. However, the current [online-services catalog](https://www.sos.mo.gov/business/formsAndServices) lists individual search, filing, and copy services but no public bulk landing, order packet, price, account, schema, cadence, or contract.

Official [Corporations information](https://www.sos.mo.gov/business/corporations/about.asp) identifies Charter Number, entity name/type/domestic-foreign, registered agent/address, formation date, prior names, and current status. Charter Number is the candidate source key but needs permanence/non-reuse guarantees. Active/good standing is compliance evidence; administrative dissolution does not itself mean the corporation has ceased existence. Preserve raw status and dates.

Corporate principal address is a mailing/headquarters address. LLC principal office is optional. Registered office is service-of-process and need not equal the place of business. Exclude agent, officer, director, member/manager, owner, and person data; retain any principal/mailing ZIP only as admin geography.

**Gate:** obtain the current official product/order packet and sample with exact price, entity scope, files/schema, Charter Number lifecycle, status codebook, full/delta/tombstone/purge logic, cadence/as-of/checksum/control counts, address coverage by entity type, automated retrieval rules, and commercial retention/derived-publication/redistribution rights.

### 6. Oklahoma — strongest technical candidate, authorization hold

The official [Business Entities Bulk Orders](https://www.sos.ok.gov/corp/bulkorder/bulkDefault.aspx) service offers a complete monthly database for $500 and weekly filing updates for $150 each. The master is a zipped, tilde-delimited text package of approximately 600 MB uncompressed. The public [19-record file layout](https://www.sos.ok.gov/corp/bulkorder/BulkOrderFileLayoutLegalEntity.htm) documents entity, address, agent, officer, names, associated entities, stock, filing type, corporation status/type, name status/type, capacities, suffixes, filings, audit log, and trailer/control totals. Web download is the stated delivery route.

The candidate source key is the ten-character Filing Number, subject to written uniqueness/immutability/non-reuse and merger/conversion rules. Monthly masters should remain truth until SOS defines weekly application: current materials do not say whether weekly rows are full upserts, how deletes/tombstones/corrections appear, or how audit records should be applied. The shipped status dictionary needs an approved legal-current mapping; registry standing remains non-operational evidence.

Entity record 01 references Address ID, but the public layout does not name its address role. Registered offices are for service and may not be the business location. Publish no physical sites. Exclude record types 03 and 04 and all person/agent data, tax/FEIN, telephone, stock, and unneeded audit/free-text content.

The [SOS disclaimer](https://www.sos.ok.gov/feedback/disclaimer.aspx) says filings are public and may be shared with third parties but is not a product license for scheduled acquisition, commercial retention, raw/derived redistribution, or attribution. No account, download expiry, automated retrieval, rate, checksum, or SLA contract is public.

**Gate:** written SOS confirmation of scheduled acquisition, intended commercial/derived use, retention and redistribution; account/download rules; Filing Number lifecycle; weekly full-row/change/delete/replay semantics; status mapping; entity Address ID role and ZIP completeness; compressed size/current count; and checksums/process timestamps.

### 7. Nevada — hold

Public access is [SilverFlume](https://www.nvsilverflume.gov/home) and the human [Business Entity Search](https://esos.nv.gov/EntitySearch/OnlineEntitySearch). No official current bulk export, API, subscription, static recurring download, schema, price, cadence, tombstone contract, checksum, automation grant, or data-use license was found. [NRS Chapter 239](https://www.leg.state.nv.us/NRS/NRS-239.html) supports ad-hoc public-record copies, not a governed recurring product.

[NRS 225.082](https://www.leg.state.nv.us/nrs/NRS-225.html) requires a unique Business Identification Number for Title 7 entities and state-business-license holders, making NV Business ID the candidate key. Lifecycle, entity/license linking, and versioning are undocumented. SOS reported [454,064 active registered businesses](https://nvsos.gov/Home/Components/News/News/3730/23) at 2026-03-31, but this mixed population included corporate and small-business entities, commercial registered agents, guardians, and other categories. Project ORION is changing the platform, raising schema/cutover risk.

[NRS Chapter 76](https://www.leg.state.nv.us/nrs/NRS-076.html) keeps state-business-license administration records confidential except narrow disclosures. When a Title 7 entity has no Nevada business place, the law can deem its registered-agent address the place of business. Without provenance, that ZIP cannot be a site. Exclude registered agents and all people; any surviving entity address is admin-only.

**Gate:** post-ORION supported recurring public-field extract/API, exact population/schema, NV Business ID lifecycle, entity/license linking, codebook, full/delta/tombstones, counts/checksums, address provenance, price/delivery/automation, and commercial retention/derived-publication rights.

### 8. Arkansas — conditional paid-source candidate

The SOS entity search links the [Business Entity Special Request List Builder](https://www.ark.org/sos/special/index.php) and the [corporations bulk-data service](https://www.arkansas.gov/services/bulk-data). The official [subscriber catalog](https://cdb-manager.ark.org/login) lists a $150/year account for up to ten users, Special Request List Builder at $0.10/record with a $10 minimum, and Business Entity/Corporation Database Bulk Download at $2,000/month with daily, weekly, biweekly, or monthly downloads. The apparent minimum first-year recurring cost is $24,150.

The current [Doing Business in Arkansas guide](https://www.sos.arkansas.gov/uploads/bcs/DoingBusinessInArkansas2025.pdf) says BCS holds almost 200,000 active entities and that purchasable listings contain entity and registered-agent names/addresses. Filing Number is the candidate key. No public bulk schema/format/version, identifier guarantee, status codebook, exact population, counts/bytes, snapshot-vs-delta/tombstone behavior, archive, checksum, API, or automated-download terms are published.

Registry/franchise standing is legal/compliance evidence only. If no Arkansas office/facility exists, registered-agent address can also serve as principal office. Treat every address as organization/admin evidence and exclude agents, officers, incorporators, members/managers, owners, and people. LLC member information is confidential.

**Gate:** subscriber agreement and data license, dictionary/sample, delivery protocol, Filing Number lifecycle, exact active/all scope, status map, full/delta/tombstones, counts/as-of/checksums, address role and ZIP coverage, automation limits, and commercial retention/derived-publication/redistribution rights.

### 9. Kansas — one-time active files; recurring route unproven

The current [Kansas SOS Database Records Access Request](https://www.sos.ks.gov/forms/elections/RAR.pdf) sells one-time active-entity files: all for-profit corporations/LLCs/LPs/LLPs for $200, or type-specific/not-for-profit/general-partnership files for $150. Published fields are SOS Business Entity ID, type, status, name, mailing address, formation date and jurisdiction, resident-agent name, and registered-office address. Customized work costs $50/hour plus a $100 service fee. The form directs entire-database inquiries to Information Network of Kansas but provides no price, schema, cadence, or contract.

The often-cited $1,500/month `entity bulk download` appears in UCC regulation and the [KSUCC Cost List](https://mykansas.ks.gov/ucc/?p=help_costs), alongside UCC enrollment. It is not established as business-entity-registry bulk. Do not budget or authorize it for corporate data without written SOS/INK confirmation.

Business Entity ID is the candidate key but needs format/lifecycle guarantees. Kansas biennial reporting means legal/address data may be roughly two years old; forfeiture/reinstatement remains legal status, not operation. The one-time product supplies mailing and registered-office addresses, not a principal/site field. Mailing is admin evidence; registered office/agent is excluded. [K.S.A. 45-230](https://ksrevisor.gov/statutes/chapters/ch45/045_002_0030.html) restricts using public name/address lists for sales solicitation, and current generic subscriber terms do not grant derived redistribution.

**Gate:** written INK/SOS confirmation of a corporate registry product, enrollment/price, exact population, sample/dictionary, Business ID lifecycle, status codebook, recurring full/delta/tombstones, cadence/count/checksum, principal-address availability, authenticated automated retrieval, and lawful retention/derived publication under K.S.A. 45-230.

### 10. Nebraska — recurring full FTP, migration hold

The SOS [Corporate and Business page](https://sos.nebraska.gov/business-services/corporate-and-business), [Subscriber Services](https://www.nebraska.gov/subscriber/), and [Corporate Records Batch Agreement](https://www.nebraska.gov/subscriber/pdf/corp-data-bulk-contract.pdf) document recurring full sets of the entire business-entity database, excluding images, in fixed-record-length multi-file format over FTP. [Neb. Rev. Stat. § 33-101(3)](https://www.nebraskalegislature.gov/laws/statutes.php?statute=33-101) authorizes batch access. Prices are $300 per weekly dump, $500 per twice-monthly dump ($1,000/month), or $800 per monthly dump, with a six-consecutive-month minimum. Subscriber enrollment is $100/year for up to ten users. Direct FTP retrieval is expressly contemplated.

The [Special Request service](https://www.nebraska.gov/SpecialRequestSearches/index.cgi) also provides one-row-per-record CSV at $15 per 1,000 records with entity/type/date/location filters. It excludes phone, email, officers/directors, and registered-agent data, but does not promise stable Account Number or status, so it is not sufficient for a governed active master.

SOS Account Number is the candidate source key, pending immutability/non-reuse, merger, and migration crosswalk guarantees. Active is legal registration status; administratively dissolved/revoked entities can reinstate. Full snapshots are preferable to inferred tombstones. Principal/designated office may be in or out of state and is organization/admin evidence. Exclude all agent/officer/director/member/manager/owner files and addresses.

The current agreement is silent on commercial retention, redistribution, derived publication, and attribution. More importantly, the [new filing-system FAQ](https://sos.nebraska.gov/new-online-business-filing-system) says the replacement should launch before the end of 2026; subscriptions will no longer be required for bulk data, but a new account will be. No replacement layout, endpoint, price, identifier crosswalk, or cutover plan is published.

**Gate:** current and post-migration layouts, exact population, Account Number crosswalk/lifecycle, complete status/date codebook, full/update/tombstone/reinstatement rules, counts/bytes/checksums, cutover/parallel-run plan, organization-only file selection, and signed retention/derived-publication/redistribution rights.

## Cross-source implementation controls

Any candidate that clears preflight must follow the governed lifecycle:

1. **Preflight:** record publisher/authority, exact product, account/fee, intended use, binding terms, retention, redistribution, attribution, automation, and people-field exclusions.
2. **Plan:** define full/delta cadence, cutoff windows, stable key, legal-active predicate, address roles, control totals, replay/idempotency, reinstatements/tombstones, and rollback.
3. **Acquire:** use only the provider-supported channel; quarantine the exact release and store source/product URL, receipt, provider as-of, filenames, bytes, hashes, and delivery metadata.
4. **Validate:** inventory schema/files; verify identifiers and referential integrity; codebook coverage; trailer/control counts; full/delta continuity; ZIP/address fill; truncation; and unexpected PII/person fields.
5. **Normalize:** preserve raw ID/status/dates; map only documented legal activity; label principal/executive/records/mailing addresses as administrative; never synthesize physical sites.
6. **Reconcile:** use provider identifiers only, never name/address alone; prefer regular full rebuilds until deletion/tombstone semantics are proven; retain reinstatement/resurrection history.
7. **Quality gate:** fail closed on missing snapshots, count drift, unknown codes, duplicate/reused IDs, schema drift, gap/overlap in deltas, unexpected people/agent data, or degraded ZIP coverage.
8. **Publish:** organization-only derived layer with source/as-of/terms provenance, explicit `not an operating-site` semantics, and no raw redistribution unless licensed.
9. **Finalize:** record manifest, validation/reconciliation metrics, contract-aligned retention/deletion, and the next expected source release.

## Recommended strongest bounded next action

Run a **non-transactional Oklahoma rights-and-change-semantics preflight**. Do not purchase or implement yet.

Ask Oklahoma SOS Business Filings to answer in writing:

1. whether a service account/operator may automatically retrieve a monthly complete master and each weekly filing package, including authentication, download window, retries, rate limits, SLA, and checksums;
2. whether Datahub may retain raw releases, normalize/reconcile them, and publish a commercial derived organization layer, including attribution, redistribution, contractor access, and deletion/retention duties;
3. whether Filing Number is immutable, unique, non-reused, preserved through mergers/conversions/reinstatements, and safe as the source key;
4. whether weekly packages are full current-row upserts or filing/event rows, and how deletions, dissolutions, withdrawals, mergers, corrections, replacements, late filings, replay, and rebaseline are represented;
5. the authoritative status mapping for a legal-current organization population and the meaning of entity record 01's Address ID, including principal/mailing/registered provenance and ZIP completeness; and
6. current compressed size, per-record-type counts, process/as-of timestamps, and a non-production sample/data dictionary.

If the answers and terms are satisfactory, authorize one $500 operator-managed master purchase plus at most one $150 weekly sample. The first implementation assignment should be an offline `ok-business-registry` evaluation that:

- ingests only entity/address/dictionary/filing/control records required for legal-entity reconciliation;
- excludes agents, officers, stock, tax IDs, phones, audit free text, and every person field;
- validates all 19 record headers, trailer counts, referential integrity, Filing Number uniqueness, status coverage, and address roles;
- publishes only local-review organization/admin-ZIP candidates, never sites; and
- does not change any release or production pointer.

If Oklahoma rights or weekly semantics fail, pursue Georgia's sample/license package next. Treat Nebraska as a post-migration candidate unless SOS supplies both current and replacement schemas with a stable identifier crosswalk and dual-run plan.

## Repository effect

This report is the only repository artifact created by Queue 3. It does not modify connector code, datasets, source policies, manifests, `current.json`, release directories, or production pointers.
