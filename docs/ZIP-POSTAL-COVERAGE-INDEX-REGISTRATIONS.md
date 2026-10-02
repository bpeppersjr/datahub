# Retained postal-quality and coverage ZIP index registrations

The metadata-only catalogs `config/datasets/registry-zip-quality-index.json` and
`config/datasets/coverage-zip-view-index.json` bind independently verified native
releases. Neither registration creates a runtime current pointer, enrolls
production/reporting denominators, rebuilds evidence, or changes an endpoint.

| Index | Manifest SHA-256 | Manifest bytes | Bucket bytes |
|---|---|---:|---:|
| Registry postal quality | `1ecbc4cb23d59e584d4528a4f65c23ed9fe4f658e134864416731fc48130941c` | 22,997 | 6,051,556 |
| Coverage ZIP view | `a10a0ae018d76b3923e7f2a788cfb7611e2c5a8616cf49fc93ea26bcae217b6e` | 17,267 | 6,065,062 |

Each has 100 bucket artifacts, 48,194 indexed ZIP labels and explicit build clock
`2026-10-02T20:00:00.000Z`. Artifact totals exclude manifest bytes. Ordered artifact
inventories are bound by SHA-256 of UTF-8 `JSON.stringify(manifest.artifacts)`;
the exact manifest hashes bind their original serialized bytes separately.

Registry registration retains enrollment, registry and audit implementation
identities, source artifact policy, and a digest of the full audit summary plus
its headline counts. Coverage registration retains exact catalog, coverage,
registry and geography identities, declared dependencies and spatial/ZIP artifact
bindings. The original clocks, source fields and restrictive `local-review-only`
policy are unchanged. Registration is not a source refresh.

The audit reports 33,791 same-code Census ZCTA members, 14,361 source-reported
nonplaceholder labels outside that set, 41 denominator-only labels outside it,
and one explicit `00000` placeholder. All 48,194 remain USPS-operational-status
unverified. The 199 denominator-only ZIPs include both inside/outside-ZCTA labels;
they are not an additional population to add to the 48,194 union. ZIP4 remains
separate and nongeometric. No business-operation or completeness claim is added.

```powershell
node --test runner/zip-postal-coverage-index-registrations.test.mjs
```

Tests hash bounded metadata, reconcile exact inventories/counts/clocks/policies
and current upstream identities, inspect bucket rosters/file sizes, and reject
changed pins or upgraded claims. They do not read/hash bucket contents or source
ZIP payloads, rerun the audit, or repeat native full verification. Those separate
operations are recorded in each index's documentation. Pointer/catalog/code drift
fails reconciliation and requires review rather than silent pin refresh.

Removing these two registrations reverses metadata registration only; immutable
releases and existing production pointers are unaffected.
