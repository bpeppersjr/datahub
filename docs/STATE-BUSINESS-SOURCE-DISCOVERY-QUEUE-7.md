# State business-source discovery — Queue 7

Observed 2026-09-03 against production coverage release `national-business-coverage-views-20260902-115337634Z-ba689784`.

Queue 7 examined the next four unreviewed states whose production evidence consisted only of national-sector layers, ranked by the diagnostic gap between the Census 2023 Nonemployer baseline and source-preserving reported-address profiles. Maryland, Missouri, Indiana, and South Carolina ran concurrently in four non-overlapping workstreams. This ratio prioritizes contract research only; it is not a completeness measure and does not compare like-for-like business universes.

| Rank | State | Strongest official candidate | Published access | Diagnostic profiles / baseline | Decision |
|---:|---|---|---|---:|---|
| 1 | Maryland | SDAT Corporate Master File through SpecPrint | $2,100/Corporate File; weekly-subscription price unresolved | 22.2% | `HOLD` |
| 2 | Missouri | SOS corporate bulk data downloads | Current route and price unpublished | 19.4% | `HOLD` |
| 3 | Indiana | INBiz Business Entity Bulk Data | $8,000 baseline or $9,500 subscription eligibility plus $500/update | 23.2% | `HOLD` |
| 4 | South Carolina | SOS Corporation Bulk Data through SCI | $12,000/fiscal year plus $125 annual subscription | 18.4% | `HOLD` |

## Decisions

### Maryland

SDAT and its contractor document a paid historical master, weekly delivery option, and an unversioned 25-file fixed-position layout. The price page labels average weekly volume as 9,300,000 records without an as-of date; this is not safely interpretable as a unique-entity count, and byte size is unpublished. They do not publish separate weekly-subscription pricing, current code values, a compatible sample, identifier mapping, address-role dictionary, or full/update/delete/replay/checksum contract. Listed media and shipping charges are included. Automated public-search collection is prohibited, and the order form does not affirm the downstream rights Datahub needs.

### Missouri

One official report says corporate bulk downloads were implemented in November 2022. A separate report aggregates bulk-data revenue with filing and copy revenue and does not attribute sales to this product. The current service catalog exposes no order route, price, agreement, delivery method, schema, sample, size, or change contract. `Charter No.` is only a candidate key. The registry is not an operating-business universe, and legal standing cannot be converted into operating status.

### Indiana

INBiz documents an account-gated monthly snapshot on USB and separately purchased downloadable differential updates. The product is materially priced but lacks a public schema, size, stable-ID lifecycle, unattended acquisition contract, and complete differential/deletion/replay/checksum semantics. Its generic site terms do not establish transformation, geocoding, publication, or redistribution rights.

### South Carolina

The current subscriber agreement documents three monthly CSV archives, price, delivery day, and subscriber-provided FTP, but it requires registration, signature, annual payment, ACH Auto Pay, and credentials. It does not publish the schema, aggregate size, exact legal-entity scope, stable key, status/address dictionaries, change contract, or affirmative downstream-use rights. The official portal explicitly distinguishes legal good standing from current operation.

## Common boundary

All four remain `HOLD`. No account, terms acceptance, signed request, payment, record-level request, portal enumeration, automated retrieval, complete download, connector implementation, source publication, registry rebuild, coverage publication, Heatmap Builder admission, or production pointer change occurred or is authorized.

The only authorized next step is a non-row-bearing written inquiry for current unsigned terms and pricing, exact person-free schema or header-only sample, current aggregate size, entity/status/address dictionaries, stable-identifier lifecycle, delivery/change/deletion/replay/checksum mechanics, supported unattended retrieval, and explicit retention, transformation, geocoding, derived-publication, redistribution, and attribution rights.

Business entities remain non-geometric. A future authorized projection may retain a contract-confirmed organization-level administrative address and address latitude/longitude only. ZIP5 and ZIP+4 remain separate fields. Registered-agent/service addresses, natural-person data, direct contacts, sensitive personal and non-registry government identifiers, tax/payment fields, filing images, documents, signatures, and free text are excluded.
