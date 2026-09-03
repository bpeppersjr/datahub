# State business-source revalidation — 2026-09-03

## Outcome

Five high-value unresolved state business-entity sources were revalidated against current official material. Four non-overlapping state workstreams ran concurrently in the first wave—Vermont, Nebraska, Georgia, and Oklahoma—and California ran in a second parallel wave as soon as a worker became available. No account was created, terms accepted, purchase made, record requested or enumerated, portal automated, access control bypassed, complete file downloaded, source release published, or production pointer changed.

All five remain **HOLD**. None currently has enough public technical, rights, automation, privacy, and change-contract evidence to justify a row-bearing acquisition or offline-fixture connector. The exact machine-checkable decision record is [`config/state-business-source-revalidation-2026-09-03.json`](../config/state-business-source-revalidation-2026-09-03.json).

| Rank | State | Official candidate | Current decision | Principal unresolved boundary |
| ---: | :---: | --- | --- | --- |
| 1 | CA | bizfile Business Entity Master Unload and Weekly Data | **HOLD** | authenticated purchase, missing schema/change contract, conflicting use/automation language |
| 2 | GA | Georgia Corporations List | **HOLD** | paid secure FTP, no schema or safe sample, person-bearing content, no downstream-use grant |
| 3 | OK | Business Entities Bulk Orders | **HOLD** | current source layout is documented, but rights, automation, stable key, address role, and weekly semantics are not |
| 4 | NE | Corporate Records Batch | **HOLD** | unpublished schema/rights plus an unresolved before-end-of-2026 platform migration |
| 5 | VT | Business Services bulk download | **HOLD** | application-shell route, unknown current price/access, no schema/feed/rights contract |

The ranking uses `nonemployer establishments - reported source-preserving profiles` only as a prioritization diagnostic. These quantities describe different universes and do not measure missing businesses or completeness.

## California

