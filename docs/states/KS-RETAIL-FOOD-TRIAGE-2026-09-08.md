# Kansas retail food licensing: bounded triage

Observed 2026-09-08. Documentation-only investigation: no establishment queries, ID inventories, inspection records, bulk files, accounts, contacts, payment, or agreement acceptance. Repository search found no earlier Kansas retail-food source assessment or connector; the state workstream entry alone is not collection evidence.

## Regulator and scope

The [Kansas Department of Agriculture licensing page](https://www.agriculture.ks.gov/licenses/food-and-lodging-applications-and-licenses/license-information-food-safety) identifies KDA as issuer of food-establishment and food-processor licenses. Establishments include grocery/convenience stores **and** restaurants, schools, bars, caterers, mobile units and other operations. Processors cover wholesale/storage/manufacturing activities; one business can require both licenses. Annual expiration is March 31. This licensing cycle is not a dataset refresh timestamp or proof of present business operation.

Consequently, selecting every food-establishment license would not produce a grocery-only population. No machine-readable grocery subtype field/domain or fixed-premises exclusion predicate was verified. License counts must not be labeled unique sites or organizations.

## Public delivery evidence and limitation

The official [Inspection Results page](https://www.agriculture.ks.gov/divisions-programs/food-safety-and-lodging/inspection-results), as available in the search index, announces a platform transition: separate results for inspections on/after July 6, 2026 and August 5, 2015–July 5, 2026. It describes viewing inspection results, not a complete current license roster, and explicitly references Kansas Open Records Act use restrictions.

A direct page open returned **403 Forbidden** during this investigation. It was not retried, and no alternate host or mirror was used to bypass that response. Thus the current page's complete link targets and notices were not independently captured. Search-index evidence is identified here as such, not represented as a successful native metadata response.

An official KDA-hosted inspection-result URL appeared incidentally in search results, but no individual report was opened or retained. No documented statewide bulk endpoint, API catalog, schema, count-only query, stable source key, pagination contract, status dictionary, address-role definition, ZIP field type, coordinate field, or refresh cadence was established. Inspection publication dates alone cannot establish roster completeness or current licensing status.

## Source-use context

[K.S.A. 45-230](https://www.kslegislature.gov/b2025_26/laws/045_000_0000_chapter/045_002_0000_article/045_002_0030_section/045_002_0030_k/) restricts specified transfer/receipt of public-record name-and-address lists for selling or offering property or services to listed persons, subject to exceptions. The [Attorney General KORA FAQ](https://www.ag.ks.gov/divisions/administration/open-government/kora-faq) also cautions against indirect circumvention through third parties. This is a material downstream solicitation/use constraint; public visibility is not an unrestricted redistribution license. This assessment does not determine the legal application to a particular business purpose, nor claim that all internal aggregate analysis is prohibited.

No dataset-specific open license, automated bulk-use contract, or fee-free roster export was verified. Conversely, this investigation does not establish that a public bulk roster is unavailable, requires an account, or necessarily requires a paid records request.

## Concrete next prerequisite

Obtain a publisher-documented current **license/establishment roster** delivery contract through an accessible official documentation/catalog surface, without repeating the denied inspection page. Require:

1. Exact export/API URL and metadata-only access method, complete notices and downstream-use boundaries.
2. Schema distinguishing establishment/license identity, grocery/convenience/restaurant/mobile subtypes, source status and its dates, premises versus mailing address, and separate ZIP semantics. Exclude contact/owner fields from any future selected contract.
3. Source update timing, coverage across the July 2026 platform transition, stable-key and count/pagination rules; do not substitute historical inspection counts for establishments.

Only then implement a bounded metadata/count preflight and a selected-field app-owned collector. There is presently insufficient technical delivery evidence for a success-capable Kansas retail-food preflight. No source policy/configuration or acquisition was created by this triage.
