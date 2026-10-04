# D.C. Corporate Registration reassessment — 2026-10-03

Decision: retain `proceed-to-bounded-connector`, limited to existing offline implementation work. No acquisition or production authority is added.

The [official layer metadata](https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Business_Licensing_and_Grants_WebMercator/FeatureServer/0) still supports the selected offline schema. It publishes a non-spatial table; historical record totals and status distributions were not re-requested. The immutable observation is `config/state-business-source-assessments/dc-2026-10-03.json`.

[DLCP's FAQ](https://dlcp.dc.gov/page/corporations-division-business-registration-faqs) now names BOSS (formerly CorpOnline). Its biennial filing cadence is distinct from source refresh cadence. Registry status is administrative evidence, and the Corporate Registration table remains separate from the retained Basic Business Licenses layer.

[District data terms](https://dc.gov/page/terms-and-conditions-use-district-data) provide a CC0 default subject to exceptions. The historical item-specific CC BY 4.0 observation was not refreshed: the catalog response was empty and the item metadata request unsuccessful. Preserve existing attribution, privacy and local-review restrictions pending that check.

Next work: maintain the existing offline app workflow. Future acquisition needs its own authorization, fresh preflight controls and resolved snapshot/admission requirements. This audit creates no current count receipt and changes no connector, policy, runtime data, coverage or production pointer.
