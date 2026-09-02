# Normalized U.S. postal-code contract

Source connectors that publish normalized U.S. addresses use separate ZIP5 and ZIP+4 components. This contract applies to normalized record-level address objects; it does not rewrite immutable source artifacts.

For every normalized address carrying postal fields:

- `zip_code` is exactly five digits, including any leading zero, or `null` when no valid U.S. ZIP5 is established;
- `postal_code` is a compatibility alias for the same ZIP5 and must exactly equal `zip_code`;
- `zip4` is exactly four digits when a valid extension was reported, otherwise `null`;
- `postal_code` is never constructed as `ZIP5-ZIP4`; and
- when `zip_code` is `null`, both `postal_code` and `zip4` are also `null`.

Source-native postal text can remain unchanged only in explicitly named source/provenance fields such as `postal_code_source`, `source_zip`, or `source_zip_plus`, and in governed raw or selected-source artifacts. Status fields may continue to record whether ZIP+4 was present, malformed, or excluded.

`runner/normalized-us-postal-code.mjs` supplies a recursive publication invariant. Every affected source connector runs it before writing normalized records, so a joined alias, malformed ZIP5, malformed extension, or missing separation field fails the staged build before publication.

The normalized-output correction is versioned as patch release 1.0.1 for the Alaska, California ABC, Chicago, CMS NPPES, Colorado, Connecticut, DC, Delaware, EPA ECHO, FDIC BankFind, Florida, FSIS, Iowa, IRS EO BMF, Los Angeles, NCUA, New York corporate, New York retail-food, NYC DCWP, Oregon, Pennsylvania, Texas active sales-tax permits, USDA SNAP, and Washington L&I connectors. FMCSA advances from 1.0.1 to 1.0.2. The stand-alone pharmacy exporter likewise emits separate `postalCode`/`zip4` JSON fields and `postal_code`/`zip4` CSV columns, with no joined compatibility field. Registry publisher 2.10.0 applies the same invariant centrally to every address assertion and location profile. Existing immutable releases are not rewritten; each source must be rebuilt and independently verified before its current pointer adopts the corrected contract.
