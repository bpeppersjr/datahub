# State business-source discovery — Queue 8

This integrates the existing assessment observed on 2026-09-03 against production coverage release `national-business-coverage-views-20260902-115337634Z-ba689784`. It does not represent a new source acquisition or a fresh review of provider terms.

Queue 8 covers Louisiana, Minnesota, Alabama, and Wisconsin. The checked-in queue records four concurrent state workstreams. Selection is verified against the pinned production state coverage: these are the next unreviewed eligible states ranked by the gap between Census 2023 Nonemployer establishments and source-preserving reported-address profiles. These unlike populations provide a research-priority diagnostic, not an industry completeness percentage or a count of unique operating businesses.

| Rank | State | Official candidate assessed | Published access in assessment | Diagnostic profiles / baseline | Decision |
|---:|---|---|---|---:|---|
| 1 | Louisiana | SOS custom Computer Query | $25 for first 40 records, then $0.01 per record | 21.9% | Hold |
| 2 | Minnesota | SOS Active Business Data | $30 once or per weekly file | 33.0% | Hold |
| 3 | Alabama | SOS Business Entity Database | Individual inquiry; no published bulk product price | 23.1% | Hold |
| 4 | Wisconsin | DFI Full Corporate Database | $40 per full file | 31.3% | Hold |

The exact evidence, official source URLs, exclusions, and proposed next actions are preserved in `config/state-business-source-discovery-queue-8.json`. Louisiana's custom query and separate limited API lack a complete recurring export contract. Minnesota documents an active-business layout but leaves identifier lifecycle, address roles, replacement semantics, and unattended delivery unresolved. Alabama exposes individual inquiries without a documented recurring bulk route. Wisconsin offers full snapshots, but the bulk-listed address is registered-agent/office data and the required export and use contract remains incomplete.

All four assessments remain on hold for the candidate products reviewed. Legal registration or good standing does not establish current business operation. These historical candidate decisions do not supersede independently governed releases from different products or later acquisitions.

No new account, payment, terms acceptance, record request, download, connector, production publication, or pointer change is made by this integration. The next action described by these assessments is a written inquiry for missing product scope, schema, identifier lifecycle, status/address dictionaries, delivery/change semantics, and use terms. No inquiry has been sent by this integration.

Business records use address latitude/longitude rather than entity polygons. ZIP5 and ZIP+4 remain separate fields; polygons belong to the governed national, state, county, and Census ZCTA geography layers.

The aggregate catalog now has 33 distinct jurisdiction assessments: 5 revalidations and 28 discovery assessments, with 31 holds and 2 existing bounded-connector decisions. Its historical decisions authorize zero autonomous acquisitions and declare zero production-ready jurisdictions. Discovery and aggregate validators pin content digests; regression tests reject evidence mutation and acquisition escalation. Run `npm run state-source-discovery:check`, `npm run state-source-assessments:check`, and `node --test runner/state-business-source-discovery.test.mjs runner/state-business-source-assessment.test.mjs` to verify this integration.
