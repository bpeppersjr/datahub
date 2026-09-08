# Illinois retail-food source triage — September 8, 2026

## Decision

No statewide public machine-readable retail-establishment roster was verified in this bounded review. Illinois retail food is regulated locally, so the strongest identified machine-readable lead is **Chicago-only inspection history**, not statewide coverage or a current grocery-store register. Do not enroll a statewide connector from this evidence.

Repository review found existing Illinois Secretary of State registration integration, whose records-office addresses are organization evidence rather than operating sites (`docs/BUSINESS-ENTITY-RESOLUTION.md`). That source does not fill the retail-food premises gap. Existing source holds and connectors were not changed.

## Official evidence

- [IDPH Retail Food](https://dph.illinois.gov/topics-services/food-safety/retail-food.html) identifies local health departments as the regulators for restaurants, bakeries, grocery stores and food trucks in their jurisdictions. It links the [local health department directory](https://dph.illinois.gov/about/lhd.html). A statewide food code and uniform inspection form are not evidence of a consolidated public statewide dataset.
- [IDPH Manufactured Food](https://dph.illinois.gov/topics-services/food-safety/manufactured-food.html) distinguishes wholesale distribution from direct-to-consumer retail sales. A manufactured-food registration list would be a different industry/source scope, not a substitute retail denominator.
- The official Chicago portal identifies **Food Inspections**, dataset `4ijn-s7e5`. The indexed [dataset page](https://data.cityofchicago.org/Health-Human-Services/Food-Inspections/4ijn-s7e5) exposes schema names including `inspection_id` (number), `dba_name`, `aka_name`, `facility_type`, `address`, `city`, `state` (text), `license_`, `zip`, `latitude` (number), and `inspection_date` (floating timestamp). This is a schema lead, not a freshly pinned API response. Numeric ZIP needs explicit source-preserving postal normalization; ZIP4 and coordinate provenance remain unverified.
- The official [Food Inspections dashboard description](https://data.cityofchicago.org/Health-Human-Services/Food-Inspections/2bnm-jnvb/about) describes inspection findings at inspection time, not necessarily other times. [The city inspection-map metadata](https://data.cityofchicago.org/Health-Human-Services/Food-Inspections-Map/cnfp-tsxc/about) identifies City of Chicago/Public Health and refers frequency/time-period to its parent dataset. Its update date must not be substituted for the parent dataset's cadence.
- [Chicago's retail-food-license performance dataset](https://data.cityofchicago.org/Administration-Finance/Performance-Metrics-Business-Affairs-Consumer-Prot/igye-3mj8/about) describes the licensing requirement for restaurants and food stores selling perishable products. It is a performance metric, not a business roster.

## Access and policy boundary

This review used official indexed documentation/schema descriptions only. No resource-row query, ID enumeration, aggregate count, export file, account, form submission or agreement acceptance was performed. Search results incidentally included indexed row snippets; those were not used as evidence or retained here.

Direct opening of the parent dataset's `/about` page was rejected by the browsing tool as non-retryable. The [Chicago data disclaimer URL](https://www.chicago.gov/city/en/narr/foia/data_disclaimer.html) returned HTTP 403. Neither was retried or bypassed. The inspected map metadata labels its license “See Terms of Use”; the complete applicable terms were not obtained. Public indexing is not redistribution approval, and retrieval failure is not a finding that public reuse is prohibited.

## Next prerequisite

If a Chicago-only workstream is useful, first validate the official parent metadata endpoint `https://data.cityofchicago.org/api/views/4ijn-s7e5.json` without requesting rows, and obtain the applicable official usage notice. Confirm the full selected-field schema, publisher, exact update semantics, geometry basis, source-native inspection key and license semantics. Only then define a narrowly scoped aggregate preflight and a source-use decision. Keep inspection events separate from license/establishment identity; repeated inspections must not inflate business counts, and an inspection result must not assert current operation.

For statewide retail coverage, the unresolved prerequisite is an official statewide aggregation or an explicitly scoped local-health-department source plan with jurisdiction conservation. Do not infer a complete Illinois denominator from Chicago, Cook County, or the national SNAP subset. No current count, active-business total, statewide completeness percentage, or acquisition readiness is asserted.
