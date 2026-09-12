# CMS entity-linkage next slice

Read-only root audit, September 12. No new source records were acquired, no entity merge was performed, and existing selected artifacts remain unchanged.

## Retained nursing chain evidence first

Root verified the retained failed-acquisition CSV SHA-256 `a5808fcded1ca73a629fde88fc23dcba3b6ff8ed75199883062a262e14ef8fe0`, then parsed its 14,690 rows locally. The already retained headers include `Chain Name`, `Chain ID`, and `Number of Facilities in Chain`, although the current fourteen-field selected projection does not include them.

Lexical inspection found 10,116 rows with nonblank chain name and ID, 4,574 with neither, no one-sided name/ID cases, and 610 distinct nonblank IDs. The reported chain-size field is nonblank on 10,116 rows. This does not interpret placeholder values, validate chain-size consistency, establish ownership, or count canonical chains. No names or addresses were printed.

Next: review the retained source dictionary's chain definitions and exclusions, then create a separate versioned chain-assertion projection linked by source row/CCN and exact CSV hash. Preserve raw chain values, dates, missingness and contradictory declarations; independently replay membership and counts. Reuse the original bytes and recovery chain. Do not rewrite the recovery manifest or selected artifact. A reported chain is not automatically a legal parent, healthcare network or unique business.

### Dictionary and within-cohort checks completed

Root used the PDF skill to extract and visually inspect complete pages 8 and 27 of the retained July 2026 dictionary (Table 2 and Table 16). Its chain grouping can arise from shared owners, officers, or operational/managerial control; it is broader than common legal-parent ownership. The dictionary identifies chain IDs as publisher-assigned numeric identifiers and says the facility-count field is missing when a provider is not in a chain. The revision table dates the change from “Affiliated Entity” to “Chain” terminology to July 2025. Preserve this source-specific meaning, not a universal corporate hierarchy.

A second hash-checked local scan found digit-only nonblank chain IDs and reported sizes, one reported name and size per each of 610 source groups, and agreement between each reported size and its retained row count. This establishes consistency within this retained cohort only. It does not prove completeness outside the source, current ownership, a unique corporate parent, or stability of chain identifiers across editions. The next implementation must detect future disagreements, not hard-code today's agreement as a permanent source invariant.

## Subsequent identifier/ownership bridge

The indexed official [Hospital Enrollments API documentation](https://data.cms.gov/provider-characteristics/hospitals-and-other-facilities/hospital-enrollments/api-docs) lists enrollment ID, NPI, multiple-NPI flag, CCN, associate ID and practice-location fields. The indexed [Skilled Nursing Facility All Owners documentation](https://data.cms.gov/provider-characteristics/hospitals-and-other-facilities/skilled-nursing-facility-all-owners/api-docs) lists enrollment/owner IDs, ownership roles, association dates and percentages. Direct HTML reads returned only a JavaScript shell; indexed metadata is discovery evidence, not a verified current dataset schema or release pin.

CMS describes hospital ownership as self-reported in its [dataset overview](https://data.cms.gov/provider-characteristics/hospitals-and-other-facilities/hospital-all-owners). Review official guidance, additional-NPI/address files, terms, current metadata and cardinalities before a connector. Preserve many-to-many dated relationships; do not flatten owners to one parent or match facility IDs to CCNs solely by string shape. Exclude individual-owner personal/address fields from the proposed selected organization layer. No ownership data or new enrollment records were downloaded during this audit.
