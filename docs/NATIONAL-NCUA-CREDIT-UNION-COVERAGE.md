# NCUA quarterly federally insured credit unions and scoped locations

This retained-only governed aggregate replays the exact pinned final NCUA quarterly release for cycle `2026-03-31` and pinned Census geography. It makes no network requests and is nonadditive to generic business totals.

The source contains 4,250 federally insured institutions and 22,445 accepted scoped U.S. locations. Institution counts are separate and nonadditive across geography; 4,245 charters have accepted location evidence and five do not. The coverage does not represent all credit unions or financial businesses and does not confirm public access, membership eligibility, current hours, or service availability.

Site types are bounded to `CORPORATE_OFFICE` and `BRANCH_OFFICE`. Source-reported service flags are bounded and nonexclusive. Corporate-office site type is not equivalent to the main-office boolean: 5,287 locations have corporate site type while 4,242 have `main_office=true`.

Only aggregates are published. Names, addresses, phones, hours, charter/site identifiers, record identifiers, and the potentially personal `ATTENTION_OF` source field are prohibited.
