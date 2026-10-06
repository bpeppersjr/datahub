# Census Nonemployer 2023 county-industry adjacent evidence

This pointer-free, local-review-only projection reuses the verified retained Census Nonemployer county-industry context. Its key is county GEOID plus a direct 2022 NAICS publisher cell. The bounded selection contains Construction (`23`) and Child Day Care Services (`62441`) totals for legal-form code `001` and receipt-size code `001`; it never derives a parent total by summing NAICS children.

The projection conserves 6,286 county-status rows across 3,143 county GEOIDs. There are 6,151 published cells, of which 6,141 have usable establishment measures and ten retain publisher flags with null usable values. The remaining 135 county-industry cells are explicitly absent and remain null. Construction has 3,141 usable, one flagged, and one absent county cell, totaling 2,917,626 usable reference-year establishments. Child Day Care Services has 3,000 usable, nine flagged, and 134 absent cells, totaling 533,398.

Every row preserves raw measures, flags, nullable usable measures, reference year, source status, and source provenance. An unflagged published zero remains measured zero. A flagged or absent value never becomes zero.

The source publishes county, state, and national aggregates—not ZIP evidence. The contract rejects ZIP5, ZIP4, ZCTA, crosswalk, allocation, coordinate, geocode, hierarchy-sum, named-directory, current-operation, completeness, production, matrix, and exact-ZIP catalog claims. No geography allocation or geocoding is performed.

Run `npm run nonemployer:county-industry-adjacent:verify`. It verifies the pinned source pointer, source manifest, source policy, retained context configuration and manifest, and retained context artifact before replaying the county projection. The command performs no acquisition, network request, release write, pointer update, or enrollment.
