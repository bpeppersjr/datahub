# ZCTA GDP allocation method evaluation

This immutable, pointer-free release evaluates three candidate county-to-ZCTA proxy weighting methods. It emits weights and diagnostics only—never numeric GDP—and does not approve a production model.

The methods are polygon intersection area, 2023 ZBP annual-payroll multiplied by the ZCTA/county polygon share, and a 2023 ZBP establishment fallback using the same area factor. County diagnostics disclose denominator coverage, weight conservation residuals, and sensitivity against full-proxy and dominant-county alternatives. Input states are explicit: `observed`, `suppressed`, `unpublished`, or `not-applicable`; nulls are never converted to zero.

The release binds the registered economic input cohort, its exact BEA, ZBP, geography and crosswalk dependencies, the ZBP ZIP-coverage artifact, and the BEA policy. BEA is reference year 2024, ZBP is 2023, and ZCTAs are 2020 statistical areas. Same-code ZIP/ZCTA spatial equivalence is not established. Polygon area is not an economic relationship, ZBP excludes nonemployers, and none of these research weights is an official ZIP/ZCTA GDP relationship.

No network request, `current.json`, production or denominator enrollment, USPS ZIP claim, active-business claim, demographic slice, or numeric GDP is produced.

The selected hardened release is `zcta-gdp-allocation-method-evaluation-aa4cac3bcc668d80f2245e40b50da267db3642b694eb03984451017006e0cf65`, manifest SHA-256 `ed84cd953807d447901edb15bc0c4386587c80ac565b8246a88d062219134b92`. Earlier local releases remain immutable but are not selected by the tracked registration.

The publisher and verifier are behaviorally fault-tested for exact-byte and rehashed tampering, missing and extra inventory, hardlinks and reparse ancestry, concurrent contenders, input drift, mid-read and mid-write cancellation, pre- and post-rename cancellation, staging failure, stage/lock replacement, and cleanup failure with primary-error preservation. These implementation checks do not alter the selected release's content identity.

```powershell
npm run zcta-gdp-allocation-evaluation:build
npm run zcta-gdp-allocation-evaluation:verify -- --manifest <immutable-manifest>
```
