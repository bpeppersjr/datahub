# National FDIC BankFind coverage

This contract defines a retained-only governed aggregate over one exact FDIC BankFind release and one exact Census geography release. It makes no network requests, is not production-enrolled, and does not add records or counts to generic business totals.

The pinned source expectation is 4,238 active FDIC-insured institutions, 77,285 accepted current U.S. offices, and 58 reported U.S. jurisdictions. These are two different measures. Institution counts are distinct within a row and are nonadditive across jurisdiction or ZIP rows because one institution may operate offices in many geographies. Office counts describe accepted current indexed locations joined to the active-institution snapshot.

The figures do not establish unique businesses, independent current operation, public access, current hours, every service offered, all banks, all credit unions, all financial businesses, or nationwide business completeness. A current indexed office is source evidence, not an independently verified storefront or service guarantee. Foreign offices excluded by the retained source contract remain outside this U.S. projection.

Service type is published only through the bounded FDIC code vocabulary `11`, `12`, `13`, `21`, `22`, `23`, `24`, `25`, `26`, `27`, `28`, `29`, `30`, and `99`. Source descriptions are not accepted as arbitrary aggregate keys. Main-office and branch-office counts remain separate, and exact source and geography release identifiers and manifest hashes must accompany every immutable release.

Only aggregate counts may be published. Institution names, office names, street addresses, coordinates, certificate numbers, location numbers, and source record identifiers are prohibited. The coverage layer contains no customer, employee, account, transaction, or individual-level data and must not be used to infer any of them.
