# State Business Source Discovery — Queue 2

Date: 2026-09-03

Scope: read-only discovery of official state business-entity sources for the national active-business/ZIP objective

Excluded because already reviewed: NC, HI, IL, MN, WI, MA, NJ, UT, MD, AZ
Excluded because broad organization connectors already exist: CT, DE, CO, OR, IA, NY, FL, PA

## Executive decision

This queue found no source ready for autonomous production ingestion without an additional rights, contract, or schema gate.

- **Best next low-cost/high-impact preflight: California.** The Secretary of State offers a $100 Business Entity master unload and free weekly data through an authenticated portal. Authorize only a bounded operator-supplied evaluation after the Secretary confirms the intended commercial/derived use and retention rights. Do not automate the portal.
- **Best recurring technical product: Kentucky.** Its authorized subscriber service has a monthly full file plus daily/weekly change files and a documented source key, but commercial access costs $2,000/month plus $75/year and the declared-purpose contract must expressly cover Datahub retention, normalization, derived publication, and customer access.
- **Other paid conditional candidates:** Indiana has a monthly full plus monthly deltas but starts at $8,000 and lacks a public schema and reuse contract. Tennessee and Virginia may have operator-supplied full extracts, but current product specifications and rights are not public. Ohio's paid file lacks proof that it contains a usable principal/business address.
- **HOLD:** Mississippi, Washington, Louisiana, and Michigan do not presently evidence a complete, recurring, automation-authorized, licensed statewide snapshot route.

All addresses discussed below are registration, executive-office, records-office, principal-office, mailing, or other administrative evidence unless the source explicitly proves an operating establishment. Registry `Active`/`Good Standing` is legal or filing status, not proof the business is open or operating. Registered-agent, officer, director, member, manager, governor, partner, incorporator, filer, and other natural-person data and their addresses are out of scope.

## Exact ten-candidate queue

The ranking balances uncovered named-business volume, the current coverage gap, official-source fitness, recurring-update potential, and the likelihood of obtaining organization-level ZIP evidence without using person/agent data.

| Rank | State | Official candidate | Decision | Primary reason |
| ---: | :---: | --- | --- | --- |
| 1 | CA | SOS bizfile Business Entity master + weekly data | **HOLD automated; conditional operator GO** | Large statewide gap and low product cost, but portal-only acquisition, no public bulk schema/delta contract, and ambiguous commercial-use terms |
| 2 | OH | SOS Business Filing Data / Business Reports | **HOLD** | Paid FTP product lacks public schema/current-master proof/status map/address roles/recurring contract terms; free reports are filing events |
| 3 | MS | SOS Mississippi Business Reports | **HOLD recurring; conditional manual evaluation** | Useful documented fields, but 300,000-row export cap and no recurring/full-export authorization or reuse license |
| 4 | TN | SOS Business Entity Database download | **HOLD automated; conditional operator GO** | Official full database is advertised, but current price, cadence, schema, status codebook, and rights are unpublished |
| 5 | KY | SOS Bulk Data Service | **CONDITIONAL GO to procurement/preflight** | Authorized monthly full + daily/weekly change service; strong technical fit, but expensive and declared-purpose contract gated |
| 6 | WA | SOS CCFS Advanced Search CSV | **HOLD** | Interactive reCAPTCHA-protected report export; broad searches can overload, and no statewide completeness/automation contract exists |
| 7 | LA | SOS Commercial API + custom queries | **HOLD statewide** | API is licensed for point search/lookup but cannot enumerate a snapshot; custom lists lack a full-active product/spec/license |
| 8 | IN | INBiz Business Entity Bulk Data | **HOLD purchase; conditional procurement** | Official monthly full+deltas exist, but cost, USB delivery, unpublished schema/delta semantics, and missing derived-use terms block purchase |
| 9 | MI | LARA MiBusiness Registry / FOIA | **HOLD** | No published Corporations bulk/API; portal automation/commercial reuse is prohibited absent permission; FOIA may not require a new compilation |
| 10 | VA | SCC Clerk/CIS data purchase | **HOLD autonomous; conditional written confirmation** | Historical RFP proves a weekly purchaser feed existed, but no current public product/spec/price/license is published |

