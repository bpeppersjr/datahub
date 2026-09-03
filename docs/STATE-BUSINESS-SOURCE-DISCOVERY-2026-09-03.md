# State business-source discovery — 2026-09-03

## Scope and method

The state data-gathering manager completed a ten-candidate official-source queue in five parallel two-worker waves. Discovery was read-only: no paid request, bulk download, portal automation, dataset publication, or production-pointer change occurred.

The diagnostic column compares current registry reported-address profiles with 2023 Census nonemployer establishments. It ranks gaps; it is not a completeness percentage because the two measures describe different universes. Registration and administrative addresses must remain distinct from operating physical sites under the [business registry contract](BUSINESS-REGISTRY-CONTRACT.md).

Current broad organization layers cover Connecticut, Delaware, Colorado, Oregon, Iowa, New York, Florida, and Pennsylvania, plus Washington contractor organizations. Alaska, California, and Texas are license/permit-scoped. The verified coverage release remains partial: 26 source views, 8,011,827 source-preserving location profiles, and 995,268 coordinate-assigned profiles.

## Decision matrix

| Rank | Candidate | Diagnostic | Decision and gate |
|---:|---|---:|---|
| 1 | North Carolina SOS weekly Core | 175,876 / 920,236 | **Hold.** Strong relational CSV with unique `PItemID` and documented `Current/Active`, but authenticated FTP costs $750 setup plus $2,000 per state fiscal year. The current contract, redistribution, retention, endpoint security, checksums, and schema/sample are not public. Free reports prohibit scripting. |
| 2 | Hawaii Business Registration `9k54-ztb8` | 18,753 / 120,656 | **Hold.** Anonymous Socrata access is technically simple, but the roughly 442,099-row Honolulu mirror was last updated in June 2022, has no declared dataset license or DCCA provenance, and does not document `Active` semantics. |
| 3 | Illinois SOS corporation and LLC bulk files | 230,937 / 1,120,413 | **Conditional GO for operator-supplied files.** Daily complete fixed-width ZIP sets have checked eight-digit entity identifiers, documented statuses, and a strong statutory open-data basis. Unattended retrieval needs written confirmation because the landing page also prohibits automated queries. |
| 4 | Minnesota Active Business/Bulk Data | 149,694 / 453,181 | **Conditional GO for licensed manual ingest.** Weekly active ZIP/CSV costs $30; commercial full bulk costs $710 and exceeds 2.5 GB uncompressed. Portal automation is prohibited. Commercial bulk forbids bulk repackaging, and active-product redistribution needs clarification. |
| 5 | Wisconsin DFI Full Corporate Database | 124,257 / 397,269 | **Hold.** The $40 weekly/monthly ShareFile product is promising, but public materials omit its record layout, stable-ID guarantee, status map, size/checksum, license, retention, and automated-delivery terms. |
| 6 | Massachusetts CIMS full extract | 118,917 / 633,439 | **Hold.** Regulation authorizes $100/week or $4,800/year, but schema, delivery, identifiers, status codes, sizes, and reuse/retention rights are request-only or unspecified. |
| 7 | New Jersey DORES Bulk Access Status Reports | 156,337 / 883,628 | **Hold.** The written-request product costs $0.0185 per record and may arrive through FTP, email, or disk. No public layout, current count/cost, stable-ID guarantee, active mapping, cadence, checksum, or license was found. |
| 8 | Utah registered-business full list | 63,844 / 304,287 | **Hold.** Active, NAICS, and ZIP filters exist and the source is refreshed through the prior Tuesday, but full access is subscriber-only at $0.01 per record. Product license, transport, automation, longitudinal-ID, and retention terms are unpublished. |
| 9 | Maryland SDAT Corporate File via SpecPrint | 132,909 / 599,050 | **Hold.** The monthly file with weekly subscription contains entities active at any time since 1982, not a current-active snapshot. Layout, Department-ID/status inclusion, price, delivery, license, and retention are unpublished; SDAT directs bulk users to its contractor and prohibits scraping. |
| 10 | Arizona ACC full database extraction | 99,038 / 598,126 | **Hold.** The full CSV costs $1,000, use is purpose-bound, commercial purpose must be declared, different use can create statutory liability, and records are returnable on demand. No promised Entity ID, current layout, recurring cadence, or redistribution safe harbor was found. |

