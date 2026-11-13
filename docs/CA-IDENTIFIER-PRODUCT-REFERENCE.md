# California identifier and product documentary reference

The standalone November 13, 2026 reference remains **HOLD**. It supplements the October assessment without changing the readiness wave or authorizing a connector, acquisition, account, order, contact, payment, terms acceptance or production action. No source rows or files are retained; current schema compatibility and readiness remain unverified.

The [official bizfile page](https://www.sos.ca.gov/business-programs/bizfile) describes new 12-character entity numbers beginning with B, preservation of existing numbers, retention of the original number on conversion and inclusion of new numbers in bulk files. These observations do not establish a complete identifier lifecycle or current bulk schema. Identifiers must not be used to infer entity type or operation. The [legacy field and status definitions](https://www.sos.ca.gov/business-programs/business-entities/cbs-field-status-definitions) describe search fields and status, not a bulk layout; registry status is not proof of operation.

The [business entity records page](https://www.sos.ca.gov/administration/public-records-act-requests/business-entity-records) directs bulk orders to bizfile. The indexed [official manual](https://bpd.cdn.sos.ca.gov/ucc/ucc-online-help.pdf) page 132 describes Business Entity master and weekly products; pages 133–134 concern UCC and must not be treated as Business Entity product specifications. The full PDF was not inspected or retained. The [terms](https://www.sos.ca.gov/business-programs/bizfile/privacy-warning-terms-and-conditions-use) distinguish filing-data use from portal access restrictions. Product-specific terms and supported delivery remain unresolved.

Evidence observations were supplied by the coordinating agent; local verification checks the pinned reference and does not retrieve or independently verify remote documents. Before any acquisition, resolve actual schema and scope, identifiers, status and address mapping, change and replay semantics, delivery and rights, then obtain separate authorization. The offline synthetic identifier helper preserves any exact nonblank string, including leading zeros and whitespace, rejects numeric input, and assigns no meaning or format validity.

```powershell
node scripts/verify-ca-identifier-product-reference.mjs
node --test runner/ca-identifier-product-reference.test.mjs
npx eslint runner/ca-identifier-product-reference.mjs runner/ca-identifier-product-reference.test.mjs scripts/verify-ca-identifier-product-reference.mjs
```

The loader pins exact bytes and parsed content. A future revision requires a new versioned reference and review; rollback removes the five standalone files together. No runtime migration or source artifact exists.
