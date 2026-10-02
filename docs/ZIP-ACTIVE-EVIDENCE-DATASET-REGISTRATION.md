# Retained ZIP qualification dataset registration

`config/datasets/zip-active-evidence-qualification.json` registers the existing
immutable local release, without rebuilding it or changing runtime selection.
It is metadata-only: no runtime pointer, production enrollment, reporting
denominator enrollment, UI integration, acquisition, or public export permission.

The release records 1,397,626 source/ZIP pairs over 48,194 source-reported ZIP
members, with 30 source conservation entries. These are not counts of unique
businesses, verified operating businesses, or valid operational USPS ZIPs.
The Census nonemployer entry has no contributed pair measures. Sources and units
overlap; absent evidence is not measured zero. ZIP5 remains source-reported and
ZIP4 remains separate; no polygon or USPS membership is inferred.

Both recorded clocks are `2026-10-02T16:30:00.000Z`; build time does not refresh
source references. The source qualification policy is version `1.1.0`.
The manifest SHA-256 is
`9872e4b46fe01fc529ac189cda20a5a8a28d0a39904c8742b931934a5ce0b493`.
The 1,399 artifacts total 2,289,977,727 bytes, excluding the manifest. To keep the
catalog concise, it binds the entire ordered artifact inventory by SHA-256 of
the UTF-8 bytes of `JSON.stringify(manifest.artifacts)` rather than duplicating
1,399 descriptors. The manifest hash separately binds exact original bytes.
Coverage and registry release identities, manifest/pointer hashes, upstream
artifact bindings, effective export policy, claims, and limitations are retained.

Run the read-only metadata check:

```powershell
node --test runner/zip-active-evidence-dataset-registration.test.mjs
```

This check hashes the bounded manifest and projection metadata, checks the full
descriptor inventory, roster and file sizes, reconciles clocks/counts/claims and
the currently selected upstream pointer/manifest chain, and tests rejected drift.
It does **not** read or hash all 2.29 GB of row shards, replay source qualification,
or independently prove source-row content. Full source-bound release verification
is documented separately in `docs/ZIP-ACTIVE-EVIDENCE-RELEASE.md`; registration is
not a substitute for it. Upstream pointer drift intentionally fails this current
chain compatibility test and requires review, not silent catalog refresh.

Current operation and all-business completeness remain unverified/null. Export
remains `local-review-only`; source-status replay is not claimed. Removing this
metadata registration reverses registration only and leaves retained artifacts
and all runtime pointers untouched.
