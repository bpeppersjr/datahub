# Retained ZIP lookup index registration

`config/datasets/zip-active-evidence-index.json` registers the independently
verified native index release as metadata-only, with no runtime current pointer
or production/reporting-denominator enrollment. Registration does not invoke the
publisher, source acquisition, lookup, UI, or API.

The immutable release manifest SHA-256 is
`046780ab2f0fb3532360c631d06300a8153469dd58d48f5dbae556be65b7d040`.
Its explicit build clock is `2026-10-02T17:45:00.000Z`. It indexes 1,397,626
source/ZIP rows for 48,194 source-reported ZIP labels in 100 buckets totaling
4,861,616 bytes (excluding the 14,333-byte manifest). The ordered descriptor
inventory is bound by SHA-256 of UTF-8 `JSON.stringify(manifest.artifacts)`;
the manifest checksum separately binds the original bytes.

Exact qualification registration/manifest/inventory/projection hashes and
separate category-map registration/file/semantic hashes and versions are copied
from the native manifest. Source evidence stays in the qualification release;
index build time does not refresh it. Categories remain authored evidence groups,
not a unique-business industry denominator. ZIP5 membership does not prove USPS
validity; ZIP4 remains separate and no geometry is inferred.

```powershell
node --test runner/zip-active-evidence-index-registration.test.mjs
```

This read-only check hashes bounded registration/manifest/map metadata, compares
counts, clocks, exact upstream identities, claims and inventory, and stats the
bucket roster and sizes. Negative tests reject drift and claim upgrades. It does
not read/hash bucket contents, scan qualification shards, or replay index entries.
Full native verification is a distinct operation recorded in
`docs/ZIP-ACTIVE-EVIDENCE-INDEX.md`; the metadata check does not repeat that proof.

Export remains `local-review-only`; current operation is unverified and all
business/completeness denominators remain null. Removing this registration does
not remove immutable evidence or modify existing runtime pointers.