The [Business Entity Records page](https://www.sos.ca.gov/administration/public-records-act-requests/business-entity-records) still routes bulk users to authenticated bizfile BE & UCC Bulk Orders. The [portal manual](https://bpd.cdn.sos.ca.gov/ucc/ucc-online-help.pdf) lists a Business Entity Master Unload at $100 and weekly data at no charge. The [account guide](https://bpd.cdn.sos.ca.gov/bizfile/bizfile-online-account-setup.pdf) documents the required account, and use requires accepting the [bizfile terms](https://www.sos.ca.gov/business-programs/bizfile/privacy-warning-terms-and-conditions-use).

No public BE file inventory, schema, sample, source count, checksum, or weekly delta/tombstone/replay contract was found. The December 2025 [Entity Number update](https://www.sos.ca.gov/business-programs/bizfile?form=MG0AV3) supplies useful opaque-ID continuity evidence, but it does not establish row uniqueness inside the bulk product. The terms say filing data have no use restriction while separately restricting robots, automatic acquisition, and commercial exploitation; product-specific retention and commercial derived-publication rights therefore need written clarification. Entity/executive and mailing addresses are administrative evidence, not operating sites. Agents, people, contacts, payment/requestor data, and residential addresses remain excluded.

**Next gate:** obtain a person-free schema/sample and written product contract from California SOS. Do not create an account, accept terms, order, automate bizfile, or implement acquisition before the contract clears.

## Georgia

Georgia SOS links its official [Corporations page](https://sos.ga.gov/index.php/corporations) to the SOS-operated store. The store lists a [$500 one-time extract](https://georgiasecretaryofstate.net/collections/corporations-list/products/idm) and a [$5,000 annual weekly secure-FTP subscription](https://georgiasecretaryofstate.net/collections/corporations-list/products/annual-subscription-for-a-weekly-extract-of-the-georgia-corporations-list). The current [active-entities report](https://sos.ga.gov/page/georgia-corporations-active-entities-report), dated 2026-09-02, reports 1,617,352 active entities but is not a control total for the paid active-and-inactive extract.

No authoritative format, schema, sample, exact population, file counts, bytes, checksums, full-versus-delta semantics, or stable Control Number guarantee is published. The product expressly includes officers, registered agents, addresses, and filing history. The store [terms](https://georgiasecretaryofstate.net/policies/terms-of-service) do not grant retained, person-free derived publication or redistribution. Principal office is administrative correspondence evidence, not a physical operating site.

**Next gate:** request a redacted schema-only sample and written technical, FTP-automation, privacy, retention, and derived-use terms. Do not purchase or build row acquisition first.

## Oklahoma

The live official [Business Entities Bulk Orders page](https://www.sos.ok.gov/corp/bulkorder/bulkDefault.aspx) still advertises a complete monthly tilde-delimited database with 19 relational tables for $500 and same-layout weekly filing packages for $150. The [public layout](https://www.sos.ok.gov/corp/bulkorder/BulkOrderFileLayoutLegalEntity.htm) documents entity, address, status, name, filing, audit, and trailer records. The page also links a sample whose HTTP metadata still reports a 2012 modification date.

The current pages do not establish Filing Number lifecycle, authoritative legal-current status mapping, entity Address ID role, weekly upsert/event/delete/correction behavior, automated retrieval, current counts, bytes, timestamps, or checksums. The [disclaimer](https://www.sos.ok.gov/feedback/disclaimer.aspx) says filing data are public and may be shared, but it is not the product-specific scheduled-acquisition, retention, commercial derivative, and redistribution grant Datahub requires. No sample row was downloaded or persisted.

**Next gate:** obtain the current source and rights contract in writing. Do not purchase or implement acquisition first.

## Nebraska

The official [subscriber service](https://www.nebraska.gov/subscriber/) and [batch agreement](https://www.nebraska.gov/subscriber/pdf/corp-data-bulk-contract.pdf) still describe a complete, fixed-record-length, multi-file FTP set at $300 weekly, $500 twice monthly, or $800 monthly, plus the subscriber fee and six-month minimum. The agreement does not publish the file schema, sample, key guarantees, status/address vocabulary, counts, checksums, person-field inventory, or downstream-use rights. General [Nebraska.gov policy](https://www.nebraska.gov/policies/) restricts automation, commercial use, distribution, and derivatives absent permission.

The [replacement filing-system FAQ](https://sos.nebraska.gov/new-online-business-filing-system) still anticipates a launch before the end of 2026 but publishes no firm cutover date, new bulk path, layout, price, legacy-to-new identifier crosswalk, final legacy snapshot, first replacement snapshot, or dual-run plan.

**Next gate:** obtain one signed legacy-and-replacement technical and rights package. Do not subscribe, acquire, or implement before both sides of the migration are documented.

## Vermont

Official [2025 testimony](https://legislature.vermont.gov/Documents/2026/Workgroups/House%20Energy%20and%20Digital/Data/W~Lauren%20Hibbert~Transparency%20and%20Accessibility%20of%20SOS%20Data~4-29-2025.pdf) described a weekly full Business Services dataset. A [2026 presentation](https://legislature.vermont.gov/Documents/2026/Workgroups/Senate%20Institutions/State%20Agencies/Secretary%20of%20State/W~Sarah%20Copeland%20Hanzas~Senate%20Institutions%20Presentation%20-%20Secretary%20Of%20State%20Data~2-17-2026.pdf) separately describes the system as containing current and historical registration information, confirms that bulk download exists, and says feeds are still in development; it does not define the bulk file as containing both current and historical records. The current [bulk-download route](https://bizfilings.vermont.gov/bulk-download) exposes an application shell rather than a documented immutable data asset or metadata contract.

The prior no-cost statement is not treated as current because [3 V.S.A. §118(c)](https://legislature.vermont.gov/statutes/section/03/005/00118) now authorizes one-time or recurring data sales. No current price, schema, sample, Record Number guarantee, status/address codebook, counts, checksums, automation permission, change contract, or downstream-use license is published.

**Next gate:** obtain a current person-free source and rights contract from Vermont SOS. Do not create an account or implement a connector first.

## Management visibility and boundaries

The coverage store now validates this revalidation file before exposing it. The States view shows the latest source-gate decision and candidate beside each matching state, supports searching by candidate/decision, and reports the number of revalidated, held, and bounded-connector jurisdictions. A pinned coverage-release check prevents old diagnostic counts from being silently presented as current after a future coverage cutover.

This work changes no business record, source release, registry release, coverage release, Heatmap Builder admission, or production pointer. Business records may carry only address-associated latitude and longitude. U.S., state, county, and Census ZCTA polygons remain in governed geography layers, and ZIP5/ZIP+4 remain separate.