## Coverage-gap diagnostics

Source: verified local review release `national-business-coverage-views-20260902-115337634Z-ba689784`. `Reported profiles` are source-preserving provisional location profiles and are not deduplicated businesses. `Coordinate profiles` are the subset with assigned coordinates. The Census baseline is 2023 nonemployer establishments, a different universe and observation period. Consequently, `profiles / baseline` is a prioritization diagnostic only, not a completeness estimate. A negative or positive difference would not prove missing or excess businesses.

| Rank | State | Reported profiles | Coordinate profiles | 2023 nonemployer baseline | Baseline minus profiles | Diagnostic ratio |
| ---: | :---: | ---: | ---: | ---: | ---: | ---: |
| 1 | CA | 1,762,569 | 555,130 | 3,537,469 | 1,774,900 | 49.8% |
| 2 | OH | 163,604 | 12,926 | 909,227 | 745,623 | 18.0% |
| 3 | MS | 43,766 | 4,097 | 253,350 | 209,584 | 17.3% |
| 4 | TN | 91,467 | 8,676 | 649,168 | 557,701 | 14.1% |
| 5 | KY | 90,006 | 6,086 | 335,592 | 245,586 | 26.8% |
| 6 | WA | 123,610 | 6,645 | 545,903 | 422,293 | 22.6% |
| 7 | LA | 91,456 | 5,508 | 418,516 | 327,060 | 21.9% |
| 8 | IN | 112,961 | 7,347 | 486,290 | 373,329 | 23.2% |
| 9 | MI | 191,395 | 11,964 | 815,013 | 623,618 | 23.5% |
| 10 | VA | 116,537 | 8,316 | 740,321 | 623,784 | 15.7% |

California's count includes 623,504 profiles from the City of Los Angeles Office of Finance source; that is city tax-registration coverage, not statewide SOS coverage. Washington currently has a contractor-license layer, not a broad organization registry. The other listed states are likewise represented mainly by national or scoped license/facility sources rather than a broad state entity master.

## Parallel dispatch record

Two state workers ran concurrently, the maximum available after accounting for the root task and this manager. The ten-item queue was executed without overlapping state assignments:

1. Wave 1: California and Ohio
2. Wave 2: Mississippi and Tennessee
3. Wave 3: Kentucky and Washington
4. Wave 4: Louisiana and Indiana
5. Wave 5: Michigan and Virginia

Research was limited to official/primary sources. No accounts were created, terms accepted, orders placed, paid APIs called, bulk files downloaded, UI controls bypassed, or production pointers changed.

## Evidence and source decisions

### 1. California — conditional operator-supplied evaluation