## Recommended authorized path

First, request written Illinois SOS confirmation that scheduled direct downloads of the expressly published static bulk ZIPs are permitted despite the automated-query clause. The offline `il-business-registry` connector is now implemented for operator-supplied official ZIPs and cannot perform network acquisition:

- accept Corporation Master, Name, and Annual Report plus LLC Master and Name;
- select documented status `00/01` while preserving the corporation NGS overlay;
- exclude agents, officers, managers, members, and personal addresses;
- publish organizations and administrative-address assertions only, never physical sites;
- validate run dates, fixed widths, trailers/counts, file-number syntax, uniqueness, joins, checksums, and schema drift; the unpublished modified-modulus-11 algorithm is not guessed;
- keep raw and record-level artifacts internal/local-review-only until export policy approval.

Minnesota Active Business Data is the second choice only after explicit spend authorization and written redistribution clarification. Wisconsin is third after DFI supplies the layout, Entity-ID/status contract, and usage terms.

## Official references

- North Carolina: [data subscription](https://www.sosnc.gov/online_services/data_subscriptions/business_registration_data_subscriptions), [data dictionary](https://www.sosnc.gov/webfiles/documents/forms/Data_Subscriptions/Business_Registration_layout.pdf)
- Hawaii: [dataset](https://data.honolulu.gov/d/9k54-ztb8), [portal terms](https://data.honolulu.gov/terms-of-use)
- Illinois: [bulk-data landing page](https://www.ilsos.gov/data/bus-serv-home.html), [corporation specification](https://www.ilsos.gov/content/dam/data/bs/proc_corp_data.pdf), [LLC specification](https://www.ilsos.gov/content/dam/data/bs/proc_llc_data.pdf), [LLC open-data statute](https://www.ilga.gov/documents/legislation/ilcs/documents/080501800K50-5.htm)
- Minnesota: [official data products](https://sos.mn.gov/business-liens/business-liens-data/business-data-available/), [commercial bulk license](https://www.sos.mn.gov/media/5125/business-bulk-la.pdf)
- Wisconsin: [corporate data services](https://dfi.wi.gov/Pages/BusinessServices/BusinessEntities/CorpDataServices.aspx), [order form](https://dfi.wi.gov/Documents/BusinessServices/BusinessEntities/Forms/CORP51.pdf)
- Massachusetts: [950 CMR 113.15](https://www.sec.state.ma.us/divisions/corporations/download/950113.pdf)
- New Jersey: [DORES fee schedule](https://www.nj.gov/treasury/revenue/fees.shtml)
- Utah: [business-list order service](https://secure.utah.gov/datarequest/businesses/index.html), [layout example](https://secure.utah.gov/datarequest/businesses/listExample.html)

Implementation evidence: [Illinois Business Registry offline connector](IL-BUSINESS-REGISTRY.md). An optional national-registry adapter now reconciles a verified connector release into privacy-minimized organization assertions and ZIP-level records-office-address evidence without creating physical sites or relationships. No official source release has been supplied or published, all Illinois-derived outputs remain local-review-only, and no production pointer or dependency has been activated.
- Maryland: [SDAT service description](https://dat.maryland.gov/pages/services.aspx)
- Arizona: [database-extraction form](https://azcc.gov/docs/default-source/corps-files/forms/m027-database-extraction-request4afa009930ae4583a9310593ba4c65ce.pdf?sfvrsn=73637fee_6), [commercial-use statute](https://www.azleg.gov/ars/39/00121-03.htm)
