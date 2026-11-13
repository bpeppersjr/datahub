# Illinois access and reuse evidence reference

The immutable 2026-11-13 reference records a documentary HOLD, with zero source files or rows retained. It supplements the October reassessment and November zero-row preflight without changing either, the source policy, or the readiness wave. The existing offline connector remains the only implementation.

The [SOS Data Transparency page](https://www.ilsos.gov/data/bus-serv-home.html) and the linked [corporation](https://www.ilsos.gov/content/dam/data/bs/proc_corp_data.pdf) and [LLC](https://www.ilsos.gov/content/dam/data/bs/proc_llc_data.pdf) layout PDFs opened successfully. The page prohibits automated queries; the version 004 layouts dated 2024-04-04 document daily full files, record widths, run dates and count trailers. Layouts do not verify an actual same-run package or authorize access.

Illinois General Assembly primary-domain search results exposed statutory open-data language for [corporations](https://ilga.gov/documents/legislation/ilcs/documents/080500050K1.25.htm), the [corporate definition](https://www.ilga.gov/legislation/ilcs/fulltext?DocName=080500050K1.80), [LLCs](https://www.ilga.gov/documents/legislation/ilcs/documents/080501800K50-5.htm), and [Public Act 102-0049](https://www.ilga.gov/Legislation/PublicActs/PrinterFriendly/102-0049). Repeated direct opens returned timeouts or 502, so this is search-result evidence, not a successful direct-page retrieval. The open-license and use/reuse language is positive reuse evidence requiring reconciliation with actual datasets, terms and policy; it is never authorization for automated website access.

The existing policy states `contains_personal_data: false` while the prior assessment notes that LLC records-office addresses may be residential. This remains unresolved for field-level privacy and policy review. Nothing here authorizes contact, account creation, payment, acceptance of terms, acquisition, processing, publication, national admission or production changes.

Verify locally:

```sh
node --test runner/il-access-vs-reuse-reference.test.mjs
node scripts/verify-il-access-vs-reuse-reference.mjs
npx eslint runner/il-access-vs-reuse-reference.mjs runner/il-access-vs-reuse-reference.test.mjs scripts/verify-il-access-vs-reuse-reference.mjs
```