The [California SOS Business Entity Records page](https://www.sos.ca.gov/administration/public-records-act-requests/business-entity-records) routes bulk users to bizfile BE & UCC Bulk Orders. The official [bulk-order help manual](https://bpd.cdn.sos.ca.gov/ucc/ucc-online-help.pdf) lists `BE Master Unload of Data` at $100 and `BE Weekly Data` at no charge. Acquisition requires the authenticated [bizfile portal](https://bizfileonline.sos.ca.gov/). The public materials do not publish a BE file inventory, data dictionary, row/byte count, weekly upsert/delete semantics, checksum, or supported API.

The [bizfile terms](https://www.sos.ca.gov/business-programs/bizfile/privacy-warning-terms-and-conditions-use) say filing data is public but also prohibit robots/page scraping and contain language that creates ambiguity for commercial exploitation of site material. Treat manual portal acquisition as the only documented path until SOS gives written machine-transport permission. Capture the actual checkout terms before purchase.

Candidate identity is the exact SOS entity number. The SOS [2025 identifier notice](https://www.sos.ca.gov/business-programs/bizfile?panel=config) says new corporations, LLCs, and LPs receive 12-character IDs beginning with `B`; legacy numbers remain. Preserve strings and leading zeros and do not infer entity type from format. The [official status definitions](https://www.sos.ca.gov/business-programs/business-entities/cbs-field-status-definitions) support a registry-active mapping if the bulk sample contains those fields. Entity/executive/principal/mailing addresses are organization/admin-office evidence only. Exclude agent and person data.

**Gate:** written commercial/derived-use and retention approval; authorized operator account/order; master and weekly samples; schema and change contract; count/size/checksum; B-ID tests; principal-address coverage; zero-person-field validation.

### 2. Ohio — hold

The [free Ohio Business Reports](https://www.ohiosos.gov/business/business-reports) are monthly new-entity and subsequent-filing event files, not a complete current master. [Form 200](https://www.ohiosos.gov/assets/200.pdf), linked from the [Business Filing Forms page](https://www.ohiosos.gov/business/business-filing-forms), sells one-time Business Filing Data for $62.50 via FTP; weekly/monthly delivery requires a separate contract.

Public materials do not provide the paid file layout, current-vs-ledger scope, full/delta behavior, status map, identifier guarantees, address roles, automation terms, retention, or redistribution rights. Free reports expose statutory-agent, filer, and incorporator fields. Current Ohio formation forms show that many records do not supply a full principal business address; statutory-agent addresses may be residences. Those person/agent fields and addresses must never become business sites.

**Gate:** contracted sample/spec proving a current entity master, permanent entity key, usable non-agent principal/business ZIP, active/dead semantics, recurring delivery, and intended-use rights.

### 3. Mississippi — hold recurring

The official [Mississippi Business Reports](https://corp.sos.ms.gov/corpreporting/Corp/BusinessSearch3) and [help document](https://corp.sos.ms.gov/corpreporting/Corp/ViewHelpDocument) document Excel export fields including Business ID, name, profile/domicile type, current status, up to three NAICS codes, principal address/ZIP, county, and formation date. Business ID is described as a unique six- or seven-digit identifier. The report can filter `Good Standing`, but that is legal filing status, not operating activity.

The UI caps exports at 300,000 rows and directs users to contact Business Services for a full export. Do not evade the cap with filter batching. The [SOS public-records policy](https://www.sos.ms.gov/ACCode/00000170c.pdf) permits written/custom electronic requests at actual cost but does not publish a recurring corporate extract price or service. The [SOS disclaimer](https://www.sos.ms.gov/disclaimer) is not an affirmative commercial/redistribution license.

Principal address can support an organization-level ZIP only, not a site. The documented report columns do not include agent/officer fields, but schema-drift and PII scans remain mandatory.

**Gate:** written recurring/full-export authorization, cost/channel, completeness and cap signaling, cadence/as-of, exhaustive status dictionary, ID permanence, exact workbook schema, and commercial/derived-use/retention terms.

### 4. Tennessee — conditional operator-supplied evaluation

The [Tennessee SOS Business Services hub](https://sos.tn.gov/business-services) advertises purchase and download of the Business Entity Database through [TNCaB](https://tncab.tnsos.gov/portal). Current public pages do not expose price, cadence, archive inventory, schema, status vocabulary, full/delta semantics, count/size, API, or automation authorization. An official [Q4 2024 business report](https://sos-prod.tnsosgovfiles.com/s3fs-public/document/2024%20Q4%20Quarterly%20Business%20and%20Economic%20Report.pdf?VersionId=igKxbwwpJ928hASJ7EeQRAiT06hTqAp8) reports 406,667 active entities, useful only as a historical magnitude check.

The SOS control number is the candidate entity key and must be stored as an exact string. Registry `Active`/good standing is not operating status. Filing forms distinguish principal, mailing, and registered-agent addresses. Principal office is organization/admin evidence and can be outside Tennessee; registered-agent and all natural-person data are excluded.

**Gate:** authorized account/manual order, current fee and terms snapshot, schema/status codebook, full manifest, control-number invariants, completeness/count, provider as-of, cadence, and commercial/derived-use/retention rights.

### 5. Kentucky — conditional go to procurement/preflight

The official [Kentucky SOS Bulk Data Service](https://www.sos.ky.gov/bus/Pages/Bulk-Data-Service.aspx) offers `All Companies` monthly, `New Companies` daily/weekly, and `Company Changes` daily as tab-delimited subscriber files. Published documentation identifies `ID` as the join key and links an official schema workbook. The organization-only connector must exclude every officer, agent, governor, and other person file.

The service costs $2,000/month for commercial Business Records plus a $75/year [Kentucky.gov subscriber account](https://www.kentucky.gov/register/pages/default.aspx). The [Subscriber Agreement](https://www.kentucky.gov/SiteCollectionDocuments/Subscription%20Services/KYGOVSubscriberAgreement.pdf) does not itself expressly grant raw redistribution, derived-product publication, or a retention period. [KRS 61.874](https://apps.legislature.ky.gov/law/statutes/statute.aspx?id=23061) makes the stated commercial purpose and contract material; use the commercial tier and describe the intended Datahub workflow precisely.

Kentucky distinguishes entity activity and good standing, so raw status and standing must remain separate until the full codebook is reviewed. Principal office is administrative/executive-office evidence, may be outside Kentucky, and is not an establishment.

**Gate:** approved commercial-purpose language; exact schema/sample; ID permanence; status/standing map; daily change and monthly full cutoff/replay/tombstone semantics; filenames/checksums/retention window; current rows/bytes; derived-publication and retention rights.

### 6. Washington — hold

The official [CCFS Tools & Resources page](https://www.sos.wa.gov/corporations-charities/frequently-asked-questions-faqs/corporations-charities-filing-system-tools-resources) documents an [Advanced Corporation Search](https://ccfs.sos.wa.gov/#/AdvancedSearch) with Business Status/type/date filters and CSV export. The same guidance warns that overly broad queries can overload the database, time out, or error. CCFS uses human-verification reCAPTCHA. This is an interactive report feature, not a documented bulk feed or automation surface.

No numeric cap/truncation behavior, statewide snapshot count, exact CSV schema, as-of time, cadence, API/rate contract, checksum, or recurring automation permission is published. UBI is the candidate official identifier. The principal office is the records office, can be outside Washington, and is administrative evidence rather than an operating site. Exclude registered agents, governors, officers, and all people.

The [SOS public-records page](https://www.sos.wa.gov/about-office/public-records-request) warns that requests for all or substantially all records are generally invalid, and [chapter 434-12A WAC](https://app.leg.wa.gov/WAC/default.aspx?cite=434-12A&full=true) says SOS need not create a new electronic-database production.

**Gate:** an existing official organization-only full snapshot/API or written authorization for complete recurring extraction, documented CSV/schema/cap/completeness/cadence, UBI lifecycle, ZIP coverage, and commercial derived-use/retention terms. Do not filter-batch or automate around reCAPTCHA.

### 7. Louisiana — hold statewide

The official [Commercial API guide](https://static.sos.la.gov/COAPI/Commercial_API_Guide.pdf) documents REST/JSON named search and per-entity lookup. Live access is $500/year, every request carries a token and account email, and the service allows 18 calls per user per minute. Search caps at 1,000 records and has no paging, list-all, status filter, snapshot, delta, or changed-since method. It is valid for bounded point validation, not statewide acquisition. Do not attempt prefix enumeration or harvest the human registry.

The official [custom-query service](https://www.sos.la.gov/business-services/how-to-order) can produce broad lists for $25 for the first 40 records plus $0.01 each additional, but it does not promise an all-active Charter extract, file/schema, as-of time, cadence, count, or reuse license. Candidate stable identity is the exact nine-character alphanumeric charter number. Status, substatus, and annual-report standing must remain distinct. The API's role-labelled address array lacks a public AddressType codebook.

Louisiana law confirms registered office need not be a place of business: [R.S. 12:1-501](https://www.legis.la.gov/legis/Law.aspx?d=920229). Exclude agents/officers/members/managers and their addresses; any surviving principal/mailing/registered address is provisional organization/admin geography only.

**Gate:** written quote and confirmation for all active Charter rows; full/delta/cadence/as-of/control count; schema, status and address codebooks; secure delivery; commercial/derived-use/retention/attribution terms. Keep API use to licensed point validation.

### 8. Indiana — conditional procurement candidate, hold purchase

The official [INBiz Bulk Data Services page](https://inbiz.in.gov/inbiz/bulkdataservices/index) offers a one-time full file generated on the first of each month and a full-plus-monthly-update product. The current [SOS regulatory analysis](https://www.in.gov/sos/business/files/Regulatory-Analysis-Business-Entity-Bulk-Data-Fees-LSA-25-155-OMB-2025-01R.pdf) and [fee rule](https://www.in.gov/sos/business/files/20250326-IR-075250155FNA.pdf) set the one-time full at $8,000; full plus update access at $9,500; and each selected monthly update at $500. All twelve updates make the first-year cost $15,500. An INBiz account is required, and the initial full is delivered on USB because of size.

Public wording conflicts between all registered businesses and all active businesses. No public bulk dictionary/sample, table inventory, identifier lifecycle, status enum, delta/tombstone/replay semantics, row/byte count, checksum, machine-download authorization, or derived-use/retention/redistribution license was found. Preserve Business ID as an opaque candidate key pending proof.

Principal office is administrative evidence. Indiana's [2026 filing changes](https://www.in.gov/sos/business/hb-1593-and-hb-1666-filing-process-changes/) allow remote-only businesses to withhold a residential public address and permit disclosed commercial-mail-receiving-agency addresses, limiting ZIP/site fitness. Exclude all agents/governors/people and their data.

**Gate:** resolve full-vs-active scope, sample/schema, Business-ID lifecycle, status map, delta contract, rows/bytes/checksums/delivery custody, recurring automation, budget, and commercial derived-publication/retention rights before purchase.

### 9. Michigan — hold

The [LARA data-set catalog](https://www.michigan.gov/lara/about/reports-data-sets) lists regulated-license data but no Corporations registry bulk file/API. The new [MiBusiness Registry portal](https://www.michigan.gov/lara/news-releases/2025/06/30/michigan-launches-new-mibusiness-registry-portal-to-improve-business-filing-services) is a human search/view surface, and LARA's [migration page](https://www.michigan.gov/lara/bureau-list/cscl/corps/mibrp/new-system) says the legacy COFS SearchApi URL is retired. [Michigan.gov terms](https://www.michigan.gov/som/footer/policies) prohibit automated access and commercial/resale use of website-derived data absent separate permission.

The [LARA FOIA route](https://www.michigan.gov/lara/foia-request) is a possible operator-mediated inquiry, but Michigan FOIA generally does not require creation of a new compilation. No standard full extract, schema, cadence, price, or reuse agreement is public. An official [2025-10-10 entity count](https://www.michigan.gov/lara/bureau-list/cscl/corps/other/total-business-entities-as-of-october-10-2025) yields a historical live-looking benchmark of about 1,178,818 across good-standing/not-cancelled/registered buckets; it is not a current snapshot or universal active definition.

Michigan's registered office is the resident agent's physical location and need not be the entity's place of business. Suppress it from the publish layer unless LARA supplies an entity-controlled address role. Exclude resident agents and all people.

**Gate:** LARA confirmation that an existing machine-readable full/delta extract exists; schema and entity-ID invariant; entity-type-specific status/annual-report codebook; permitted org-address roles; as-of/control count/cadence; cost/delivery; and written automation/commercial/derived-use/retention rights.

### 10. Virginia — conditional written product confirmation

Current public access is the human-oriented [Clerk's Information System](https://cis.scc.virginia.gov/); current SCC pages do not publish a bulk catalog, API, order form, price, schema, or subscription. A historical official [2012 SCC replacement-system RFP](https://appspre.scc.virginia.gov/procure/rfp_scc12020_scc.pdf) says a limited number of purchasers received business-entity data weekly by SSL FTP and required the replacement system to stage public-data files. This proves a legacy capability, not a currently purchasable product.

[Va. Code § 12.1-21.2](https://law.lis.virginia.gov/vacode/title12.1/chapter4/section12.1-21.2/) authorizes reasonable fees for database/structured-data records, while the [SCC web policy](https://www.scc.virginia.gov/accessibility-and-web-policy/) does not grant automation or commercial redistribution. The Clerk must confirm product availability and rights in writing.

Current Entity ID must be preserved as an opaque string; the old RFP's legacy identifier format is not sufficient. Use exact raw `Active` plus reason/status date after a current codebook is supplied. The [SCC registered/principal-office FAQ](https://www.scc.virginia.gov/businesses/business-faqs/registered-agents/) defines principal office as the physical executive-office location; that is still administrative/headquarters evidence, not proof of an operating establishment. Registered office is the agent's service address and is excluded. The [2025 Clerk statistical summary](https://www.scc.virginia.gov/media/sccvirginiagov-home/about-the-scc/annual-reports/2025clk.pdf) reports about 874,748 active entities across entity types, a historical control only.

**Gate:** current weekly/full/delta product confirmation, statewide/current scope, quote and delivery, schema/codebooks/current ID rules, status selection, as-of/control totals, principal-address completeness, and commercial automation/retention/derived-publication/attribution terms.

## Cross-source implementation controls

Any connector that passes preflight must follow the repository lifecycle:

1. **Preflight:** record source authority, exact product, account/fee, intended use, binding terms, retention, redistribution, and people-field exclusions.
2. **Plan:** define full/delta cadence, cutoff windows, stable identifier, legal-active predicate, address roles, completeness controls, replay/idempotency, and rollback.
3. **Acquire:** use only the provider-supported channel; store the exact source URL/product, receipt, provider as-of, filename, bytes, and checksum in a run-scoped quarantine.
4. **Validate:** inventory files and schema; test identifier uniqueness/non-reuse; status/codebook coverage; counts; full/delta continuity; ZIP/address fill; unexpected PII/person fields; and truncation.
5. **Normalize:** retain raw status and organization ID; map only documented legal activity; label principal/executive/records/mailing addresses as administrative; never synthesize sites.
6. **Reconcile:** use the source identifier, never name/address alone; rebuild from periodic full snapshots when deletion/tombstone semantics are not proven.
7. **Quality gate:** fail closed on missing full snapshots, count drift, unknown statuses, duplicate IDs, schema changes, gap/overlap in deltas, unexpected people/agent data, or degraded ZIP coverage.
8. **Publish:** organization-only derived layer with source/as-of/terms provenance, explicit `not an operating-site` semantics, and no raw redistribution unless expressly licensed.
9. **Finalize:** write run manifest, validation/reconciliation metrics, terms-aligned retention/deletion decision, and the next expected source release marker.

## Recommended next authorized action

Authorize a **California rights-and-sample preflight**, not a production connector or cutover:

1. Ask California SOS to confirm in writing that purchased BE master and weekly files may be retained, normalized, reconciled, and used in the intended derived/commercial Datahub output, and whether a human operator may download each release on a scheduled cadence.
2. If satisfactory, authorize one operator-managed bizfile account and a maximum $100 master order; capture checkout terms and receipt. Obtain the master plus one weekly sample without automating the portal.
3. Assign an offline `ca-business-registry` evaluation connector to inventory files, prove exact identifier/status/address roles, validate B-prefixed identifiers, measure active organization and principal/admin ZIP coverage, strip every person/agent field, and produce a local-review-only candidate.
4. Do not publish or change `current.json`/release pointers until policy, schema, completeness, and quality gates pass.

If California cannot grant the necessary use rights, the fallback action is Kentucky commercial-purpose contract preflight. Do not subscribe until the declared purpose explicitly covers Datahub's retention, derived publication, customer access, and no-person organization layer.

## Repository effect

This report is the only repository artifact created by this discovery queue. It does not modify connector code, datasets, source policies, release manifests, `current.json`, or any production pointer.
