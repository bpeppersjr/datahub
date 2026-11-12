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
