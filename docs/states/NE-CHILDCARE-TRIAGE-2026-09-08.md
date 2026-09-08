# Nebraska childcare source triage — 2026-09-08

## Outcome

Official publisher and discovery routes established; **not acquisition-ready**. No current statewide machine-readable childcare layer, selected-field schema, stable row-key contract, point provenance, or source-specific bulk-use terms were established in this bounded pass. No provider records, ID inventory, PDF roster, export, or query-feature response was requested or retained. No application enrollment or coverage count follows from this note.

Existing repository evidence concerns Nebraska Secretary of State business-entity bulk access, not childcare: `config/state-business-source-revalidation-2026-09-03.json` and `docs/STATE-BUSINESS-SOURCE-REVALIDATION-2026-09-03.md`. That historical HOLD remains unchanged. No dedicated NE childcare runtime/config was found in the initial scoped search.

## Official evidence

- [DHHS child-care information](https://dhhs.ne.gov/Pages/Search-for-Child-Care-Providers.aspx) identifies Nebraska DHHS as the licensing-information publisher, links NebraskaMAP, the roster, and license search, and describes program addresses, licensee names, capacity and facility type. It distinguishes Child Care Center from Family Child Care Home I/II, Preschool and School Age Only Center. Thus a center-only contract must not combine every licensed category. The documented license-search sequence includes reCAPTCHA; automated search is not a fallback.
- [NebraskaMAP](https://www.nebraskamap.gov/) is the official mapping route linked by DHHS. Its page produced no readable content in this web-tool inspection. This is a rendering/discovery limitation, **not an observed provider 403/429 or access refusal**. No guessed REST endpoint or alternate hostname was requested to circumvent it.
- [Official roster link](https://dhhs.ne.gov/licensure/Documents/ChildCareRoster.pdf) was identified, not opened or downloaded. Search-index introductory documentation describes a weekly, ZIP-ordered roster including home and center categories. This is not a verified current file date, row count, schema or delivery receipt. Incidental licensee/contact/home-address data makes an unfiltered roster unsuitable as the first machine-ingestion choice.
- [Nebraska ECIDS data documentation](https://ecids.nebraska.gov/ECIDS-Data/) says DHHS licensing information is periodically integrated into its access dashboard. Its center definition is licensed care for 13 or more children; provisional center licensing is separate. County/city/ZIP filters are documented. Dashboard refresh timing is not equivalent to licensing-event timing or proof of current operations.
- [Nebraska.gov policies](https://www.nebraska.gov/policies/) remain a source-use review input. Existing SOS policy analysis must not be silently treated as either permission for, or a blanket prohibition on, a distinct NebraskaMAP dataset. Dataset-specific notice and applicable service terms still need direct inspection.

## Unresolved contract boundaries

No verified field names/types exist yet for a center selector, provisional versus operating status, license identifier, address/ZIP, source-update clock, or coordinates. Public map presentation does not establish point accuracy, CRS, geocoding method, mailing-versus-premises address role, or verified site identity. Keep these unknown; do not infer state from publisher jurisdiction or convert a publication clock into a licensing date.

The Lincoln municipal childcare layer surfaced in search but is geographically limited and is not a statewide substitute. Older NebraskaMAP documentation and non-childcare DHHS layers likewise do not prove the current statewide childcare service contract.

## Concrete next action

Perform a bounded official NebraskaMAP catalog inspection to resolve its currently published childcare item and service URL, following links actually present in the catalog. Read item/layer metadata and source-use notices only. Require exact publisher identity, layer scope, schema, status vocabulary, timestamps, CRS/point derivation and documented query/pagination capability before proposing a metadata/count-only preflight. If no statewide item is published, request DHHS's documented machine-readable center extract and its retention/use conditions rather than automating reCAPTCHA search or parsing an unreviewed mixed home-provider roster. Do not acquire rows until that source contract and a privacy-selected field roster are reviewed.

No tests or runtime changes were needed for this documentation-only triage.

## Bounded catalog follow-up

The requested rendered-catalog follow-up could not obtain a browser: the computer-use browser entry returned `No browser is available`. This is an agent-environment limitation, not a Nebraska access refusal, CAPTCHA result, or authentication challenge.

Two bounded anonymous GET inspections of the already linked [NebraskaMAP homepage](https://www.nebraskamap.gov/) followed. The first returned HTTP 200 and 82,185 bytes; the second also returned HTTP 200. Both were limited to a 2 MB response and 15-second request timeout, with redirects rejected. HTML link inspection found the ArcGIS Hub application assets and Nebraska branding, but no childcare catalog-item/service link or childcare text. No application JavaScript, inferred REST endpoint, item-ID inventory, provider records or query-feature response was fetched. HTML was examined in memory and not saved.

Accordingly, the current owner, childcare layer, selected schema, edit clock and dataset-use notice remain unresolved. The next useful step is the official catalog in an available interactive browser, or a publisher-supplied current item link; repeating static homepage requests will not establish those facts. This outcome does not establish that NebraskaMAP lacks a childcare dataset and does not change the existing source or acquisition gates.
