# Retained childcare ZIP evidence v1.2

The pointer-free `retained-childcare-zip-evidence@1.2.0` release replays seven already-retained childcare cohorts without a source request. It retains the legacy Pennsylvania selection while advancing Vermont to its governed current enrollment. A present `config/current/vt-childcare-reporting-enrollment.json` is authoritative and malformed or incompatible current evidence fails closed; the legacy Vermont enrollment is used only when the current binding is absent.

The immutable release is `retained-childcare-zip-evidence-b61acab3e067f828013a17387b1912c90493e69d7cf3f3c12ae6a04b01b3625b`, with manifest SHA-256 `9997dc9dcad2f3a35cd49a76244527ecd6bf6b13a4a6000db8a28f7651bf123a`. It conserves 12,210 accepted source-candidate rows: 12,208 carry ZIP5, one Vermont row has a missing source ZIP, and one Maryland row retains its publisher-contract `invalid-source-zip-range` classification. There are 2,359 indexed ZIP5 keys.

Vermont contributes 507 accepted candidate rows from app run `2a188fc7-2720-4b74-9556-29cf8a0c3f3d`: 506 carry ZIP5, two carry separate ZIP+4 values, one lacks ZIP5, and all 507 lack selected coordinates. Publisher scope does not assign address state. The source reporting period remains unverified.

This release is internal, immutable, pointer-free and pre-production. It writes no current pointer and grants no production or national-denominator enrollment. Candidate rows are not deduplicated businesses, verified physical sites, verified current operations, completeness, USPS assignment, county assignment or public-export authority. ZIP+4 remains separate and is not aggregated into ZIP5 geometry.

No exact-ZIP matrix, national federation, registry, coverage view or application contract was rebuilt by this successor. Those downstream consumers remain pinned to their prior versions until a separately governed migration conserves their full contracts.
