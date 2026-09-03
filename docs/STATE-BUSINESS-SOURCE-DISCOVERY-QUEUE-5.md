# State business-source discovery — Queue 5

Observed 2026-09-03 against production coverage release `national-business-coverage-views-20260902-115337634Z-ba689784`.

Queue 5 examined the next four previously unreviewed state equivalents ranked by the same diagnostic gap used for earlier discovery. Ohio, North Carolina, New Jersey, and Virginia ran in four concurrent, non-overlapping workstreams. Only official primary-source pages, laws, regulations, manuals, forms, and product descriptions were inspected.

No account was created, no terms were accepted, no purchase or record request was made, no interactive portal was enumerated or automated, no complete bulk file was downloaded, and no source, registry, coverage, Heatmap Builder, or production pointer was changed.

The diagnostic gap compares current source-preserving reported-address profiles with the annual Census Nonemployer establishment baseline. It ranks research only. It is not a completeness percentage, does not identify missing businesses, and does not make the two universes equivalent.

| Rank | State | Strongest official candidate | Current published access | Diagnostic profile / Nonemployer ratio | Decision |
| ---: | --- | --- | --- | ---: | --- |
| 1 | Ohio | Business Filing Data | $62.50 one-time FTP; recurring contract unpublished | 18.0% | `HOLD` |
| 2 | North Carolina | Business Registration Master Files — Core | Weekly FTP; $750 setup + $2,000/state fiscal year | 19.1% | `HOLD` |
| 3 | New Jersey | Bulk Access Status Reports, item 01000000 | $0.0185/record; written quote and payment | 17.7% | `HOLD` |
| 4 | Virginia | Requested SCC business-entity structured-data extract | Discretionary request; reasonable fee may be quoted | 15.7% | `HOLD` |

## Ohio

Form 200 documents a paid one-time FTP download and directs recurring customers to obtain a separate contract. The product has no published current schema, machine sample, exact source population, status/address contract, size, checksum, or full-versus-delta semantics. Free monthly reports describe filing events rather than a current entity master and contain agent, filer, incorporator, and address data that Datahub must exclude. The candidate Charter or Entity number lacks a product-specific non-reuse and lifecycle guarantee. Public-record access does not establish the paid product's automation, retention, commercial derived-publication, or redistribution rights.

Next gate: request a no-order, person-free schema sample and written answers covering source scope, active selection, identifier lifecycle, status and address semantics, recurring changes and tombstones, counts and hashes, FTP automation, current recurring price, retention, and derived-use rights. Do not submit Form 200, pay, obtain FTP access, or implement a connector first.

## North Carolina

The official subscription materials describe a weekly FTP-delivered relational CSV Core snapshot and call it a complete point-in-time set. The published layout is dated 2012 with revisions only through 2015, however, so it cannot pin the current contract. `PItemID` is the best candidate key and `CorpNum` is expressly non-unique, but persistence through conversions, mergers, reinstatements, and replacements is undocumented. Several registry-active statuses exist and none proves physical operation. Office-address roles, replacement atomicity, corrections, deletions, tombstones, replay, checksums, unattended FTP authorization, and commercial reuse remain unresolved.

Next gate: obtain the current unsigned terms, manifest, schema-only sample, codebooks, identifier guarantee, address roles, cadence/change contract, counts, sizes, checksums, unattended-retrieval approval, and written retention and derived-publication rights before subscribing or implementing.

## New Jersey

The current fee schedule and N.J.A.C. 17:34 support a written paid bulk request and an ongoing arrangement for additions and modifications. They do not publish a bulk machine layout, complete status vocabulary, active-only selector, current count or size, cadence, watermark, deletion/tombstone/replay rules, checksums, or unattended FTP contract. The official status-report example is not the paid bulk schema. A ten-digit Business Entity ID is only a candidate until the product owner confirms its presence, immutability, non-reuse, and entity-type coverage. The portal's general copying statement does not clearly license paid output for indefinite commercial derived publication or redistribution.

Next gate: request a no-purchase machine schema or sample, person-free projection, codebooks, active definition, identifier lifecycle, count/size quote, snapshot/change/tombstone contract, checksums, FTP automation terms, and explicit retention and derived-use rights before authorizing payment or implementation.

## Virginia

Virginia law permits the State Corporation Commission to furnish structured database records and charge reasonable fees, but the SCC publishes no recurring business-entity product or current extract contract. A system procurement document describes a candidate SCC-ID and principal-office data while also contemplating identifier reassignment during migration; it is not a current schema. The Clerk's Information System is an interactive record search, not a documented public bulk interface. The SCC web policy limits commercial use beyond intended public availability and grants only fair use of website contents, leaving extract-specific rights unresolved.

Next gate: ask the Clerk for a no-record written response on whether a recurring person-free extract exists and, if so, its schema-only sample, exact scope/count, SCC-ID lifecycle, status/address dictionaries, change/tombstone rules, delivery automation, price, checksums, retention, attribution, derived-publication, and redistribution terms. Do not accept portal terms, request records, pay, enumerate CIS, or implement first.

## Shared retention boundary

All four candidates expose or may expose natural-person and service-address data. Any future selected projection must exclude registered agents and service-of-process fields; officers, directors, members, managers, partners, incorporators, organizers, filers, signers, and their addresses; direct contacts and signatures; tax, payment, financial, and government identifiers; filing images, documents, and free text. An organization address remains an administrative assertion unless a separate source proves it is a physical operating site.

Business records may carry governed address latitude and longitude only. Business polygons remain prohibited. ZIP5 and ZIP+4 remain separate fields, and ZIP+4 is never polygon geometry.

The machine-readable decision is [`config/state-business-source-discovery-queue-5.json`](../config/state-business-source-discovery-queue-5.json).
