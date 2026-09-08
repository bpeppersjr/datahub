# Monroe County, Indiana food-data use review — September 8, 2026

## Activation decision: source-specific permission clarification required

The prior [metadata discovery](IN-RETAIL-FOOD-TRIAGE-2026-09-08.md) established a public county facility layer, not unrestricted downstream-use rights. This follow-up found a concrete published reuse restriction. Do not activate business-row acquisition, normalization or recurring refresh for this source pending a source-specific permission basis. This is an operational governance decision, not a legal opinion or a conclusion that public-record facts are categorically unavailable.

## Notice evidence

The [county Terms of Use](https://secure.in.gov/counties/monroe/terms/) identify the county website as their scope and incorporate service-specific rules. Section 2 permits browsing and personal, noncommercial printing/downloading with proprietary notices retained, but requires written permission for reuse, modification, distribution and derivative works. Section 7 reserves intellectual-property rights and refers other uses to written permission. This is stronger evidence than an empty ArcGIS item license field. It does not by itself resolve how the website terms apply to the separately hosted county ArcGIS data service, nor establish a dataset-specific exception. No such exception was verified in this review.

The [official GIS Division page](https://www.in.gov/counties/monroe/gis-division/) describes free public-facing maps, dashboards and imagery viewers. Its disclaimer concerns accuracy, liability and approximate boundaries; it does not expressly grant Co*Tive's retention, transformation or redistribution workflow. Its Spatial Data Hub link resolves to `https://gis.co.monroe.in.us/portal/apps/sites/`; browser retrieval yielded no readable content, so no additional dataset-use notice was obtained there. No alternate transport or repeated retrieval was attempted for that shell.

## Required clarification and preserved scope

An acceptable next input is a publisher-issued notice or written permission explicitly covering `Food_Locations_for_Survey_123`, item `b6e58e0d6a424856b0e5e3b608ce376a`, layer 0, and Co*Tive's intended unattended retrieval, retention, internal normalization, derived reporting and any separately requested export. Clarify refresh/rate expectations and attribution. Do not send a records request, accept an agreement, commit to fees or represent approval without user authorization. A supplied permission document must be reviewed for scope before dispatch.

Category and license-status semantics remain separate technical prerequisites. Empty metadata domains, `LicensedCheck=1` and `IsArchived=0` do not establish a grocery category, current operation or physical-site identity. [Category follow-up](IN-MONROE-FOOD-CATEGORIES-2026-09-08.md) records the licensing distinctions. Any future connector remains Monroe County-only and excludes contact/person/mailing fields and inspection narrative payloads.

No business records, new aggregate counts, source metadata refreshes, accounts, submissions or downloads were initiated during this notice review. No connector, scheduler, source release or national production pointer changed. Continue other state workstreams rather than repeatedly querying this source while the permission and semantics gaps remain unresolved.
