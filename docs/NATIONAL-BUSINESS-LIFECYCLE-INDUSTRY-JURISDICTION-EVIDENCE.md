# National business lifecycle industry-jurisdiction evidence

This pointer-free local-review dataset projects the retained source-relative lifecycle memberships into the nine operational industry programs for each of the 60 governed jurisdiction scopes. It preserves 51 state/D.C. scopes, five territories and four special scopes without allocating multi-state, unresolved, non-ZCTA or placeholder evidence.

The closed mapping is `config/lifecycle-operational-industry-crosswalk.json`. Thirteen lifecycle sources have a reviewed operational-industry placement. EPA ECHO and USDA FSIS remain explicitly unmapped because their regulated-facility cohorts are not equivalent to one operational business segment. Unmapped memberships remain conserved in every scope and nationally.

Counts are source memberships, not unique businesses. Sources and industries can overlap and are not additive. The release does not assert an active-business numerator, current operation, industry completeness, all-business completeness, identity resolution, ZIP+4 joining, USPS assignment, production enrollment or acquisition authority.

The retained release contains one 60-row `jurisdictions.json` artifact. Its builder replays the registered lifecycle-jurisdiction artifact and the closed crosswalk, conserves every source membership across mapped and unmapped dispositions, and derives a content-addressed release ID. The verifier independently recomposes the artifact, validates all hashes and bindings, and rejects inventory or byte drift.

```text
npm run business-lifecycle-industry-jurisdiction:build
npm run business-lifecycle-industry-jurisdiction:verify
node --test runner/national-business-lifecycle-industry-jurisdiction-evidence.test.mjs
```

These commands are local-only and perform no network request, acquisition, payment, account action, terms acceptance, pointer write or production enrollment.

## Protected runtime API

The read-only runtime hard-pins the registration, immutable manifest, artifact and operational-industry crosswalk. It rejects links, unstable files, schema additions, changed claims, incomplete scope or industry rosters, and any ZIP, membership, mapped/unmapped, lifecycle, review or source conservation drift.

- `GET /api/business-map/lifecycle-industry-jurisdiction-summary` returns the national summary and ordered governed scope roster.
- `GET /api/business-map/lifecycle-industry-jurisdiction?state=MN` returns one exact state/DC row.
- `GET /api/business-map/lifecycle-industry-jurisdiction?scope=territory:72` returns one exact governed scope, including any of the four special scopes.

The selectors are mutually exclusive. State lookup does not include territories. Runtime counts remain source-relative memberships and must not be treated as unique businesses, additive industry totals, completeness, verified current operations, inferred ZIP-to-state assignment or allocated multi-state evidence.
