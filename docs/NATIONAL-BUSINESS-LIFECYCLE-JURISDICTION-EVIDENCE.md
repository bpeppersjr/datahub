# National business lifecycle jurisdiction evidence

This pointer-free local-review dataset rolls the registered national lifecycle ZIP evidence into the 60 governed scopes already established by the registered state exact-ZIP industry evidence disposition: 51 states/DC, five territories, and the four special scopes `multi-state-material`, `zcta-overlay-unresolved`, `non-zcta-unassigned`, and `explicit-placeholder`.

## Evidence boundary

Each row reports ZIP membership coverage plus registry-location-profile lifecycle-membership counts by lifecycle class, review status, and source. The counts are evidence memberships, not unique businesses, active-business numerators, or independently verified current operations. All-business completeness is null. Counts from different sources are not additive because identity resolution and deduplication have not been applied.

The build replays the exact ZIP-to-scope disposition bound by the registered jurisdiction release. It does not infer USPS ZIP-to-state assignment, fractionally allocate evidence, or distribute `multi-state-material` ZIP evidence among states. ZIP+4 is not joined.

## Conservation

The immutable release contains exactly 60 scope rows, 48,194 ZIP rows, and 8,011,213 lifecycle memberships. The national lifecycle, review, and source totals exactly match the lifecycle ZIP predecessor; the geography totals exactly match the jurisdiction disposition predecessor.

## Commands

```text
npm run business-lifecycle-jurisdiction:build
npm run business-lifecycle-jurisdiction:verify
node --test runner/national-business-lifecycle-jurisdiction-evidence.test.mjs
```

The builder performs no network acquisition, writes no runtime pointer, and performs no production enrollment. An existing content-addressed release is accepted only when its bytes are unchanged.
