# Ohio childcare source validation

Observed September 7 local / September 8, 2026 UTC by the parallel Ohio research workstream. Root independently inspected current layer metadata. This is source discovery and metadata/count validation only: no facility records, ID lists, bulk files, accounts or agreements were accessed. Existing Ohio corporate-registry paid-FTP restrictions remain unchanged.

## Authoritative current-source chain

The [Ohio childcare search site](https://childcaresearch.ohio.gov/) links the [official nearby-map app](https://maps.ohio.gov/portal/apps/instant/nearby/index.html?appid=e80b0d56986a4c9caa2ccd8c5419cdca). The app selects webmap `a1f7936a96ed4ab4958e2b76cb33757f`, which uses [Ohio_Daycares_view layer 0](https://maps.ohio.gov/arcgis/rest/services/Hosted/Ohio_Daycares_view/FeatureServer/0?f=pjson). Its [publisher item](https://maps.ohio.gov/portal/sharing/rest/content/items/e7b80e83d8764427b5de7fde6f67f83d?f=json) is public, owned by `oitogrip`, and describes weekly updates. A stated cadence is not an observed source refresh: layer `editingInfo` is empty.

The agent's count-only query for `program_type='Child Care Center'` returned 4,344. Metadata exposes 28 fields, Query/pagination/order/statistics capabilities and a 1,000-record limit. `zip_code` is a nullable string; `program_number` is Double. Native geometry is 102100/latest3857. Status is an undocumented string. Preserve source claims without inferring continuous operation, unique-business identity or a licensing-status dictionary.

The similarly named `Ohio_Day_Care_Centers` service is a different July-2025 source with 31 fields and a different count; do not substitute it or conflate its status vocabulary with the current app-linked view.

## Bounded next implementation

Build a fixed-endpoint metadata/count preflight and synthetic offline fixtures before any app acquisition. Proposed selected fields: `objectid`, `county`, `program_type`, `program_number`, `program_name`, `street_address`, `city`, `state`, `zip_code`, `program_status`, `geocode__latitude_`, `geocode__longitude_`. Exclude mailing/contact fields and all non-center categories at request time. Preserve ZIP5/ZIP4 separately; numeric provider identifiers require lossless validation, not automatic labeling as license numbers.

Retain complete publisher metadata and notices. The reviewed item notice allows public informational use with accuracy/completeness and liability disclaimers; this is not legal approval or an unrestricted export decision. XML, status vocabulary, coordinate datum, refresh consistency and actual record quality remain unvalidated. Never use projected x/y directly as lat/lon; retain only business point coordinates after explicit validation, not polygons.

Acquisition belongs to Co*Tive after connector validation: bounded requests, deterministic record membership, before/after count/schema checks, cancellation, immutable evidence, independent replay and explicit quality gaps. Neither a metadata success nor this document submits a job, grants access to other Ohio systems, or promotes records into national coverage.
