# Florida FDACS native metadata evidence and source follow-up

## Native prerequisite evidence

The integrator invoked code `971a0eb` once on September 12, 2026: run `fd982c92-8370-4ae6-84b9-3d3d2986571c`, created `2026-09-12T15:35:25.138Z`, completed `2026-09-12T15:35:27.871Z`. Native CLI exit0 and an independent fetch-forbidden verifier exit0 were reported by the integrator. The source agent independently read the receipt and hashed every retained file; no further GIS request was made for this evidence note.

Manifest SHA-256: `5a1a706238f47d7fd5fd056bed6020db1c8da25a2c184cb1a3cedd601bbaebc5`.

All three responses were HTTP200/text/plain: service5,408 bytes, layer13,981 bytes, iteminfo341 bytes, total19,730 response bytes. Durations490/83/123ms and gaps1013/1017ms are recorded. There were no feature/count/ID/export queries or provider rows. `metadataContractValidated:true` does not change `acquisitionReady:false`, null source/business counts, unresolved FE_TYPE mapping, unknown license status/date, or internal-only policy.

Original evidence location: `C:\\Master Data\\datahub\\data\\worktrees\\retained-feed-integration\\data\\business-sources\\fl-food\\gis-preflight\\jobs\\fd982c92-8370-4ae6-84b9-3d3d2986571c`.

Nine files total 26244 bytes. No copy into main or production promotion has occurred. A later integrator-approved retained transfer must require an absent canonical destination UUID path, reject links, preserve exact bytes, copy supporting evidence before manifest publication, compare all hashes, and run the integrated native verifier offline. Do not rerun the source acquisition merely to transfer or integrate this receipt.

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| intent.json | 441 | `c2e910ffb2e46d434a0cc1b76778df686a39c61aa59ee0c08f804f4b32d2eff1` |
| iteminfo.json | 341 | `1eccb49007c12cac16a9fba5fcc4b4b0ff30daa2c5fa5c9033bef1868b959f75` |
| layer.json | 13981 | `c20aa08dcf782cb2e8af3bad3913c3345020d2f89e8a79e9d3d5b9e24c651709` |
| manifest.json | 4527 | `5a1a706238f47d7fd5fd056bed6020db1c8da25a2c184cb1a3cedd601bbaebc5` |
| policy.json | 813 | `8aa95f9b77e84b5c331f2c74910e01fa1bc425c9d77f53fab6137648fb8e4a42` |
| request-1.json | 240 | `24ed4695da7a6f48cde7781b8c7b785cf22bb188bdfcb7579c3ce97a592ea702` |
| request-2.json | 242 | `54f9e9ff6643ae1a4a3bc9321f75f1868cc24d832e54888f793f68e6a4442165` |
| request-3.json | 251 | `a7c958050836df1368134ca9dbb4ee538c2bd239e2ecde495c627a3b63abfcea` |
| service.json | 5408 | `c6c95670b1bed3eb89aeb93f7fb1b79435a6bc1ad0e378ef0e2a9507154180b3` |

## Publisher documentation reviewed after native validation

The [FDACS Internet Disclaimer](https://www.fdacs.gov/Privacy-Policy/Internet-Disclaimer) presents department websites as a public service, warns against assuming accuracy/completeness or currency, and disclaims noninfringement of privately owned rights. The reviewed text contains no automation prohibition or fee/license-acceptance prerequisite for reading this public GIS source. Empty layer iteminfo is therefore not evidence that ordinary internal public-source assessment is prohibited. Conversely, the disclaimer is not a blanket third-party-rights or redistribution license. Preserve attribution, minimization and unknown currentness; do not invent a requirement for paid access or credentials. This is a bounded source-use assessment, not legal advice or a change to current collector policy.

The [public inspection-search page](https://foodpermit.fdacs.gov/Reports/SearchFoodEntity.aspx) says reports cover the past four years and show inspection-time conditions. Its initial form has no FE_TYPE selector. No search was submitted. Inspection history must not be treated as the current permit roster or used as an unstated status join.

The [public permitting guide](https://foodpermit.fdacs.gov/Guides/PermittingGuide.aspx) offers convenience-store/supermarket and other business functions, but the inspected initial documentation does not supply GIS FE_TYPE codes. No guide form or permit application was submitted.

The [official application FDACS-14306](https://forms.fdacs.gov/14306.pdf), revision05/2025, is a blank one-page form. It distinguishes owner mailing address from the establishment physical address, and distinguishes retail, wholesale and both. It has no numeric FE_TYPE codebook. The PDF skill guided document inspection; no completed form or personal information was obtained. These form semantics support preserving address/owner separation but do not establish that a GIS attribute is a verified physical location.

The official [Rule5K-4.020 page](https://flrules.org/gateway/ruleno.asp?Section=0&id=5K-4.020) lists effective date November11,2025 and links the May2025 application/renewal references. The gateway/notice pages establish applicable permit-document context, not a verified numeric GIS type mapping. No current rule-text numeric crosswalk was obtained in this pass. Incidental indexed individual inspection material was not opened or used as a codebook.

## Concrete remaining source step

The access/protocol/schema prerequisite is now proven; the immediate classification gap is the publisher's exact FE_TYPE value-to-description table. Risk renderer labels must never substitute. Obtain an actually documented table or a publisher-described codebook route, preserving a version/date and exact field linkage. If reviewed source use supports a small aggregate next, an explicitly bounded FE_TYPE distribution could establish observed codes without provider names/contacts, but would still not decode them by itself; no such query is authorized or executed by this note.

A record-use policy may be scoped to minimized, attributed internal records on the public FDACS route after integrator review of these actual notices. It should not be blocked solely by empty licenseInfo, nor marked acquisition-ready before source selection, snapshot/conservation, refresh semantics and byte/row budgets are defined. Current-operation claims remain unavailable even if the publisher calls the layer active. The new source work is distinct from previously denied DBPR pages and the already-retained Florida corporate registry.
